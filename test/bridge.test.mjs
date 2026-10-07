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
 requestDisplayMode(){return new Promise(()=>{});}
 callServerTool(input){return globalThis.host.call(input);}
 }`}));
}}]});
function setup(call){const module={exports:{}},ctx={module,exports:module.exports,host:{call},window:{parent:{}}};vm.runInNewContext(bundle.outputFiles[0].text,ctx);return {api:module.exports,host:ctx.host};}
test('a fullscreen request with no response does not block loading or exam tools',async()=>{
 const calls=[];const {api}=setup(async input=>{calls.push(input.name);return {structuredContent:{courses:[]}};});
 const result=await Promise.race([api.call('open_test'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Blocked by display mode request')),100))]);
 assert.deepEqual(calls,['open_test']);assert.equal(result.courses.length,0);assert.equal(api.latest.courses.length,0);
});
test('late startup library read cannot replace a host-hydrated course',async()=>{
 let finish;const {api,host}=setup(()=>new Promise(r=>{finish=r;}));
 const pending=api.call('open_test',{}, {initial:true});await new Promise(r=>setImmediate(r));
 host.app.ontoolresult({structuredContent:{state:{courseId:'saved',revision:9}}});
 finish({structuredContent:{courses:[]}});await pending;assert.equal(api.latest.state.courseId,'saved');assert.equal(api.latest.state.revision,9);
});
test('host authorization errors remain errors, never switch to direct network',async()=>{
 const {api}=setup(async()=>{throw Error('Not in trusted tool scope');});
 await assert.rejects(api.call('create_course'),/controls cached/);assert.equal(api.latest.state,undefined);
});
