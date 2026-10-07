import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool,definitions} from '../worker/tools.js';
import {syncRequestMessage} from '../app/source-sync.js';

test('read_course_state is equivalent to the opener, redacted, read-only and user-isolated',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'reader');
 assert.deepEqual(await executeTool(repo,'read_course_state',{}),{courses:[]});
 let {state}=await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Mock course',questions:[{term:'Mock concept',stem:'Mock question',options:['One','Two'],answer:[0]}]});
 state=(await executeTool(repo,'start_test',{courseId:state.courseId,revision:state.revision,adaptive:false,size:1})).state;
 const saved=await repo.get(state.courseId),args={courseId:state.courseId};
 assert.deepEqual(await executeTool(repo,'read_course_state',args),await executeTool(repo,'open_test',args));
 assert.equal((await executeTool(repo,'read_course_state',args)).state.question.answer,undefined);
 assert.deepEqual(await repo.get(state.courseId),saved);
 await assert.rejects(executeTool(new CourseRepository(db,'other'),'read_course_state',args),/not found/);
 assert.equal(definitions.find(d=>d.name==='read_course_state').readOnly,true);
});

test('polling, startup, recovery and tutor/sync handoffs never invoke the render opener',()=>{
 for(const file of ['main.jsx','bridge.js','pending.js','source-sync.js','recovery.jsx']){
  const source=readFileSync(new URL('../app/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bopen_test\b/,file);
  assert.match(source,/read_course_state/,file);
 }
});

test('sync asks the client to omit contact details before sending all text/page/metadata payloads',()=>{
 const prompt=syncRequestMessage({courseId:'mock',name:'Mock'},'request');
 assert.match(prompt,/omit unrelated instructor\/student email addresses, phone numbers and administrative contact blocks/);
 assert.match(prompt,/source text, each page and metadata/);
 assert.match(prompt,/must not be transmitted by default/);
 const schema=definitions.find(d=>d.name==='sync_course_sources').schema;
 assert.match(schema.shape.sources.removeDefault().element.shape.text.description,/Omit unrelated instructor/);
 assert.match(schema.shape.sources.removeDefault().element.shape.pages.unwrap().element.shape.text.description,/Omit unrelated personal contact/);
});

test('legacy reads have no rendering or launch intent and only a user-only entrypoint may launch',()=>{
 const legacy=definitions.find(d=>d.name==='open_test');
 assert.equal(legacy.opener,undefined);assert.equal(legacy.readOnly,true);
 assert.match(legacy.description,/WITHOUT opening a panel/);
 const launchers=definitions.filter(d=>d.opener);
 assert.deepEqual(launchers.map(d=>d.name),['open_interface']);
 assert.equal(launchers[0].appOnly,true);
 assert.ok(definitions.filter(d=>!d.appOnly).every(d=>!d.opener));
});

test('explicit interface entrypoint preserves the exact data-only saved state',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'launcher');
 assert.deepEqual(await executeTool(repo,'open_interface',{}),{courses:[]});
 const {state}=await executeTool(repo,'create_course',{requestId:crypto.randomUUID(),name:'Saved mock'});
 const before=await repo.get(state.courseId),args={courseId:state.courseId};
 assert.deepEqual(await executeTool(repo,'open_interface',args),await executeTool(repo,'open_test',args));
 assert.deepEqual(await executeTool(repo,'open_interface',args),await executeTool(repo,'read_course_state',args));
 assert.deepEqual(await repo.get(state.courseId),before);
});
