import {createServer} from 'node:http';
import {mkdirSync} from 'node:fs';
import {LocalD1} from './local-db.mjs';
import worker from '../dist/server/index.js';
mkdirSync('work',{recursive:true});
const db=new LocalD1('work/local.sqlite'),port=8777;
const server=createServer(async(req,res)=>{try{
 const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-preview-user');
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
 const response=await worker.fetch(request,{DB:db});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(e.message);}});
server.listen(port,'127.0.0.1',()=>console.log(`Pummy preview http://127.0.0.1:${port}`));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
