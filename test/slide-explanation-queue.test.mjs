import test from 'node:test';
import assert from 'node:assert/strict';
import {SlideExplanationQueue,slideExplanationPrompt} from '../app/slide-explanation-queue.js';
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}};
const ids=n=>({courseId:'course',presentationId:'presentation',slideId:`slide-${n}`,requestId:`request-${n}`});
test('rapid clicks reserve FIFO before asynchronous captures and send only one until explicit confirmation',async()=>{
 const sent=[],prepared=[];let release;
 const queue=new SlideExplanationQueue({storage:memory(),key:'test',prepare:async args=>prepared.push(args),send:async item=>sent.push(structuredClone(item))});
 const fourth=ids(4);queue.enqueue(fourth,4,()=>new Promise(resolve=>release=resolve));fourth.slideId='slide-9';
 queue.enqueue(ids(5),5,async()=> 'visual-5');await settle();assert.equal(sent.length,0);
 release('visual-4');await settle();assert.deepEqual(sent.map(r=>r.args.slideId),['slide-4']);
 assert.equal(prepared.find(r=>r.slideId==='slide-4').visual,'visual-4');
 // Acknowledgement, tool completion, and repeated dispatch calls do not release slide 5.
 await queue.dispatch();await queue.dispatch();assert.equal(sent.length,1);
 await queue.confirmFinished();assert.deepEqual(sent.map(r=>r.args.slideId),['slide-4','slide-5']);
 assert.match(slideExplanationPrompt(sent[1]),/request-5/);assert.doesNotMatch(slideExplanationPrompt(sent[1]),/slide-4/);
});
test('reload and uncertain delivery never automatically resend; a held unsent head resumes only explicitly',async()=>{
 const storage=memory(),sent=[];
 const q=new SlideExplanationQueue({storage,key:'test',prepare:async()=>{},send:async item=>{sent.push(item.args.requestId);throw new Error('Timed out after host may have accepted');}});
 q.enqueue(ids(4),4,async()=>null);q.enqueue(ids(5),5,async()=>null);await settle();assert.equal(q.items[0].status,'uncertain');
 const restored=new SlideExplanationQueue({storage,key:'test',prepare:async()=>{},send:async item=>sent.push(item.args.requestId)});
 await restored.dispatch();assert.deepEqual(sent,['request-4']);await restored.confirmFinished();assert.deepEqual(sent,['request-4','request-5']);
 storage.setItem('held',JSON.stringify([{args:ids(6),page:6,status:'ready'}]));
 const held=new SlideExplanationQueue({storage,key:'held',send:async item=>sent.push(item.args.requestId)});
 await held.dispatch();assert.equal(sent.length,2);await held.confirmFinished();assert.equal(sent[2],'request-6');
});
test('double confirmation during delivery cannot remove or dispatch a second item',async()=>{
 let release;const sent=[],q=new SlideExplanationQueue({storage:memory(),key:'test',prepare:async()=>{},send:item=>{sent.push(item.args.requestId);return new Promise(r=>release=r);}});
 q.enqueue(ids(4),4,async()=>null);q.enqueue(ids(5),5,async()=>null);await settle();
 await q.confirmFinished();assert.equal(sent.length,1);release();await settle();
 const next=q.confirmFinished();await q.confirmFinished();assert.equal(sent.length,2);assert.equal(q.items[0].args.requestId,'request-5');release();await next;
});
