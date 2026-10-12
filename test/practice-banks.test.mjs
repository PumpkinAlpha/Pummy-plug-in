import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {quizletTSV} from '../lib/quizlet.js';
import {TutorRepository} from '../worker/tutor-repository.js';
import {bankInsert} from '../worker/practice-banks.js';
const question={term:'Numbers',stem:'Which is even?',options:['One','Two'],answer:[1],definition:'Two is even.',lecture:'A',sourceId:'a'};
async function setup(t){const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'student'),call=(name,args)=>executeTool(repo,name,args);const {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Archive test',questions:[question],sources:[{id:'a',name:'Lecture A',lecture:'A',text:'Two is even.'}]});return {db,repo,call,state};}
test('every append is archived once, persists beyond rolling receipts and preserves a live exam',async t=>{
 const {repo,call,state:initial}=await setup(t);let state=(await call('start_test',{courseId:initial.courseId,revision:initial.revision,size:1,adaptive:false})).state;
 const started=(await repo.get(state.courseId)).data.session;
 for(let i=0;i<42;i++){const args={courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),questions:[{...question,stem:'Bank question '+i,setId:'Bank '+i}]};state=(await call('add_questions',args)).state;await call('add_questions',args);}
 const {banks}=await call('list_practice_banks',{courseId:state.courseId});assert.equal(banks.length,43);assert.equal(new Set(banks.map(b=>b.id)).size,43);assert.equal(banks.reduce((n,b)=>n+b.count,0),43);assert.deepEqual((await repo.get(state.courseId)).data.session,started);
});
test('editing archive keys leaves course revision, active answers, results and mastery untouched; stale edits reject',async t=>{
 const {repo,call,state:initial}=await setup(t);const state=(await call('start_test',{courseId:initial.courseId,revision:initial.revision,size:1,adaptive:false})).state,before=await repo.get(state.courseId);
 const {banks}=await call('list_practice_banks',{courseId:state.courseId}),{bank}=await call('read_practice_bank',{courseId:state.courseId,bankId:banks[0].id});
 const args={courseId:state.courseId,bankId:bank.id,bankRevision:bank.revision,name:'Edited bank',questionId:bank.questions[0].id,question:{...question,stem:'Edited stem',answer:[0],definition:'Edited explanation.'}};
 const edited=await call('edit_practice_bank',args);assert.equal(edited.bank.questions[0].answer[0],0);assert.equal(edited.bank.revision,2);assert.deepEqual(await repo.get(state.courseId),before);
 await assert.rejects(call('edit_practice_bank',args),/changed in another window/);
 await assert.rejects(executeTool(new CourseRepository(repo.db,'other'),'read_practice_bank',{courseId:state.courseId,bankId:bank.id}),/Course not found/);
 await assert.rejects(call('edit_practice_bank',{...args,bankRevision:2,question:{...question,answer:[9]}}),/valid answer/);
});
test('losing a course compare-and-swap cannot leave an orphaned question bank',async t=>{
 const {repo,call,state}=await setup(t),saved=await repo.get(state.courseId),next=structuredClone(saved.data);next.questions.push({...next.questions[0],id:'losing-question'});
 await repo.save(saved.data,saved.revision,saved.data);
 await assert.rejects(repo.save(next,saved.revision,saved.data),/changed in another window/);
 assert.equal((await call('list_practice_banks',{courseId:state.courseId})).banks.length,1);
});
test('legacy bank recovery and edits survive receipt loss without duplicate cards',async t=>{
 const {db,repo,call,state}=await setup(t);await db.prepare('DELETE FROM practice_banks').run();
 const {banks}=await call('list_practice_banks',{courseId:state.courseId});assert.equal(banks[0].revision,0);assert.equal(banks[0].recovered,true);
 const {bank}=await call('read_practice_bank',{courseId:state.courseId,bankId:banks[0].id});await call('edit_practice_bank',{courseId:state.courseId,bankId:bank.id,bankRevision:0,name:bank.name,questionId:bank.questions[0].id,question});
 const result=await call('list_practice_banks',{courseId:state.courseId});assert.equal(result.banks.length,1);assert.equal(result.banks[0].revision,1);assert.equal((await repo.get(state.courseId)).revision,state.revision);
});
test('tutor completion archives practice before Add to bank, atomically and without duplicating the saved batch',async t=>{
 const {repo,call,state}=await setup(t),tutor=new TutorRepository(repo),pid=crypto.randomUUID(),rid=crypto.randomUUID(),appendId=crypto.randomUUID(),request={id:rid,appendId,status:'pending',page:1,context:{professorSlide:{sourceId:'a',text:'Two is even.'},related:{excerpts:[]}}};
 await tutor.putRequest(state.courseId,pid,rid,request);
 const archived={id:'batch:'+appendId,name:'Tutor practice',createdAt:Date.now(),questions:[{...question,id:'tutor-question'}]};
 await tutor.completeRequest(state.courseId,pid,rid,{...request,status:'complete'},request,(gate,bindings)=>bankInsert(repo,state.courseId,archived,gate,bindings));
 const next=(await call('add_questions',{courseId:state.courseId,revision:state.revision,requestId:appendId,questions:[question]})).state;
 assert.equal((await call('list_practice_banks',{courseId:state.courseId})).banks.length,2);
 assert.equal(next.questionCount,2);
 const before=(await call('list_practice_banks',{courseId:state.courseId})).banks.length;
 await assert.rejects(tutor.completeRequest(state.courseId,pid,rid,request,request,(gate,bindings)=>bankInsert(repo,state.courseId,{...archived,id:'must-rollback'},gate,bindings)),/changed/);
 assert.equal((await call('list_practice_banks',{courseId:state.courseId})).banks.length,before);
});
test('Quizlet uses exactly two columns and one row per question for every question type',()=>{
 const questions=[{...question,stem:'Question\twith\nnewlines',definition:'Explain\r\nwith tab\tcharacters'}, {type:'multi',stem:'Select',options:['A','B','C'],answer:[0,2]}, {type:'order',stem:'Order',items:['C','A','B']},{type:'match',stem:'Match',pairs:[{left:'A',right:'1'},{left:'B',right:'2'},{left:'C',right:'3'}]},{type:'label',stem:'Label',figure:{file:'Diagram'},targets:[{answer:'Heart'},{answer:'Lung'}]},{type:'image',stem:'Identify',options:['X','Y'],answer:[1]}];
 const rows=quizletTSV(questions).trimEnd().split('\n');assert.equal(rows.length,6);assert.ok(rows.every(row=>row.split('\t').length===2));assert.match(rows[1],/A\. A; C\. C/);assert.match(rows[2],/C → A → B/);assert.match(rows[3],/A = 1/);assert.match(rows[4],/Target 1: Heart/);assert.match(rows[5],/B\. Y/);
});
test('adaptive follow-ups and older unsaved slide practice appear in the archive',async t=>{
 const {repo,call,state:initial}=await setup(t);let state=(await call('start_test',{courseId:initial.courseId,revision:initial.revision,size:1,adaptive:true})).state;
 state=(await call('submit_answer',{courseId:state.courseId,revision:state.revision,sessionId:state.session.id,questionId:state.question.id,choices:[0]})).state;
 state=(await call('provide_question',{courseId:state.courseId,revision:state.revision,generationId:state.generation.id,question:{...question,term:'Evenness prerequisite',stem:'Which number is divisible by two?',optionNotes:['One is odd.','Two is even.']}})).state;
 let {banks}=await call('list_practice_banks',{courseId:state.courseId});assert.equal(banks.length,2);assert.equal(banks.reduce((n,b)=>n+b.count,0),2);
 const tutor=new TutorRepository(repo),appendId=crypto.randomUUID();await tutor.putRequest(state.courseId,crypto.randomUUID(),crypto.randomUUID(),{status:'complete',appendId,page:1,completedAt:Date.now(),questions:[question]});
 banks=(await call('list_practice_banks',{courseId:state.courseId})).banks;assert.equal(banks.length,3);assert.ok(banks.find(b=>b.id==='batch:'+appendId)?.recovered);
});
test('archive editor accepts ordering, matching and diagram labels with their keys intact',async t=>{
 const {repo,call,state}=await setup(t),figure={dataUrl:'data:image/png;base64,iVBORw0KGgo=',file:'Diagram',unit:'page',page:1,marks:[]},questions=[{type:'order',term:'Order',stem:'Put in order',items:['first','second','third']},{type:'match',term:'Match',stem:'Match pairs',pairs:[{left:'A',right:'one'},{left:'B',right:'two'},{left:'C',right:'three'}]},{type:'label',term:'Label',stem:'Label diagram',figure,targets:[{x:0,y:0,w:.2,h:.2,answer:'Heart'},{x:.5,y:.5,w:.2,h:.2,answer:'Lung'}]}];
 const requestId=crypto.randomUUID();await call('add_questions',{courseId:state.courseId,revision:state.revision,requestId,questions});let {bank}=await call('read_practice_bank',{courseId:state.courseId,bankId:'batch:'+requestId});const before=await repo.get(state.courseId);
 for(const q of bank.questions){const question={...q,stem:q.stem+' edited'};if(q.type==='label')question.targets=q.targets.map((t,i)=>({...t,answer:i===0?'Edited heart':t.answer}));bank=(await call('edit_practice_bank',{courseId:state.courseId,bankId:bank.id,bankRevision:bank.revision,name:bank.name,questionId:q.id,question})).bank;}
 assert.deepEqual(await repo.get(state.courseId),before);assert.equal(bank.questions[2].targets[0].answer,'Edited heart');assert.ok(bank.questions[2].bank.includes('Edited heart'));assert.equal(quizletTSV(bank.questions).trimEnd().split('\n').length,3);
});
