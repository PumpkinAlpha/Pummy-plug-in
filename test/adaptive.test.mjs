import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
const qs=[{term:'Multiplication',stem:'What is 3 + 4 × 2?',options:['14','11','10','7'],answer:[1],definition:'Multiply before adding.'},{term:'Fractions',stem:'Which is one half?',options:['1/4','2/4','3/4','4/4'],answer:[1]}];
async function setup(questions=qs){const db=new LocalD1(),repo=new CourseRepository(db,'alice');const {state}=await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Test',questions,sources:[{id:'reference',name:'Reference',text:'Multiply and divide before adding and subtracting. Multiplication means repeated addition.'}]});return {db,repo,state};}
const args=state=>({courseId:state.courseId,revision:state.revision,sessionId:state.session.id});
const next=async(repo,state)=> (await executeTool(repo,'next_question',args(state))).state;
const start=async(repo,state,adaptive=true,size=2)=>(await executeTool(repo,'start_test',{courseId:state.courseId,revision:state.revision,adaptive,size})).state;
const answer=async(repo,state,choices)=>(await executeTool(repo,'submit_answer',{...args(state),questionId:state.question.id,choices})).state;
const provide=async(repo,state,question)=>(await executeTool(repo,'provide_question',{courseId:state.courseId,revision:state.revision,generationId:state.generation.id,question:{...question,optionNotes:question.options.map((_,i)=>i===question.answer[0]?'This choice follows the course rule.':'This choice does not follow the course rule.')}})).state;
test('adaptive miss → foundation → climb → original resolution survives new repository instances',async()=>{
 const {db,repo,state:imported}=await setup();let state=await start(repo,imported,true,1);
 assert.equal(state.question.answer,undefined);assert.equal(state.question.definition,undefined);
 state=await answer(repo,state,[0]);assert.equal(state.session.feedback.correct,false);assert.ok(state.generation?.prompt.includes('foundational'));
 const generationId=state.generation.id;
 const restored=new CourseRepository(db,'alice');state=(await executeTool(restored,'open_test',{courseId:state.courseId})).state;
 assert.equal(state.generation.id,generationId);
 state=await provide(restored,state,{term:'Multiplication basics',stem:'What does 4 × 2 represent?',options:['4 + 2','4 + 4'],answer:[1],definition:'Two groups of four make eight.'});
 assert.equal(state.generation,null);state=await next(restored,state);assert.equal(state.question.depth,1);assert.equal(state.question.answer,undefined);
 let stored=await restored.get(state.courseId);const key=stored.data.questions.find(q=>q.id===state.question.id).answer;
 state=await answer(restored,state,key);assert.equal(state.session.nextType,'climb');assert.ok(state.generation);assert.equal(state.question.optionNotes.length,2);assert.ok(state.question.optionNotes.every(Boolean));
 state=await provide(restored,state,{term:'Order of operations',stem:'What is 1 + 3 × 2?',options:['7','8','9'],answer:[0],definition:'3 × 2 = 6, then 1 + 6 = 7.'});
 state=await next(restored,state);assert.equal(state.question.depth,0);stored=await restored.get(state.courseId);
 state=await answer(restored,state,stored.data.questions.find(q=>q.id===state.question.id).answer);state=await next(restored,state);
 assert.equal(state.session.phase,'done');assert.equal(state.session.resolved,1);assert.equal(state.session.firstTry,0);assert.equal(state.session.unresolved,0);
 assert.equal((await restored.get(state.courseId)).data.concepts.find(c=>c.id==='c-multiplication').interval,1);db.close();
});
test('exact answer retries are idempotent, stale revisions and wrong question IDs cannot change attempts',async()=>{
 const {db,repo,state:imported}=await setup();const original=await start(repo,imported,false);const updated=await answer(repo,original,[1]);
 assert.deepEqual(await answer(repo,original,[1]),updated);
 await assert.rejects(answer(repo,original,[0]),/changed/);
 await assert.rejects(executeTool(repo,'submit_answer',{...args(updated),questionId:'wrong',choices:[1]}),/no longer active/);
 const saved=await repo.get(original.courseId);assert.equal(saved.data.questions.find(q=>q.id===original.question.id).attempts,1);db.close();
});
test('nonadaptive misses repeat at the end without generation; multi-select is server graded',async()=>{
 const {db,repo,state:imported}=await setup([{term:'Select evens',stem:'Choose all even numbers.',options:['1','2','4'],answer:[1,2],multi:true}]);
 let state=await start(repo,imported,false,1);state=await answer(repo,state,[1]);assert.equal(state.session.feedback.correct,false);assert.equal(state.generation,null);
 state=await next(repo,state);assert.equal(state.session.phase,'question');state=await answer(repo,state,[1,2]);state=await next(repo,state);assert.equal(state.session.phase,'done');assert.equal(state.session.resolved,1);db.close();
});
test('invalid bank is atomic, users cannot access each other, and compare-and-swap rejects concurrent writes',async()=>{
 const {db,repo,state}=await setup();await assert.rejects(executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Bad',questions:[qs[0],{...qs[1],answer:[7]}]}),/valid answer/);assert.equal((await repo.list()).length,1);
 const bob=new CourseRepository(db,'bob');assert.deepEqual(await bob.list(),[]);await assert.rejects(executeTool(bob,'open_test',{courseId:state.courseId}),/not found/);
 const a=await repo.get(state.courseId),b=await repo.get(state.courseId);await repo.save(a.data,a.revision);await assert.rejects(repo.save(b.data,b.revision),/another window/);db.close();
});
test('skip marks unresolved rather than counting an unattempted question as correct',async()=>{
 const {db,repo,state:imported}=await setup();let state=await start(repo,imported,true,1);state=(await executeTool(repo,'skip_question',args(state))).state;assert.equal(state.session.firstTry,0);assert.equal(state.session.unresolved,1);assert.equal(state.session.phase,'done');db.close();
});
test('four-level depth cap and skipping a pending due-review question do not duplicate results',async()=>{
 const {db,repo,state:imported}=await setup();let state=await start(repo,imported,true,1);
 for(let depth=0;depth<4;depth++){
  const saved=await repo.get(state.courseId),q=saved.data.questions.find(q=>q.id===state.question.id);const wrong=state.question.options.findIndex((_,i)=>!q.answer.includes(i));
  state=await answer(repo,state,[wrong]);assert.equal(state.session.nextType,'deeper');
  state=await provide(repo,state,{term:'Foundation '+(depth+1),stem:'Foundation '+(depth+1)+' question?',options:['A choice','B choice'],answer:[0]});state=await next(repo,state);assert.equal(state.question.depth,depth+1);
 }
 const saved=await repo.get(state.courseId),q=saved.data.questions.find(q=>q.id===state.question.id);
 state=await answer(repo,state,[q.answer[0]===0?1:0]);assert.equal(state.session.nextType,'retry');
 state=(await executeTool(repo,'skip_question',args(state))).state;assert.equal(state.session.phase,'done');assert.equal(state.session.results.length,1);
 // A review with only an already-seen question needs host generation. Skipping it removes
 // that queue item, rather than finalizing the previous root a second time.
 let data=await repo.get(state.courseId);data.data.concepts.find(c=>c.id==='c-multiplication').status='review';data.data.concepts.find(c=>c.id==='c-multiplication').due=1;data.data.questions[0].lastResult='correct';data.data.questions=data.data.questions.filter(q=>q.origin!=='practice'||q.conceptId==='c-multiplication');await repo.save(data.data,data.revision);
 state=(await executeTool(repo,'open_test',{courseId:state.courseId})).state;state=await start(repo,state,true,1);assert.equal(state.session.phase,'loading');assert.ok(state.generation);
 state=(await executeTool(repo,'skip_question',args(state))).state;assert.equal(state.session.phase,'done');assert.equal(state.session.results.length,0);assert.equal(state.session.total,0);db.close();
});
