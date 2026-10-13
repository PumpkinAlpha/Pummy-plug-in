import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {uploadPresentationFile} from '../app/tutor-files.js';
import {fixturePDF,object} from './tutor-fixtures.mjs';
const tables=['practice_banks','course_source_content','tutor_asset_chunks','tutor_assets','tutor_presentations','tutor_slide_annotations','tutor_revisions','tutor_requests','tutor_conversions'];
class Bucket {
 objects=new Map();fail=false;pages=0;
 async put(key,data){this.objects.set(key,data);}
 async get(key){return this.objects.has(key)?{text:async()=>this.objects.get(key)}:null;}
 async list({prefix,cursor}){this.pages++;const keys=[...this.objects.keys()].filter(k=>k.startsWith(prefix)&&(!cursor||k>cursor)).sort(),page=keys.slice(0,2);return {objects:page.map(key=>({key})),truncated:keys.length>2,cursor:page.at(-1)};}
 async delete(keys){if(this.fail){this.fail=false;throw new Error('R2 unavailable');}for(const key of keys)this.objects.delete(key);}
}
async function setup(t){
 const db=new LocalD1(),bucket=new Bucket();t.after(()=>db.close());const repo=new CourseRepository(db,'alice',null,bucket),call=(n,a)=>executeTool(repo,n,a);
 const {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Private lecture',questions:[{stem:'Which is even?',options:['One','Two'],answer:[1],sourceId:'lecture'}],sources:[{id:'lecture',name:'Lecture',text:'Two is even.'}]}),pdf=await fixturePDF();
 const assetId=await uploadPresentationFile(call,state.courseId,new File([pdf],'lecture.pdf'));
 const {presentation:p}=await call('import_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:assetId,pdfAssetId:assetId});
 await call('save_slide_annotations',{courseId:state.courseId,presentationId:p.id,slideId:p.slides[0].id,revision:p.revision,requestId:crypto.randomUUID(),annotations:[object(p,p.slides[0].id)]});
 await call('request_slide_tutor',{courseId:state.courseId,presentationId:p.id,slideId:p.slides[0].id,requestId:crypto.randomUUID(),question:'Explain this slide.'});
 await db.prepare('INSERT INTO tutor_conversions(user_id,course_id,original_asset_id,pdf_asset_id) VALUES(?,?,?,?)').bind('alice',state.courseId,assetId,assetId).run();
 // Cover interrupted uploads with no committed chunk receipt and paginated R2 listings.
 const prefix='files/alice/'+state.courseId+'/';for(let i=0;i<4;i++)bucket.objects.set(prefix+'abandoned/'+i,'uncommitted bytes');
 bucket.objects.set('files/bob/'+state.courseId+'/private','other account');bucket.objects.set('files/alice/other-course/private','other course');
 return {db,bucket,repo,call,state,assetId};
}
test('course deletion removes every tutor table and paginated R2 object while preserving other owners and courses',async t=>{
 const {db,bucket,repo,call,state,assetId}=await setup(t);
 for(const table of tables)assert.ok(db.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id=? AND course_id=?`).get('alice',state.courseId).n>0,table);
 await call('delete_course',{courseId:state.courseId,revision:state.revision});
 assert.equal(await repo.get(state.courseId),null);assert.deepEqual(await repo.list(),[]);
 for(const table of [...tables,'course_deletions'])assert.equal(db.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id=? AND course_id=?`).get('alice',state.courseId).n,0,table);
 assert.equal(bucket.objects.size,2);assert.ok(bucket.pages>=3);
 await call('create_course',{requestId:state.courseId,name:'Reused ID'});
 await assert.rejects(call('read_presentation_chunk',{courseId:state.courseId,assetId,index:0}),/File not found/);
});
test('stale and foreign deletion requests cannot remove database records or R2 files',async t=>{
 const {db,bucket,repo,call,state}=await setup(t),before=[...bucket.objects.entries()];
 const {state:updated}=await call('update_course',{courseId:state.courseId,revision:state.revision,name:'Renamed'});
 await assert.rejects(repo.delete(state.courseId,state.revision),/changed in another window/);
 await assert.rejects(new CourseRepository(db,'bob',null,bucket).delete(state.courseId,updated.revision),/changed in another window/);
 assert.deepEqual([...bucket.objects.entries()],before);assert.equal(bucket.pages,0);
 for(const table of tables)assert.ok(db.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id=? AND course_id=?`).get('alice',state.courseId).n>0,table);
 assert.equal((await repo.get(state.courseId)).revision,updated.revision);
});
test('failed R2 cleanup remains retryable after repository reload and prevents course ID reuse',async t=>{
 const {db,bucket,repo,call,state}=await setup(t);bucket.fail=true;
 await assert.rejects(repo.delete(state.courseId,state.revision),/deletion is pending/);
 assert.equal(await repo.get(state.courseId),null);assert.equal((await repo.list())[0].id,state.courseId);
 await assert.rejects(call('create_course',{requestId:state.courseId,name:'Must not resurrect files'}),/changed in another window/);
 const reloaded=new CourseRepository(db,'alice',null,bucket);
 await reloaded.delete(state.courseId,state.revision);
 assert.deepEqual(await reloaded.list(),[]);assert.equal(bucket.objects.size,2);
});
test('database cleanup failure rolls back the course and all tutor records before touching R2',async t=>{
 const {db,bucket,repo,state}=await setup(t);
 db.db.exec("CREATE TRIGGER reject_cleanup BEFORE DELETE ON tutor_revisions BEGIN SELECT RAISE(ABORT,'database interrupted'); END");
 await assert.rejects(repo.delete(state.courseId,state.revision),/database interrupted/);
 assert.ok(await repo.get(state.courseId));assert.equal(bucket.pages,0);
 assert.equal(db.db.prepare('SELECT count(*) AS n FROM course_deletions').get().n,0);
 for(const table of tables)assert.ok(db.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id=? AND course_id=?`).get('alice',state.courseId).n>0,table);
});
