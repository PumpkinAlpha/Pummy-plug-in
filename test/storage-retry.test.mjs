import test from 'node:test';
import assert from 'node:assert/strict';
import {retryStorage} from '../worker/storage-retry.js';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {uploadPresentationFile} from '../app/tutor-files.js';
import {CHUNK_SIZE} from '../lib/tutor/presentations.js';
const internal=()=>new Error('put: We encountered an internal error. Please try again. (10001)');
test('temporary storage errors retry with bounded backoff and return the successful write result',async()=>{
 const waits=[];let attempts=0;
 const result=await retryStorage(async()=>{if(++attempts<4)throw internal();return 'stored';},{wait:async ms=>waits.push(ms)});
 assert.equal(result,'stored');assert.equal(attempts,4);assert.deepEqual(waits,[250,750,1750]);
});
test('persistent outages stop after four attempts and terminal storage errors are never retried',async()=>{
 let attempts=0;const waits=[];
 await assert.rejects(retryStorage(async()=>{attempts++;throw internal();},{wait:async ms=>waits.push(ms)}),e=>e.code==='storage_unavailable'&&e.message.includes('Completed upload chunks are kept')&&e.cause.message.includes('10001'));
 assert.equal(attempts,4);assert.equal(waits.length,3);
 for(const message of ['Access denied (10003)','Quota exceeded','The RPC receiver does not implement the method put']){
  let calls=0;await assert.rejects(retryStorage(async()=>{calls++;throw new Error(message);},{wait:async()=>assert.fail('Terminal error must not wait')}));assert.equal(calls,1);
 }
});
test('an uncertain R2 write retries the identical chunk key and stores one immutable chunk receipt',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const objects=new Map(),keys=[];let attempts=0;
 const bucket={put:async(key,data)=>{keys.push(key);objects.set(key,data);if(++attempts<3)throw internal();},get:async key=>({text:async()=>objects.get(key)})};
 const repo=new CourseRepository(db,'retry-user',null,bucket),call=(name,args)=>executeTool(repo,name,args),{state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Storage retries'}),file=new File(['Original lecture bytes'],'lecture.txt');
 const assetId=await uploadPresentationFile(call,state.courseId,file,{source:true});
 assert.equal(keys.length,3);assert.equal(new Set(keys).size,1);assert.equal(objects.size,1);
 assert.equal(db.db.prepare('SELECT count(*) AS n FROM tutor_asset_chunks').get().n,1);
 await call('sync_course_sources',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[{id:'lecture',name:'Lecture',text:'Original lecture bytes',originalAssetId:assetId}]});
 assert.equal(Buffer.from((await call('read_presentation_chunk',{courseId:state.courseId,assetId,index:0})).asset.data,'base64').toString(),'Original lecture bytes');
});
test('a persistent failure in a later chunk resumes that upload without resending completed chunks',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const objects=new Map(),writes=[];let outage=true;
 const bucket={put:async(key,data)=>{writes.push(key);if(outage&&key.split('/').at(-2)==='1')throw internal();objects.set(key,data);},get:async key=>objects.has(key)?{text:async()=>objects.get(key)}:null};
 const repo=new CourseRepository(db,'resume-user',null,bucket),call=(name,args)=>executeTool(repo,name,args),{state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Resume upload'}),file=new File([new Uint8Array(CHUNK_SIZE/4*3+20).fill(65)],'lecture.txt');
 await assert.rejects(uploadPresentationFile(call,state.courseId,file,{source:true}),/Completed upload chunks are kept/);
 const original=db.db.prepare('SELECT id FROM tutor_assets').get().id;assert.equal(objects.size,1);
 outage=false;const assetId=await uploadPresentationFile(call,state.courseId,file,{source:true});assert.equal(assetId,original);
 assert.equal(writes.filter(key=>key.split('/').at(-2)==='0').length,1);assert.equal(objects.size,2);
 assert.equal(db.db.prepare('SELECT count(*) AS n FROM tutor_assets').get().n,1);assert.equal(db.db.prepare('SELECT count(*) AS n FROM tutor_asset_chunks').get().n,2);
});
