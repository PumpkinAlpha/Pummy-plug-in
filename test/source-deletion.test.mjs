import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {uploadPresentationFile,loadAsset} from '../app/tutor-files.js';
import {fixturePDF,object} from './tutor-fixtures.mjs';
async function setup(t){const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'student'),call=(name,args)=>executeTool(repo,name,args);let {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Sources',questions:[{term:'Venous return',stem:'Which vessel carries blood to the right atrium?',options:['Superior vena cava','Aorta'],answer:[0],sourceId:'lecture',page:1}],sources:[{id:'lecture',name:'Professor lecture',text:'The superior vena cava carries blood to the right atrium.'}]});state=(await call('start_test',{courseId:state.courseId,revision:state.revision,size:1,adaptive:true})).state;return {db,repo,call,state};}
test('source deletion is recoverable, excludes retrieval and preserves exam, keys, source bytes and progress',async t=>{
 const {repo,call,state}=await setup(t),before=await repo.get(state.courseId);
 let result=await call('delete_source',{courseId:state.courseId,revision:state.revision,sourceId:'lecture'});
 assert.equal(result.state.sources.length,0);assert.equal(result.state.deletedSources[0].name,'Professor lecture');assert.equal(result.state.hasMaterials,false);
 const deleted=await repo.get(state.courseId);for(const key of ['session','questions','concepts','generation','history','texts','objectives','preferences'])assert.deepEqual(deleted.data[key],before.data[key],key);
 assert.equal((await call('retrieve_sources',{courseId:state.courseId,query:'superior vena cava'})).context.excerpts.length,0);
 const duplicate=await call('delete_source',{courseId:state.courseId,revision:result.state.revision,sourceId:'lecture'});assert.equal(duplicate.state.revision,result.state.revision);
 const backup=(await call('export_bank',{courseId:state.courseId})).export;const imported=await call('import_questions',{...backup,requestId:crypto.randomUUID()});assert.equal(imported.state.deletedSources.length,1);assert.equal(imported.state.sources.length,0);
 result=await call('restore_source',{courseId:state.courseId,revision:result.state.revision,sourceId:'lecture'});assert.equal(result.state.sources[0].id,'lecture');assert.equal(result.state.deletedSources.length,0);
 const restored=await repo.get(state.courseId);assert.deepEqual(restored.data,before.data);assert.equal((await call('retrieve_sources',{courseId:state.courseId,query:'superior vena cava'})).context.excerpts.length,1);
});
test('deleting a linked source hides its tutor copy and rejects stale opens, then restores original bytes, annotations and banks',async t=>{
 const {repo,call,state}=await setup(t),bytes=await fixturePDF(),assetId=await uploadPresentationFile(call,state.courseId,new File([bytes],'Lecture.pdf'));
 let current=(await call('attach_source_original',{courseId:state.courseId,revision:state.revision,sourceId:'lecture',assetId})).state;
 const {presentation:p}=await call('import_course_presentation',{courseId:state.courseId,sourceId:'lecture',presentationId:crypto.randomUUID()});
 const independent=(await call('import_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:assetId})).presentation;
 await call('save_slide_annotations',{courseId:state.courseId,presentationId:p.id,slideId:p.slides[0].id,revision:p.revision,requestId:crypto.randomUUID(),annotations:[object(p,p.slides[0].id)]});
 const before=(await call('read_presentation',{courseId:state.courseId,presentationId:p.id})).presentation,banks=(await call('list_practice_banks',{courseId:state.courseId})).banks,course=await repo.get(state.courseId);
 current=(await call('delete_source',{courseId:state.courseId,revision:current.revision,sourceId:'lecture'})).state;
 assert.deepEqual((await call('list_presentations',{courseId:state.courseId})).presentations.map(p=>p.id),[independent.id]);
 for(const [name,args] of [['read_presentation',{presentationId:p.id}],['read_slide_context',{presentationId:p.id,slideId:p.slides[0].id}],['import_course_presentation',{sourceId:'lecture',presentationId:crypto.randomUUID()}],['import_presentation',{sourceId:'lecture',presentationId:p.id,originalAssetId:assetId}]])await assert.rejects(call(name,{courseId:state.courseId,...args}),/Recently deleted/);
 assert.deepEqual((await call('list_practice_banks',{courseId:state.courseId})).banks,banks);
 for(const key of ['questions','session','history','concepts'])assert.deepEqual((await repo.get(state.courseId)).data[key],course.data[key]);
 current=(await call('restore_source',{courseId:state.courseId,revision:current.revision,sourceId:'lecture'})).state;
 assert.deepEqual((await call('read_presentation',{courseId:state.courseId,presentationId:p.id})).presentation,before);
 assert.deepEqual(await loadAsset(call,state.courseId,current.sources[0].originalFile),bytes);
 assert.equal((await call('list_presentations',{courseId:state.courseId})).presentations.length,2);
});
test('source actions reject other users, missing sources and stale revisions without mutation; resync restores the same ID',async t=>{
 const {db,repo,call,state}=await setup(t),before=await repo.get(state.courseId);
 await assert.rejects(executeTool(new CourseRepository(db,'other'),'delete_source',{courseId:state.courseId,revision:state.revision,sourceId:'lecture'}),/not found/i);
 await assert.rejects(call('delete_source',{courseId:state.courseId,revision:state.revision,sourceId:'missing'}),/Source not found/);assert.deepEqual(await repo.get(state.courseId),before);
 const r=await call('delete_source',{courseId:state.courseId,revision:state.revision,sourceId:'lecture'});const deleted=await repo.get(state.courseId);
 await assert.rejects(call('restore_source',{courseId:state.courseId,revision:state.revision,sourceId:'lecture'}),/changed/);assert.deepEqual(await repo.get(state.courseId),deleted);
 const restored=await call('sync_course_sources',{courseId:state.courseId,revision:r.state.revision,requestId:crypto.randomUUID(),sources:[{id:'lecture',name:'Professor lecture',text:before.data.texts[0][1]}]});assert.equal(restored.state.sources[0].id,'lecture');assert.equal(restored.state.deletedSources.length,0);
});
