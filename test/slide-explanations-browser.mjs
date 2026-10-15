// Real MCP bridge with a disposable host. It does not model ChatGPT turn scheduling.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {encode64,CHUNK_SIZE} from '../lib/tutor/presentations.js';
import worker from '../dist/server/index.js';
const db=new LocalD1(),repo=new CourseRepository(db,'slide-browser'),call=(name,args)=>executeTool(repo,name,args);
const state=(await call('import_questions',{requestId:crypto.randomUUID(),name:'Slide QA',questions:[{stem:'Which number is even?',options:['one','two'],answer:[1]}]})).state;
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
for(let page=1;page<=5;page++)pdf.addPage([640,360]).drawText(`Professor slide ${page}: ${page} plus one is ${page+1}.`,{x:25,y:300,size:20,font});
const bytes=await pdf.save(),data=encode64(bytes),assetId=crypto.randomUUID();
await call('begin_presentation_upload',{courseId:state.courseId,assetId,name:'Lecture.pdf',kind:'pdf',bytes:bytes.length,chunks:Math.ceil(data.length/CHUNK_SIZE)});
for(let index=0;index<Math.ceil(data.length/CHUNK_SIZE);index++)await call('upload_presentation_chunk',{courseId:state.courseId,assetId,index,data:data.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE)});
const p=(await call('import_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:assetId,pdfAssetId:assetId})).presentation;
await call('start_test',{courseId:state.courseId,revision:state.revision,size:1,adaptive:false});
const before=await repo.get(state.courseId),checkHTML=await readFile('app/slide-check.html','utf8');
const host=`<!doctype html><style>iframe{width:100%;height:950px;border:0}.check{height:380px}</style><iframe id="viewer" src="/"></iframe><script>
window.handoffs=[];window.handoffContexts=[];window.checks={};window.failNext=false;window.toolCalls=[];window.contexts=[];
addEventListener('message',async e=>{const m=e.data;if(m?.jsonrpc!=='2.0')return;
 const frame=[...document.querySelectorAll('iframe')].find(f=>f.contentWindow===e.source);
 if(m.method==='ui/notifications/initialized'&&frame?.className==='check'){e.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:checks[frame.id]},'*');return;}
 if(m.id==null)return;try{let result={};
 if(m.method==='ui/initialize')result={protocolVersion:'2026-01-26',hostInfo:{name:'QA',version:'1'},hostCapabilities:{serverTools:{},message:{text:{}},updateModelContext:{structuredContent:{}}},hostContext:{displayMode:'inline'}};
 else if(m.method==='tools/call'){toolCalls.push(m.params.name);result=await fetch('/api/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m.params)}).then(r=>r.json());}
 else if(m.method==='ui/update-model-context')contexts.push(m.params);
 else if(m.method==='ui/message'){handoffs.push(m.params);handoffContexts.push(contexts.at(-1));if(failNext){failNext=false;throw new Error('Connection lost after acceptance');}}
 e.source.postMessage({jsonrpc:'2.0',id:m.id,result},'*');
 }catch(error){e.source.postMessage({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:error.message}},'*');}});
</script>`;
const server=createServer(async(req,res)=>{try{
 if(req.url==='/host'||req.url?.startsWith('/check')){res.writeHead(200,{'Content-Type':'text/html'});res.end(req.url==='/host'?host:checkHTML);return;}
 const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','slide-browser');
 const response=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),{DB:db});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PUMMY_BROWSER_EXECUTABLE?{executablePath:process.env.PUMMY_BROWSER_EXECUTABLE}:{})});page=await browser.newPage({viewport:{width:1280,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/host`);const viewer=page.frameLocator('#viewer');
 await viewer.getByRole('button',{name:'Open course',exact:true}).click();await viewer.getByRole('button',{name:'Open sidebar',exact:true}).click();await viewer.getByRole('button',{name:'Interactive Tutor',exact:true}).click();await viewer.getByRole('button',{name:/Lecture.pdf/}).click();
 await viewer.locator('.explain-slide-fab').hover();await viewer.getByRole('combobox',{name:'Go to slide'}).selectOption('3');await viewer.locator('.explain-slide-fab').hover();await viewer.getByRole('button',{name:'Explain the slide',exact:true}).click();
 await viewer.locator('.explain-slide-fab').hover();await viewer.getByRole('combobox',{name:'Go to slide'}).selectOption('4');await viewer.locator('.explain-slide-fab').hover();await viewer.getByRole('button',{name:'Explain the slide',exact:true}).click();
 await page.waitForFunction(()=>handoffs.length===2);
 assert.equal(await viewer.getByRole('button',{name:/ChatGPT finished/}).count(),0);
 assert.equal(await viewer.locator('.tutor-explain-controls').count(),0);
 const expected={role:'user',content:[{type:'text',text:'explain this slide'}]};
 assert.deepEqual(await page.evaluate(()=>handoffs),[expected,expected]);
 assert.equal((await call('read_slide_tutor',{courseId:p.courseId,presentationId:p.id,summaryOnly:true})).tutor.requests.length,0);
 assert.equal(await page.evaluate(()=>toolCalls.filter(name=>name==='prepare_slide_explanation').length),2);assert.equal((await db.prepare('SELECT count(*) AS n FROM tutor_requests').first()).n,2);
 const captured=await page.evaluate(()=>handoffContexts.map(c=>c.structuredContent.interactiveTutor));assert.deepEqual(captured.map(c=>c.page),[4,5]);assert.ok(captured.every(c=>c.requestId&&c.slideId));
 // Finish the real saved app-click requests, independent of the current visible slide.
 const refFor=c=>({courseId:c.courseId,presentationId:c.presentationId,slideId:c.slideId,requestId:c.requestId});
 const fourth=refFor(captured[0]),fifth=refFor(captured[1]);
 const answer='A. Reading the Slide\nProfessor arithmetic.\nB. Understanding the Material\nAdd one.\nC. What to Remember\nThe next integer.\nD. Check Your Understanding\nSelect an answer in the slide check.';
 const finish=async(ref,pageNumber)=>{await call('provide_slide_tutor',{...ref,answer,testable:true,citations:[{sourceId:`presentation-${p.id}`,page:pageNumber}],questions:[{stem:`What is ${pageNumber} plus one?`,options:[String(pageNumber+1),String(pageNumber)],answer:[0],definition:'Adding one gives the next integer.'}]});return {structuredContent:await call('render_slide_check',ref)};};
 const check4=await finish(fourth,4);assert.equal(await page.evaluate(()=>handoffs.length),2,'tool completion cannot send another request');
 const check5=await finish(fifth,5);
 for(const [id,result] of [['check4',check4],['check5',check5]])await page.evaluate(({id,result,answer})=>{const teaching=document.createElement('article');teaching.id=id+'-explanation';teaching.textContent=answer.split('D. Check Your Understanding')[0]+'Source: Lecture.pdf, slide '+result.structuredContent.tutor.check.page;document.body.append(teaching);checks[id]=result;const f=document.createElement('iframe');f.id=id;f.className='check';f.src='/check';document.body.append(f);},{id,result,answer});
 const c4=page.frameLocator('#check4'),c5=page.frameLocator('#check5');
 await c4.getByRole('radio',{name:'5',exact:true}).waitFor();assert.equal(await c4.locator('input:checked').count(),0);assert.equal(await c4.getByRole('button',{name:'Check answer',exact:true}).isEnabled(),false);assert.equal(await c4.getByText(/Correct answer:|Adding one gives/).count(),0);
 assert.equal(await page.locator('#check4-explanation').evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('#check4'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
 await c4.getByRole('radio',{name:'5',exact:true}).check();await c4.getByRole('button',{name:'Check answer',exact:true}).click();await c4.getByText('Correct',{exact:true}).waitFor();
 await c5.getByRole('radio',{name:'5',exact:true}).check();await c5.getByRole('button',{name:'Check answer',exact:true}).click();await c5.getByText('Incorrect',{exact:true}).waitFor();
 assert.equal(await c4.getByRole('radio',{name:'5',exact:true}).isChecked(),true);
 // Replayed stale tool output rehydrates the authoritative saved answer and result.
 await page.locator('#check4').evaluate(f=>f.src='/check?reload');await c4.getByText('Correct',{exact:true}).waitFor();assert.equal(await c4.getByRole('radio',{name:'5',exact:true}).isChecked(),true);
 await page.evaluate(result=>document.querySelector('#check4').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*'),check5);
 assert.equal(await c4.getByRole('heading',{name:/Slide 4/}).count(),1);assert.equal(await c5.getByText('Incorrect',{exact:true}).count(),1);
 // Typed explanations receive fresh renderable IDs even without an app-created request.
 await page.evaluate(()=>window.scrollTo(0,0));await viewer.locator('.explain-slide-fab').hover();await viewer.getByRole('combobox',{name:'Go to slide'}).selectOption('2');
 await page.waitForFunction(()=>contexts.some(c=>c.structuredContent?.interactiveTutor?.page===3&&c.structuredContent.interactiveTutor.practiceCheck?.prepareTool==='prepare_slide_explanation'));
 const typedVisible=await page.evaluate(()=>contexts.filter(c=>c.structuredContent?.interactiveTutor?.page===3).at(-1).structuredContent.interactiveTutor);
 const typedContext=(await call('read_slide_context',{courseId:typedVisible.courseId,presentationId:typedVisible.presentationId,slideId:typedVisible.slideId,query:'explain this slide'})).context;
 const typed=refFor(typedContext.practiceCheck);await call('prepare_slide_explanation',typed);
 await viewer.locator('.explain-slide-fab').hover();await viewer.getByRole('combobox',{name:'Go to slide'}).selectOption('1');
 const typedCheck=await finish(typed,3);await page.evaluate(({result,answer})=>{const article=document.createElement('article');article.id='typed-explanation';article.textContent=answer.split('D. Check Your Understanding')[0]+'Source: Lecture.pdf, slide 3';document.body.append(article);checks.typed=result;const f=document.createElement('iframe');f.id='typed';f.className='check';f.src='/check';document.body.append(f);},{result:typedCheck,answer});
 const tc=page.frameLocator('#typed');await tc.getByRole('radio',{name:'4',exact:true}).waitFor();assert.equal(await tc.locator('input:checked').count(),0);assert.equal(await tc.getByRole('button',{name:'Check answer',exact:true}).isEnabled(),false);assert.equal(await tc.getByText(/Correct answer:|Adding one gives/).count(),0);
 await tc.getByRole('radio',{name:'3',exact:true}).check();assert.equal(await tc.getByText(/Correct answer:|Adding one gives/).count(),0);await tc.getByRole('button',{name:'Check answer',exact:true}).click();await tc.getByText('Incorrect',{exact:true}).waitFor();await tc.getByText('Adding one gives the next integer.',{exact:true}).waitFor();
 assert.equal(await viewer.getByRole('combobox',{name:'Go to slide'}).inputValue(),'1');
 const freshTyped=(await call('read_slide_context',{courseId:p.courseId,presentationId:p.id,slideId:p.slides[2].id,explain:true})).context.practiceCheck;assert.notEqual(freshTyped.requestId,typed.requestId);
 await page.evaluate(()=>window.scrollTo(0,0));
 // Explicit uncertain delivery is never automatically sent again, including after remount.
 await viewer.locator('.explain-slide-fab').hover();await page.evaluate(()=>failNext=true);
 await viewer.locator('.explain-slide-fab').hover();await viewer.getByRole('button',{name:'Explain the slide',exact:true}).click();await viewer.locator('.explain-slide-fab').hover();await viewer.getByText(/Connection lost after acceptance/).waitFor();assert.equal(await page.evaluate(()=>handoffs.length),3);
 await page.locator('#viewer').evaluate(f=>f.contentWindow.location.reload());await viewer.getByRole('button',{name:'Open course',exact:true}).click();await viewer.getByRole('button',{name:'Open sidebar',exact:true}).click();await viewer.getByRole('button',{name:'Interactive Tutor',exact:true}).click();await viewer.getByRole('button',{name:/Lecture.pdf/}).click();await viewer.locator('.explain-slide-fab').hover();assert.equal(await viewer.getByText(/Connection lost after acceptance/).count(),0);assert.equal(await page.evaluate(()=>handoffs.length),3);
 await viewer.getByRole('button',{name:'Explain the slide',exact:true}).click();await page.waitForFunction(()=>handoffs.length===4);assert.deepEqual(await page.evaluate(()=>handoffs[3]),expected);
 assert.deepEqual(await repo.get(state.courseId),before);assert.deepEqual((await call('read_presentation',{courseId:state.courseId,presentationId:p.id})).presentation,p);assert.deepEqual(errors,[]);
 await mkdir('/private/tmp/pummy-slide-qa',{recursive:true});await viewer.locator('.explain-slide-fab').hover();await page.waitForFunction(()=>{const f=document.querySelector('#viewer'),b=f.contentDocument.querySelector('.explain-slide-fab').getBoundingClientRect();return b.right<=f.contentWindow.innerWidth&&b.left>=0;});await page.screenshot({path:'/private/tmp/pummy-slide-qa/checks.png',fullPage:true});
 console.log('Slide browser checks passed: typed and app request IDs, default native selectable checks, prose/citations first, no preselection, hidden keys until Check answer, unchanged exam and slide position; slides 4/5 capture independent saved requests while sending only the short chat text with no completion confirmation, persisted checked answers on replay, stale-result isolation, failed delivery/remount without replay and a fresh successful click, and unchanged exam/presentation.');
}catch(e){if(page){await mkdir('/private/tmp/pummy-slide-qa',{recursive:true});await page.screenshot({path:'/private/tmp/pummy-slide-qa/failure.png',fullPage:true});console.error(await page.locator('body').innerText());}throw e;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();}
