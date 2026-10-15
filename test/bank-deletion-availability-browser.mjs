// All deletions run against a disposable local database.
import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import worker from '../dist/server/index.js';
const directory='/private/tmp/pummy-bank-deletion-sync-qa';await mkdir(directory,{recursive:true});
const db=new LocalD1(),repo=new CourseRepository(db,'bank-sync-browser'),call=(n,a)=>executeTool(repo,n,a),question=stem=>({term:stem,stem,options:['Yes','No'],answer:[0],sourceId:'a',weekId:'Week 13'});
let {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Deletion sync QA',sources:[{id:'a',name:'Lecture',weekId:'Week 13',text:'Use these supplied number facts.'}],questions:[question('Keep this question?')]});
state=(await call('append_saved_bank',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),bankName:'Delete these questions',questions:[question('Deleted question one?'),question('Deleted question two?')]})).state;
state=(await call('save_custom_test',{courseId:state.courseId,revision:state.revision,testId:crypto.randomUUID(),name:'Mixed saved test',questionIds:state.questionIndex.map(q=>q.id),size:'all',adaptive:false})).state;
state=(await call('start_test',{courseId:state.courseId,revision:state.revision,size:'all',examMode:'all',adaptive:false})).state;
const before=await repo.get(state.courseId),errors=[];
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','bank-sync-browser');const result=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),{DB:db});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;
try{
 browser=await chromium.launch({headless:true,...(process.env.PUMMY_BROWSER_EXECUTABLE?{executablePath:process.env.PUMMY_BROWSER_EXECUTABLE}:{})});page=await browser.newPage({viewport:{width:1096,height:977}});page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const url=`http://127.0.0.1:${server.address().port}`;
 const widget=name=>page.locator('.folder-widget').filter({hasText:name});
 const entry=()=>page.locator('.practice-bank-entry').filter({hasText:'Delete these questions'});
 async function openHistory(){await page.getByRole('button',{name:'Open course',exact:true}).click();await page.locator('.folder-row').filter({hasText:'Week 13'}).click();await widget('Exam history').click();await entry().waitFor();}
 async function remove(){await entry().getByRole('button',{name:'Delete bank',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete bank',exact:true}).click();await page.getByText('Question bank moved to Recently deleted. Its questions are excluded from new tests; saved exams and results are kept.',{exact:true}).waitFor();}
 await page.goto(url);await openHistory();await remove();
 // These checks use the current app state, without a reload between views.
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.locator('.folder-subtitle').getByText('1 source · 1 question',{exact:true}).waitFor();await page.screenshot({path:directory+'/folder-count-after-delete.png',fullPage:false});
 await widget('Custom tests').click();await page.locator('.saved-tests').getByText('1 saved questions · All selected',{exact:true}).waitFor();await page.getByRole('tab',{name:'From course bank',exact:true}).click();assert.equal(await page.locator('.custom-bank .toggle').count(),1);assert.equal(await page.getByText('Deleted question one?',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Back',exact:true}).click();await widget('Adaptive exam').click();await page.getByText('1 matching question',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Resume exam',exact:true}).count(),1);
 await page.getByRole('button',{name:'Back',exact:true}).click();await widget('Exam history').click();await page.locator('.deleted-banks summary').click();await page.getByRole('button',{name:'Restore bank',exact:true}).click();await page.getByText('Question bank restored.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Back',exact:true}).click();await page.locator('.folder-subtitle').getByText('1 source · 3 questions',{exact:true}).waitFor();await widget('Custom tests').click();await page.locator('.saved-tests').getByText('3 saved questions · All selected',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Pummy.Ai home',exact:true}).click();await page.locator('.course-facts').getByText('3 questions',{exact:true}).waitFor();
 await openHistory();await remove();await page.locator('.deleted-banks summary').click();await page.getByRole('button',{name:'Delete forever',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete forever',exact:true}).click();await page.getByText('Question bank permanently deleted.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Pummy.Ai home',exact:true}).click();await page.locator('.course-facts').getByText('1 questions',{exact:true}).waitFor();await page.reload();await page.locator('.course-facts').getByText('1 questions',{exact:true}).waitFor();
 await page.screenshot({path:directory+'/library-count-after-purge.png',fullPage:false});assert.deepEqual((await repo.get(state.courseId)).data,before.data);assert.deepEqual(errors,[]);
 console.log('Deleted-bank visibility browser passed: same-view state updates, folder and library counts, custom-test selections, adaptive matching count, restore, purge and reload; existing exam remains intact.');
}catch(e){if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:directory+'/failure.png',fullPage:true});}throw e;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();}
