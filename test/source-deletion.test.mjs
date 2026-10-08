import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
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
test('source actions reject other users, missing sources and stale revisions without mutation; resync restores the same ID',async t=>{
 const {db,repo,call,state}=await setup(t),before=await repo.get(state.courseId);
 await assert.rejects(executeTool(new CourseRepository(db,'other'),'delete_source',{courseId:state.courseId,revision:state.revision,sourceId:'lecture'}),/not found/i);
 await assert.rejects(call('delete_source',{courseId:state.courseId,revision:state.revision,sourceId:'missing'}),/Source not found/);assert.deepEqual(await repo.get(state.courseId),before);
 const r=await call('delete_source',{courseId:state.courseId,revision:state.revision,sourceId:'lecture'});const deleted=await repo.get(state.courseId);
 await assert.rejects(call('restore_source',{courseId:state.courseId,revision:state.revision,sourceId:'lecture'}),/changed/);assert.deepEqual(await repo.get(state.courseId),deleted);
 const restored=await call('sync_course_sources',{courseId:state.courseId,revision:r.state.revision,requestId:crypto.randomUUID(),sources:[{id:'lecture',name:'Professor lecture',text:before.data.texts[0][1]}]});assert.equal(restored.state.sources[0].id,'lecture');assert.equal(restored.state.deletedSources.length,0);
});
