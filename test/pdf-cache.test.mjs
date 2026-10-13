import test from 'node:test';
import assert from 'node:assert/strict';
import {fixturePDF} from './tutor-fixtures.mjs';
import {encode64} from '../lib/tutor/presentations.js';
const presentation=id=>({courseId:'cache-regression',pdfAssetId:id,assets:{pdf:{id,chunks:1}}});
for(const retry of ['same','different'])test(`a failed PDF download allows the ${retry} presentation to load on retry`,async t=>{
 const {renderSlide}=await import('../app/tutor-files.js?retry='+retry);
 const pdf=await fixturePDF();let calls=0;
 const call=async()=>{if(++calls===1)throw new Error('Transient network outage');return {asset:{data:encode64(pdf)}};};
 const previous=globalThis.document;
 // Reaching canvas creation proves the retry downloaded and parsed a valid PDF.
 globalThis.document={createElement(){throw new Error('PDF parsed; canvas reached');}};
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 await assert.rejects(renderSlide(call,presentation('first'),1),/Transient network outage/);
 await assert.rejects(renderSlide(call,presentation(retry==='same'?'first':'second'),1),/PDF parsed; canvas reached/);
 assert.equal(calls,2);
});
test('an older failed download cannot evict a newer presentation cache',async t=>{
 const {renderSlide}=await import('../app/tutor-files.js?retry=concurrent');let rejectOld,calls=0;
 const pdf=await fixturePDF(),call=async()=>{calls++;if(calls===1)return new Promise((_,reject)=>{rejectOld=reject;});return {asset:{data:encode64(pdf)}};};
 const previous=globalThis.document;globalThis.document={createElement(){throw new Error('PDF parsed; canvas reached');}};
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const old=renderSlide(call,presentation('old'),1),oldFailure=assert.rejects(old,/Old download failed/);
 const next=renderSlide(call,presentation('new'),1);rejectOld(new Error('Old download failed'));
 await oldFailure;await assert.rejects(next,/PDF parsed; canvas reached/);
 await assert.rejects(renderSlide(call,presentation('new'),2),/PDF parsed; canvas reached/);
 assert.equal(calls,2);
});
