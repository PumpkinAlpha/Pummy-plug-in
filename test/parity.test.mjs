import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {banksFromFile} from '../app/import.js';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK9sAAAAASUVORK5CYII=';
const base={term:'Basics',stem:'Choose two.',options:['one','two','three'],answer:[1],sourceId:'s',objective:'o'};
const boards=[{term:'Order',stem:'Order items.',type:'order',items:['first','second','third']},{term:'Match',stem:'Match pairs.',type:'match',pairs:[{left:'A',right:'Alpha'},{left:'B',right:'Beta'},{left:'C',right:'Gamma'}]},{term:'Label',stem:'Label the diagram.',type:'label',figure:{dataUrl:image},targets:[{x:.1,y:.1,w:.2,h:.2,answer:'left'},{x:.6,y:.1,w:.2,h:.2,answer:'right'}]}];
async function setup(questions=[base]){const db=new LocalD1(),repo=new CourseRepository(db,'qa'),state=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Parity',questions,sources:[{id:'s',name:'Handout',text:'Two is even. One and three are odd.',weekId:'week1'}],objectives:[{id:'o',text:'Understand the basics',num:'1'}]})).state;return {db,repo,state};}
const args=s=>({courseId:s.courseId,revision:s.revision,sessionId:s.session?.id});
async function start(repo,s,extra={}){return (await executeTool(repo,'start_test',{...args(s),adaptive:false,size:1,...extra})).state;}
async function answer(repo,s,extra){return (await executeTool(repo,'submit_answer',{...args(s),questionId:s.question.id,...extra})).state;}
const next=async(repo,s)=>(await executeTool(repo,'next_question',args(s))).state;
test('all interactive formats hide keys, validate responses, grade and roundtrip exports',async()=>{
 for(const raw of boards){const {db,repo,state:imported}=await setup([raw]);let s=await start(repo,imported);const q=s.question;
  assert.equal(q.definition,undefined);assert.equal(q.answer,undefined);assert.equal(q.correctItems,undefined);
  if(q.type==='order')assert.notDeepEqual(q.items,raw.items);
  if(q.type==='match')assert.ok(q.pairs.every(p=>!Object.hasOwn(p,'right')));
  if(q.type==='label')assert.ok(q.targets.every(t=>!Object.hasOwn(t,'answer')));
  await assert.rejects(answer(repo,s,{response:{invalid:'anything'}}));
  const response=q.type==='order'?raw.items:q.type==='match'?Object.fromEntries(raw.pairs.map((p,i)=>[i,p.right])):{t1:'left',t2:'right'};
  const old=s;s=await answer(repo,s,{response});assert.equal(s.session.feedback.correct,true);assert.deepEqual(await answer(repo,old,{response}),s);
  s=await next(repo,s);assert.equal(s.session.phase,'done');assert.ok(s.session.results[0].question.definition);assert.equal(s.history.length,1);
  const exported=(await executeTool(repo,'export_bank',{courseId:s.courseId})).export;const restored=(await executeTool(repo,'import_questions',{...exported,requestId:crypto.randomUUID()})).state;assert.equal(restored.questionCount,1);assert.equal(restored.progress.concepts[0].attempts,1);db.close();
 }
});
test('week, source, type, objective, set and empty filters never broaden an exam',async()=>{
 const {db,repo,state}=await setup([{...base,setId:'set1',weekId:'week1'}, {...base,term:'Other',sourceId:undefined,objective:undefined,multi:true,answer:[0,1]}]);
 for(const filter of [{sourceIds:[]},{types:[]},{objectiveIds:[]},{weekId:'missing'},{setId:'missing'},{objectiveIds:['not-found']},{types:['label']},{sourceIds:['not-found']}])await assert.rejects(start(repo,state,filter),/No questions match/);
 const before=await repo.get(state.courseId);assert.equal(before.revision,1);assert.equal(before.data.session,null);
 const s=await start(repo,state,{weekId:'week1',setId:'set1',objectiveIds:['o'],sourceIds:['s'],types:['mcq']});assert.equal(s.question.term,'Basics');db.close();
});
test('flag notes, saved preferences, read-only sources and end-exam preserve attempts and history',async()=>{
 const {db,repo,state:imported}=await setup();let s=await start(repo,imported);
 s=(await executeTool(repo,'flag_question',{...args(s),questionId:s.question.id,flagged:true,reason:'Check the wording'})).state;assert.equal(s.question.flagReason,'Check the wording');
 const prefs=(await executeTool(repo,'save_preferences',{...args(s),size:7,adaptive:true,practiceFirst:false,includeReviews:false})).state;assert.equal(prefs.session.id,s.session.id);assert.equal(prefs.preferences.size,7);s=prefs;
 const src=await executeTool(repo,'read_source',{courseId:s.courseId,sourceId:'s'});assert.match(src.source.text,/even/);assert.equal((await repo.get(s.courseId)).revision,s.revision);
 s=await answer(repo,s,{choices:[1]});s=(await executeTool(repo,'end_test',args(s))).state;assert.equal(s.session.firstTry,1);assert.equal(s.session.done,1);assert.equal(s.history.length,1);assert.equal(s.history[0].results.length,1);assert.equal(s.progress.concepts[0].attempts,1);db.close();
});
test('ending an unanswered concept marks it unresolved, not correct',async()=>{const {db,repo,state}=await setup();let s=await start(repo,state);s=(await executeTool(repo,'end_test',args(s))).state;assert.equal(s.session.firstTry,0);assert.equal(s.session.unresolved,1);db.close();});
test('explanations cannot reveal an unsubmitted question, and do not advance the exam',async()=>{
 const {db,repo,state}=await setup();let s=await start(repo,state);
 await assert.rejects(executeTool(repo,'request_explanation',{...args(s),questionId:s.question.id}),/Submit/);
 s=await answer(repo,s,{choices:[1]});s=(await executeTool(repo,'request_explanation',{...args(s),questionId:s.question.id,choice:0})).state;assert.ok(s.explanationRequest.prompt.includes('Handout'));
 await assert.rejects(executeTool(repo,'provide_explanation',{...args(s),requestId:'expired',explanation:{body:['Wrong request']}}),/expired/);
 s=(await executeTool(repo,'provide_explanation',{...args(s),requestId:s.explanationRequest.id,explanation:{body:['One is odd [Handout].']}})).state;assert.equal(s.question.optionMore[0],'One is odd [Handout].');assert.equal(s.session.phase,'feedback');assert.equal(s.explanationRequest,null);
 s=(await executeTool(repo,'request_explanation',{...args(s),questionId:s.question.id})).state;s=(await executeTool(repo,'provide_explanation',{...args(s),requestId:s.explanationRequest.id,explanation:{body:['Two is even [Handout].'],table:{columns:['Number','Property'],rows:[['2','even']]}}})).state;assert.equal(s.question.explanation.table.rows[0][1],'even');db.close();
});
test('ten-question checkpoint has rich review results and continues the saved queue',async()=>{
 const {db,repo,state}=await setup(Array.from({length:11},(_,i)=>({...base,term:'Concept '+i})));let s=await start(repo,state,{size:11});
 for(let i=0;i<10;i++){s=await answer(repo,s,{choices:i===0?[0]:[1]});s=await next(repo,s);}
 // The missed nonadaptive item must close before its block checkpoint.
 if(s.session.phase==='question'){s=await answer(repo,s,{choices:[1]});s=await next(repo,s);}
 assert.equal(s.session.phase,'checkpoint');assert.equal(s.session.results.length,10);assert.ok(s.session.results.every(r=>r.question?.answer));s=await next(repo,s);assert.equal(s.session.phase,'question');assert.equal(s.question.term,'Concept 10');db.close();
});
test('spaced-review imports preserve retained mastery and trigger objective celebration after a due answer',async()=>{
 const {db,repo,state}=await setup();const data=await repo.get(state.courseId);const c=data.data.concepts[0];Object.assign(c,{status:'review',interval:8,ease:2.6,due:1,attempts:3,correct:3});const rev=await repo.save(data.data,data.revision);let s=await start(repo,{...state,revision:rev});s=await answer(repo,s,{choices:[1]});assert.equal(s.progress.retained,1);assert.equal(s.session.masteryNotices[0].id,'o');s=(await executeTool(repo,'dismiss_mastery',args(s))).state;assert.equal(s.session.masteryNotices.length,0);db.close();
});
test('backup imports attach local diagram images and restore concept schedules without raw desktop sessions',()=>{
 const q={...boards[2],id:'ql',origin:'generated',keyed:true,figure:{assetId:'fig',file:'Shapes',unit:'page',page:1},bank:['left','right'],targets:boards[2].targets.map((t,i)=>({...t,id:'t'+(i+1)}))};const banks=banksFromFile({format:'daniel-ai-backup',documents:[['data/users/local/workup/courses/c',{name:'Backup'}],['data/users/local/workup/courses/c/questions/ql',q],['data/users/local/workup/courses/c/concepts/co',{name:'Label',status:'review',interval:21,ease:2.6}]],assets:[{id:'fig',type:'image/png',data:image.split(',')[1]}]},'bank.json');assert.equal(banks[0].questions[0].figure.dataUrl,image);assert.equal(banks[0].conceptProgress[0].interval,21);assert.equal(banks[0].session,undefined);
});
test('unsafe image URLs, duplicate interactive labels, and invalid diagram bounds are rejected atomically',async()=>{const {db,repo,state}=await setup();for(const q of [{...boards[2],figure:{dataUrl:'https://example.com/track.png'}},{...boards[2],targets:boards[2].targets.map(t=>({...t,answer:'same'}))},{...boards[2],targets:boards[2].targets.map(t=>({...t,x:.95}))}])await assert.rejects(executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Bad',questions:[q]}));assert.equal((await repo.list()).length,1);db.close();});
test('a deferred retry never leaks its answer through earlier results or history',async()=>{const {db,repo,state}=await setup();let s=await start(repo,state);s=await answer(repo,s,{choices:[0]});s=await next(repo,s);assert.equal(s.session.phase,'question');assert.equal(s.session.results[0].question.revealed,false);assert.equal(s.session.results[0].question.answer,undefined);assert.equal(s.session.results[0].question.definition,undefined);db.close();});
