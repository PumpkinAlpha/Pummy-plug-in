import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {LocalD1} from '../scripts/local-db.mjs';
const rpc=(method,params={},user)=>new Request('https://example.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(user?{'oai-authenticated-user-id':user}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
test('MCP initialization, discovery, resource MIME and fullscreen metadata, and authenticated calls',async()=>{
 const db=new LocalD1(),env={DB:db};
 let response=await worker.fetch(rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}),env);assert.equal(response.status,200);let result=(await response.json()).result;assert.equal(result.serverInfo.name,'pummy-adaptive-test');assert.match(result.instructions,/student/);
 response=await worker.fetch(rpc('tools/list'),env);result=(await response.json()).result;assert.equal(result.tools.length,20);assert.deepEqual(result.tools.find(t=>t.name==='open_test')._meta['openai/ui'].entrypoints,[{type:'global'},{type:'thread'}]);assert.equal(result.tools.find(t=>t.name==='submit_answer').annotations.readOnlyHint,false);
 response=await worker.fetch(rpc('resources/read',{uri:'ui://pummy/adaptive-test-v3.html'}),env);result=(await response.json()).result;assert.equal(result.contents[0].mimeType,'text/html;profile=mcp-app');assert.equal(result.contents[0]._meta['openai/ui'].preferredDisplayMode,'fullscreen');assert.match(result.contents[0].text,/Pummy Adaptive Test/);
 const currentPage=result.contents[0].text;
 // Cached v0.1/v0.2 descriptors still request the original address. Both
 // addresses must serve the current app after the versioned URI is advertised.
 response=await worker.fetch(rpc('resources/read',{uri:'ui://pummy/adaptive-test.html'}),env);result=(await response.json()).result;assert.equal(result.contents[0].uri,'ui://pummy/adaptive-test.html');assert.equal(result.contents[0].text,currentPage);assert.match(currentPage,/Reload saved test/);assert.match(currentPage,/Opening Pummy/);
 response=await worker.fetch(rpc('tools/list'),env);result=(await response.json()).result;for(const tool of result.tools){assert.equal(tool._meta.ui.resourceUri,'ui://pummy/adaptive-test-v3.html');assert.equal(tool._meta['openai/outputTemplate'],undefined);}
 response=await worker.fetch(rpc('resources/list'),env);assert.equal((await response.json()).result.resources.length,2);
 response=await worker.fetch(rpc('tools/call',{name:'list_courses',arguments:{}}),env);assert.equal(response.status,401);
 response=await worker.fetch(rpc('tools/call',{name:'list_courses',arguments:{}},'alice'),env);assert.equal(response.status,200);assert.deepEqual((await response.json()).result.structuredContent.courses,[]);
 const request=new Request('https://example.test/api/tool',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'alice',Origin:'https://evil.test'},body:JSON.stringify({name:'list_courses',arguments:{}})});response=await worker.fetch(request,env);assert.equal(response.status,403);db.close();
});
