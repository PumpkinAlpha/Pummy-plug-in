import {createServer} from 'node:http';
import {mkdirSync} from 'node:fs';
import {LocalD1} from './local-db.mjs';
import {createPresentationConverter} from './presentation-converter.mjs';
import worker from '../dist/server/index.js';
mkdirSync('work',{recursive:true});
const port=Number(process.env.PUMMY_PREVIEW_PORT||8777);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PUMMY_PREVIEW_PORT must be a port between 1 and 65535.');
const db=new LocalD1('work/local.sqlite');
const converter=createPresentationConverter();
const server=createServer(async(req,res)=>{try{
 const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-preview-user');
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
 const response=await worker.fetch(request,{DB:db,PRESENTATION_CONVERTER:converter});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(e.message);}});
server.listen(port,'127.0.0.1',()=>console.log(`Pummy preview http://127.0.0.1:${port}`));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0);}));
