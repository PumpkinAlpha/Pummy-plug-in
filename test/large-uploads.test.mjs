import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync} from 'fflate';
import {uploadPresentationFile,loadAsset} from '../app/tutor-files.js';
import {extractSourceFile} from '../app/source-files.js';
import {CHUNK_SIZE,encode64} from '../lib/tutor/presentations.js';
import {fixturePPTX} from './tutor-fixtures.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {LocalD1} from '../scripts/local-db.mjs';
import {connectedProfile} from '../worker/identity.js';

class Bucket {
 objects=new Map();
 async put(key,data){this.objects.set(key,String(data));}
 async get(key){return this.objects.has(key)?{text:async()=>this.objects.get(key)}:null;}
}
test('32 MB source uploads stream small slices into object storage and preserve every original byte',async t=>{
 const db=new LocalD1(),bucket=new Bucket();t.after(()=>db.close());const repo=new CourseRepository(db,'large-owner',null,bucket),call=(n,a)=>executeTool(repo,n,a),{state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Large originals'});
 const files=unzipSync(fixturePPTX());files['ppt/media/large.bin']=new Uint8Array(32*1024*1024);const bytes=zipSync(files,{level:0}),blob=new Blob([bytes]);
 const extracted=await extractSourceFile({name:'Large.pptx',size:bytes.length,arrayBuffer:()=>blob.arrayBuffer()});assert.match(extracted.text,/jugular/);
 let slices=0;const file={name:'Large.pptx',size:blob.size,arrayBuffer(){throw new Error('Do not read the whole upload.');},slice(start,end){slices++;assert.ok(end-start<=CHUNK_SIZE/4*3);return blob.slice(start,end);}};
 const assetId=await uploadPresentationFile(call,state.courseId,file,{source:true});assert.ok(slices>149);
 const sync=await call('sync_course_sources',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[{id:'large',name:file.name,text:extracted.text,originalAssetId:assetId}]});
 const asset=sync.state.sources[0].originalFile;assert.deepEqual(await loadAsset(call,state.courseId,asset),bytes);
 assert.equal((await db.prepare('SELECT storage FROM tutor_assets WHERE id=?').bind(assetId).first()).storage,'r2');
 assert.ok((await db.prepare('SELECT max(length(data)) AS length FROM tutor_asset_chunks').first()).length<=64);
 await assert.rejects(executeTool(new CourseRepository(db,'another-account',null,bucket),'read_presentation_chunk',{courseId:state.courseId,assetId,index:0}),/not found/i);
});
test('object upload failures retry with the same ID and conflicting retries never overwrite originals',async t=>{
 const db=new LocalD1(),bucket=new Bucket();t.after(()=>db.close());const repo=new CourseRepository(db,'retry-owner',null,bucket),call=(n,a)=>executeTool(repo,n,a),{state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Retries'}),file=new File(['Original text'],'original.txt');
 const put=bucket.put.bind(bucket);let fail=true;bucket.put=async(...args)=>{if(fail){fail=false;throw new Error('Storage interrupted');}return put(...args);};
 await assert.rejects(uploadPresentationFile(call,state.courseId,file,{source:true}),/interrupted/);const assetId=await uploadPresentationFile(call,state.courseId,file,{source:true});
 const args={courseId:state.courseId,assetId,index:0,data:encode64(new TextEncoder().encode('Original text'))};bucket.objects.clear();await call('upload_presentation_chunk',args);assert.equal(bucket.objects.size,1);
 await assert.rejects(call('upload_presentation_chunk',{...args,data:encode64(new TextEncoder().encode('Replaced text'))}),/cannot be overwritten/);
 const fresh=(await call('read_course_state',{courseId:state.courseId})).state;await call('attach_source_original',{courseId:state.courseId,revision:fresh.revision,sourceId:'missing',assetId}).then(()=>assert.fail('Missing sources must fail'),e=>assert.match(e.message,/not found/));
});
test('profiles use only trusted current identity and reject client-selected account IDs',async t=>{
 const profile=connectedProfile(new Request('https://pummy.test/',{headers:{'oai-authenticated-user-full-name':'Daniel%20Dehkordi','oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8','oai-authenticated-user-email':'demo@example.test'}}));assert.equal(profile.name,'Daniel Dehkordi');
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'current',null,null,profile);assert.deepEqual((await executeTool(repo,'read_connected_profile',{})).profile,profile);
 await assert.rejects(executeTool(repo,'read_connected_profile',{userId:'other-account'}),/Check/);
});
