import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {uploadPresentationFile,loadAsset,exportProject,exportEditablePPTX} from '../app/tutor-files.js';
import {parse,slideText} from '@web-ppt/core';
import {legacyPptSlides} from '../lib/tutor/legacy-ppt.js';
import {nativeDeck,checkPowerPointExpansion} from '../app/powerpoint.js';
import {fixtureLegacyPPT} from './source-fixtures.mjs';
import {nativePPTX} from './native-fixtures.mjs';
import {zipSync,unzipSync,strFromU8} from 'fflate';
for(const kind of ['ppt','pptx'])test(`original ${kind} opens without a PDF or converter and survives export/reimport`,async t=>{
 const db=new LocalD1();t.after(()=>db.close());let conversionCalls=0;const repo=new CourseRepository(db,'native-'+kind,{fetch(){conversionCalls++;throw Error('Must not convert');}}),call=(n,a)=>executeTool(repo,n,a),{state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Native deck'}),before=await repo.get(state.courseId),bytes=kind==='ppt'?fixtureLegacyPPT():nativePPTX(),assetId=await uploadPresentationFile(call,state.courseId,new File([bytes],'Lecture.'+kind)),args={courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:assetId};
 const p=(await call('import_presentation',args)).presentation;assert.equal(p.renderMode,'powerpoint');assert.equal(p.pdfAssetId,null);assert.equal(p.assets.pdf,null);assert.equal(p.slides.length,2);assert.equal((await call('import_presentation',args)).presentation.id,p.id);assert.equal(conversionCalls,0);assert.deepEqual(await loadAsset(call,p.courseId,p.assets.original),bytes);assert.deepEqual(await repo.get(state.courseId),before);
 const deck=await nativeDeck(call,p,loadAsset);assert.equal(deck.slides.length,2);assert.ok(deck.slides.every(s=>s.elements.length>0));
 const project=JSON.parse(await exportProject(call,p,{}));assert.equal(project.pdf,null);assert.equal(project.presentation.renderMode,'powerpoint');assert.equal(Buffer.from(project.original,'base64').compare(Buffer.from(bytes)),0);
 if(kind==='pptx'){assert.match(p.slides[0].notes,/Professor speaker note/);assert.match(p.slides[0].text,/jugular/);assert.ok(deck.slides[0].elements.some(e=>e.kind==='image'));const original=unzipSync(bytes),edited=unzipSync(await exportEditablePPTX(call,p,{}));assert.deepEqual(edited['ppt/media/logo.png'],original['ppt/media/logo.png']);assert.deepEqual(edited['ppt/notesSlides/notesSlide4.xml'],original['ppt/notesSlides/notesSlide4.xml']);assert.match(strFromU8(edited['ppt/slides/slide7.xml']),/jugular/);}
 else{assert.match(slideText(deck.slides[0]),/Second slide/);assert.match(slideText(deck.slides[1]),/Latest professor text/);assert.ok(!deck.slides.map(slideText).join(' ').includes('Stale'));}
});
test('expanded media is bounded before a browser renderer allocates it',()=>{
 const bytes=zipSync({'large.bin':new Uint8Array(33*1024*1024)});assert.throws(()=>checkPowerPointExpansion(bytes),/too large for direct viewing/);
});

test('legacy renderer follows the current revision for regular FAT storage without changing source bytes',async()=>{
 const bytes=fixtureLegacyPPT({large:true}),before=bytes.slice(),view=legacyPptSlides(bytes,{rendererView:true}),deck=await parse(view);
 assert.deepEqual(bytes,before);assert.equal(deck.slides.length,2);assert.match(slideText(deck.slides[0]),/Second slide/);assert.match(slideText(deck.slides[1]),/Latest professor text/);assert.ok(!deck.slides.map(slideText).join(' ').includes('Stale'));deck.dispose?.();
});
