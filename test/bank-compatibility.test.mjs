import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';

test('cached add_questions descriptors can complete the native staged review workflow without bypassing validation',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'compat-owner');
 let state=(await executeTool(repo,'create_course',{name:'Compatibility',requestId:crypto.randomUUID()})).state;
 state=(await executeTool(repo,'sync_course_sources',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[{id:'source',name:'Professor',text:'Internal oblique rotates the trunk ipsilaterally. External oblique rotates the trunk contralaterally.'}]})).state;
 const before=(await repo.get(state.courseId)).data;
 const compat=async(name,args={},requestId=crypto.randomUUID())=>{const r=await executeTool(repo,'add_questions',{courseId:state.courseId,revision:state.revision,requestId,questions:[{pummyBankOperation:{name,arguments:args}}]});if(r.state)state=r.state;return r;};
 const discovery=await executeTool(repo,'read_course_state',{courseId:state.courseId});assert.equal(discovery.context.bankWorkflow.compatibilityTool,'add_questions');
 const description=await compat('describe',{tool:'stage_bank_questions'});assert.ok(description.context.inputSchema.properties.questions);assert.equal((await repo.get(state.courseId)).revision,state.revision);
 await assert.rejects(compat('submit_answer'),/Invalid option/);
 await assert.rejects(compat('read_bank_repair',{courseId:'someone-else'}),/nested overrides/);
 const runId=crypto.randomUUID(),topic={id:'right',detail:'Combine opposite oblique sides for right trunk rotation.',suitableTypes:['mcq']};
 await compat('begin_bank_repair',{sourceIds:['source'],bankName:'Reviewed bank',mode:'gaps',topics:[topic]},runId);
 await compat('calibrate_bank_difficulty',{runId,ratings:[]});
 const evidence=[{sourceId:'source',quote:'Internal oblique rotates the trunk ipsilaterally.'},{sourceId:'source',quote:'External oblique rotates the trunk contralaterally.'}];
 await compat('map_bank_subtopic',{runId,subtopicId:'right',status:'supported',evidence,inspectedSourceIds:['source'],reason:'The professor gives both opposing oblique actions.',correctiveAction:'Require both sided actions in a combined application.'});
 const good={reasoning:2,integration:2,application:2,discrimination:1};
 const question={type:'mcq',origin:'generated',sourceId:'source',stem:'To rotate right, which two-sided combination correctly integrates the opposing actions of the obliques?',options:['Right internal and left external oblique','Left internal and right external oblique'],answer:[0],optionNotes:['The internal oblique is ipsilateral; external is contralateral.','This opposite pairing instead rotates to the left.'],explanation:{body:['Right internal oblique and left external oblique combine to rotate right.']},assessment:{runId,subtopicIds:['right'],evidence,difficulty:{...good,steps:['Identify the ipsilateral internal oblique for right rotation.','Combine it with the contralateral external oblique.'],relationships:['Internal oblique acts toward its own side.','External oblique acts toward the opposite side.'],rationale:'Both supported sided muscle actions are needed to choose.'},formatReason:'Two plausible opposing pairings test a real sided misconception.'}};
 const staged=await compat('stage_bank_questions',{runId,questions:[question]});assert.equal(state.questionCount,0);const candidateId=staged.context.candidateIds[0];
 await assert.rejects(compat('review_bank_question',{runId,candidateId,accepted:true,...good,requiredSubtopicIds:['right'],checks:{sourceSupport:false,accuracy:true,unambiguous:true,reasoning:true,distractors:true,format:true,explanations:true},critique:'Source support has not passed the independent review.',correctiveAction:'Recheck both source statements before saving this question.'}),/Independent review failed/);
 const candidate=(await compat('read_bank_repair',{runId,candidateId})).context.candidate;assert.equal(candidate.status,'pending');
 await compat('review_bank_question',{runId,candidateId,accepted:true,...good,requiredSubtopicIds:['right'],checks:{sourceSupport:true,accuracy:true,unambiguous:true,reasoning:true,distractors:true,format:true,explanations:true},critique:'Independently solved: right internal and left external follows both source relationships; alternatives reverse the direction.',correctiveAction:'All source and format checks pass; no correction required.'});
 assert.equal(state.questionCount,1);assert.equal((await compat('finish_bank_repair',{runId})).context.report.complete,true);
 const after=(await repo.get(state.courseId)).data;assert.deepEqual(after.session,before.session);assert.deepEqual(after.history,before.history);assert.deepEqual(after.preferences,before.preferences);assert.deepEqual(after.sources,before.sources);
});

test('an older read_source descriptor returns a prepared original figure with provenance and no mutations',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'visual-owner');
 let state=(await executeTool(repo,'create_course',{name:'Original visual',requestId:crypto.randomUUID()})).state;
 const assetId=crypto.randomUUID(),image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLYYAAAAASUVORK5CYII=';
 state=(await executeTool(repo,'sync_course_sources',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[{id:'original',name:'Professor.pdf',text:'Image-only original; no extracted page text.',metadata:{pageCount:1}}]})).state;
 // Simulate the same saved original-file link established by validated uploads.
 let saved=await repo.get(state.courseId);saved.data.sources[0].originalFile={id:assetId,kind:'pdf'};state.revision=await repo.save(saved.data,saved.revision,saved.data);
 state=(await executeTool(repo,'save_source_visual',{courseId:state.courseId,revision:state.revision,sourceId:'original',page:1,assetId,dataUrl:image,emphasis:[]})).state;
 const before=await repo.get(state.courseId),read=await executeTool(repo,'read_source',{courseId:state.courseId,sourceId:'original',page:1});
 assert.equal(read.visual.dataUrl,image);assert.equal(read.context.sourceId,'original');assert.equal(read.context.page,1);assert.equal(read.context.status,'verified_original');assert.equal(read.source.text,'');assert.deepEqual(read.source.preparedFigurePages,[1]);assert.deepEqual(read.source.allPageNumbers,[1]);
 assert.deepEqual(await repo.get(state.courseId),before);
 await assert.rejects(executeTool(new CourseRepository(db,'other-owner'),'read_source',{courseId:state.courseId,sourceId:'original',page:1}),/not found|No saved/i);
});
