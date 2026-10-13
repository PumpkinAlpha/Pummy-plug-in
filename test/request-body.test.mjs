import test from 'node:test';
import assert from 'node:assert/strict';
import {readJsonRequest,MAX_REQUEST_BYTES} from '../worker/request-body.js';
import worker from '../dist/server/index.js';

test('request reader bounds chunked UTF-8 bytes and cancels before reading the rest',async()=>{
 let pulls=0,cancelled=false;
 const chunk=new TextEncoder().encode('€'.repeat(200000));
 const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(chunk);},cancel(){cancelled=true;}},{highWaterMark:0});
 const request=new Request('https://example.test/mcp',{method:'POST',body:stream,duplex:'half'});
 await assert.rejects(readJsonRequest(request),e=>e.status===413);
 assert.equal(cancelled,true);assert.equal(pulls,3);
});

test('declared oversized requests are rejected without pulling their body',async()=>{
 let pulls=0,cancelled=false;
 const request=new Request('https://example.test/mcp',{method:'POST',headers:{'Content-Length':String(MAX_REQUEST_BYTES+1)},body:new ReadableStream({pull(){pulls++;},cancel(){cancelled=true;}},{highWaterMark:0}),duplex:'half'});
 await assert.rejects(readJsonRequest(request),e=>e.status===413);
 assert.equal(pulls,0);assert.equal(cancelled,true);
});

test('parsed requests retain the exact payload and headers for the MCP transport',async()=>{
 const value={jsonrpc:'2.0',id:17,method:'tools/list',params:{text:'UTF-8 €'}};
 const input=new Request('https://example.test/mcp',{method:'POST',headers:{'Content-Type':'application/json','mcp-protocol-version':'2026-07-28'},body:JSON.stringify(value)});
 const {body,request}=await readJsonRequest(input);assert.deepEqual(body,value);assert.deepEqual(await request.json(),value);assert.equal(request.headers.get('mcp-protocol-version'),'2026-07-28');
});

test('HTTP MCP parse errors use JSON-RPC and browser writes enforce bytes, not characters',async()=>{
 const env={DB:{prepare(){throw new Error('Invalid requests must not access data.');}}};
 const invalid=await worker.fetch(new Request('https://example.test/mcp',{method:'POST',body:'{'}),env);
 assert.equal(invalid.status,400);assert.deepEqual(await invalid.json(),{jsonrpc:'2.0',id:null,error:{code:-32700,message:'The request must contain valid JSON.'}});
 for(const path of ['/api/tool','/mcp']){
  const response=await worker.fetch(new Request('https://example.test'+path,{method:'POST',headers:{'oai-authenticated-user-id':'test',Origin:'https://example.test'},body:JSON.stringify({text:'€'.repeat(600000)})}),env);
  assert.equal(response.status,413);
 }
});
