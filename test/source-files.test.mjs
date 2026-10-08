import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {extractSourceFile,saveManualSource,SOURCE_FILE_ACCEPT} from '../app/source-files.js';
import {DOMParser} from '@xmldom/xmldom';
import {legacyPptSlides} from '../lib/tutor/legacy-ppt.js';
import {fixtureLegacyPPT} from './source-fixtures.mjs';
import {fixturePPTX,fixturePDF} from './tutor-fixtures.mjs';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
const file=(name,bytes)=>({name,size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer});

test('manual PowerPoint imports read both formats in live slide order and exclude stale saves and notes',async()=>{
 for(const extension of ['ppt','pptx'])assert.ok(SOURCE_FILE_ACCEPT.includes('.'+extension));
 const modern=await extractSourceFile(file('Lecture.pptx',fixturePPTX()));assert.equal(modern.pageCount,2);assert.match(modern.text,/^--- Slide 1 ---\nThe jugular/);assert.equal(modern.pages[1].page,2);assert.doesNotMatch(modern.text,/Professor speaker note/);
 const legacy=await extractSourceFile(file('Lecture.ppt',fixtureLegacyPPT()));assert.equal(legacy.pageCount,2);assert.equal(legacy.pages[0].text,'Second slide – β文字é');assert.equal(legacy.pages[1].text,'Latest professor text');assert.doesNotMatch(legacy.text,/Stale/);
 const large=await extractSourceFile(file('Large.ppt',fixtureLegacyPPT({large:true})));assert.match(large.text,/Latest professor text/);assert.ok(large.text.length>4096);
});
test('manual PPTX source extraction never silently truncates long slide text',async()=>{
 const files=unzipSync(fixturePPTX()),path='ppt/slides/slide7.xml';files[path]=strToU8(strFromU8(files[path]).replace('The jugular and subclavian veins unite.','x'.repeat(13000)));
 const result=await extractSourceFile(file('Long slide.pptx',zipSync(files)));assert.equal(result.pages[0].text.length,13000);
 files[path]=strToU8(strFromU8(files[path]).replace('x'.repeat(13000),'x'.repeat(60001)));
 await assert.rejects(extractSourceFile(file('Too long.pptx',zipSync(files))),/60,000/);
});
test('legacy import rejects corrupt containers, cyclic edits, encrypted files and macros without executing them',async()=>{
 assert.throws(()=>legacyPptSlides(new Uint8Array([1,2,3])),/fresh .pptx/);
 for(const [options,pattern] of [[{cycle:true},/fresh .pptx/],[{encrypted:true},/Encrypted/],[{macro:true},/Macro/],[{macro:'storage'},/Macro/]])assert.throws(()=>legacyPptSlides(fixtureLegacyPPT(options)),pattern);
 const broken=fixtureLegacyPPT();new DataView(broken.buffer).setUint32(48,0x7fffffff,true);assert.throws(()=>legacyPptSlides(broken),/fresh .pptx/);
 await assert.rejects(extractSourceFile(file('bad.pptx',new Uint8Array([1,2,3]))),/valid PPTX/);
});
test('manual import accepts PDF and plain text and minimizes contact details',async()=>{
 const pdf=await extractSourceFile(file('Lecture.pdf',await fixturePDF()));assert.equal(pdf.pageCount,2);assert.match(pdf.text,/Page 1/);
 const plain=await extractSourceFile(file('Lecture.txt',strToU8('Professor text\nContact: teacher@example.test')));assert.doesNotMatch(plain.text,/teacher@example/);
});
test('manual reference imports append into the selected folder and retry without altering existing sources or active exams',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'manual-source-test'),call=(name,args)=>executeTool(repo,name,args);
 const {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Existing course',questions:[{term:'Original',stem:'Original question?',options:['One','Two'],answer:[0]}],sources:[{id:'existing',name:'Original reference',text:'Original professor source'}]});
 await call('start_test',{courseId:state.courseId,revision:state.revision,size:1,adaptive:false});const before=(await repo.get(state.courseId)).data;
 const parsed={...await extractSourceFile(file('Lecture.ppt',fixtureLegacyPPT())),sourceType:'professor_slides',rank:1},attempt={sourceId:'manual-source-'+crypto.randomUUID(),requestId:crypto.randomUUID()};
 const folder={kind:'week',label:'Week 2'};await saveManualSource(call,state.courseId,parsed,folder,attempt);await saveManualSource(call,state.courseId,parsed,folder,attempt);
 const after=(await repo.get(state.courseId)).data;assert.deepEqual(after.session,before.session);assert.deepEqual(after.questions,before.questions);assert.deepEqual(after.concepts,before.concepts);assert.deepEqual(after.sources[0],before.sources[0]);assert.equal(after.sources.length,2);
 assert.equal(after.sources[1].weekId,'Week 2');assert.equal(after.sources[1].rank,1);assert.equal(after.sources[1].metadata.mimeType,'application/vnd.ms-powerpoint');assert.equal(after.sources[1].pages[0].page,1);
});

test('all supported manual files preserve exact original bytes alongside editable text, including sync and restore',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'original-files'),call=(name,args)=>executeTool(repo,name,args);
 let {state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Originals'});
 const docx=zipSync({'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Professor text</w:t></w:r></w:p></w:body></w:document>')});
 for(const [name,bytes] of [['lecture.pdf',await fixturePDF()],['lecture.pptx',fixturePPTX()],['lecture.ppt',fixtureLegacyPPT()],['lecture.docx',docx],['lecture.txt',strToU8('Professor text')],['lecture.md',strToU8('# Professor text')]]){
  const parsed=await extractSourceFile(file(name,bytes),{Parser:DOMParser}),attempt={sourceId:'source-'+name,requestId:crypto.randomUUID()};
  const result=await saveManualSource(call,state.courseId,{...parsed,text:'Reviewed text copy',sourceType:'professor_slides',rank:1},null,attempt);state=result.state;
  const source=state.sources.find(s=>s.id===attempt.sourceId);assert.equal(source.originalFile.name,name);assert.equal(source.originalFile.bytes,bytes.length);
  let data='';for(let index=0;index<source.originalFile.chunks;index++)data+=(await call('read_presentation_chunk',{courseId:state.courseId,assetId:source.originalFile.id,index})).asset.data;
  assert.deepEqual(new Uint8Array(Buffer.from(data,'base64')),bytes);assert.equal((await call('read_source',{courseId:state.courseId,sourceId:source.id})).source.text,'Reviewed text copy');
  state=(await call('sync_course_sources',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[{id:source.id,name,text:'Updated searchable text'}]})).state;assert.deepEqual(state.sources.find(s=>s.id===source.id).originalFile,source.originalFile);
  state=(await call('delete_source',{courseId:state.courseId,revision:state.revision,sourceId:source.id})).state;state=(await call('restore_source',{courseId:state.courseId,revision:state.revision,sourceId:source.id})).state;assert.deepEqual(state.sources.find(s=>s.id===source.id).originalFile,source.originalFile);
  await assert.rejects(executeTool(new CourseRepository(db,'other-user'),'read_presentation_chunk',{courseId:state.courseId,assetId:source.originalFile.id,index:0}),/not found/i);
  if(name.endsWith('.pdf'))assert.equal((await call('import_course_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),sourceId:source.id})).presentation.slides.length,2);
 }
});
test('linking an incomplete original upload rejects the source without changing course state',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'incomplete-original'),call=(name,args)=>executeTool(repo,name,args),{state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Incomplete'}),assetId=crypto.randomUUID();
 await call('begin_presentation_upload',{courseId:state.courseId,assetId,name:'lecture.txt',kind:'txt',bytes:8,chunks:1});const before=await repo.get(state.courseId);
 await assert.rejects(call('sync_course_sources',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[{id:'lecture',name:'Lecture',text:'Study copy',originalAssetId:assetId}]}),/incomplete/);assert.deepEqual(await repo.get(state.courseId),before);
});
