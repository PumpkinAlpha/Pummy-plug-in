import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {PluginCourse} from '../worker/course.js';
import {matchingExamQuestions,examPracticeOptions} from '../app/exam-settings.js';
import {questionsInFolder} from '../app/folders.js';
import {generationCapacity} from '../app/generation-plan.js';
const q=(stem,term)=>({term,stem,options:['Yes','No'],answer:[0],sourceId:'a',weekId:'Week 13'});
async function setup(t){
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'student'),call=(n,a)=>executeTool(repo,n,a);
 let {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Bank visibility',sources:[{id:'a',name:'Objectives',sourceType:'objectives',text:'1. Describe number A.\n2. Describe number B.',weekId:'Week 13'}],questions:[q('Keep this question?','Shared concept')]});
 const generationId=crypto.randomUUID();
 for(const term of ['Deleted concept','Shared concept'])state=(await call('add_questions',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),generationId,bankName:'Delete this group',questions:[{...q(term+'? ',term),objectiveId:state.objectives[1].id}]})).state;
 const grouped=(await call('list_practice_banks',{courseId:state.courseId})).banks.find(b=>b.groupId),full=(await call('read_practice_bank',{courseId:state.courseId,bankId:grouped.id})).bank;
 const ids=full.questions.map(q=>q.id),testId=crypto.randomUUID();state=(await call('save_custom_test',{courseId:state.courseId,revision:state.revision,testId,name:'Mixed saved test',questionIds:[...state.questionIndex.map(q=>q.id)]})).state;
 state=(await call('start_test',{courseId:state.courseId,revision:state.revision,adaptive:false,size:'all'})).state;
 return {db,repo,call,state,grouped,ids,testId};
}
test('deletion propagates to counts, folders, selectors, coverage, custom tests and generation capacity; restore reverses it',async t=>{
 const {repo,call,state,grouped,ids,testId}=await setup(t),before=await repo.get(state.courseId);
 const deleted=await call('delete_practice_bank',{courseId:state.courseId,bankId:grouped.id,bankRevision:grouped.revision});
 assert.equal(deleted.state.questionCount,1);assert.equal(deleted.state.storedQuestionCount,1);assert.equal(deleted.courses[0].questionCount,1);assert.equal(deleted.courses[0].professorCount,1);assert.equal(deleted.state.revision,state.revision+1);
 assert.ok(deleted.state.questionIndex.every(q=>!ids.includes(q.id)));assert.equal(questionsInFolder(deleted.state,{kind:'week',label:'Week 13'}).length,1);assert.equal(matchingExamQuestions(deleted.state,{}).length,1);assert.equal(generationCapacity(deleted.state),499);
 assert.equal(deleted.state.customTests[0].questionIds.length,1);assert.ok(examPracticeOptions(deleted.state).some(o=>o.practiceTestId===testId));
 assert.ok(!deleted.state.progress.concepts.some(c=>c.name==='Deleted concept'));assert.ok(deleted.state.progress.concepts.some(c=>c.name==='Shared concept'));assert.equal(deleted.state.progress.objectives.find(o=>o.id===state.objectives[1].id).total,0);
 const after=await repo.get(state.courseId);assert.deepEqual(after.data,before.data);assert.deepEqual(deleted.state.session,state.session);assert.equal((await call('export_bank',{courseId:state.courseId})).export.questions.length,1);
 const resumed=(await call('read_course_state',{courseId:state.courseId})).state;assert.deepEqual(resumed.questionIndex,deleted.state.questionIndex);
 const trash=(await call('list_practice_banks',{courseId:state.courseId})).deletedBanks[0];const restored=await call('restore_practice_bank',{courseId:state.courseId,bankId:trash.id,bankRevision:trash.revision});
 assert.equal(restored.state.questionCount,3);assert.equal(restored.courses[0].questionCount,3);assert.equal(restored.state.customTests[0].questionIds.length,3);assert.deepEqual(restored.state.session,state.session);assert.deepEqual((await repo.get(state.courseId)).data,before.data);
});
test('existing deleted and purged banks are excluded after reload, with no manual migration or new deletion required',async t=>{
 const {db,repo,call,state,grouped,ids}=await setup(t),before=await repo.get(state.courseId);
 await db.prepare("UPDATE practice_banks SET data=json_set(data,'$.deletedAt',1) WHERE user_id=? AND course_id=? AND json_extract(data,'$.groupId')=?").bind('student',state.courseId,grouped.groupId).run();
 const freshRepo=new CourseRepository(db,'student'),fresh=await executeTool(freshRepo,'read_course_state',{courseId:state.courseId});assert.equal(fresh.state.questionCount,1);assert.equal((await freshRepo.list())[0].questionCount,1);
 const trash=(await call('list_practice_banks',{courseId:state.courseId})).deletedBanks[0];await call('purge_practice_bank',{courseId:state.courseId,bankId:trash.id,bankRevision:trash.revision,confirmed:true});
 assert.equal((await executeTool(new CourseRepository(db,'student'),'read_course_state',{courseId:state.courseId})).state.questionCount,1);assert.equal((await call('list_practice_banks',{courseId:state.courseId})).deletedBanks.length,0);
 assert.deepEqual((await repo.get(state.courseId)).data,before.data);assert.equal((await call('export_bank',{courseId:state.courseId})).export.questions.some(q=>ids.includes(q.id)),false);
});
test('new exams and stale custom selections cannot reintroduce deleted questions, while old results remain readable',async t=>{
 const {repo,call,state,grouped,ids,testId}=await setup(t);
 const deleted=await call('delete_practice_bank',{courseId:state.courseId,bankId:grouped.id,bankRevision:grouped.revision});
 await assert.rejects(call('start_test',{courseId:state.courseId,revision:state.revision,adaptive:false,restart:true,size:'all'}),/changed/);
 await assert.rejects(call('start_test',{courseId:state.courseId,revision:deleted.state.revision,adaptive:false,restart:true,size:'all',questionIds:ids}),/missing course question/);
 const started=await call('start_test',{courseId:state.courseId,revision:deleted.state.revision,customTestId:testId,restart:true});assert.equal(started.state.session.total,1);assert.ok(!ids.includes(started.state.question.id));
 const saved=await repo.get(state.courseId);assert.ok(saved.data.session.queue.every(q=>!ids.includes(q.id)));assert.ok(saved.data.history[0].id===state.session.id);assert.equal(saved.data.customTests[0].questionIds.length,3);
});
test('deleting the final bank empties active progress and selections, retains current exam keys, and rejects a new empty exam',async t=>{
 const {repo,call,state,grouped}=await setup(t);await call('delete_practice_bank',{courseId:state.courseId,bankId:grouped.id,bankRevision:grouped.revision});const other=(await call('list_practice_banks',{courseId:state.courseId})).banks[0];
 const empty=await call('delete_practice_bank',{courseId:state.courseId,bankId:other.id,bankRevision:other.revision});assert.equal(empty.state.questionCount,0);assert.equal(empty.courses[0].questionCount,0);assert.equal(empty.state.progress.concepts.length,0);assert.deepEqual(empty.state.customTests,[]);assert.equal(empty.state.session.total,3);assert.ok(empty.state.question?.id);
 await assert.rejects(call('start_test',{courseId:state.courseId,revision:empty.state.revision,restart:true,size:'all',adaptive:false}),/No questions match/);
 const answered=await call('submit_answer',{courseId:state.courseId,revision:empty.state.revision,sessionId:state.session.id,questionId:empty.state.question.id,choices:[0]});assert.equal(answered.state.session.feedback.correct,true);assert.equal(answered.state.questionCount,0);const continued=await call('next_question',{courseId:state.courseId,revision:answered.state.revision,sessionId:state.session.id});assert.ok(continued.state.session.results[0].question?.stem);
 const old=await repo.get(state.courseId);assert.equal(old.data.questions.length,3);assert.equal(new PluginCourse(old.data).rootQuestions().length,0);
});
test('a course save begun before deletion cannot overwrite the new availability revision',async t=>{
 const {repo,call,state,grouped}=await setup(t),stale=await repo.get(state.courseId);
 await call('delete_practice_bank',{courseId:state.courseId,bankId:grouped.id,bankRevision:grouped.revision});
 await assert.rejects(repo.save({...stale.data,name:'Stale update'},stale.revision,stale.data),/changed/);assert.equal((await call('read_course_state',{courseId:state.courseId})).state.questionCount,1);
});
test('pending explanation work excludes deleted questions and can finish without reviving a deleted bank',async t=>{
 const {repo,call,state,grouped,ids}=await setup(t),requestId=crypto.randomUUID();
 let current=(await call('request_bank_explanations',{courseId:state.courseId,revision:state.revision,requestId,questionIds:ids,depth:'quick'})).state;assert.equal(current.bankExplanationRequest.pending,2);const partial=await repo.get(state.courseId);partial.data.bankExplanationRequest.completed=[ids[0]];await repo.save(partial.data,partial.revision,partial.data);
 current=(await call('delete_practice_bank',{courseId:state.courseId,bankId:grouped.id,bankRevision:grouped.revision})).state;assert.equal(current.bankExplanationRequest.pending,0);assert.equal(current.bankExplanationRequest.completed,0);
 const read=await call('read_bank_explanations',{courseId:state.courseId,requestId});assert.deepEqual(read.request.questions,[]);assert.equal(read.request.pending,0);
 await assert.rejects(call('request_bank_explanations',{courseId:state.courseId,revision:current.revision,requestId:crypto.randomUUID(),questionIds:ids,depth:'quick'}),/Choose saved bank questions/);
});
test('deleted questions free active capacity and an oversized restore fails without partial changes',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'student'),call=(n,a)=>executeTool(repo,n,a),questions=Array.from({length:200},(_,i)=>q('Question '+i+'?','Concept '+i));
 let {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Capacity',questions,sources:[{id:'a',name:'Source',text:'Reference facts.'}]});const original=(await call('list_practice_banks',{courseId:state.courseId})).banks[0];
 state=(await call('delete_practice_bank',{courseId:state.courseId,bankId:original.id,bankRevision:original.revision})).state;assert.equal(generationCapacity(state),500);
 for(let i=0;i<2;i++)state=(await call('add_questions',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),questions})).state;assert.equal(state.storedQuestionCount,400);assert.equal(state.questionCount,400);
 const trash=(await call('list_practice_banks',{courseId:state.courseId})).deletedBanks[0],before=await repo.get(state.courseId);await assert.rejects(call('restore_practice_bank',{courseId:state.courseId,bankId:trash.id,bankRevision:trash.revision}),/exceed 500 active/);assert.deepEqual(await repo.get(state.courseId),before);assert.equal((await call('read_course_state',{courseId:state.courseId})).state.questionCount,400);
});
