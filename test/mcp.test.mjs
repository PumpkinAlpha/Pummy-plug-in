import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {LocalD1} from '../scripts/local-db.mjs';
const rpc=(method,params={},user)=>new Request('https://example.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(user?{'oai-authenticated-user-id':user}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
test('publisher discovery probes negotiate real supported versions and preserve private-call authentication',async()=>{
 const request=(method,params={},extra={})=>new Request('https://example.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','mcp-method':method,'mcp-protocol-version':'2026-07-28',...extra},body:JSON.stringify({jsonrpc:'2.0',id:'publisher-probe',method,params})});
 const env={DB:{prepare(){throw new Error('Discovery must not access saved course data.');}}};
 const response=await worker.fetch(request('server/discover',{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'publisher',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}}}),env);
 assert.equal(response.status,200);const message=await response.json(),result=message.result;
 assert.equal(message.id,'publisher-probe');assert.equal(result.resultType,'complete');assert.equal(result.cacheScope,'public');assert.equal(result.ttlMs,0);
 assert.ok(result.supportedVersions.includes('2025-11-25'));assert.ok(!result.supportedVersions.includes('2026-07-28'));assert.equal(result._meta['io.modelcontextprotocol/serverInfo'].name,'pummy-adaptive-test');
 const legacy=await worker.fetch(rpc('initialize',{protocolVersion:result.supportedVersions[0],capabilities:{},clientInfo:{name:'publisher',version:'1'}}),env);
 const initialized=(await legacy.json()).result;assert.deepEqual(result.capabilities,initialized.capabilities);assert.equal(result.instructions,initialized.instructions);
 assert.equal((await worker.fetch(request('tools/list'),env)).status,400);
 assert.equal((await worker.fetch(request('tools/call',{name:'list_courses',arguments:{}}),env)).status,401);
 const invalid=new Request('https://example.test/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','mcp-protocol-version':'2026-07-28'},body:JSON.stringify({jsonrpc:'2.0',method:'server/discover'})});
 assert.equal((await worker.fetch(invalid,env)).status,400);
 const oversized=request('server/discover',{padding:'x'.repeat(1500000)});assert.equal((await worker.fetch(oversized,env)).status,413);
});
test('MCP initialization, discovery, resource MIME and fullscreen metadata, and authenticated calls',async()=>{
 const db=new LocalD1(),env={DB:db};
 let response=await worker.fetch(rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}),env);assert.equal(response.status,200);let result=(await response.json()).result;assert.equal(result.serverInfo.name,'pummy-adaptive-test');assert.equal(result.serverInfo.version,'0.4.5');assert.equal(result.serverInfo.icons[0].src,'https://pummy-adaptive-test.daniel-dehkordi1.chatgpt.site/pummy-logo.png');assert.match(result.instructions,/student/);
 response=await worker.fetch(rpc('tools/list'),env);result=(await response.json()).result;assert.equal(result.tools.length,30);assert.deepEqual(result.tools.find(t=>t.name==='open_interface')._meta['openai/ui'].entrypoints,[{type:'global'},{type:'thread'}]);assert.equal(result.tools.find(t=>t.name==='submit_answer').annotations.readOnlyHint,false);assert.deepEqual(result.tools.find(t=>t.name==='delete_course')._meta.ui.visibility,['app']);assert.equal(result.tools.find(t=>t.name==='delete_course').annotations.destructiveHint,true);
 response=await worker.fetch(rpc('resources/read',{uri:'ui://pummy/adaptive-test-v4.html'}),env);result=(await response.json()).result;assert.equal(result.contents[0].mimeType,'text/html;profile=mcp-app');assert.equal(result.contents[0]._meta['openai/ui'].preferredDisplayMode,'fullscreen');assert.match(result.contents[0].text,/Pummy Adaptive Test/);
 const currentPage=result.contents[0].text;
 // Cached descriptors still request the original and v3 addresses.
 response=await worker.fetch(rpc('resources/read',{uri:'ui://pummy/adaptive-test-v3.html'}),env);result=(await response.json()).result;assert.equal(result.contents[0].text,currentPage);
 response=await worker.fetch(rpc('resources/read',{uri:'ui://pummy/adaptive-test.html'}),env);result=(await response.json()).result;assert.equal(result.contents[0].uri,'ui://pummy/adaptive-test.html');assert.equal(result.contents[0].text,currentPage);assert.match(currentPage,/Reload saved test/);assert.match(currentPage,/Opening Pummy/);
 response=await worker.fetch(rpc('tools/list'),env);result=(await response.json()).result;for(const tool of result.tools){assert.equal(tool._meta.ui.resourceUri,tool.name==='open_interface'?'ui://pummy/adaptive-test-v10.html':undefined);assert.equal(tool._meta['ui/resourceUri'],tool.name==='open_interface'?'ui://pummy/adaptive-test-v10.html':undefined);assert.deepEqual(tool._meta.ui.visibility,['export_bank','open_interface','delete_course','manage_folder','set_folder_tags','update_source_metadata','read_source_pdf','attach_source_pdf'].includes(tool.name)?['app']:['model','app']);assert.equal(tool._meta['openai/outputTemplate'],undefined);}
 response=await worker.fetch(rpc('resources/list'),env);const resources=(await response.json()).result.resources;assert.equal(resources.length,9);assert.ok(resources.some(r=>r.uri==='ui://pummy/adaptive-test-v9.html'));
 response=await worker.fetch(new Request('https://example.test/pummy-logo.png'),env);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0,8)],[137,80,78,71,13,10,26,10]);
 response=await worker.fetch(rpc('tools/call',{name:'list_courses',arguments:{}}),env);assert.equal(response.status,401);
 response=await worker.fetch(rpc('tools/call',{name:'list_courses',arguments:{}},'alice'),env);assert.equal(response.status,200);assert.deepEqual((await response.json()).result.structuredContent.courses,[]);
 const request=new Request('https://example.test/api/tool',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'alice',Origin:'https://evil.test'},body:JSON.stringify({name:'list_courses',arguments:{}})});response=await worker.fetch(request,env);assert.equal(response.status,403);db.close();
});

test('authenticated MCP source sync, idempotent retry, retrieval and page reads work end to end',async()=>{
 const db=new LocalD1(),env={DB:db};
 async function call(name,args,user='source-student'){const response=await worker.fetch(rpc('tools/call',{name,arguments:args},user),env);assert.equal(response.status,200);const body=await response.json();assert.equal(body.error,undefined,JSON.stringify(body));return body.result;}
 try{const created=await call('create_course',{requestId:crypto.randomUUID(),name:'Isolated source test'});assert.equal(created.isError,undefined);const state=created.structuredContent.state;
 const payload={courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[{id:'lecture-1',name:'Lecture',sourceType:'professor_slides',text:'The jugular and subclavian veins unite.',pages:[{page:15,text:'Jugular and subclavian union.'}]}]};
 const synced=await call('sync_course_sources',payload);assert.equal(synced.isError,undefined,JSON.stringify(synced));assert.deepEqual(synced.structuredContent.sync.added,['lecture-1']);assert.deepEqual((await call('sync_course_sources',payload)).structuredContent.sync,synced.structuredContent.sync);
 const found=await call('retrieve_sources',{courseId:state.courseId,query:'jugular'});assert.equal(found.structuredContent.context.excerpts[0].page,15);assert.equal(found.structuredContent.context.excerpts[0].rank,1);
 assert.match((await call('read_source',{courseId:state.courseId,sourceId:'lecture-1',page:15})).structuredContent.source.text,/union/);
 assert.equal((await call('open_test',{courseId:state.courseId},'other-student')).isError,true);
 const rejected=await call('sync_course_sources',{...payload,revision:synced.structuredContent.state.revision,requestId:crypto.randomUUID(),sources:[payload.sources[0],payload.sources[0]]});assert.equal(rejected.isError,true);assert.match(rejected.structuredContent.sync.rejected[0].message,/duplicate/);
 assert.equal((await call('open_test',{courseId:state.courseId})).structuredContent.state.revision,synced.structuredContent.state.revision);
 }finally{db.close();}
});

test('public listing pages work anonymously while saved app data still requires sign-in',async()=>{
 const env={DB:{prepare(){throw new Error('Public pages must not read private data.');}}};
 for(const route of ['/about','/support','/privacy','/terms']){
  const response=await worker.fetch(new Request('https://example.test'+route),env);
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/Daniel Dehkordi/);
  if(route!=='/about')assert.match(html,/daniel.dehkordi1@gmail.com/);
  assert.doesNotMatch(html,/\[CONTACT\]/);
  assert.match(response.headers.get('content-security-policy'),/default-src 'self'/);
 }
 const anonymous=await worker.fetch(new Request('https://example.test/'),env);
 assert.equal(anonymous.status,302);
 assert.equal(anonymous.headers.get('location'),'/signin-with-chatgpt?return_to=%2F');
 const signed=await worker.fetch(new Request('https://example.test/',{headers:{'oai-authenticated-user-id':'reviewer'}}),env);
 assert.equal(signed.status,200);
 assert.match(await signed.text(),/Opening Pummy/);
 const post=await worker.fetch(new Request('https://example.test/api/tool',{method:'POST',headers:{Origin:'https://example.test'},body:JSON.stringify({name:'list_courses',arguments:{}})}),env);
 assert.equal(post.status,401);
});
