// All mutations use a disposable database, never the user's live course.
import {createServer} from 'node:http';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import worker from '../dist/server/index.js';
const directory='/private/tmp/pummy-bank-history-qa';await mkdir(directory,{recursive:true});
const db=new LocalD1(),repo=new CourseRepository(db,'bank-history-qa'),call=(name,args)=>executeTool(repo,name,args);
const question={term:'Number reasoning',stem:'Which number is even?',options:['One','Two'],answer:[1],definition:'Two is even.',sourceId:'a',weekId:'Week 13'};
let {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Bank history QA',questions:[question],sources:[{id:'a',name:'Week 13 objectives',weekId:'Week 13',sourceType:'objectives',text:'1. Describe even numbers.\n2. Describe odd numbers.'}]});
const objectives=state.objectives,generationId=crypto.randomUUID();
for(let i=0;i<2;i++)state=(await call('add_questions',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),generationId,bankName:'One generation prompt',bankSourceIds:['a'],questions:[{...question,stem:'Generation batch '+(i+1)+' question?',objectiveId:objectives[0].id}]})).state;
state=(await call('add_questions',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),bankName:'Older prompt batch',questions:[{...question,stem:'Older prompt question?',objectiveId:objectives[1].id}]})).state;
state=(await call('start_test',{courseId:state.courseId,revision:state.revision,size:1,adaptive:false})).state;
const before=await repo.get(state.courseId),errors=[];
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','bank-history-qa');const result=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),{DB:db});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;
try{
 browser=await chromium.launch({headless:true,...(process.env.PUMMY_BROWSER_EXECUTABLE?{executablePath:process.env.PUMMY_BROWSER_EXECUTABLE}:{})});page=await browser.newPage({viewport:{width:1096,height:977}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Open course',exact:true}).click();await page.locator('.folder-row').filter({hasText:'Week 13'}).click();await page.locator('.folder-widget').filter({hasText:'Exam history'}).click();
 await page.locator('.practice-bank-entry').filter({hasText:'One generation prompt'}).waitFor();assert.equal(await page.locator('.practice-bank-entry').count(),3);
 const generation=page.locator('.practice-bank-entry').filter({hasText:'One generation prompt'});
 assert.match(await generation.innerText(),/2 questions/);assert.match(await generation.innerText(),/Objective coverage: 50%/);
 await generation.getByRole('button',{name:'Edit bank',exact:true}).click();const editor=page.getByRole('region',{name:'Question bank editor'});await page.locator('.bank-question-list button').first().waitFor();
 assert.equal(await generation.evaluate(el=>el.nextElementSibling?.classList.contains('practice-bank-editor')),true);assert.equal(await page.locator('.practice-bank-editor').evaluate(el=>document.activeElement===el),true);
 await page.locator('.bank-question-list button').first().click();await page.getByLabel('Question',{exact:true}).fill('Edited bank question?');await page.getByLabel('Learning objective',{exact:true}).selectOption(objectives[1].id);await page.getByRole('button',{name:'Save question',exact:true}).click();await page.getByText('Question-bank copy saved. Exam answers and progress preserved.',{exact:true}).waitFor();assert.match(await generation.innerText(),/Objective coverage: 100%/);
 const downloadEvent=page.waitForEvent('download');await generation.getByRole('button',{name:'Download Quizlet',exact:true}).click();const download=await downloadEvent;await download.saveAs(directory+'/group-quizlet.txt');assert.equal((await readFile(directory+'/group-quizlet.txt','utf8')).trimEnd().split('\n').length,2);
 await page.getByRole('button',{name:'Close bank',exact:true}).click();
 await page.getByRole('checkbox',{name:'Select bank Imported question bank',exact:true}).check();await page.getByRole('checkbox',{name:'Select bank Older prompt batch',exact:true}).check();await page.getByLabel('Combined bank name',{exact:true}).fill('Combined older prompt');await page.getByRole('button',{name:'Combine selected (2)',exact:true}).click();await page.getByRole('heading',{name:'Combined older prompt',exact:true,level:2}).waitFor();assert.equal(await page.locator('.practice-bank-entry').count(),2);assert.equal(await page.locator('.bank-question-list button').count(),2);
 const combined=page.locator('.practice-bank-entry').filter({hasText:'Combined older prompt'});assert.equal(await combined.evaluate(el=>el.nextElementSibling?.classList.contains('practice-bank-editor')),true);
 await combined.getByRole('button',{name:'Delete bank',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Delete question bank?',exact:true});await dialog.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.locator('.practice-bank-entry').count(),2);
 await combined.getByRole('button',{name:'Delete bank',exact:true}).click();dialog=page.getByRole('dialog',{name:'Delete question bank?',exact:true});await dialog.getByRole('button',{name:'Delete bank',exact:true}).click();await page.getByText('Question bank moved to Recently deleted. Course questions and exam progress preserved.',{exact:true}).waitFor();assert.equal(await page.locator('.practice-bank-entry').count(),1);assert.equal(await page.locator('.practice-bank-editor').count(),0);
 await page.reload();await page.getByRole('button',{name:'Open course',exact:true}).click();await page.locator('.folder-row').filter({hasText:'Week 13'}).click();await page.locator('.folder-widget').filter({hasText:'Exam history'}).click();await page.getByText('Recently deleted banks · 1',{exact:true}).click();await page.getByRole('button',{name:'Restore bank',exact:true}).click();await page.getByText('Question bank restored.',{exact:true}).waitFor();assert.equal(await page.locator('.practice-bank-entry').count(),2);
 await generation.getByRole('button',{name:'Edit bank',exact:true}).click();await page.locator('.practice-bank-editor').waitFor();
 await page.screenshot({path:directory+'/history-desktop.png',fullPage:true});
 for(const width of [697,390]){await page.setViewportSize({width,height:977});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`no overflow at ${width}`);await page.screenshot({path:directory+`/history-${width}.png`,fullPage:true});}
 assert.deepEqual(await repo.get(state.courseId),before);assert.deepEqual(errors,[]);console.log('Bank history browser checks passed: automatic grouping, inline editor and focus, coverage update, combined Quizlet, manual combine, delete/cancel/restore/reload, responsive layout, and unchanged course/exam.');
}catch(e){if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:directory+'/failure.png',fullPage:true});}throw e;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();}
