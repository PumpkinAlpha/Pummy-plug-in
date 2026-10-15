import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {extractSourceFile,saveManualSources} from '../app/source-files.js';
import {encode64} from '../lib/tutor/presentations.js';
class Bucket {
 objects=new Map();
 async put(key,data){this.objects.set(key,data);}
 async get(key){return this.objects.has(key)?{text:async()=>this.objects.get(key)}:null;}
}
for(const transport of ['browser','mcp'])test(`${transport} uploads use R2 while the static asset RPC service is present`,async t=>{
 const db=new LocalD1(),bucket=new Bucket();t.after(()=>db.close());
 const staticService=new Proxy({},{get:(_,method)=>async()=>{throw new Error(`The RPC receiver does not implement the method "${String(method)}".`);}});
 const env={DB:db,BUCKET:bucket,ASSETS:staticService};
 const call=async(name,args)=>{
  const mcp=transport==='mcp',response=await worker.fetch(new Request('https://example.test/'+(mcp?'mcp':'api/tool'),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Origin:'https://example.test','oai-authenticated-user-id':'binding-test'},body:JSON.stringify(mcp?{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}:{name,arguments:args})}),env);
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));const result=mcp?body.result:body;assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent;
 };
 const {state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Storage binding'}),assetId=crypto.randomUUID(),data=encode64(new TextEncoder().encode('Lecture'));
 await call('begin_presentation_upload',{courseId:state.courseId,assetId,name:'Lecture.txt',kind:'txt',bytes:7,chunks:1});
 await call('upload_presentation_chunk',{courseId:state.courseId,assetId,index:0,data});
 assert.equal(bucket.objects.size,1);
 await call('sync_course_sources',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[{id:'lecture',name:'Lecture',text:'Lecture',originalAssetId:assetId}]});
 assert.equal((await call('read_presentation_chunk',{courseId:state.courseId,assetId,index:0})).asset.data,data);
});
test('batch imports continue after a failure and retry only unfinished files with stable receipts',async t=>{
 const db=new LocalD1(),bucket=new Bucket();t.after(()=>db.close());const repo=new CourseRepository(db,'batch-test',null,bucket);
 const call=(n,a)=>executeTool(repo,n,a),{state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Batch imports',questions:[{stem:'One?',options:['Yes','No'],answer:[0]}]});
 await call('start_test',{courseId:state.courseId,revision:state.revision,size:1,adaptive:false});const before=(await repo.get(state.courseId)).data;
 const entries=[];for(const name of ['first.txt','second.md','third.txt'])entries.push({file:{...await extractSourceFile(new File(['Source for '+name],name)),sourceType:'professor_slides',rank:1},attempt:{sourceId:crypto.randomUUID(),requestId:crypto.randomUUID()},status:'ready'});
 const receipts=entries.map(e=>({...e.attempt}));let failures=3,active=0,maxActive=0;const writes=[];
 const failingCall=async(n,a)=>{active++;maxActive=Math.max(maxActive,active);try{if(n==='sync_course_sources'){writes.push(a.sources[0].id);if(a.sources[0].id===entries[1].attempt.sourceId&&failures>0){failures--;throw new Error('Temporary outage');}}return await call(n,a);}finally{active--;}};
 await saveManualSources(failingCall,state.courseId,entries,{kind:'lecture',label:'Week 3'});
 assert.deepEqual(entries.map(e=>e.status),['saved','failed','saved']);assert.match(entries[1].error,/Temporary/);assert.equal(maxActive,1);
 const assetId=entries[1].attempt.originalAssetId;
 await saveManualSources(failingCall,state.courseId,entries,{kind:'lecture',label:'Week 3'});
 assert.ok(entries.every(e=>e.status==='saved'));assert.equal(entries[1].attempt.originalAssetId,assetId);
 assert.deepEqual(entries.map(e=>({sourceId:e.attempt.sourceId,requestId:e.attempt.requestId})),receipts);
 assert.deepEqual(writes,[receipts[0].sourceId,receipts[1].sourceId,receipts[1].sourceId,receipts[1].sourceId,receipts[2].sourceId,receipts[1].sourceId]);
 const after=(await repo.get(state.courseId)).data;assert.equal(after.sources.length,3);assert.ok(after.sources.every(s=>s.lecture==='Week 3'));assert.deepEqual(after.questions,before.questions);assert.deepEqual(after.session,before.session);
});
