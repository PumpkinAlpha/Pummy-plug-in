import test from 'node:test';
import assert from 'node:assert/strict';
import {hasLoaded,loadOnMount} from '../app/startup.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('entrypoint without host tool result loads via read-only opener',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let data={},reads=0;const errors=[];
 const stop=loadOnMount(async()=>{reads++;data={courses:[]};},()=>data,e=>errors.push(e));
 t.mock.timers.tick(1200);await tick();assert.equal(reads,1);assert.equal(hasLoaded(data),true);
 t.mock.timers.tick(15000);assert.deepEqual(errors,[]);stop();
});
test('normal hydrated launches do not make a redundant startup call',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let reads=0;
 const stop=loadOnMount(()=>{reads++;},()=>({state:{courseId:'saved'}}),()=>assert.fail());
 t.mock.timers.tick(16000);await tick();assert.equal(reads,0);stop();
});
test('host connection never finishing produces an actionable loading error',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const errors=[];
 const stop=loadOnMount(()=>new Promise(()=>{}),()=>({}),e=>errors.push(e));
 t.mock.timers.tick(15000);assert.match(errors[0],/Refresh/);assert.match(errors[0],/progress is saved/);stop();
});
test('failure is surfaced but late failed startup does not replace hydrated state',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const errors=[];let data={},reject;
 const stop=loadOnMount(()=>new Promise((_,r)=>{reject=r;}),()=>data,e=>errors.push(e));
 t.mock.timers.tick(1200);await tick();data={state:{courseId:'live'}};reject(new Error('old startup failed'));await tick();assert.deepEqual(errors,[]);stop();
});
test('unmount cancels startup and deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const stop=loadOnMount(()=>assert.fail(),()=>({}),()=>assert.fail());stop();t.mock.timers.tick(16000);await tick();
});
