import test from 'node:test';
import assert from 'node:assert/strict';
import {retryUploadOperation} from '../app/upload-retry.js';
import {uploadPresentationFile} from '../app/tutor-files.js';
import {extractSourceFile,saveManualSources} from '../app/source-files.js';
import {CHUNK_SIZE} from '../lib/tutor/presentations.js';
import {fixturePDF} from './tutor-fixtures.mjs';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';

test('connection retries are bounded and validation, permission and scope errors fail immediately',async()=>{
 for(const message of ['McpServerError: Connection failed.','Connection closed','Network request failed','Storage interrupted']){
  let calls=0;const waits=[];
  await assert.rejects(retryUploadOperation(()=>{calls++;throw Error(message);},{wait:async ms=>waits.push(ms)}),{message});
  assert.equal(calls,3);assert.deepEqual(waits,[250,500]);
 }
 for(const message of ['Invalid file chunk.','Sign in to access your question banks.','Tool not found','Original files cannot be overwritten.']){
  let calls=0;await assert.rejects(retryUploadOperation(()=>{calls++;throw Error(message);},{wait:()=>assert.fail('Must not retry')}),{message});assert.equal(calls,1);
 }
});

for(const stage of ['begin_presentation_upload','upload_presentation_chunk','read_course_state','sync_course_sources'])for(const lostResponse of [false,true])test(`PDF import recovers ${stage} ${lostResponse?'after a lost response':'before reaching the server'}`,async t=>{
 const db=new LocalD1();t.after(()=>db.close());const objects=new Map(),bucket={put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null};
 const repo=new CourseRepository(db,'pdf-retry',null,bucket),call=(name,args)=>executeTool(repo,name,args);
 const {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Anatomy',questions:[{stem:'Original?',options:['A','B'],answer:[0]}]});
 await call('start_test',{courseId:state.courseId,revision:state.revision,size:1,adaptive:false});const before=(await repo.get(state.courseId)).data;
 const bytes=await fixturePDF(),file={...await extractSourceFile(new File([bytes],'Session 21-22 - ABDOMEN 1-2.pdf')),sourceType:'professor_slides',rank:1};
 const entry={file,status:'ready',attempt:{sourceId:'abdomen',requestId:crypto.randomUUID()}},requests=[];let failed=false;
 const flaky=async(name,args)=>{
  if(name===stage){requests.push(structuredClone(args));if(!failed){failed=true;if(lostResponse)await call(name,args);throw Error('McpServerError: Connection failed.');}}
  return call(name,args);
 };
 await saveManualSources(flaky,state.courseId,[entry]);assert.equal(entry.status,'saved',entry.error);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
 const after=(await repo.get(state.courseId)).data;assert.equal(after.sources.length,1);assert.deepEqual(after.questions,before.questions);assert.deepEqual(after.session,before.session);
 const asset=after.sources[0].originalFile;assert.equal(objects.size,asset.chunks);let data='';for(let index=0;index<asset.chunks;index++)data+=(await call('read_presentation_chunk',{courseId:state.courseId,assetId:asset.id,index})).asset.data;
 assert.deepEqual(Buffer.from(data,'base64'),Buffer.from(bytes));
});

test('persistent connection failures show recovery guidance and manual retry skips confirmed chunks',async()=>{
 const file=new File([new Uint8Array(CHUNK_SIZE/4*3+3)],'large.pdf'),chunks=[];let disconnected=true;const beginnings=[];
 const call=async(name,args)=>{if(name==='begin_presentation_upload')beginnings.push(args.assetId);if(name==='upload_presentation_chunk'){chunks.push(args.index);if(args.index===1&&disconnected)throw Error('McpServerError: Connection failed.');}};
 const entry={file:{originalFile:file,name:file.name,text:'Professor text'},status:'ready',attempt:{sourceId:'lecture',requestId:crypto.randomUUID()}};
 await saveManualSources(call,'course',[entry]);assert.equal(entry.status,'failed');assert.match(entry.error,/Retry failed uploads/);assert.match(entry.error,/close and reopen Pummy/);assert.deepEqual(chunks.sort(),[0,1,1,1]);
 disconnected=false;const id=await uploadPresentationFile(call,'course',file,{source:true});assert.equal(id,beginnings[0]);assert.deepEqual(beginnings,[id,id]);assert.equal(chunks.filter(i=>i===0).length,1);assert.equal(chunks.filter(i=>i===1).length,4);
});
