import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['app/bridge.js'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'host-test',setup(b){
 b.onResolve({filter:/^@modelcontextprotocol\/ext-apps$/},()=>({path:'mock-app',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export class App {
 constructor(){globalThis.host.app=this;}
 connect(){return Promise.resolve();}
 getHostContext(){return {displayMode:'inline',availableDisplayModes:['fullscreen']};}
 requestDisplayMode(input){return globalThis.host.display?.(input)||new Promise(()=>{});}
 callServerTool(input){return globalThis.host.call(input);}
 }`}));
}}]});
function setup(call,embedded=true){const module={exports:{}},window={};window.parent=embedded?{}:window;const ctx={module,exports:module.exports,host:{call},window};vm.runInNewContext(bundle.outputFiles[0].text,ctx);return {api:module.exports,host:ctx.host};}
test('inline initialization does not request host fullscreen or block tools',async()=>{
 const calls=[];const {api}=setup(async input=>{calls.push(input.name);return {structuredContent:{courses:[]}};});
 const result=await Promise.race([api.call('read_course_state'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Blocked by display mode request')),100))]);
 assert.deepEqual(calls,['read_course_state']);assert.equal(result.courses.length,0);assert.equal(api.latest.courses.length,0);
});
test('late startup library read cannot replace a host-hydrated course',async()=>{
 let finish;const {api,host}=setup(()=>new Promise(r=>{finish=r;}));
 const pending=api.call('read_course_state',{}, {initial:true});await new Promise(r=>setImmediate(r));
 host.app.ontoolresult({structuredContent:{state:{courseId:'saved',revision:9}}});
 finish({structuredContent:{courses:[]}});await pending;assert.equal(api.latest.state.courseId,'saved');assert.equal(api.latest.state.revision,9);
});
test('host authorization errors remain errors, never switch to direct network',async()=>{
 const {api}=setup(async()=>{throw Error('Not in trusted tool scope');});
 await assert.rejects(api.call('create_course'),/controls cached/);assert.equal(api.latest.state,undefined);
});
test('background read errors are reported without replacing the visible saved course',async()=>{
 const {api,host}=setup(async()=>({isError:true,content:[{type:'text',text:'Could not read the saved course.'}]}));
 host.app.ontoolresult({structuredContent:{state:{courseId:'saved',revision:9}}});
 await assert.rejects(api.call('read_course_state',{courseId:'saved'},{background:true}),/Could not read the saved course/);
 assert.equal(api.latest.state.courseId,'saved');assert.equal(api.latest.state.revision,9);
});
test('a failed initial read still rejects after host hydration so callers can handle the failure',async()=>{
 let finish;const {api,host}=setup(()=>new Promise(r=>{finish=r;}));
 const pending=api.call('read_course_state',{}, {initial:true});await new Promise(r=>setImmediate(r));
 host.app.ontoolresult({structuredContent:{state:{courseId:'saved',revision:9}}});
 finish({isError:true,content:[{type:'text',text:'Not in trusted tool scope'}]});
 await assert.rejects(pending,/controls cached/);assert.equal(api.latest.state.revision,9);
});
test('stale background course responses cannot navigate away from a newly opened course',async()=>{
 let finish;const {api,host}=setup(()=>new Promise(r=>{finish=r;}));
 host.app.ontoolresult({structuredContent:{state:{courseId:'old',revision:4}}});
 const pending=api.call('read_course_state',{courseId:'old'},{background:true});await new Promise(r=>setImmediate(r));
 host.app.ontoolresult({structuredContent:{state:{courseId:'new',revision:1}}});
 finish({structuredContent:{state:{courseId:'old',revision:5}}});await pending;
 assert.equal(api.latest.state.courseId,'new');
});
test('embedded editor expands locally without requesting host or browser fullscreen',async()=>{
 const {api,host}=setup(async()=>({structuredContent:{courses:[]}}));const calls=[];
 host.display=async input=>{calls.push(input.mode);return {mode:'fullscreen'};};
 await api.call('read_course_state');
 await api.fullscreen({requestFullscreen(){throw Error('Browser fullscreen must not be used in the host.');}});
 assert.deepEqual(calls,[]);
});
test('standalone editor requests browser fullscreen and reports unsupported browsers',async()=>{
 const {api}=setup(null,false);let count=0;await api.fullscreen({requestFullscreen(){count++;return Promise.resolve();}});assert.equal(count,1);
 await assert.rejects(api.fullscreen({}),/Fullscreen is unavailable/);
});
