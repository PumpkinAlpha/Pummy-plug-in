import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {extractSourceFile,saveManualSource,SOURCE_FILE_ACCEPT} from '../app/source-files.js';
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
 await assert.rejects(extractSourceFile({name:'large.ppt',size:24*1024*1024+1}),/24 MB/);
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
