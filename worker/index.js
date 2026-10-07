import page from '../app/view.html';
import { handleMcp } from './mcp.js';
import { executeTool } from './tools.js';
import { CourseRepository } from './repository.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {async fetch(request,env){
 const url=new URL(request.url),user=request.headers.get('oai-authenticated-user-id');
 try{
  if(url.pathname==='/health')return json({ok:true,app:'Pummy Adaptive Test',version:'0.4.0'});
  if(url.pathname==='/mcp'){
   // Discovery is public; the hosting boundary supplies authenticated identity for private calls.
   if(request.method==='POST'){
    const body=await request.clone().json();
    if(!user&&body.method==='tools/call')return json({jsonrpc:'2.0',id:body.id,error:{code:-32001,message:'Authentication required.'}},401);
   }
   return handleMcp(request,env,user);
  }
  if(url.pathname==='/api/tool'&&request.method==='POST'){
   if(!user)return json({error:'Sign in to continue.'},401);
   if(request.headers.get('origin')!==url.origin)return json({error:'Use the test interface to perform this action.'},403);
   if(Number(request.headers.get('content-length')||0)>1500000)return json({error:'Import fewer questions.'},413);
   const bodyText=await request.text();if(bodyText.length>1500000)return json({error:'Import fewer questions.'},413);
   const body=JSON.parse(bodyText);const data=await executeTool(new CourseRepository(env.DB,user),body.name,body.arguments);
   return json({structuredContent:data});
  }
  if(url.pathname==='/')return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"}});
  return new Response('Not found',{status:404});
 }catch(e){console.error('pummy-request-failed',url.pathname,e.message);return json({error:e.message||'Could not load your test. Try again.'},e.code==='conflict'?409:400);}
}};
