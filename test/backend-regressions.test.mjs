import {cognitiveFixture} from './cognitive-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';

const keyed={term:'Letters',stem:'Choose the first letter.',options:['Alpha','Beta'],answer:[0],definition:'B. Beta is correct.',flagReason:'Professor supplied this key.'};
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK9sAAAAASUVORK5CYII=';
const args=s=>({courseId:s.courseId,revision:s.revision,sessionId:s.session?.id});

test('explicit keys survive conflicting explanation labels on import, append and adaptive generation',async t=>{
 const db=new LocalD1(),repo=new CourseRepository(db,'keys');t.after(()=>db.close());
 let s=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Keys',questions:[keyed],sources:[{id:'letters',name:'Letters',text:'Alpha is the first letter; Beta follows Alpha.'}]})).state;
 let data=(await repo.get(s.courseId)).data;
 assert.deepEqual(data.questions[0].answer,[0]);assert.equal(data.questions[0].flagged,true);
 assert.match(data.questions[0].flagReason,/Professor supplied/);assert.match(data.questions[0].flagReason,/supplied key was preserved/);
 s=(await executeTool(repo,'append_saved_bank',{...args(s),requestId:crypto.randomUUID(),questions:[{...keyed,term:'Own letters',origin:'own'}]})).state;
 data=(await repo.get(s.courseId)).data;
 const own=data.questions.find(q=>q.origin==='own');assert.equal(own.options[own.answer[0]],'Alpha');assert.equal(own.flagged,true);
 const exported=(await executeTool(repo,'export_bank',{courseId:s.courseId})).export;
 assert.equal(exported.questions[0].options[exported.questions[0].answer[0]],'Alpha');
 s=(await executeTool(repo,'start_test',{...args(s),size:1,adaptive:true})).state;
 assert.equal(s.question.answer,undefined);assert.doesNotMatch(s.question.flagReason,/Original key:|explanation: [A-L]/);
 s=(await executeTool(repo,'submit_answer',{...args(s),questionId:s.question.id,choices:[1]})).state;
 const foundation={...keyed,term:'Letter basics',stem:'Which letter precedes Beta?',optionNotes:['Alpha precedes Beta.','Beta follows Alpha.']};
 s=(await executeTool(repo,'provide_question',{...args(s),generationId:s.generation.id,question:{...foundation,cognitive:cognitiveFixture}})).state;
 data=(await repo.get(s.courseId)).data;
 const generated=data.questions.find(q=>q.origin==='followup');assert.equal(generated.options[generated.answer[0]],'Alpha');assert.equal(generated.flagged,true);
 assert.equal(s.questionCount,2);assert.equal(s.storedQuestionCount,3);
});

test('simultaneous create and import retries return one saved course with identical question IDs',async t=>{
 const db=new LocalD1(),repo=new CourseRepository(db,'retries');t.after(()=>db.close());
 for(const tool of ['create_course','import_questions']){
  const payload={requestId:crypto.randomUUID(),name:tool,...(tool==='import_questions'?{questions:[{...keyed,definition:'Alpha is first.'}]}:{})};
  const results=await Promise.all([executeTool(repo,tool,payload),executeTool(new CourseRepository(db,'retries'),tool,payload)]);
  assert.deepEqual(results[0].state,results[1].state);assert.equal(results[0].state.revision,1);
  assert.equal((await repo.get(payload.requestId)).data.questions.length,tool==='import_questions'?1:0);
 }
 assert.equal((await repo.list()).length,2);
});

test('normalized matching labels, empty choices and blank course names reject atomically',async t=>{
 const db=new LocalD1(),repo=new CourseRepository(db,'validation');t.after(()=>db.close());
 const matching={type:'match',term:'Letters',stem:'Match the letters.',pairs:[{left:'A',right:'Alpha'},{left:'B',right:' Alpha '},{left:'C',right:'Gamma'}]};
 await assert.rejects(executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Duplicate labels',questions:[matching]}),/unique pairs/);
 await assert.rejects(executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Blank choice',questions:[{...keyed,options:['Alpha','  ']}]}));
 await assert.rejects(executeTool(repo,'create_course',{requestId:crypto.randomUUID(),name:'  '}));
 assert.deepEqual(await repo.list(),[]);
 const good={...matching,pairs:[{left:' A ',right:' Alpha '},{left:' B ',right:' Beta '},{left:' C ',right:' Gamma '}]};
 let s=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Valid matching',questions:[good]})).state;
 s=(await executeTool(repo,'start_test',{...args(s),adaptive:false,size:1})).state;
 s=(await executeTool(repo,'submit_answer',{...args(s),questionId:s.question.id,response:{0:'Alpha',1:'Beta',2:'Gamma'}})).state;
 assert.equal(s.session.feedback.correct,true);
});

test('explicit select-all and image-only imports retain their type for strict exam filters',async t=>{
 const db=new LocalD1(),repo=new CourseRepository(db,'types');t.after(()=>db.close());
 let s=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Types',questions:[{...keyed,type:'multi',definition:'Alpha is first.'},{...keyed,term:'Image letters',type:'image',image,definition:'Alpha is first.'}]})).state;
 assert.deepEqual(s.questionIndex.map(q=>q.type),['multi','image']);
 const bank=(await repo.get(s.courseId)).data;assert.equal(bank.questions[1].figure.dataUrl,image);assert.equal(bank.questions[1].image,null);
 s=(await executeTool(repo,'start_test',{...args(s),adaptive:false,size:1,types:['multi']})).state;
 assert.equal(s.question.type,'multi');assert.equal(s.question.multi,true);
 s=(await executeTool(repo,'start_test',{...args(s),adaptive:false,size:1,types:['image'],restart:true})).state;
 assert.equal(s.question.type,'image');assert.equal(s.question.figure.dataUrl,image);assert.equal(s.question.answer,undefined);
 await assert.rejects(executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Missing image',questions:[{...keyed,type:'image'}]}),/embedded image/);
});

test('saved legacy diagram labels with whitespace remain answerable without rewriting the bank',async t=>{
 const db=new LocalD1(),repo=new CourseRepository(db,'legacy');t.after(()=>db.close());
 let s=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Legacy diagram',questions:[{type:'label',term:'Letters',stem:'Place the labels.',figure:{dataUrl:image},targets:[{x:0,y:0,w:.2,h:.2,answer:'Alpha'},{x:.5,y:.5,w:.2,h:.2,answer:'Beta'}]}]})).state;
 const saved=await repo.get(s.courseId),q=saved.data.questions[0];q.targets.forEach(target=>target.answer=` ${target.answer} `);q.bank=q.bank.map(label=>` ${label} `);
 s.revision=await repo.save(saved.data,saved.revision);
 s=(await executeTool(repo,'start_test',{...args(s),adaptive:false,size:1})).state;
 s=(await executeTool(repo,'submit_answer',{...args(s),questionId:s.question.id,response:{t1:' Alpha ',t2:' Beta '}})).state;
 assert.equal(s.session.feedback.correct,true);assert.deepEqual((await repo.get(s.courseId)).data.questions[0].bank,[' Alpha ',' Beta ']);
});

test('sync accepts named week folders and preserves their source and objective grouping',async t=>{
 const db=new LocalD1(),repo=new CourseRepository(db,'week-labels');t.after(()=>db.close());
 let s=(await executeTool(repo,'create_course',{requestId:crypto.randomUUID(),name:'Anatomy'})).state;
 s=(await executeTool(repo,'manage_folder',{...args(s),kind:'week',label:'Week 4',action:'create'})).state;
 s=(await executeTool(repo,'sync_course_sources',{courseId:s.courseId,revision:s.revision,requestId:crypto.randomUUID(),sources:[{id:'week-4',name:'Thorax slides',text:'The brachiocephalic trunk is the first arch branch.\nLearning objectives\n1. Identify arch branches.',weekId:'Week 4'}],objectives:[{id:'arch',text:'Identify arch branches.',sourceId:'week-4',weekId:'Week 4'}]})).state;
 assert.equal(s.sources[0].weekId,'Week 4');assert.equal(s.objectives[0].weekId,'Week 4');
 s=(await executeTool(repo,'append_saved_bank',{...args(s),requestId:crypto.randomUUID(),questions:[{...keyed,definition:'Alpha is first.',sourceId:'week-4',objectiveId:'arch',weekId:'Week 4'}]})).state;
 s=(await executeTool(repo,'start_test',{...args(s),size:1,adaptive:false,weekId:'Week 4'})).state;
 assert.equal(s.session.total,1);assert.equal(s.question.source.id,'week-4');
 for(const weekId of ['  ','x'.repeat(181)])await assert.rejects(executeTool(repo,'sync_course_sources',{courseId:s.courseId,revision:s.revision,requestId:crypto.randomUUID(),sources:[{id:'bad',name:'Bad source',text:'Text.',weekId}]}));
});

test('append receipts retain exact question IDs across unrelated appends and stale request retries',async t=>{
 const db=new LocalD1(),repo=new CourseRepository(db,'append-receipts');t.after(()=>db.close());
 let s=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Receipt course',questions:[{...keyed,definition:'Alpha is first.'}]})).state;
 s=(await executeTool(repo,'start_test',{...args(s),size:1,adaptive:false})).state;
 const originalSession=s.session.id,requestId=crypto.randomUUID(),request={...args(s),requestId,questions:[{...keyed,term:'Custom one',definition:'Alpha is first.'},{...keyed,term:'Custom two',definition:'Alpha is first.'}]};
 const added=(await executeTool(repo,'append_saved_bank',request)).state;
 const receipt=added.questionImports.find(item=>item.requestId===requestId),expected=added.questionIndex.filter(question=>question.term.startsWith('Custom')).map(question=>question.id);
 assert.deepEqual(receipt.questionIds,expected);assert.equal(receipt.addedCount,2);
 const unrelatedId=crypto.randomUUID();
 s=(await executeTool(repo,'append_saved_bank',{...args(added),requestId:unrelatedId,questions:[{...keyed,term:'Unrelated addition',definition:'Alpha is first.'}]})).state;
 const retried=(await executeTool(new CourseRepository(db,'append-receipts'),'add_questions',request)).state;
 assert.equal(retried.questionCount,4);assert.equal(retried.revision,s.revision);assert.equal(retried.session.id,originalSession);
 assert.deepEqual(retried.questionImports.find(item=>item.requestId===requestId).questionIds,expected);
 assert.ok(retried.questionImports.find(item=>item.requestId===unrelatedId).questionIds.every(id=>!expected.includes(id)));
 assert.deepEqual((await repo.get(s.courseId)).data.completedRequests.find(item=>item.id===requestId).questionIds,expected);
});
