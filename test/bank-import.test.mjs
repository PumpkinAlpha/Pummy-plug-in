import test from 'node:test';
import assert from 'node:assert/strict';
import {importBankFiles} from '../app/bank-import.js';
import {banksFromFile} from '../app/import.js';
import {executeTool} from '../worker/tools.js';
import {CourseRepository} from '../worker/repository.js';
import {LocalD1} from '../scripts/local-db.mjs';
const bank=count=>({name:'Backup',questions:Array.from({length:count},(_,i)=>({term:`Concept ${i}`,stem:`Question ${i}?`,options:['Yes','No'],answer:[0],sourceId:'lecture',progress:{attempts:2,correctCount:1,lastSeen:123,lastResult:'wrong'}})),sources:[{id:'lecture',name:'Lecture',text:'Course reference.'}],objectives:[],conceptProgress:Array.from({length:count},(_,i)=>({term:`Concept ${i}`,status:'review',interval:21,ease:2.6,due:123,reps:2,lapses:1,attempts:2,correct:1,lastSeen:123}))});
function setup(t){const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'bank-import-test'),call=(n,a)=>executeTool(repo,n,a);return {db,repo,call};}

test('a 500-question export restores in bounded batches with every question and concept schedule',async t=>{
 const {repo,call}=setup(t),attemptRef={current:null},calls=[];
 await importBankFiles({banks:[bank(500)],attemptRef,call:async(n,a)=>{calls.push({n,a});return call(n,a);}});
 const [course]=await repo.list(),saved=await repo.get(course.id);
 assert.equal(saved.data.questions.length,500);assert.equal(saved.data.concepts.length,500);assert.ok(saved.data.questions.every(q=>q.attempts===2));assert.ok(saved.data.concepts.every(c=>c.interval===21&&c.reps===2));
 assert.deepEqual(calls.filter(c=>c.a.questions).map(c=>c.a.questions.length),[200,200,100]);assert.equal(attemptRef.current,null);
 const exported=(await call('export_bank',{courseId:course.id})).export;
 await importBankFiles({banks:banksFromFile(exported,'backup.json'),attemptRef,call});
 const courses=await repo.list();assert.equal(courses.length,2);assert.ok(courses.every(c=>c.questionCount===500));
});

test('lost responses at either import step reuse receipts without duplicate courses or questions',async t=>{
 const {repo,call}=setup(t),attemptRef={current:null};let failImport=true,failAppend=true;const ids=[];
 const uncertain=async(n,a)=>{const result=await call(n,a);if(a.questions)ids.push(a.requestId);if(n==='import_questions'&&failImport){failImport=false;throw new Error('Lost import response');}if(n==='add_questions'&&failAppend){failAppend=false;throw new Error('Lost append response');}return result;};
 const run=()=>importBankFiles({banks:[bank(204)],attemptRef,call:uncertain});
 await assert.rejects(run(),/Lost import response.*same JSON/);await assert.rejects(run(),/Lost append response.*same JSON/);await run();
 assert.equal((await repo.list()).length,1);assert.equal((await repo.list())[0].questionCount,204);assert.equal(ids[0],ids[1]);assert.equal(ids[2],ids[3]);
});

test('appending a bank preserves existing concept progress and the active exam while restoring new schedules',async t=>{
 const {repo,call}=setup(t);const initial=(await call('import_questions',{...bank(1),requestId:crypto.randomUUID()})).state;
 await call('start_test',{courseId:initial.courseId,revision:initial.revision,size:'all',adaptive:false});
 const before=(await repo.get(initial.courseId)).data,imported=bank(204);imported.conceptProgress[0].interval=999;
 await importBankFiles({banks:[imported],appendCourseId:initial.courseId,folder:{kind:'lecture',label:'Imported folder'},attemptRef:{current:null},call});
 const after=(await repo.get(initial.courseId)).data;assert.deepEqual(after.session,before.session);assert.deepEqual(after.concepts.find(c=>c.name==='Concept 0'),before.concepts[0]);assert.ok(after.concepts.filter(c=>c.name!=='Concept 0').every(c=>c.interval===21));assert.equal(after.questions.length,205);
 assert.ok(after.questions.slice(1).every(q=>q.lecture==='Imported folder'));
});

test('invalid bank sizes are rejected before writing any course',async t=>{
 const {repo,call}=setup(t);await assert.rejects(importBankFiles({banks:[bank(501)],attemptRef:{current:null},call}),/500/);assert.deepEqual(await repo.list(),[]);
});
