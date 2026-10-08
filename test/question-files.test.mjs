import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {extractQuestionFile,fileSourceId,questionFileMessage,stageQuestionFile,QUESTION_FILE_ACCEPT,docxText} from '../app/question-files.js';
import {executeTool} from '../worker/tools.js';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
const file=(name,data)=>{const bytes=typeof data==='string'?strToU8(data):data;return {name,size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer};};
const quiz='1. Mock question?\nA. One\nB. Two\nAnswer: B';
function pdfBytes(text){const stream=`BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];let data='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(data.length);data+=`${i+1} 0 obj\n${o}\nendobj\n`;});const start=data.length;data+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return strToU8(data);}
test('TXT and Markdown preserve questions, minimize emails and accept UTF-16 BOM',async()=>{
 const extracted=await extractQuestionFile(file('quiz.txt',quiz+'\nInstructor: mock@example.test\nPhone: 555-123-4567'));
 assert.ok(extracted.text.startsWith(quiz));assert.doesNotMatch(extracted.text,/mock@example|555-123/);assert.equal(extracted.pageCount,undefined);assert.ok(extracted.warnings.some(w=>w.includes('omitted')));
 const bytes=new Uint8Array(2+quiz.length*2);bytes.set([255,254]);quiz.split('').forEach((c,i)=>{bytes[2+i*2]=c.charCodeAt(0);});
 assert.equal((await extractQuestionFile(file('quiz.txt',bytes))).text,quiz);
 assert.equal((await extractQuestionFile(file('quiz.md',quiz))).text,quiz);
});
test('DOCX paragraphs, runs, table text and breaks preserve order without external media',async()=>{
 const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>1. Mock </w:t></w:r><w:r><w:t>question?</w:t><w:br/><w:t>A. One</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>B. Two</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Answer: B</w:t></w:r></w:p></w:body></w:document>';
 const bytes=zipSync({'word/document.xml':strToU8(xml),'word/media/mock.png':new Uint8Array(20)});
 const extracted=await extractQuestionFile(file('quiz.docx',bytes),{Parser:DOMParser});assert.equal(extracted.text,quiz);assert.equal(extracted.pageCount,undefined);assert.match(extracted.warnings.at(-1),/images/);
 assert.throws(()=>docxText(zipSync({'word/document.xml':strToU8('<!DOCTYPE w [<!ENTITY x "unsafe">]>'+xml)}),DOMParser),/XML declarations/);
 await assert.rejects(extractQuestionFile(file('bad.docx','not a zip'),{Parser:DOMParser}),/DOCX/);
});
test('actual PDF parser extracts text with real page markers; no automatic binary upload',async()=>{
 const extracted=await extractQuestionFile(file('quiz.pdf',pdfBytes('Mock question? A. One B. Two Answer: B')));
 assert.equal(extracted.pageCount,1);assert.match(extracted.text,/^--- Page 1 ---\nMock question\?/);assert.equal(extracted.mimeType,'application/pdf');
});
test('empty, oversized, binary and unsupported documents fail without silent truncation',async()=>{
 for(const [f,pattern] of [[file('blank.txt','  '),/No readable/],[file('huge.txt','x'.repeat(60001)),/60,000/],[file('binary.txt',new Uint8Array([0,1])),/supported text/],[file('legacy.doc',quiz),/save as .docx/],[file('image.png','png'),/Choose JSON/]])await assert.rejects(extractQuestionFile(f),pattern);
 assert.ok(QUESTION_FILE_ACCEPT.includes('.txt,.md,.docx,.pdf'));
});
test('PDF bounds, scanned pages and password protection are reported; parser destroyed',async()=>{
 let destroyed=0;const make=(n,items)=>({pdfLoader:async()=>({getDocumentProxy:async()=>({numPages:n,getPage:async()=>({getTextContent:async()=>({items}),cleanup(){}}),destroy:async()=>destroyed++})})});
 await assert.rejects(extractQuestionFile(file('scan.pdf','mock'),make(2,[])),/OCR/);
 await assert.rejects(extractQuestionFile(file('long.pdf','mock'),make(201,[])),/200 pages/);
 assert.equal(destroyed,2);
 await assert.rejects(extractQuestionFile(file('protected.pdf','mock'),{pdfLoader:async()=>({getDocumentProxy:async()=>{throw new Error('Password required');}})}),/password-protected/);
});
test('stable file IDs and conversion prompt preserve professor keys, authority and app state',async()=>{
 assert.equal(await fileSourceId('Quiz.TXT'),await fileSourceId('quiz.txt'));assert.notEqual(await fileSourceId('quiz.txt'),await fileSourceId('another.txt'));
 const prompt=questionFileMessage('course','quiz-reference','request');for(const expected of ['verbatim','supplied answer keys','untrusted','add_questions','requestId request','read_course_state','missing images','Do not launch','not a completed'])assert.ok(prompt.includes(expected),expected);
});

test('same-named question files in different folders preserve each reference',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'folder-file-test');const call=(name,args)=>executeTool(repo,name,args);
 const {state}=await call('create_course',{requestId:crypto.randomUUID(),name:'Folder imports'});
 const first={kind:'week',label:'week1'},second={kind:'week',label:'week2'};
 const firstId=await fileSourceId('Quiz.txt',first),secondId=await fileSourceId('quiz.txt',second);
 assert.equal(firstId,await fileSourceId('quiz.txt',first));assert.notEqual(firstId,secondId);
 assert.notEqual(firstId,await fileSourceId('quiz.txt',{kind:'lecture',label:'week1'}));
 const extracted=await extractQuestionFile(file('quiz.txt',quiz));
 await stageQuestionFile(call,state.courseId,{...extracted,sourceType:'professor_quiz',rank:3},firstId,crypto.randomUUID(),first);
 await stageQuestionFile(call,state.courseId,{...extracted,text:quiz.replace('Mock','Another'),sourceType:'professor_quiz',rank:3},secondId,crypto.randomUUID(),second);
 const saved=(await call('read_course_state',{courseId:state.courseId})).state;
 assert.deepEqual(saved.sources.map(source=>[source.id,source.weekId]),[[firstId,'week1'],[secondId,'week2']]);
 assert.equal((await call('read_source',{courseId:state.courseId,sourceId:firstId})).source.text,quiz);
 assert.match((await call('read_source',{courseId:state.courseId,sourceId:secondId})).source.text,/Another/);
});
test('file staging is source-only; append receipts confirm a single idempotent import and preserve keys/session',async t=>{
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'file-test');const call=(name,args)=>executeTool(repo,name,args);
 let {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Mock',questions:[{term:'Original',stem:'Original?',options:['One','Two'],answer:[0]}]});
 state=(await call('start_test',{courseId:state.courseId,revision:state.revision,adaptive:false,size:1})).state;const before=(await repo.get(state.courseId)).data;
 const extracted=await extractQuestionFile(file('quiz.txt',quiz));const sourceId=await fileSourceId(extracted.name),syncId=crypto.randomUUID();
 const staged=await stageQuestionFile(call,state.courseId,{...extracted,sourceType:'professor_quiz',rank:3},sourceId,syncId);
 const after=(await repo.get(state.courseId)).data;assert.deepEqual(after.questions,before.questions);assert.deepEqual(after.session,before.session);assert.deepEqual(after.concepts,before.concepts);assert.equal(staged.state.questionCount,1);assert.equal(staged.state.sources[0].rank,3);
 await stageQuestionFile(call,state.courseId,{...extracted,sourceType:'professor_quiz',rank:3},sourceId,syncId);
 const requestId=crypto.randomUUID(),args={courseId:state.courseId,revision:staged.state.revision,requestId,questions:[{term:'Imported',stem:'Mock question?',options:['One','Two'],answer:[1],origin:'practice',sourceId}]};
 const appended=await call('add_questions',args);assert.equal(appended.state.questionCount,2);assert.deepEqual(appended.state.questionImports.map(r=>[r.requestId,r.addedCount]),[[requestId,1]]);assert.equal(appended.state.question.answer,undefined);
 assert.deepEqual((await call('add_questions',args)).state,appended.state);
 const final=(await repo.get(state.courseId)).data;assert.deepEqual(final.session,before.session);assert.deepEqual(final.questions[0],before.questions[0]);assert.deepEqual(final.questions[1].answer,[1]);assert.equal(final.questions[1].origin,'practice');
});
