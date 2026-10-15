import test from 'node:test';
import assert from 'node:assert/strict';
import {saveDraftCustomTest} from '../app/custom-test-save.js';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';

const question={stem:'Which letter comes first?',options:['Alpha','Beta'],answer:[0],definition:'Alpha comes first.'};

test('retrying a lost append response saves only the draft questions after an unrelated append',async t=>{
 const db=new LocalD1(),repo=new CourseRepository(db,'custom-retry');t.after(()=>db.close());
 let visible=(await executeTool(repo,'create_course',{requestId:crypto.randomUUID(),name:'Custom tests'})).state;
 const initial=visible,attemptRef={current:null};let loseResponse=true;
 const call=async(name,args)=>{
  const result=await executeTool(repo,name,args);
  if(name==='add_questions'&&loseResponse){loseResponse=false;throw new Error('Response lost after save.');}
  visible=result.state;return result;
 };
 await assert.rejects(saveDraftCustomTest({state:initial,name:'My test',questions:[question],attemptRef,call,getState:()=>visible}),/Response lost/);
 const current=(await executeTool(repo,'read_course_state',{courseId:initial.courseId})).state;
 await executeTool(repo,'append_saved_bank',{courseId:current.courseId,revision:current.revision,requestId:crypto.randomUUID(),questions:[{...question,stem:'An unrelated tutor question.',origin:'generated'}]});
 await saveDraftCustomTest({state:initial,name:'My test',questions:[question],attemptRef,call,getState:()=>visible});
 const saved=(await repo.get(initial.courseId)).data;
 assert.equal(saved.questions.length,2);
 assert.equal(saved.customTests.length,1);
 assert.deepEqual(saved.customTests[0].questionIds,saved.questions.filter(q=>q.origin==='own').map(q=>q.id));
 assert.equal(attemptRef.current,null);
});

test('retrying a failed custom-test save reuses its appended questions and write IDs',async t=>{
 const db=new LocalD1(),repo=new CourseRepository(db,'custom-second-step');t.after(()=>db.close());
 let visible=(await executeTool(repo,'create_course',{requestId:crypto.randomUUID(),name:'Custom tests'})).state;
 const attemptRef={current:null},writes=[];let failSave=true;
 const call=async(name,args)=>{
  writes.push({name,args});
  if(name==='save_custom_test'&&failSave){failSave=false;throw new Error('Save temporarily unavailable.');}
  const result=await executeTool(repo,name,args);visible=result.state;return result;
 };
 await assert.rejects(saveDraftCustomTest({state:visible,name:'My test',questions:[question],attemptRef,call,getState:()=>visible}),/temporarily unavailable/);
 const testId=attemptRef.current.testId;
 await saveDraftCustomTest({state:visible,name:'My test',questions:[question],attemptRef,call,getState:()=>visible});
 assert.equal(writes.filter(write=>write.name==='add_questions').length,1);
 assert.deepEqual(writes.filter(write=>write.name==='save_custom_test').map(write=>write.args.testId),[testId,testId]);
 const saved=(await repo.get(visible.courseId)).data;
 assert.equal(saved.questions.length,1);assert.equal(saved.customTests.length,1);
 assert.equal(attemptRef.current,null);
});
