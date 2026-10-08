import {App} from '@modelcontextprotocol/ext-apps';
import {pendingKey,tutorContext,requestTracker} from './pending.js';
import {hasLoaded} from './startup.js';
export const embedded=window.parent!==window;
export const bridge=embedded?new App({name:'pummy-adaptive-test',version:'0.5.0'},{availableDisplayModes:['inline','fullscreen']},{autoResize:true}):null;
export let latest={};let listener=()=>{},ready;
export function subscribe(fn){listener=fn;fn(latest);return ()=>{listener=()=>{};};}
function checkResult(r){if(r?.isError)throw new Error(r.content?.find(c=>c.type==='text')?.text||'Could not complete the action.');}
function apply(r){checkResult(r);const v=r?.structuredContent;if(!v?.state&&!v?.courses)return;if(v.state&&latest.state?.courseId===v.state.courseId&&v.state.revision<latest.state.revision)return;latest=v;listener(v);}
if(bridge){bridge.ontoolresult=r=>{try{apply(r);}catch(e){listener({...latest,error:e.message});}};bridge.ontoolcancelled=()=>listener({...latest,error:'Action cancelled. Progress is saved.'});ready=bridge.connect().catch(e=>{listener({...latest,error:e.message});throw e;});ready.catch(()=>{});}
async function perform(name,args={},options={}){const r=bridge?(await ready,await bridge.callServerTool({name,arguments:args},name==='convert_presentation'?{timeout:120000}:undefined)):await fetch('/api/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,arguments:args})}).then(async r=>{const b=await r.json();if(!r.ok)throw new Error(b.error||'Could not load the exam.');return b;});checkResult(r);if((!options.initial||!hasLoaded(latest))&&(!options.background||r.structuredContent?.state?.courseId===latest.state?.courseId))apply(r);return r.structuredContent;}
export async function message(state,text){if(!bridge)throw new Error('Open this exam in ChatGPT to ask the tutor.');await ready;await bridge.updateModelContext({structuredContent:context(state)});const r=await bridge.sendMessage({role:'user',content:[{type:'text',text}]});if(r.isError)throw new Error('Send your request in the ChatGPT conversation.');}
export const context=tutorContext;
export async function fullscreen(element){
 // Embedded expansion stays inside Pummy; never expand the surrounding ChatGPT window.
 if(bridge)return;
 if(!element?.requestFullscreen)throw new Error('Fullscreen is unavailable in this browser. Collapse the editor panels for more space.');
 return element.requestFullscreen();
}
let storage;try{storage=window.localStorage;}catch{}
const requests=requestTracker(storage);
export function pendingStatus(s){return requests.status(pendingKey(s));}
export async function askPending(s,authoritative=false){
 if(!pendingKey(s))return 'ready';
 // A tutor may already have completed the task in another view or conversation.
 const fresh=authoritative?s:(await call('read_course_state',{courseId:s.courseId},{background:true})).state;
 if(latest.state?.courseId!==s.courseId||!pendingKey(fresh))return 'ready';
 const key=pendingKey(fresh);if(!requests.begin(key))return 'sent';
 try{await message(fresh,fresh.generation?`Prepare the pending adaptive question for my Pummy exam (${fresh.name}). Read read_course_state with courseId ${fresh.courseId} for the latest revision and generation prompt, then call provide_question. If outOfScope creates a replacement generation request, complete that too until generation is null. Complete any explanationRequest using provide_explanation, reading the latest revision after each write. Never use a stale prompt from an earlier view. Keep the new answer key hidden and let me press Next.`:`Prepare the pending explanation for my Pummy exam (${fresh.name}). Read read_course_state with courseId ${fresh.courseId} for the latest revision and explanationRequest prompt, then call provide_explanation. Do not move to the next question or answer it for me.`);requests.finish(key,true);return 'sent';}catch(e){requests.finish(key,false);throw e;}
}

export async function call(name,args={},options={}){try{return await perform(name,args,options);}catch(e){if(/trusted tool scope|tool.*not.*found/i.test(e.message))throw new Error('This conversation still has the older plugin controls cached. Open Pummy Adaptive Test in a fresh ChatGPT conversation to enable the updated controls. Your progress is saved.');throw e;}}
