// Disposable end-to-end QA. Uses an authored schematic fixture, never a student's course.
import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {uploadPresentationFile} from '../app/tutor-files.js';
import {fixturePDF} from './tutor-fixtures.mjs';
import worker from '../dist/server/index.js';
const output='work/assessment-formats-browser';await mkdir(output,{recursive:true});
const db=new LocalD1(),repo=new CourseRepository(db,'format-qa');let state;
const call=async(n,a)=>{const r=await executeTool(repo,n,a);if(r.state)state=r.state;return r;};
({state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Assessment formats QA'}));
const assetId=await uploadPresentationFile(call,state.courseId,new File([await fixturePDF()],'Professor schematic.pdf'));
await call('sync_course_sources',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[{id:'s',name:'Professor schematic.pdf',sourceType:'professor_slides',originalAssetId:assetId,text:'Objectives\n1. Interpret the original schematic and its spatial relationships.\nThe diagram contains a blue circle and orange line. The jugular and subclavian veins unite.',metadata:{pageCount:2}}]});
const server=createServer(async(req,res)=>{try{
 const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','format-qa');const r=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),{DB:db});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
}catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;const errors=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PUMMY_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});page=await browser.newPage({viewport:{width:1200,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('button',{name:'Open course',exact:true}).click();
 await page.getByRole('button',{name:/Study resources.*source/}).click();
 await page.getByRole('button',{name:/Course & sources Organize/}).click();
 const beforePreparation=await repo.get(state.courseId);
 await page.getByRole('button',{name:'Prepare original figures',exact:true}).click();
 await page.getByText(/Original figures prepared for source review/).waitFor();
 state=(await call('read_course_state',{courseId:state.courseId})).state;assert.equal(state.sourceVisuals.length,2);assert.equal(state.questionCount,0);
 const afterPreparation=await repo.get(state.courseId);for(const key of ['session','questions','history','concepts'])assert.deepEqual(afterPreparation.data[key],beforePreparation.data[key]);
 const legacyRead=await call('read_source',{courseId:state.courseId,sourceId:'s',page:1});assert.equal(legacyRead.context.status,'verified_original');assert.ok(legacyRead.visual.dataUrl);
 await page.screenshot({path:output+'/prepared-original-figures.png',fullPage:true});
 const visual=(await call('read_source_visual',{courseId:state.courseId,sourceId:'s',page:1})).visual.dataUrl;
 const figure={dataUrl:visual,file:'Professor schematic.pdf',unit:'page',page:1},raw=[
 {term:'Single choice',stem:'Identify the drawn blue shape.',options:['Circle','Line','Triangle'],answer:[0],optionNotes:['The blue region is circular.','The orange region is a line.','No triangle is drawn.']},
 {term:'Multiple selection',stem:'Select all shapes drawn in the original schematic.',multi:true,options:['Blue circle','Orange line','Green triangle'],answer:[0,1],optionNotes:['The blue circle is visible.','The orange line is visible.','No green triangle is present.']},
 {term:'Matching',stem:'Match the schematic elements.',type:'match',pairs:[{left:'Blue region',right:'Circle'},{left:'Orange region',right:'Line'},{left:'Black text',right:'Caption'}]},
 {term:'Ordering',stem:'Order these integers from smallest to largest.',type:'order',items:['One','Two','Three']},
 {term:'Diagram labeling',stem:'Place the labels onto the original schematic.',type:'label',figure,targets:[{x:.203,y:.39,w:.22,h:.39,answer:'Blue circle'},{x:.42,y:.38,w:.16,h:.18,answer:'Orange line'}]}
 ].map(q=>({...q,origin:'practice',sourceId:'s',page:1,explanation:{body:['This explanation belongs to this assessment format.'],items:[{item:'Relationship',text:'The source schematic supplies the spatial relationship.'}]}}));
 await call('append_saved_bank',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),questions:raw});
 const bank=await repo.get(state.courseId);
 for(const original of bank.data.questions){
  await call('start_test',{courseId:state.courseId,revision:state.revision,questionIds:[original.id],adaptive:true,size:1,restart:true});
  await page.reload();await page.getByRole('button',{name:'Open course',exact:true}).click();
  if(await page.getByRole('button',{name:'Resume exam',exact:true}).isVisible())await page.getByRole('button',{name:'Resume exam',exact:true}).click();
  await page.getByText(original.stem,{exact:true}).waitFor();
  for(const width of [1200,390]){await page.setViewportSize({width,height:900});if(await page.getByRole('button',{name:'Close sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'Close sidebar',exact:true}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  if(original.type==='label'){
   const bounds=await page.locator('.figure-stage img').boundingBox(),slot=await page.getByRole('button',{name:'Box 1',exact:true}).boundingBox();assert.ok(Math.abs((slot.x-bounds.x)/bounds.width-original.targets[0].x)<.02);
   for(const t of original.targets){await page.getByRole('button',{name:t.answer,exact:true}).click();await page.getByRole('button',{name:'Box '+(original.targets.indexOf(t)+1),exact:true}).click();}
   // Student selections must survive a reload before submission.
   await page.reload();await page.getByRole('button',{name:'Open course',exact:true}).click();if(await page.getByRole('button',{name:'Resume exam',exact:true}).isVisible())await page.getByRole('button',{name:'Resume exam',exact:true}).click();assert.ok((await page.getByRole('button',{name:'Box 1: Blue circle',exact:true}).count())===1);
  }else if(original.type==='match'){
   for(const p of original.pairs){await page.getByRole('button',{name:p.right,exact:true}).click();await page.getByRole('button',{name:'Match '+p.left,exact:true}).click();}
  }else if(original.type==='order'){
   for(let i=0;i<original.items.length;i++){const item=original.items[i];while(await page.getByRole('button',{name:'Move '+item+' up',exact:true}).isEnabled()){const index=await page.locator('.order-board li').allTextContents();if(index.findIndex(t=>t.includes(item))<=i)break;await page.getByRole('button',{name:'Move '+item+' up',exact:true}).click();}}
  }else{
   for(const i of original.answer)await page.getByRole(original.multi?'checkbox':'radio',{name:new RegExp(original.options[i])}).click();
  }
  await page.getByRole('button',{name:'Submit answer',exact:true}).click();await page.locator('.feedback.good').waitFor();assert.equal((await repo.get(state.courseId)).data.questions.find(q=>q.id===original.id).lastResult,'correct');
  await page.screenshot({path:output+'/'+(original.type||original.multi&&'multi'||'mcq')+'.png',fullPage:true});state=(await call('read_course_state',{courseId:state.courseId})).state;
 }
 assert.deepEqual(errors,[]);console.log('All five formats passed desktop/mobile input, actual original visual rendering, responsive targets, grading, explanations, adaptive persistence and label save/resume.');
}catch(e){if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:output+'/failure.png',fullPage:true});}throw e;}finally{await browser?.close();await new Promise(r=>server.close(r));db.close();}
