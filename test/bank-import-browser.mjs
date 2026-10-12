import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import worker from '../dist/server/index.js';
const db=new LocalD1(),repo=new CourseRepository(db,'bank-browser'),errors=[];
let failAppend=true;
const directory=new URL('../work/audit-bank-browser/',import.meta.url);await mkdir(directory,{recursive:true});
const server=createServer(async(req,res)=>{try{
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','bank-browser');
 const response=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers,...(body.length?{body}:{})}),{DB:db});
 if(req.method==='POST'&&JSON.parse(body).name==='add_questions'&&failAppend){failAppend=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Lost import response'}));return;}
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PUMMY_BROWSER_EXECUTABLE?{executablePath:process.env.PUMMY_BROWSER_EXECUTABLE}:{})});const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const file={name:'Large backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({name:'Large backup',questions:Array.from({length:204},(_,i)=>({term:`Topic ${i}`,stem:`Question ${i}?`,options:['Yes','No'],answer:[0],page:null}))}))};
 const picker=page.locator('input[aria-label="Import question bank"]');await picker.setInputFiles(file);
 await page.getByText(/Lost import response.*Select the same JSON file again/).waitFor();assert.equal((await repo.list()).length,1);assert.equal((await repo.list())[0].questionCount,204);
 await page.reload();await page.locator('input[aria-label="Import question bank"]').setInputFiles(file);await page.getByText('Imported 204 questions, sources and spaced-review progress.',{exact:false}).waitFor();assert.equal((await repo.list()).length,1);assert.equal((await repo.list())[0].questionCount,204);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 await page.screenshot({path:fileURLToPath(new URL('restored-bank-mobile.png',directory)),fullPage:true});
 console.log('Bank browser checks passed: a 204-question JSON export with null page numbers imports, a lost second-batch response resumes without duplicate courses/questions, and the restored course fits a phone.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();}
