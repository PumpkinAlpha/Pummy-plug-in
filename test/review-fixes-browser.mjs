import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {uploadPresentationFile} from '../app/tutor-files.js';
import {fixturePDF} from './tutor-fixtures.mjs';
import worker from '../dist/server/index.js';
const db=new LocalD1(),objects=new Map(),bucket={put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null,list:async({prefix})=>({objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false}),delete:async keys=>{for(const key of keys)objects.delete(key);}};
const repo=new CourseRepository(db,'review-browser-user',null,bucket),call=(n,a)=>executeTool(repo,n,a);
const {state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Review fixes'}),assetId=await uploadPresentationFile(call,state.courseId,new File([await fixturePDF()],'Lecture.pdf'));
await call('import_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:assetId,pdfAssetId:assetId});
let failDownload=true,downloads=0;const errors=[];
const server=createServer(async(req,res)=>{try{
 const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks),headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','review-browser-user');
 if(req.method==='POST'&&JSON.parse(body).name==='read_presentation_chunk'){downloads++;if(failDownload){failDownload=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Temporary PDF download failure'}));return;}}
 const response=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers,...(body.length?{body}:{})}),{DB:db,BUCKET:bucket});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PUMMY_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1400,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Open course',exact:true}).click();await page.getByRole('button',{name:'Open sidebar',exact:true}).click();await page.getByRole('button',{name:'Interactive Tutor',exact:true}).click();await page.getByRole('button',{name:/Lecture.pdf/}).click();
 await page.getByRole('button',{name:'Retry slide',exact:true}).waitFor();assert.equal(downloads,1);
 await page.getByRole('button',{name:'Retry slide',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.tutor-canvas image')?.getAttribute('href')?.startsWith('data:image/png'));
 assert.equal(downloads,2);assert.equal(await page.getByRole('button',{name:'Retry slide',exact:true}).count(),0);
 // Navigate through the real library and delete the uploaded course.
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Options for Review fixes',exact:true}).click();await page.getByRole('menuitem',{name:'Delete course',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Delete course?',exact:true});await dialog.getByRole('button',{name:'Delete course',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(await repo.get(state.courseId),null);assert.equal(objects.size,0);assert.equal((await repo.list()).length,0);assert.deepEqual(errors,[]);
 console.log('Browser regression checks passed: Retry slide recovers in place; course deletion removes uploaded storage.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();}
