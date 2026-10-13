import {connectedProfile} from './identity.js';
import page from '../app/view.html';
import logoDataUrl from '../app/pummy-logo.png';
import { handleMcp } from './mcp.js';
import { executeTool } from './tools.js';
import { CourseRepository } from './repository.js';
import {configuredConverter} from './presentation-converter.js';
import {publicPage} from './public-pages.js';
import {publicationInfo} from './public-content.js';
import {readJsonRequest} from './request-body.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {async fetch(request,env){
 const url=new URL(request.url),user=request.headers.get('oai-authenticated-user-id');
 try{
  if(url.pathname==='/.well-known/openai-apps-challenge'){
   if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
   return new Response(request.method==='HEAD'?null:'gn2KBwViuw2s8d8rlzY5aeqndqneMWONWyJucixXcEw',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  const info=publicPage(url.pathname,publicationInfo);
  if(info){
   if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
   return new Response(request.method==='HEAD'?null:info,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'unsafe-inline'; img-src 'self'; object-src 'none'; base-uri 'none'"}});
  }
  if(url.pathname==='/health')return json({ok:true,app:'Pummy Adaptive Test',version:'0.5.0'});
  if(url.pathname==='/pummy-logo.png')return new Response(Uint8Array.from(atob(logoDataUrl.split(',')[1]),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
  if(url.pathname==='/mcp'){
   // Discovery is public; the hosting boundary supplies authenticated identity for private calls.
   let body;
   if(request.method==='POST'){
    const parsed=await readJsonRequest(request);body=parsed.body;request=parsed.request;
    if(!user&&body?.method==='tools/call')return json({jsonrpc:'2.0',id:body.id??null,error:{code:-32001,message:'Authentication required.'}},401);
   }
   return handleMcp(request,env,user,body,connectedProfile(request));
  }
  if(url.pathname==='/api/tool'&&request.method==='POST'){
   if(!user)return json({error:'Sign in to continue.'},401);
   if(request.headers.get('origin')!==url.origin)return json({error:'Use the test interface to perform this action.'},403);
   const {body}=await readJsonRequest(request);const data=await executeTool(new CourseRepository(env.DB,user,configuredConverter(env),env.BUCKET,connectedProfile(request)),body?.name,body?.arguments);
   return json({structuredContent:data});
  }
  if(url.pathname==='/'){
   if(!user)return new Response(null,{status:302,headers:{Location:'/signin-with-chatgpt?return_to=%2F','Cache-Control':'no-store'}});
   return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; media-src blob: data:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'"}});
  }
  return new Response('Not found',{status:404});
 }catch(e){console.error('pummy-request-failed',url.pathname,e.message);const status=e.status||(e.code==='conflict'?409:400);return json(url.pathname==='/mcp'&&e.rpcCode?{jsonrpc:'2.0',id:null,error:{code:e.rpcCode,message:e.message}}:{error:e.message||'Could not load your test. Try again.'},status);}
}};
