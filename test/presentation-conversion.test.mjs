import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {CHUNK_SIZE,encode64,decode64} from '../lib/tutor/presentations.js';
import {configuredConverter} from '../worker/presentation-converter.js';
import {createPresentationConverter} from '../scripts/presentation-converter.mjs';
import {fixturePDF,fixturePPTX} from './tutor-fixtures.mjs';
import {fixtureLegacyPPT} from './source-fixtures.mjs';
async function setup(t,converter){const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'conversion-student',converter),call=(name,args)=>executeTool(repo,name,args),state=(await call('create_course',{name:'Conversion course',requestId:crypto.randomUUID()})).state;return {db,repo,call,state};}
async function upload(call,courseId,kind='pptx',bytes=fixturePPTX()){const data=encode64(bytes),assetId=crypto.randomUUID(),chunks=Math.ceil(data.length/CHUNK_SIZE);await call('begin_presentation_upload',{courseId,assetId,name:'Lecture.'+kind,kind,bytes:bytes.length,chunks});for(let index=0;index<chunks;index++)await call('upload_presentation_chunk',{courseId,assetId,index,data:data.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE)});return {courseId,assetId};}
test('PowerPoint conversion preserves original bytes and notes, caches retries and leaves course state unchanged',async t=>{
 const pdf=await fixturePDF();let calls=0;const {repo,call,state,db}=await setup(t,{async fetch(r){calls++;assert.equal(r.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.presentationml.presentation');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),fixturePPTX());return new Response(pdf);}}),before=await repo.get(state.courseId),args=await upload(call,state.courseId);
 const a=(await call('convert_presentation',args)).asset,b=(await call('convert_presentation',args)).asset;assert.equal(a.id,b.id);assert.equal(calls,1);assert.equal(a.kind,'pdf');assert.equal(a.ready,0);
 const p=(await call('import_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:args.assetId,pdfAssetId:a.id})).presentation;assert.equal(p.kind,'pptx');assert.equal(p.slides.length,2);assert.match(p.slides[0].notes,/Professor speaker note/);assert.match(p.slides[1].text,/first arch branch/);
 assert.deepEqual(decode64((await call('read_presentation_chunk',{courseId:state.courseId,assetId:p.originalAssetId,index:0})).asset.data),fixturePPTX());assert.deepEqual(await repo.get(state.courseId),before);
 await assert.rejects(executeTool(new CourseRepository(db,'outsider',repo.converter),'convert_presentation',args),/Course not found/);
});
test('legacy PPT converts and reopens with original text, order and downloadable immutable PPT bytes',async t=>{
 const pdf=await fixturePDF(),bytes=fixtureLegacyPPT(),{call,state}=await setup(t,{fetch:async r=>{assert.equal(r.headers.get('content-type'),'application/vnd.ms-powerpoint');return new Response(pdf);}}),args=await upload(call,state.courseId,'ppt',bytes),a=(await call('convert_presentation',args)).asset;
 const p=(await call('import_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:args.assetId,pdfAssetId:a.id})).presentation;assert.equal(p.kind,'ppt');assert.match(p.slides[0].text,/Second slide/);assert.match(p.slides[1].text,/Latest professor text/);assert.deepEqual(decode64((await call('read_presentation_chunk',{...args,index:0})).asset.data),bytes);
});
test('missing converters, incomplete uploads and conversion failures create no PDF receipt or presentation',async t=>{
 const {repo,db,call,state}=await setup(t),args=await upload(call,state.courseId);await assert.rejects(call('convert_presentation',args),/not configured/);
 repo.converter={fetch:async()=>new Response('failure',{status:422})};await assert.rejects(call('convert_presentation',args),/Could not generate/);
 repo.converter={fetch:async()=>new Response('corrupt')};await assert.rejects(call('convert_presentation',args),/valid PDF/);
 repo.converter={fetch:async()=>new Response(await fixturePDF())};const incomplete=crypto.randomUUID();await call('begin_presentation_upload',{courseId:state.courseId,assetId:incomplete,name:'Partial.pptx',kind:'pptx',bytes:40,chunks:1});await assert.rejects(call('convert_presentation',{courseId:state.courseId,assetId:incomplete}),/incomplete/);
 assert.equal((await db.prepare('SELECT count(*) AS count FROM tutor_conversions').first()).count,0);assert.equal((await call('list_presentations',{courseId:state.courseId})).presentations.length,0);
});
test('concurrent conversion and interrupted writes produce one complete PDF with no orphaned chunks',async t=>{
 const {call,state,db}=await setup(t,{fetch:async()=>new Response(await fixturePDF())}),args=await upload(call,state.courseId);
 db.db.exec("CREATE TRIGGER fail_conversion BEFORE INSERT ON tutor_conversions BEGIN SELECT RAISE(ABORT,'interrupted conversion'); END");await assert.rejects(call('convert_presentation',args),/interrupted/);assert.equal((await db.prepare('SELECT count(*) AS count FROM tutor_assets').first()).count,1);
 db.db.exec('DROP TRIGGER fail_conversion');const results=await Promise.all([call('convert_presentation',args),call('convert_presentation',args)]);assert.equal(results[0].asset.id,results[1].asset.id);assert.equal((await db.prepare('SELECT count(*) AS count FROM tutor_assets').first()).count,2);assert.equal((await db.prepare('SELECT count(*) AS count FROM tutor_conversions').first()).count,1);
});
test('converter configuration requires HTTPS and an authentication secret; local binding stays local',async()=>{
 assert.equal(configuredConverter({}),null);assert.equal(configuredConverter({PRESENTATION_CONVERTER_URL:'https://example.com'}),null);const binding={fetch(){}};assert.equal(configuredConverter({PRESENTATION_CONVERTER:binding}),binding);const bad=configuredConverter({PRESENTATION_CONVERTER_URL:'http://example.com',PRESENTATION_CONVERTER_TOKEN:'secret'});await assert.rejects(bad.fetch(new Request('https://converter',{method:'POST',body:'file'})),/HTTPS/);
});
test('native converter rejects corrupt, macro-enabled and oversized input before starting Office',async()=>{
 const converter=createPresentationConverter({executable:'/missing/soffice'});
 assert.equal((await converter.fetch(new Request('https://converter',{method:'GET'}))).status,405);
 const request=(bytes,type='application/vnd.ms-powerpoint',extra={})=>new Request('https://converter',{method:'POST',headers:{'Content-Type':type,...extra},body:bytes});
 assert.equal((await converter.fetch(request(new Uint8Array([1])))).status,400);assert.equal((await converter.fetch(request(fixtureLegacyPPT({macro:true})))).status,400);assert.equal((await converter.fetch(request('x','text/plain'))).status,415);assert.equal((await converter.fetch(request('x','application/vnd.ms-powerpoint',{'Content-Length':String(25*1024*1024)}))).status,413);
});
