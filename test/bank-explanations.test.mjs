import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {feedbackAdvanceKey} from '../app/exam-keys.js';
import {buildGenerationPrompt} from '../app/generation-plan.js';
import worker from '../dist/server/index.js';
const q={stem:'Which number is even?',options:['one','two'],answer:[1],sourceId:'s'};
async function setup(){const db=new LocalD1(),repo=new CourseRepository(db,'qa');const state=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Explanations',questions:[q,{...q,term:'Saved',explanation:{body:['Keep this explanation.']}},{...q,term:'Other'}],sources:[{id:'s',name:'Lecture',text:'Two is even; one is odd.'}]})).state;return {db,repo,state};}
const args=state=>({courseId:state.courseId,revision:state.revision});
test('bank batches fill only missing explanations, preserve an active exam, hide keys, and retry safely',async()=>{
 const {db,repo,state}=await setup();try{
  let st=(await executeTool(repo,'start_test',{...args(state),adaptive:false,size:'all',explanationDepth:'mcat_uworld'})).state;
  const before=(await repo.get(st.courseId)).data,requestId=crypto.randomUUID(),payload={...args(st),requestId,questionIds:st.questionIndex.map(q=>q.id),depth:'mcat_uworld'};
  st=(await executeTool(repo,'request_bank_explanations',payload)).state;
  assert.deepEqual(st.bankExplanationRequest,{id:requestId,depth:'mcat_uworld',total:2,completed:0,pending:2});
  assert.equal(st.session.opts.explanationDepth,'mcat_uworld');
  assert.equal((await executeTool(repo,'request_bank_explanations',payload)).state.revision,st.revision);
  const batch=(await executeTool(repo,'read_bank_explanations',{courseId:st.courseId,requestId,limit:1})).request;
  assert.equal(batch.questions.length,1);assert.deepEqual(batch.questions[0].answer,[1]);assert.match(batch.prompt,/MCAT \/ UWorld level/);assert.match(batch.questions[0].grounding,/Lecture/);
  const write={...args(st),requestId,batchId:crypto.randomUUID(),explanations:[{questionId:batch.questions[0].questionId,explanation:{body:['Two is even.'],sources:['Lecture'],choices:[{letter:'A',text:'One is odd.'},{letter:'B',text:'Two is even.'}]}}]};
  st=(await executeTool(repo,'provide_bank_explanations',write)).state;
  assert.equal(st.bankExplanationRequest.pending,1);assert.equal(st.question.explanation,undefined);assert.equal(st.question.answer,undefined);
  assert.equal((await executeTool(repo,'provide_bank_explanations',write)).state.revision,st.revision);
  const after=(await repo.get(st.courseId)).data;assert.deepEqual(after.session,before.session);assert.deepEqual(after.concepts,before.concepts);assert.deepEqual(after.history,before.history);
  for(let i=0;i<before.questions.length;i++){const {explanation,...a}=after.questions[i],{explanation:old,...b}=before.questions[i];assert.deepEqual(a,b);if(old)assert.deepEqual(explanation,old);}
  const rest=(await executeTool(repo,'read_bank_explanations',{courseId:st.courseId,requestId})).request;
  st=(await executeTool(repo,'provide_bank_explanations',{...args(st),requestId,batchId:crypto.randomUUID(),explanations:rest.questions.map(q=>({questionId:q.questionId,explanation:{body:['Even number'],sources:['Lecture']}}))})).state;
  assert.equal(st.bankExplanationRequest.pending,0);assert.ok(st.questionIndex.every(q=>q.hasExplanation));
  st=(await executeTool(repo,'submit_answer',{...args(st),sessionId:st.session.id,questionId:st.question.id,choices:[1]})).state;assert.ok(st.question.explanation.body.length);
 }finally{db.close();}
});
test('bank explanations reject foreign IDs, overlapping jobs, stale writes and unsupported citations atomically',async()=>{
 const {db,repo,state}=await setup();try{
  await assert.rejects(executeTool(repo,'request_bank_explanations',{...args(state),requestId:crypto.randomUUID(),questionIds:['foreign']}),/saved bank/);
  const requestId=crypto.randomUUID();let st=(await executeTool(repo,'request_bank_explanations',{...args(state),requestId,questionIds:state.questionIndex.map(q=>q.id),depth:'quick'})).state;
  await assert.rejects(executeTool(repo,'request_bank_explanations',{...args(st),requestId:crypto.randomUUID(),questionIds:state.questionIndex.map(q=>q.id)}),/Finish/);
  const batch=(await executeTool(repo,'read_bank_explanations',{courseId:st.courseId,requestId})).request;
  const write={...args(st),requestId,batchId:crypto.randomUUID(),explanations:batch.questions.map((q,i)=>({questionId:q.questionId,explanation:{body:['Explanation'],sources:[i?'Invented source':'Lecture']}}))};
  await assert.rejects(executeTool(repo,'provide_bank_explanations',write),/exact source/);assert.equal((await repo.get(st.courseId)).revision,st.revision);
  assert.equal((await executeTool(repo,'read_course_state',{courseId:st.courseId})).state.bankExplanationRequest.completed,0);
  await assert.rejects(executeTool(repo,'provide_bank_explanations',{...write,revision:st.revision-1}),/changed/);
  const other=new CourseRepository(db,'other');await assert.rejects(executeTool(other,'read_bank_explanations',{courseId:st.courseId,requestId}),/not found/);
 }finally{db.close();}
});
test('explanation depths reach question prompts and feedback accepts ordinary keys without stealing controls',()=>{
 for(const [depth,label] of [['quick','Quick'],['comprehensive','Comprehensive'],['mcat_uworld','MCAT / UWorld level']])assert.ok(buildGenerationPrompt({courseId:'c',sources:[],questionCount:0},{mode:'custom',count:1,generateExplanations:true,explanationDepth:depth},'request').includes(`Explanation depth: ${label}`));
 for(const key of ['Enter',' ','a','2','ArrowRight'])assert.equal(feedbackAdvanceKey({key}),true);
 for(const key of ['Tab','Escape','Shift','Control','F11','Dead'])assert.equal(feedbackAdvanceKey({key}),false);
 for(const extra of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true},{isComposing:true},{defaultPrevented:true},{target:{isContentEditable:true}},{target:{closest:()=>({})}}])assert.equal(feedbackAdvanceKey({key:'a',...extra}),false);
});
test('MCP exposes preparation tools without opening a new panel and validates batch output',async()=>{
 const {db,repo,state}=await setup();try{
  const requestId=crypto.randomUUID();await executeTool(repo,'request_bank_explanations',{...args(state),requestId,questionIds:state.questionIndex.map(q=>q.id),depth:'quick'});
  const rpc=async(method,params)=>{const response=await worker.fetch(new Request('https://example.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','oai-authenticated-user-id':'qa'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),{DB:db});return (await response.json()).result;};
  const list=(await rpc('tools/list',{})).tools;
  assert.deepEqual(list.find(t=>t.name==='request_bank_explanations')._meta.ui.visibility,['app']);
  assert.equal(list.find(t=>t.name==='read_bank_explanations')._meta.ui.resourceUri,undefined);
  const result=await rpc('tools/call',{name:'read_bank_explanations',arguments:{courseId:state.courseId,requestId}});
  assert.notEqual(result.isError,true);assert.equal(result.structuredContent.request.questions.length,2);assert.match(result.structuredContent.request.prompt,/Explanation depth: Quick/);
 }finally{db.close();}
});
