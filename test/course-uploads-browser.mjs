import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import worker from '../dist/server/index.js';
const directory=new URL('../work/upload-qa/',import.meta.url);await mkdir(directory,{recursive:true});
const db=new LocalD1(),objects=new Map(),bucket={put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null},repo=new CourseRepository(db,'browser-upload-test',null,bucket);
const {state}=await executeTool(repo,'create_course',{requestId:crypto.randomUUID(),name:'Upload QA'});
let fail=true;const errors=[];
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','browser-upload-test');
 if(req.method==='POST'){const data=JSON.parse(body);if(data.name==='sync_course_sources'&&data.arguments.sources[0].name==='second.md'&&fail){fail=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Temporary upload failure'}));return;}}
 const response=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers,...(body.length?{body}:{})}),{DB:db,BUCKET:bucket,ASSETS:new Proxy({},{get:()=>()=>{throw new Error('Wrong storage binding');}})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PUMMY_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage({viewport:{width:1400,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Open course',exact:true}).click();await page.getByRole('button',{name:'Open sidebar',exact:true}).click();await page.getByRole('button',{name:'Course & sources',exact:true}).click();
 await page.getByRole('button',{name:'+ Add subfolder',exact:true}).click();await page.getByRole('textbox',{name:'New subfolder name'}).fill('Batch folder');await page.getByRole('button',{name:'Create subfolder',exact:true}).click();
 await page.getByRole('button',{name:'Manual import',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Import course source'}),input=dialog.getByLabel('Choose source file');assert.equal(await input.getAttribute('multiple'),'');
 await input.setInputFiles(['first.txt','second.md','third.txt','invalid.bin'].map(name=>({name,mimeType:'text/plain',buffer:Buffer.from('Professor reference for '+name)})));
 await dialog.getByRole('button',{name:'Import 3 sources',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.source-file-form input[type=file]').disabled);
 await dialog.getByRole('button',{name:'second.md',exact:true}).click();assert.match(await dialog.getByRole('textbox',{name:/Review extracted source text/}).inputValue(),/second.md/);
 await page.screenshot({path:fileURLToPath(new URL('batch-review-desktop.png',directory))});
 await page.setViewportSize({width:390,height:844});assert.ok(await dialog.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:fileURLToPath(new URL('batch-review-mobile.png',directory))});await page.setViewportSize({width:1400,height:1000});
 await dialog.getByRole('button',{name:'Import 3 sources',exact:true}).click();await dialog.getByText('Temporary upload failure',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Retry failed uploads',exact:true}).waitFor();
 assert.equal((await repo.get(state.courseId)).data.sources.length,2);
 await dialog.getByRole('button',{name:'Retry failed uploads',exact:true}).click();await dialog.getByText('3 of 4 files imported.',{exact:false}).waitFor();
 await dialog.getByRole('button',{name:'Remove invalid.bin',exact:true}).click();await dialog.getByRole('button',{name:'Done',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const saved=(await repo.get(state.courseId)).data;assert.equal(saved.sources.length,3);assert.ok(saved.sources.every(s=>s.lecture==='Batch folder'));assert.equal(saved.questions.length,0);assert.equal(objects.size,3);
 for(const source of saved.sources){const chunk=await executeTool(repo,'read_presentation_chunk',{courseId:state.courseId,assetId:source.originalFile.id,index:0});assert.equal(Buffer.from(chunk.asset.data,'base64').toString(),'Professor reference for '+source.name);}
 await page.screenshot({path:fileURLToPath(new URL('batch-imported.png',directory))});assert.deepEqual(errors,[]);console.log('Batch upload browser QA passed: review, mobile layout, partial failure, retry, folder placement, exact originals, no duplicates.');
}finally{await browser?.close();await new Promise(r=>server.close(r));db.close();}
