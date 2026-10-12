import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedBytes} from '../lib/stream-bytes.js';
import {convertBytes,MAX_CONVERSION_BYTES,MAX_CONVERTED_PDF_BYTES} from '../worker/presentation-converter.js';
import {importBankFiles} from '../app/bank-import.js';
import {uploadPresentationFile} from '../app/tutor-files.js';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {LocalD1} from '../scripts/local-db.mjs';
const bank={name:'Reload recovery',questions:Array.from({length:204},(_,i)=>({term:`Concept ${i}`,stem:`Question ${i}?`,options:['Yes','No'],answer:[0]})),sources:[],objectives:[]};
const memory=()=>{const values=new Map();return {values,getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
function setup(t){const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'deep-review'),call=(n,a)=>executeTool(repo,n,a);return {repo,call,db};}
test('unknown-length streams are cancelled as soon as they cross the byte bound',async()=>{
 let cancelled=false;const body=new ReadableStream({pull(c){c.enqueue(new Uint8Array(600));},cancel(){cancelled=true;}});
 await assert.rejects(boundedBytes(new Response(body),1000),e=>e.status===413);assert.equal(cancelled,true);
});
test('declared oversized streams are rejected without reading and empty streams remain empty',async()=>{
 let cancelled=false;const body=new ReadableStream({cancel(){cancelled=true;}});
 await assert.rejects(boundedBytes(new Response(body,{headers:{'content-length':'2000'}}),1000),e=>e.status===413);assert.equal(cancelled,true);assert.equal((await boundedBytes(new Response(null),1000)).length,0);
});
test('oversized PowerPoint is rejected before any converter call',async()=>{
 let called=false;await assert.rejects(convertBytes({fetch:async()=>{called=true;}},'pptx',new Uint8Array(MAX_CONVERSION_BYTES+1)),/16 MB/);assert.equal(called,false);
});
test('converter output is bounded even without Content-Length and error bodies cannot grow without bound',async()=>{
 let cancelled=false;const converter={fetch:async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}))};
 await assert.rejects(convertBytes(converter,'pptx',new Uint8Array(1)),e=>e.status===413);assert.equal(cancelled,true);
 await assert.rejects(convertBytes({fetch:async()=>new Response('failure'.repeat(1000),{status:422})},'pptx',new Uint8Array(1)),/Could not generate/);
 await assert.rejects(convertBytes({fetch:async()=>new Response(null)},'pptx',new Uint8Array(1)),/empty PDF/);
});
test('list presentations reports actual converter availability and its input limit',async t=>{
 const {call,repo}=setup(t),{state}=await call('create_course',{name:'Capabilities',requestId:crypto.randomUUID()});
 assert.deepEqual((await call('list_presentations',{courseId:state.courseId})).presentationCapabilities,{nativePowerPoint:true,automaticConversion:false,maxConversionBytes:MAX_CONVERSION_BYTES});repo.converter={fetch(){}};assert.equal((await call('list_presentations',{courseId:state.courseId})).presentationCapabilities.automaticConversion,true);
});
test('lost append response resumes after reload using only account-scoped receipt IDs',async t=>{
 const {call,repo}=setup(t),storage=memory();let fail=true;
 const interrupted=async(n,a)=>{const result=await call(n,a);if(n==='add_questions'&&fail){fail=false;throw Error('Lost response');}return result;};
 await assert.rejects(importBankFiles({banks:[bank],attemptRef:{current:null},call:interrupted,storage,recoveryScope:'account-a'}),/after reloading/);
 const journal=[...storage.values.values()][0];assert.ok(!journal.includes('Question 0')&&!journal.includes('Reload recovery'));
 await importBankFiles({banks:[structuredClone(bank)],attemptRef:{current:null},call,storage,recoveryScope:'account-a'});
 assert.equal((await repo.list()).length,1);assert.equal((await repo.list())[0].questionCount,204);assert.equal(storage.values.size,0);
});
test('another account cannot consume a recovery journal and malformed journals are ignored',async t=>{
 const {call,repo}=setup(t),storage=memory();let fail=true;
 await assert.rejects(importBankFiles({banks:[bank],attemptRef:{current:null},call:async(n,a)=>{const r=await call(n,a);if(n==='import_questions'&&fail){fail=false;throw Error('Lost response');}return r;},storage,recoveryScope:'account-a'}));
 await importBankFiles({banks:[bank],attemptRef:{current:null},call,storage,recoveryScope:'account-b'});assert.equal((await repo.list()).length,2);assert.equal(storage.values.size,1);
 storage.setItem('pummy-bank-import:account-b','invalid json');await importBankFiles({banks:[{...bank,questions:bank.questions.slice(0,1)}],attemptRef:{current:null},call,storage,recoveryScope:'account-b'});assert.equal((await repo.list()).length,3);
});
test('rejected source sync and rolled-back course saves never publish original asset bytes',async t=>{
 const {call,repo,db}=setup(t),{state}=await call('create_course',{name:'Atomic originals',requestId:crypto.randomUUID()}),assetId=await uploadPresentationFile(call,state.courseId,new File(['Reference'],'reference.txt'),{source:true});
 const args={courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[{id:'source',name:'Reference',text:'Reference',originalAssetId:assetId}],objectives:[{id:'invalid',text:'Unknown source',sourceId:'missing'}]};
 await assert.rejects(call('sync_course_sources',args),/missing source/);assert.equal((await db.prepare('SELECT ready FROM tutor_assets WHERE id=?').bind(assetId).first()).ready,0);
 db.db.exec("CREATE TRIGGER block_course_write BEFORE UPDATE ON courses BEGIN SELECT RAISE(ABORT,'forced save failure'); END");
 await assert.rejects(call('sync_course_sources',{...args,objectives:[]}),/forced save failure/);assert.equal((await db.prepare('SELECT ready FROM tutor_assets WHERE id=?').bind(assetId).first()).ready,0);
 db.db.exec('DROP TRIGGER block_course_write');await call('sync_course_sources',{...args,objectives:[]});assert.equal((await db.prepare('SELECT ready FROM tutor_assets WHERE id=?').bind(assetId).first()).ready,1);assert.equal((await repo.get(state.courseId)).data.sources.length,1);
});
test('home source and folder counts exclude recently deleted sources',async t=>{
 const {call,repo}=setup(t);let {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Visible references',questions:[{stem:'Q?',options:['Yes','No'],answer:[0]}],sources:[{id:'a',name:'A',text:'A',lecture:'Hidden folder'},{id:'b',name:'B',text:'B'}]});
 state=(await call('delete_source',{courseId:state.courseId,revision:state.revision,sourceId:'a'})).state;const [course]=await repo.list();assert.equal(course.sourceCount,1);assert.equal(course.weekCount,1);assert.equal(state.deletedSources.length,1);
});

test('bank plans fit UTF-8 request bytes and preflight all courses before writing',async()=>{
 const oversized={...bank,name:'Oversized',sources:[{id:'s',text:'字'.repeat(500000)}]};let calls=0;
 await assert.rejects(importBankFiles({banks:[bank,oversized],attemptRef:{current:null},call:async()=>{calls++;}}),/nothing was imported/);assert.equal(calls,0);
 const input={...bank,sources:Array.from({length:20},(_,i)=>({id:'s'+i,text:'a'.repeat(60000)})),questions:bank.questions.map(q=>({...q,stem:q.stem+'b'.repeat(2000)}))};const emitted=[];
 await importBankFiles({banks:[input],attemptRef:{current:null},call:async(n,a)=>{if(a.questions)emitted.push(a);return {state:{courseId:'a13c1817-5593-44ba-bf6f-02bc805b41da',revision:1}};}});
 assert.ok(emitted[0].questions.length<200);assert.equal(emitted.flatMap(a=>a.questions).length,204);assert.ok(emitted.every(a=>new TextEncoder().encode(JSON.stringify({name:'add_questions',arguments:a})).length<1350000));
});
