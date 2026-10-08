import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewHistory,validView} from '../app/view-history.js';
function browser(){const listeners=new Map(),stack=[null];let position=0;const win={history:{get state(){return stack[position];},pushState(value){stack.splice(position+1);stack.push(value);position++;},replaceState(value){stack[position]=value;},back(){this.go(-1);},forward(){this.go(1);},go(delta){if(position+delta<0||position+delta>=stack.length)return;position+=delta;queueMicrotask(()=>listeners.get('popstate')?.({state:stack[position]}));}},addEventListener(n,fn){listeners.set(n,fn);},removeEventListener(n){listeners.delete(n);},stack,get position(){return position;}};return win;}
const view=(tab,presentationId=null,courseId='course')=>({courseId,tab,presentationId,folder:null});
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('Back and Forward restore actual previous tabs and presentations without recording duplicate refreshes',async()=>{
 const win=browser(),visited=[],changes=[],nav=createViewHistory(win,{apply:async route=>visited.push(route),onChange:value=>changes.push(value)});
 nav.record(view('library',null,null));nav.record(view('dashboard'));nav.record(view('tutor'));nav.record(view('tutor','deck'));nav.record({...view('tutor','deck'),slide:2});nav.record({...view('tutor','deck'),slide:2});assert.equal(win.stack.length,4);assert.equal(win.history.state.pummyView.view.slide,2);
 nav.back();await settle();assert.equal(visited.at(-1).presentationId,null);nav.record(visited.at(-1));nav.back();await settle();assert.equal(visited.at(-1).tab,'dashboard');nav.record(visited.at(-1));win.history.forward();await settle();assert.equal(visited.at(-1).tab,'tutor');nav.record(visited.at(-1));assert.equal(win.stack.length,4);assert.equal(changes.at(-1),true);nav.dispose();
});
test('history waits for saves and restores its position when a save fails',async()=>{
 const win=browser(),visited=[],errors=[];let finish;const nav=createViewHistory(win,{apply:async route=>visited.push(route),guard:()=>new Promise((resolve,reject)=>{finish={resolve,reject};}),onError:e=>errors.push(e.message)});
 nav.record(view('tutor'));nav.record(view('tutor','deck'));nav.back();await settle();assert.equal(visited.length,0);finish.reject(Error('Keep local work'));await settle();assert.equal(win.position,1);assert.deepEqual(errors,['Keep local work']);nav.back();await settle();finish.resolve();await settle();assert.equal(visited[0].presentationId,null);nav.dispose();
});
test('navigation validation and replacing forward history keep other window-state fields intact',async()=>{
 assert.equal(validView({tab:'run-shell',courseId:'course'}),false);assert.equal(validView(view('course')),true);const win=browser();win.history.replaceState({host:'keep'});let applied;const nav=createViewHistory(win,{apply:async v=>{applied=v;}});nav.record(view('dashboard'));nav.record(view('course'));nav.back();await settle();nav.record(applied);nav.record(view('progress'));assert.equal(win.stack.length,2);assert.equal(win.history.state.host,'keep');assert.equal(win.history.state.pummyView.view.tab,'progress');nav.dispose();
});
