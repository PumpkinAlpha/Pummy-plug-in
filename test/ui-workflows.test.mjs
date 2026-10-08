import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardExamSettings,customExamSize} from '../app/exam-settings.js';
import {saveDraftCustomTest} from '../app/custom-test-save.js';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';

test('studying a folder ignores unrelated saved filters and includes question-only weeks',async()=>{
 const db=new LocalD1();
 try{
  const repo=new CourseRepository(db,'ui-folder');
  let state=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Folders',questions:[
   {term:'Old selection',stem:'Old question?',options:['Yes','No'],answer:[0],sourceId:'old-source',objectiveId:'old-objective',setId:'old-set',weekId:'week1'},
   {term:'New folder',stem:'New question?',options:['One','Two','Three'],answer:[0,1],multi:true,weekId:'week2'}
  ],sources:[{id:'old-source',name:'Week 1 source',text:'Old material.',weekId:'week1'}],objectives:[{id:'old-objective',text:'Old objective'}]})).state;
  state=(await executeTool(repo,'save_preferences',{courseId:state.courseId,revision:state.revision,size:1,adaptive:false,includeReviews:false,sourceIds:['old-source'],objectiveIds:['old-objective'],types:['mcq'],setId:'old-set',weekId:'week1'})).state;
  const exam=(await executeTool(repo,'start_test',{courseId:state.courseId,revision:state.revision,...dashboardExamSettings(state,{weekId:'week2'},false)})).state;
  assert.equal(exam.question.term,'New folder');
  assert.equal(exam.session.total,1);
 }finally{db.close();}
});

test('a saved selection includes all 101 questions without an exam cap',async()=>{
 const db=new LocalD1();
 try{
  const repo=new CourseRepository(db,'ui-custom');
  let state=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Large bank',questions:Array.from({length:101},(_,i)=>({term:`Topic ${i}`,stem:`Question ${i}?`,options:['Yes','No'],answer:[0]}))})).state;
  const questionIds=state.questionIndex.map(question=>question.id),testId=crypto.randomUUID();
  state=(await executeTool(repo,'save_custom_test',{courseId:state.courseId,revision:state.revision,testId,name:'Large selection',questionIds,size:customExamSize(questionIds),adaptive:false,includeReviews:false})).state;
  assert.equal(state.customTests[0].questionIds.length,101);
  const exam=(await executeTool(repo,'start_test',{courseId:state.courseId,revision:state.revision,customTestId:testId})).state;
  assert.equal(exam.session.total,101);
 }finally{db.close();}
});

const draft={stem:'Authored question?',options:['Yes','No'],answer:[0]};
test('retrying an authored save after the second write fails does not duplicate questions',async()=>{
 const attemptRef={current:null},calls=[];
 let state={courseId:'c',revision:1,questionIndex:[],customTests:[]},fail=true;
 const call=async(name,args)=>{
  calls.push({name,args});
  if(name==='add_questions'){state={...state,revision:2,questionIndex:[{id:'q'}]};return {state};}
  if(fail){fail=false;throw new Error('Temporary save failure');}
  assert.equal(args.revision,2);
  assert.deepEqual(args.questionIds,['q']);
 };
 const save=()=>saveDraftCustomTest({state,name:'My test',questions:[draft],attemptRef,call,getState:()=>state});
 await assert.rejects(save(),/Temporary save failure/);
 await save();
 assert.deepEqual(calls.map(call=>call.name),['add_questions','save_custom_test','save_custom_test']);
 assert.equal(calls[1].args.testId,calls[2].args.testId);
 assert.equal(attemptRef.current,null);
});

test('an uncertain authored add response retries the original write ID',async()=>{
 const attemptRef={current:null},requests=[];
 let state={courseId:'c',revision:1,questionIndex:[],customTests:[]},fail=true;
 const call=async(name,args)=>{
  if(name==='add_questions'){
   requests.push(args.requestId);
   state={...state,revision:2,questionIndex:[{id:'q'}]};
   if(fail){fail=false;throw new Error('Lost response');}
   return {state};
  }
  assert.deepEqual(args.questionIds,['q']);
 };
 const save=()=>saveDraftCustomTest({state,name:'My test',questions:[draft],attemptRef,call,getState:()=>state});
 await assert.rejects(save(),/Lost response/);
 await save();
 assert.equal(requests.length,2);
 assert.equal(requests[0],requests[1]);
});

test('a full custom-test library refuses authored writes before adding questions',async()=>{
 let calls=0;
 await assert.rejects(saveDraftCustomTest({state:{courseId:'c',revision:1,customTests:Array.from({length:30},(_,i)=>({id:String(i)}))},name:'New test',questions:[draft],attemptRef:{current:null},call:async()=>{calls++;},getState:()=>null}),/30 custom tests/);
 assert.equal(calls,0);
});
