import test from 'node:test';
import assert from 'node:assert/strict';
import {queueSlideContext,sendSlideExplanation} from '../app/slide-explanation-handoff.js';

function host(){
 const updates=[],messages=[],requests=[];let current;
 return {updates,messages,requests,bridge:{async updateModelContext(c){current=c;updates.push(c);},async sendMessage(m){messages.push({message:m,context:current});return {};}},call:async(name,args)=>{assert.equal(name,'prepare_slide_explanation');requests.push(args);return {tutor:{request:{id:args.requestId,page:Number(args.slideId.split('-')[1]),context:{professorSlide:{sourceId:'s',text:'Original source evidence.'},speakerNotes:{text:'Professor note.'},explainSkill:'Professor-aligned explanation and native check.'}}}};}};
}
const args=n=>({courseId:'c',presentationId:'p',slideId:'slide-'+n,annotationIds:[],allowGeneral:false});
test('rapid app clicks bind the exact saved slide to each short message and restore typed context',async()=>{
 const h=host();await Promise.all([sendSlideExplanation({...h,args:args(4)}),queueSlideContext(()=>h.bridge.updateModelContext({structuredContent:{interactiveTutor:{slideId:'slide-5'}}})),sendSlideExplanation({...h,args:args(5)})]);
 assert.deepEqual(h.messages.map(m=>m.context.structuredContent.interactiveTutor.slideId),['slide-4','slide-5']);
 assert.deepEqual(h.messages.map(m=>m.context.structuredContent.interactiveTutor.requestId),h.requests.map(r=>r.requestId));
 assert.ok(h.messages.every(m=>m.message.content[0].text==='explain this slide'));
 const typed=h.updates.at(-1);assert.equal(typed.structuredContent.interactiveTutor.requestId,undefined);assert.equal(typed.structuredContent.interactiveTutor.practiceCheck.prepareTool,'prepare_slide_explanation');assert.match(typed.content[0].text,/fresh practiceCheck/);
});
test('an uncertain host delivery is not replayed and a later explicit click creates a fresh check',async()=>{
 const h=host();let fail=true;h.bridge.sendMessage=async message=>{h.messages.push(message);if(fail){fail=false;throw Error('Connection lost after acceptance');}return {};};
 await assert.rejects(sendSlideExplanation({...h,args:args(2)}),/Connection lost/);assert.equal(h.messages.length,1);assert.equal(h.requests.length,1);
 await queueSlideContext(()=>h.bridge.updateModelContext({structuredContent:{interactiveTutor:{slideId:'slide-2'}}}));assert.equal(h.messages.length,1);
 await sendSlideExplanation({...h,args:args(2)});assert.equal(h.messages.length,2);assert.notEqual(h.requests[0].requestId,h.requests[1].requestId);
});
