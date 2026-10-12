import test from 'node:test';
import assert from 'node:assert/strict';
import {planFolderSync,saveFolderSync,selectedDirectoryFiles,directoryFiles} from '../app/local-folder.js';
import {uploadPresentationFile,loadAsset} from '../app/tutor-files.js';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {LocalD1} from '../scripts/local-db.mjs';
const binding={id:'cf42b001-2f60-4d25-b19e-8fb1a205b65c',name:'Lectures'},files=text=>[{path:'Week 1/Notes.txt',raw:new File([text],'Notes.txt')}];
function setup(t){const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'folder-owner'),call=(n,a)=>executeTool(repo,n,a);return {repo,call};}
test('local folder updates keep stable source IDs, immutable originals and active exam state',async t=>{
 const {repo,call}=setup(t);let {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Folder',questions:[{stem:'Q?',options:['A','B'],answer:[0]}]});await call('start_test',{courseId:state.courseId,revision:state.revision,size:'all',adaptive:false});const before=(await repo.get(state.courseId)).data.session;
 let plan=await planFolderSync({files:files('First notes'),binding,state,folder:{kind:'lecture',label:'Week 1'}});await saveFolderSync(call,state.courseId,plan.entries);state=(await call('read_course_state',{courseId:state.courseId})).state;const first=state.sources[0];assert.equal(first.metadata.relativePath,'Week 1/Notes.txt');assert.equal(first.lecture,'Week 1');
 plan=await planFolderSync({files:files('First notes'),binding,state});assert.equal(plan.entries[0].status,'unchanged');
 plan=await planFolderSync({files:files('New notes'),binding,state});assert.equal(plan.entries[0].change,'Updated');await saveFolderSync(call,state.courseId,plan.entries);state=(await call('read_course_state',{courseId:state.courseId})).state;assert.equal(state.sources.length,1);assert.equal(state.sources[0].id,first.id);assert.notEqual(state.sources[0].originalFile.id,first.originalFile.id);assert.equal(new TextDecoder().decode(await loadAsset(call,state.courseId,first.originalFile)),'First notes');assert.deepEqual((await repo.get(state.courseId)).data.session,before);
 plan=await planFolderSync({files:[],binding,state});assert.deepEqual(plan.missing,['Week 1/Notes.txt']);assert.equal((await repo.get(state.courseId)).data.sources.length,1);
});
test('folder receipt retries a lost response without duplicating originals or references',async t=>{
 const {repo,call}=setup(t),{state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Retries'}),plan=await planFolderSync({files:files('Notes'),binding,state});let fail=true;
 await saveFolderSync(async(n,a)=>{const r=await call(n,a);if(n==='sync_course_sources'&&fail){fail=false;throw Error('Lost response');}return r;},state.courseId,plan.entries);assert.equal(plan.entries[0].status,'failed');await saveFolderSync(call,state.courseId,plan.entries);assert.equal(plan.entries[0].status,'saved');assert.equal((await repo.get(state.courseId)).data.sources.length,1);
});
test('folder paths distinguish duplicate filenames, reject traversal and skip unsupported files',async()=>{
 const state={sources:[]},raw=new File(['Notes'],'Notes.txt'),plan=await planFolderSync({files:[{raw,path:'A/Notes.txt'},{raw,path:'B/Notes.txt'}],binding,state});assert.notEqual(plan.entries[0].attempt.sourceId,plan.entries[1].attempt.sourceId);
 await assert.rejects(planFolderSync({files:[{raw,path:'../Notes.txt'}],binding,state}),/unsupported relative path/);assert.equal(selectedDirectoryFiles([new File(['x'],'macro.exe'),raw]).length,1);
 const handle={async *entries(){yield ['Notes.txt',{kind:'file',getFile:async()=>raw}];yield ['.git',{kind:'directory',entries(){throw Error('Must skip');}}];}};assert.equal((await directoryFiles(handle)).length,1);
});
test('full folder plans reject course capacity before uploading any file',async()=>{let uploads=0;const state={sources:Array.from({length:30},(_,i)=>({id:'s'+i}))},plan=await planFolderSync({files:files('Notes'),binding,state});await assert.rejects(saveFolderSync(async n=>{if(n!=='read_course_state')uploads++;return {state};},'course',plan.entries),/nothing was imported/);assert.equal(uploads,0);});
test('parallel uploads report progress and retry transient chunks with stable receipts',async()=>{const bytes=new Uint8Array(750000),file=new File([bytes],'Lecture.pptx'),indices=new Map(),ids=new Set(),progress=[];let active=0,max=0,failed=false;
 const id=await uploadPresentationFile(async(n,a)=>{ids.add(a.assetId);if(n==='upload_presentation_chunk'){indices.set(a.index,(indices.get(a.index)||0)+1);active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,10));active--;if(a.index===1&&!failed){failed=true;throw Error('Network timeout');}}return {};},'course',file,{onProgress:p=>progress.push(p.completed)});
 assert.ok(max>1&&max<=3);assert.equal(ids.size,1);assert.equal(indices.get(1),2);assert.equal(progress.at(-1),5);assert.ok(ids.has(id));
});
