import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
const question={stem:'Which is correct?',options:['First','Second'],answer:[0]};
const source=i=>({id:'lecture-'+i,name:'Lecture '+i,text:('Professor lecture '+i+' reference. ').repeat(2200).slice(0,59000),pages:[{page:1,unit:'slide',text:('Professor lecture '+i+' reference. ').repeat(2200).slice(0,59000)}]});
async function setup(t){const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'storage-owner'),call=(name,args)=>executeTool(repo,name,args);const {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Large course',questions:[question]});return {db,repo,call,state};}
test('thirty full-length references exceed the old course limit without affecting an active exam or truncating text/pages',async t=>{
 const {db,repo,call,state}=await setup(t);let next=(await call('start_test',{courseId:state.courseId,revision:state.revision,adaptive:false,size:1})).state;
 const before=(await repo.get(state.courseId)).data;
 for(let offset=0;offset<30;offset+=5)next=(await call('sync_course_sources',{courseId:state.courseId,revision:next.revision,requestId:crypto.randomUUID(),sources:Array.from({length:5},(_,i)=>source(offset+i))})).state;
 const saved=await repo.get(state.courseId);assert.equal(saved.data.sources.length,30);
 assert.deepEqual(saved.data.questions,before.questions);assert.deepEqual(saved.data.session,before.session);assert.deepEqual(saved.data.concepts,before.concepts);
 for(let i=0;i<30;i++){assert.equal(new Map(saved.data.texts).get(source(i).id),source(i).text);assert.deepEqual(saved.data.sources.find(s=>s.id===source(i).id).pages,source(i).pages);}
 const raw=db.db.prepare('SELECT data FROM courses WHERE user_id=? AND id=?').get('storage-owner',state.courseId).data;
 assert.ok(Buffer.byteLength(JSON.stringify(saved.data))>3000000);assert.ok(Buffer.byteLength(raw)<900000);assert.deepEqual(JSON.parse(raw).texts,[]);
 assert.equal(db.db.prepare('SELECT count(*) AS n FROM course_source_content').get().n,30);
 assert.equal((await call('read_source',{courseId:state.courseId,sourceId:'lecture-29',page:1})).source.text,'--- Slide 1 ---\n'+source(29).pages[0].text);
 await call('delete_course',{courseId:state.courseId,revision:saved.revision});assert.equal(db.db.prepare('SELECT count(*) AS n FROM course_source_content').get().n,0);
});
test('the next save moves a legacy inline course into separate rows without changing its contents',async t=>{
 const {db,repo,state}=await setup(t),legacy=await repo.get(state.courseId);
 legacy.data.sources=[source(1),source(2)].map(({text,...metadata})=>metadata);legacy.data.texts=[[source(2).id,source(2).text],[source(1).id,source(1).text]];
 legacy.data.sources[0].visualPdf='data:application/pdf;base64,'+'A'.repeat(200000);
 db.db.prepare('UPDATE courses SET data=? WHERE user_id=? AND id=?').run(JSON.stringify(legacy.data),'storage-owner',state.courseId);
 const original=await repo.get(state.courseId);assert.deepEqual(original.data,legacy.data);
 await repo.save(original.data,original.revision,original.data);
 const reopened=await new CourseRepository(db,'storage-owner').get(state.courseId);assert.deepEqual(reopened.data,legacy.data);
 assert.equal(db.db.prepare('SELECT count(*) AS n FROM course_source_content').get().n,2);
 assert.equal(JSON.parse(db.db.prepare('SELECT data FROM courses WHERE id=?').get(state.courseId).data).sources[0].visualPdf,undefined);
});
test('source-row failures roll back the snapshot, and stale saves cannot overwrite winning source content',async t=>{
 const {db,repo,state}=await setup(t),before=await repo.get(state.courseId),next=structuredClone(before.data);
 next.sources=[{id:'new-source',name:'New'}];next.texts=[['new-source','First source content']];
 db.db.exec("CREATE TRIGGER reject_source BEFORE INSERT ON course_source_content BEGIN SELECT RAISE(ABORT,'source storage interrupted'); END");
 await assert.rejects(repo.save(next,before.revision,before.data),/source storage interrupted/);assert.deepEqual(await repo.get(state.courseId),before);
 db.db.exec('DROP TRIGGER reject_source');
 const competitor=await repo.get(state.courseId);await repo.save(next,before.revision,before.data);
 const loser={...competitor.data,sources:[{id:'new-source',name:'Wrong'}],texts:[['new-source','Must not overwrite winner']]};
 await assert.rejects(repo.save(loser,competitor.revision,competitor.data),/changed in another window/);
 assert.equal(new Map((await repo.get(state.courseId)).data.texts).get('new-source'),'First source content');
 assert.equal(await new CourseRepository(db,'another-user').get(state.courseId),null);
});
test('the exam snapshot limit still rejects oversized questions atomically after source offloading',async t=>{
 const {repo,state}=await setup(t),before=await repo.get(state.courseId),next=structuredClone(before.data);next.questions[0].definition='x'.repeat(900001);
 await assert.rejects(repo.save(next,before.revision,before.data),/questions and exam history exceed/);assert.deepEqual(await repo.get(state.courseId),before);
});
test('exam answers and unchanged sync receipts do not rewrite stored lecture content',async t=>{
 const {db,repo,call,state}=await setup(t),lecture=source(1),requestId=crypto.randomUUID();
 let current=(await call('sync_course_sources',{courseId:state.courseId,revision:state.revision,requestId,sources:[lecture]})).state;
 db.db.exec("CREATE TRIGGER reject_rewrite BEFORE INSERT ON course_source_content BEGIN SELECT RAISE(ABORT,'Unchanged source must not be rewritten'); END");
 current=(await call('sync_course_sources',{courseId:state.courseId,revision:current.revision,requestId:crypto.randomUUID(),sources:[lecture]})).state;
 current=(await call('start_test',{courseId:state.courseId,revision:current.revision,adaptive:false,size:1})).state;
 await call('submit_answer',{courseId:state.courseId,revision:current.revision,sessionId:current.session.id,questionId:current.question.id,choices:[0]});
 assert.equal(new Map((await repo.get(state.courseId)).data.texts).get(lecture.id),lecture.text);
});
