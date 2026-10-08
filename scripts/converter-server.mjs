import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {timingSafeEqual} from 'node:crypto';
import {createPresentationConverter} from './presentation-converter.mjs';
const token=process.env.PRESENTATION_CONVERTER_TOKEN;
if(!token||token.length<32)throw new Error('Set PRESENTATION_CONVERTER_TOKEN to a secret of at least 32 characters.');
const converter=createPresentationConverter(),expected=Buffer.from('Bearer '+token);
const port=Number(process.env.PUMMY_CONVERTER_PORT||8879);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid converter port.');
const server=createServer(async(req,res)=>{
 const received=Buffer.from(req.headers.authorization||'');
 if(received.length!==expected.length||!timingSafeEqual(received,expected)){res.writeHead(401);res.end('Authentication required.');return;}
 if(req.url!=='/convert'){res.writeHead(404);res.end('Not found');return;}
 try{const request=new Request('https://presentation-converter/convert',{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})});const response=await converter.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
 catch{res.writeHead(500);res.end('Slide conversion failed.');}
});
server.listen(port,process.env.PUMMY_CONVERTER_HOST||'127.0.0.1',()=>console.log(`Pummy slide converter listening on port ${port}`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
