// Regression coverage for screen docking and theme-aware embedded audio, using disposable data.
import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {fixturePDF} from './tutor-fixtures.mjs';
import {fixtureAudioPPTX} from './audio-fixture.mjs';
import {encode64,CHUNK_SIZE} from '../lib/tutor/presentations.js';
import {contrast} from '../app/themes.js';
import worker from '../dist/server/index.js';
const directory=new URL('../work/docking-qa/',import.meta.url);await mkdir(directory,{recursive:true});
const db=new LocalD1(),repo=new CourseRepository(db,'docking-qa'),call=(name,args)=>executeTool(repo,name,args);
const {state}=await call('create_course',{name:'Screen docking QA',requestId:crypto.randomUUID()});
async function upload(bytes,kind){const data=encode64(bytes),assetId=crypto.randomUUID();await call('begin_presentation_upload',{courseId:state.courseId,assetId,name:'Docking lecture.'+kind,kind,bytes:bytes.length,chunks:Math.ceil(data.length/CHUNK_SIZE)});for(let index=0;index<Math.ceil(data.length/CHUNK_SIZE);index++)await call('upload_presentation_chunk',{courseId:state.courseId,assetId,index,data:data.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE)});return assetId;}
await call('import_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:await upload(fixtureAudioPPTX(),'pptx'),pdfAssetId:await upload(await fixturePDF(),'pdf')});
const before=await repo.get(state.courseId);
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','docking-qa');const response=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),{DB:db});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,page;const errors=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PUMMY_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe'});page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Open course',exact:true}).click();await page.getByRole('button',{name:'Open sidebar',exact:true}).click();await page.getByRole('button',{name:'Interactive Tutor',exact:true}).click();
 const open=async()=>{await page.getByRole('button',{name:/Docking lecture.pptx/}).click();await page.locator('.tutor-audio audio').waitFor();await page.waitForFunction(()=>document.querySelector('.tutor-audio audio')?.readyState>=1);};
 const back=async()=>{await page.locator('.tutor-heading').hover();await page.getByRole('button',{name:'Back to previous page',exact:true}).click();};
 await open();
 const fab=page.locator('.explain-slide-fab'),handle=page.locator('.explain-slide-handle');
 async function dock(corner){await handle.focus();await page.keyboard.press(corner[0]==='t'?'Alt+ArrowUp':'Alt+ArrowDown');await page.keyboard.press(corner[1]==='l'?'Alt+ArrowLeft':'Alt+ArrowRight');await assertCorner(corner);}
 async function assertCorner(corner){await page.waitForFunction(c=>{const el=document.querySelector('.explain-slide-fab'),b=el.getBoundingClientRect(),v=visualViewport;return el.dataset.dockCorner===c&&Math.abs((c[1]==='l'?b.left-v.offsetLeft:v.offsetLeft+v.width-b.right)-12)<2&&Math.abs((c[0]==='t'?b.top-v.offsetTop:v.offsetTop+v.height-b.bottom)-12)<2;},corner);}
 for(const c of ['tl','tr','bl','br'])await dock(c);
 // The bottom screen edge is below the presentation and its audio, not a slide corner.
 assert.ok((await fab.boundingBox()).y>(await page.locator('.tutor-canvas-scroll').boundingBox()).y+(await page.locator('.tutor-canvas-scroll').boundingBox()).height);
 for(const corner of ['tl','tr','bl','br']){const b=await handle.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(corner[1]==='l'?20:1480,corner[0]==='t'?20:980,{steps:12});await page.mouse.up();await assertCorner(corner);}
 // Pointer cancellation returns to the saved corner instead of leaving a detached control.
 {const b=await handle.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(700,500,{steps:5});await handle.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await assertCorner('br');}
 await page.evaluate(()=>window.scrollTo(0,100));await assertCorner('br');
 await page.locator('.tutor-heading').hover();await page.getByRole('button',{name:'Browser fullscreen',exact:true}).click();await page.waitForFunction(()=>!!document.fullscreenElement);await assertCorner('br');await page.evaluate(()=>document.exitFullscreen());await assertCorner('br');
 await page.setViewportSize({width:390,height:844});await handle.focus();await assertCorner('br');for(const c of ['tl','tr','bl','br'])await dock(c);assert.ok((await fab.boundingBox()).width<=374);
 const audioPanel=page.locator('.tutor-audio');assert.ok((await audioPanel.boundingBox()).x>=0);assert.ok((await audioPanel.boundingBox()).x+(await audioPanel.boundingBox()).width<=390);
 await page.screenshot({path:fileURLToPath(new URL('phone-screen-corner.png',directory))});await page.setViewportSize({width:1500,height:1000});await dock('tr');await back();await open();await assertCorner('tr');await page.reload();await page.getByRole('button',{name:'Open course',exact:true}).click();await page.getByRole('button',{name:'Open sidebar',exact:true}).click();await page.getByRole('button',{name:'Interactive Tutor',exact:true}).click();await open();await assertCorner('tr');await dock('br');await back();
 for(const [theme,custom] of [['navy'],['warm'],['light'],['custom','light'],['custom','dark']]){
  await page.getByRole('button',{name:'Display settings',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Display & exam controls'});await dialog.getByRole('combobox',{name:/^Theme/}).selectOption(theme);
  if(custom){const colors=custom==='light'?['#f5f1ff','#ffffff','#282040','#7043c6']:['#101423','#171d30','#edf2ff','#66a3ff'];for(const [key,color] of ['background','surfaces','text','accent'].map((key,i)=>[key,colors[i]]))await dialog.getByLabel(`Custom ${key} color`).fill(color);}
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await open();
  const download=audioPanel.getByRole('button',{name:'Download audio',exact:true});
  const palette=await audioPanel.evaluate(el=>{const root=getComputedStyle(document.documentElement),s=getComputedStyle(el),audio=getComputedStyle(el.querySelector('audio'));return {surface:s.backgroundColor,text:s.color,panel:root.getPropertyValue('--panel').trim(),ink:root.getPropertyValue('--ink').trim(),scheme:audio.colorScheme};});
  const hex=color=>color.startsWith('#')?(color.length===4?'#'+color.slice(1).split('').map(c=>c+c).join(''):color):'#'+color.match(/\d+/g).slice(0,3).map(v=>Number(v).toString(16).padStart(2,'0')).join('');assert.equal(hex(palette.surface),hex(palette.panel));assert.equal(hex(palette.text),hex(palette.ink));assert.equal(palette.scheme,theme==='light'||custom==='light'?'light':'dark');
  for(const hover of [false,true]){if(hover)await download.hover();const colors=await download.evaluate(el=>{const s=getComputedStyle(el);return {text:s.color,surface:s.backgroundColor};});assert.ok(contrast(hex(colors.text),hex(colors.surface))>=4.5,`${theme}/${custom||''} audio button contrast`);}
  await page.locator('.tutor-audio audio').evaluate(async el=>{el.muted=true;el.loop=true;await el.play();});await page.waitForFunction(()=>document.querySelector('.tutor-audio audio')?.currentTime>.1);await page.locator('.tutor-audio audio').evaluate(el=>el.pause());
  await page.screenshot({path:fileURLToPath(new URL(`audio-${theme}${custom?'-'+custom:''}.png`,directory))});await back();
 }
 assert.deepEqual(await repo.get(state.courseId),before);assert.deepEqual(errors,[]);console.log('Tutor docking/theme checks passed: all four screen corners by keyboard and drag, cancel, scroll, resize, phone wrapping, native fullscreen, persisted corner on reopen/reload; audio playback and contrast in navy, warm, light and both custom color schemes; course state preserved.');
}catch(e){if(page){console.error((await page.locator('body').innerText()).slice(-4000));await page.screenshot({path:fileURLToPath(new URL('failure.png',directory))});}throw e;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();}
