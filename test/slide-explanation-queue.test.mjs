import test from 'node:test';
import assert from 'node:assert/strict';
import {SlideExplanationQueue,slideExplanationPrompt} from '../app/slide-explanation-queue.js';
import {SLIDE_EXPLAINER_SKILL,SLIDE_EXPLAINER_SUMMARY} from '../worker/slide-explainer-skill.js';
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}};
const ids=n=>({courseId:'course',presentationId:'presentation',slideId:`slide-${n}`,requestId:`request-${n}`});
test('rapid clicks reserve FIFO before asynchronous captures and send without a confirmation',async()=>{
 const sent=[],prepared=[];let release;
 const queue=new SlideExplanationQueue({storage:memory(),key:'test',prepare:async args=>prepared.push(args),send:async item=>sent.push(structuredClone(item))});
 const fourth=ids(4);queue.enqueue(fourth,4,()=>new Promise(resolve=>release=resolve));fourth.slideId='slide-9';
 queue.enqueue(ids(5),5,async()=> 'visual-5');await settle();assert.equal(sent.length,0);
 release('visual-4');await settle();assert.deepEqual(sent.map(r=>r.args.slideId),['slide-4','slide-5']);
 assert.equal(prepared.find(r=>r.slideId==='slide-4').visual,'visual-4');
 await queue.dispatch();await queue.dispatch();assert.equal(sent.length,2);
 queue.enqueue(ids(6),6,async()=>null);await settle();assert.equal(sent.length,3);
 assert.match(slideExplanationPrompt(sent[1]),/request-5/);assert.doesNotMatch(slideExplanationPrompt(sent[1]),/slide-4/);
});
test('reload never resends sent, uncertain or previously unsent requests; a new click works',async()=>{
 const storage=memory(),sent=[];
 storage.setItem('test',JSON.stringify(['sent','sending','preparing','ready','held'].map((status,n)=>({args:ids(n),page:n,status}))));
 const q=new SlideExplanationQueue({storage,key:'test',prepare:async()=>{},send:async item=>sent.push(item.args.requestId)});
 await q.dispatch();assert.deepEqual(sent,[]);
 q.enqueue(ids(6),6,async()=>null);await settle();assert.deepEqual(sent,['request-6']);
 const restored=new SlideExplanationQueue({storage,key:'test',prepare:async()=>{},send:async item=>sent.push(item.args.requestId)});
 await restored.dispatch();assert.deepEqual(sent,['request-6']);
});
test('deliveries serialize while multiple explicit clicks are preparing',async()=>{
 const sent=[],releases=[],q=new SlideExplanationQueue({storage:memory(),key:'test',prepare:async()=>{},send:item=>{sent.push(item.args.requestId);return new Promise(r=>releases.push(r));}});
 q.enqueue(ids(4),4,async()=>null);await settle();q.enqueue(ids(5),5,async()=>null);await settle();
 await q.dispatch();assert.deepEqual(sent,['request-4']);releases.shift()();await settle();
 assert.deepEqual(sent,['request-4','request-5']);q.enqueue(ids(6),6,async()=>null);await settle();assert.equal(sent.length,2);
 releases.shift()();await settle();assert.deepEqual(sent,['request-4','request-5','request-6']);releases.shift()();await settle();
});
test('a failed preparation or uncertain delivery is never retried and cannot block another click',async()=>{
 const sent=[],q=new SlideExplanationQueue({storage:memory(),key:'test',prepare:async()=>{},send:async item=>{sent.push(item.args.requestId);if(item.page===5)throw new Error('Lost acknowledgement');}});
 q.enqueue(ids(4),4,async()=>{throw new Error('Capture failed');});q.enqueue(ids(5),5,async()=>null);q.enqueue(ids(6),6,async()=>null);
 await settle();await settle();assert.deepEqual(sent,['request-5','request-6']);await q.dispatch();assert.equal(sent.length,2);
});
test('all slide entrypoints require explanation and citations before rendering the last question',()=>{
 for(const prompt of [slideExplanationPrompt({args:ids(4),page:4}),SLIDE_EXPLAINER_SKILL,SLIDE_EXPLAINER_SUMMARY]){
  assert.match(prompt,/final tool call/i);assert.match(prompt,/final generated content/i);assert.match(prompt,/citations?.*before|before.*citations?/is);
 }
 assert.match(SLIDE_EXPLAINER_SKILL,/at the end of section C, before section D/);
});
