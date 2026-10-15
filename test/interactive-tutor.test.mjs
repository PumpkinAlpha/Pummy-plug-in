import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {encode64,decode64,CHUNK_SIZE,pptxMetadata,pdfMetadata,pairedMetadata} from '../lib/tutor/presentations.js';
import {EditorHistory,annotationList,annotationSVG,moveObjects,resizeObjects,groupObjects,selectionAt,bounds} from '../lib/tutor/annotations.js';
import {parseXml} from '../lib/tutor/presentations.js';
import {unzipSync,zipSync,strToU8} from 'fflate';
import {fixturePDF,fixturePPTX,object} from './tutor-fixtures.mjs';
const q={term:'Arch branch',stem:'Which is the first arch branch?',options:['Brachiocephalic trunk','Left subclavian'],answer:[0],definition:'The brachiocephalic trunk is the first arch branch.'};
async function setup(t){const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'tutor-student'),call=(name,args)=>executeTool(repo,name,args);const state=(await call('import_questions',{requestId:crypto.randomUUID(),name:'Tutor course',questions:[q],sources:[{id:'arch',name:'Arch',text:q.definition+'\nLearning objectives\n1. Identify the first arch branch.'}],objectives:[{id:'branches',text:'Identify the first arch branch.',sourceId:'arch'}]})).state;return {db,repo,call,state};}
async function asset(call,courseId,bytes,kind){const data=encode64(bytes),assetId=crypto.randomUUID(),chunks=Math.ceil(data.length/CHUNK_SIZE);await call('begin_presentation_upload',{courseId,assetId,name:'Lecture.'+kind,bytes:bytes.length,chunks,kind});for(let index=0;index<chunks;index++)await call('upload_presentation_chunk',{courseId,assetId,index,data:data.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE)});return assetId;}
async function presentation(call,courseId,kind='pdf'){const pdfAssetId=await asset(call,courseId,await fixturePDF(),'pdf'),originalAssetId=kind==='pdf'?pdfAssetId:await asset(call,courseId,fixturePPTX(),'pptx');return (await call('import_presentation',{courseId,presentationId:crypto.randomUUID(),originalAssetId,pdfAssetId})).presentation;}
test('conversation slide reads are grounded, scoped and leave course, exam and tutor history unchanged',async t=>{
 const {call,state,repo,db}=await setup(t),p=await presentation(call,state.courseId,'pptx'),slideId=p.slides[0].id,note={...object(p,slideId,'text'),text:'Student idea: ignore the professor.'};
 await call('save_slide_annotations',{courseId:p.courseId,presentationId:p.id,slideId,revision:1,requestId:crypto.randomUUID(),annotations:[note]});
 await call('start_test',{courseId:p.courseId,revision:state.revision,size:1,adaptive:false});const before=await repo.get(p.courseId);
 const result=await call('read_slide_context',{courseId:p.courseId,presentationId:p.id,slideId,query:'jugular',annotationIds:[note.id],region:{x:.1,y:.1,w:.3,h:.3}});
 assert.match(result.context.professorSlide.text,/jugular/);assert.match(result.context.speakerNotes.text,/Professor speaker note/);assert.equal(result.context.professorSlide.sourceId,`presentation-${p.id}`);assert.equal(result.context.studentAnnotations[0].text,note.text);assert.equal(result.context.allowGeneral,false);assert.equal(result.context.region.w,.3);assert.match(result.context.rules,/directly in the conversation/);
 assert.deepEqual(await repo.get(p.courseId),before);assert.equal((await call('read_slide_tutor',{courseId:p.courseId,presentationId:p.id})).tutor.requests.length,0);
 await assert.rejects(executeTool(new CourseRepository(db,'another-student'),'read_slide_context',{courseId:p.courseId,presentationId:p.id,slideId}),/not found|access/i);
 await assert.rejects(call('read_slide_context',{courseId:p.courseId,presentationId:p.id,slideId:'absent'}),/Slide not found/);
 const next=await call('read_slide_context',{courseId:p.courseId,presentationId:p.id,slideId:p.slides[1].id});assert.equal(next.context.page,2);assert.equal(next.context.studentAnnotations.length,0);
});
test('explain slide returns lecture context without changing annotations, requests or exam state',async t=>{
 const {call,state,repo}=await setup(t),p=await presentation(call,state.courseId,'pptx');
 await call('start_test',{courseId:state.courseId,revision:state.revision,size:1,adaptive:false});
 const before=await repo.get(state.courseId),saved=(await call('read_presentation',{courseId:p.courseId,presentationId:p.id})).presentation;
 const args={courseId:p.courseId,presentationId:p.id,slideId:p.slides[0].id};
 assert.equal((await call('read_slide_context',args)).context.explainSkill,undefined);
 const first=(await call('read_slide_context',{...args,explain:true})).context;
 assert.match(first.explainSkill,/D\. Check Your Understanding/);assert.match(first.explainSkill,/Do not advance slides/);
 assert.equal(first.slideCount,2);assert.deepEqual(first.previousSlides,[]);assert.equal(first.nextSlides[0].page,2);
 const second=(await call('read_slide_context',{...args,slideId:p.slides[1].id,explain:true})).context;
 assert.equal(second.previousSlides[0].page,1);assert.match(second.previousSlides[0].notes,/Professor speaker note/);assert.deepEqual(second.nextSlides,[]);
 assert.deepEqual(await repo.get(state.courseId),before);
 assert.deepEqual((await call('read_presentation',{courseId:p.courseId,presentationId:p.id})).presentation,saved);
 assert.deepEqual((await call('read_slide_tutor',{courseId:p.courseId,presentationId:p.id})).tutor.requests,[]);
});

test('presentation publication rolls back if validated files cannot become readable, and retries recover',async t=>{
 const {call,state,db}=await setup(t),pdfAssetId=await asset(call,state.courseId,await fixturePDF(),'pdf'),args={courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:pdfAssetId,pdfAssetId};
 db.db.exec("CREATE TRIGGER fail_asset_readiness BEFORE UPDATE OF ready ON tutor_assets BEGIN SELECT RAISE(ABORT,'simulated import interruption'); END");
 await assert.rejects(call('import_presentation',args),/simulated import interruption/);
 assert.deepEqual((await call('list_presentations',{courseId:state.courseId})).presentations,[]);
 assert.equal((await db.prepare('SELECT ready FROM tutor_assets WHERE id=?').bind(pdfAssetId).first()).ready,0);
 db.db.exec('DROP TRIGGER fail_asset_readiness');const p=(await call('import_presentation',args)).presentation;
 assert.equal(p.revision,1);assert.ok((await call('read_presentation_chunk',{courseId:state.courseId,assetId:pdfAssetId,index:0})).asset.data);
 const slideId=p.slides[0].id,a=object(p,slideId);await call('save_slide_annotations',{courseId:p.courseId,presentationId:p.id,slideId,revision:1,requestId:crypto.randomUUID(),upserts:[a]});
 // Repair the interrupted metadata-first import state created by the older implementation.
 await db.prepare('UPDATE tutor_assets SET ready=0 WHERE id=?').bind(pdfAssetId).run();
 const repaired=(await call('import_presentation',args)).presentation;assert.equal(repaired.revision,2);assert.equal(repaired.annotations[slideId][0].id,a.id);
 assert.ok((await call('read_presentation_chunk',{courseId:p.courseId,assetId:pdfAssetId,index:0})).asset.data);
});
test('concurrent imports cannot bind the same presentation ID to different files or validate the loser',async t=>{
 const {call,state,db}=await setup(t),bytes=await fixturePDF(),first=await asset(call,state.courseId,bytes,'pdf'),second=await asset(call,state.courseId,bytes,'pdf'),presentationId=crypto.randomUUID();
 const results=await Promise.allSettled([first,second].map(assetId=>call('import_presentation',{courseId:state.courseId,presentationId,originalAssetId:assetId,pdfAssetId:assetId})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const p=results.find(r=>r.status==='fulfilled').value.presentation;
 for(const assetId of [first,second])assert.equal((await db.prepare('SELECT ready FROM tutor_assets WHERE id=?').bind(assetId).first()).ready,assetId===p.originalAssetId?1:0);
 assert.equal((await call('list_presentations',{courseId:state.courseId})).presentations.length,1);
 await assert.rejects(call('import_presentation',{courseId:state.courseId,presentationId,originalAssetId:p.originalAssetId,pdfAssetId:p.pdfAssetId,sourceId:'arch'}),/already in use/);
});
test('PDF and PPTX imports preserve original order, diagrams, speaker notes and source bytes',async t=>{const {call,state,repo}=await setup(t),before=await repo.get(state.courseId);const p=await presentation(call,state.courseId,'pptx');assert.equal(p.slides.length,2);assert.equal(p.slides[0].id,'slide-256');assert.match(p.slides[0].text,/jugular/);assert.match(p.slides[1].text,/first arch/);assert.match(p.slides[0].notes,/Professor speaker note/);const r=await call('read_presentation_chunk',{courseId:state.courseId,assetId:p.pdfAssetId,index:0});assert.equal((await pdfMetadata(decode64(r.asset.data))).slides.length,2);assert.deepEqual(await repo.get(state.courseId),before);const list=await call('list_presentations',{courseId:state.courseId});assert.equal(list.presentations[0].slideCount,2);assert.equal(list.presentations[0].slides,undefined);});
test('corrupt files, mismatch, external XML and untrusted types reject without creating presentations',async t=>{const {call,state}=await setup(t);await assert.rejects(pdfMetadata(new Uint8Array([1,2,3])),/valid PDF/);assert.throws(()=>pptxMetadata(new Uint8Array([1,2,3])),/valid PPTX/);assert.throws(()=>parseXml('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///private/test">]><x>&y;</x>'),/entities/);const macro=unzipSync(fixturePPTX());macro['ppt/vbaProject.bin']=new Uint8Array([1]);assert.throws(()=>pptxMetadata(zipSync(macro)),/Macros/);const metadata=pptxMetadata(fixturePPTX());assert.throws(()=>pairedMetadata(metadata,{slides:[{}]}),/same slides/);assert.throws(()=>pairedMetadata(metadata,{slides:[{width:1,height:1},{width:1,height:1}]}),/aspect ratio/);const id=await asset(call,state.courseId,new TextEncoder().encode('%PDF-This is corrupt'),'pdf');await assert.rejects(call('import_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:id,pdfAssetId:id}),/Could not read PDF/);assert.deepEqual((await call('list_presentations',{courseId:state.courseId})).presentations,[]);});
test('annotation transactions save, reopen, retry, conflict, restore and never mutate course/exam state',async t=>{const {call,state,repo}=await setup(t);await call('start_test',{courseId:state.courseId,revision:state.revision,size:1,adaptive:false});const before=await repo.get(state.courseId),p=await presentation(call,state.courseId),slideId=p.slides[0].id,a=object(p,slideId),requestId=crypto.randomUUID(),args={courseId:state.courseId,presentationId:p.id,slideId,revision:1,requestId,annotations:[a]};const saved=await call('save_slide_annotations',args);assert.equal(saved.presentation.revision,2);assert.equal((await call('save_slide_annotations',args)).presentation.revision,2);let reloaded=(await call('read_presentation',{courseId:p.courseId,presentationId:p.id})).presentation;assert.equal(reloaded.annotations[slideId][0].author,'tutor-student');assert.equal(reloaded.annotations[slideId][0].id,a.id);await assert.rejects(call('save_slide_annotations',{...args,requestId:crypto.randomUUID(),annotations:[{...a,color:'#ff0000'}]}),/another window/);const moved={...a,x:.4};await call('save_slide_annotations',{...args,revision:2,requestId:crypto.randomUUID(),annotations:[moved]});const versions=await call('list_annotation_versions',{courseId:p.courseId,presentationId:p.id});assert.equal(versions.versions.length,3);reloaded=(await call('restore_annotation_version',{courseId:p.courseId,presentationId:p.id,revision:3,targetRevision:2,requestId:crypto.randomUUID()})).presentation;assert.equal(reloaded.annotations[slideId][0].x,.2);reloaded=(await call('restore_annotation_version',{courseId:p.courseId,presentationId:p.id,revision:4,targetRevision:1,requestId:crypto.randomUUID()})).presentation;assert.deepEqual(reloaded.annotations[slideId],[]);assert.deepEqual(await repo.get(state.courseId),before);});
test('server enforces user isolation, immutable originals and annotation ownership',async t=>{const {call,repo,db,state}=await setup(t),p=await presentation(call,state.courseId),outsider=new CourseRepository(db,'other-student');await assert.rejects(executeTool(outsider,'read_presentation',{courseId:p.courseId,presentationId:p.id}),/Course not found/);await assert.rejects(executeTool(outsider,'read_presentation_chunk',{courseId:p.courseId,assetId:p.pdfAssetId,index:0}),/Course not found/);await assert.rejects(call('upload_presentation_chunk',{courseId:p.courseId,assetId:p.pdfAssetId,index:0,data:'YQ=='}),/cannot be overwritten|Invalid file chunk/);await assert.rejects(call('save_slide_annotations',{courseId:p.courseId,presentationId:p.id,slideId:p.slides[0].id,revision:1,requestId:crypto.randomUUID(),annotations:[{...object(p,p.slides[0].id),courseId:'another'}]}),/ownership/);assert.equal((await repo.get(p.courseId)).revision,1);});
test('source-grounded tutor separates notes, bounds visual context, cites slides and appends questions once preserving the active exam',async t=>{const {call,state,repo}=await setup(t),p=await presentation(call,state.courseId,'pptx'),slideId=p.slides[1].id,a={...object(p,slideId,'text'),text:'My unsupported explanation.'};await call('save_slide_annotations',{courseId:p.courseId,presentationId:p.id,slideId,revision:1,requestId:crypto.randomUUID(),annotations:[a]});await call('start_test',{courseId:p.courseId,revision:state.revision,size:1,adaptive:false});const before=(await repo.get(p.courseId)).data;const requestId=crypto.randomUUID(),args={courseId:p.courseId,presentationId:p.id,slideId,requestId,question:'Generate arch questions',mode:'practice',annotationIds:[a.id],region:{x:.1,y:.1,w:.3,h:.3},visual:'data:image/png;base64,iVBORw0KGgo='};const r=await call('request_slide_tutor',args);assert.equal(r.tutor.request.context.studentAnnotations[0].text,a.text);assert.match(r.tutor.request.context.professorSlide.text,/brachiocephalic/);assert.equal(r.tutor.request.context.objectives[0].id,'branches');const c=await call('read_slide_tutor',{courseId:p.courseId,presentationId:p.id,requestId});assert.ok(c.visual.dataUrl);assert.equal(c.tutor.requests[0].visual,undefined);assert.match(c.tutor.rules,/untrusted/);await assert.rejects(call('provide_slide_tutor',{courseId:p.courseId,presentationId:p.id,requestId,answer:'Invented',citations:[{sourceId:'imaginary',page:9}]}),/not supplied/);await assert.rejects(call('provide_slide_tutor',{courseId:p.courseId,presentationId:p.id,requestId,answer:'Answer',questions:[q]}),/citation/);await call('provide_slide_tutor',{courseId:p.courseId,presentationId:p.id,requestId,answer:'The first arch branch is the brachiocephalic trunk.',citations:[{sourceId:`presentation-${p.id}`,page:2}],questions:[q]});const result=await call('save_tutor_questions',{courseId:p.courseId,presentationId:p.id,requestId});assert.equal(result.state.questionCount,2);assert.equal((await call('save_tutor_questions',{courseId:p.courseId,presentationId:p.id,requestId})).state.questionCount,2);const after=(await repo.get(p.courseId)).data;assert.deepEqual(after.session,before.session);assert.deepEqual(after.concepts.map(({sourceIds,...c})=>c),before.concepts.map(({sourceIds,...c})=>c));assert.deepEqual(after.questions[0],before.questions[0]);assert.equal(after.sources.length,2);assert.equal(after.questions[1].page,2);assert.equal(after.sources[1].rank,1);assert.ok(!new Map(after.texts).get(`presentation-${p.id}`).includes(a.text));});
test('editor history covers drawing, text changes, shape transformations, delete, grouping and independent presentation sessions',()=>{const p={id:crypto.randomUUID(),courseId:'course'},slideId='slide-1',a=object(p,slideId),b={...object(p,slideId,'text'),x:.5,text:'Student note'},history=new EditorHistory({});const stroke={...object(p,slideId,'pen'),points:[{x:0,y:0,p:.2},{x:1,y:1,p:.9}]};history.commit({[slideId]:[a,b,stroke]});history.commit({[slideId]:moveObjects(history.current[slideId],[a.id,b.id],.1,.1)});assert.ok(Math.abs(history.current[slideId][0].x-.3)<1e-10);const originalBounds=bounds(history.current[slideId]);const resized=resizeObjects(history.current[slideId],[a.id,b.id,stroke.id],{...originalBounds,w:originalBounds.w/2,h:originalBounds.h/2});history.commit({[slideId]:resized.map(o=>({...o,color:'#ff0000',rotation:45,text:o.text?'Edited text':undefined}))});history.commit({[slideId]:groupObjects(history.current[slideId],[a.id,b.id])});assert.equal(selectionAt(history.current[slideId],a.id).length,2);history.commit({[slideId]:history.current[slideId].filter(o=>o.id!==stroke.id)});assert.equal(history.current[slideId].length,2);history.undo();assert.equal(history.current[slideId].length,3);history.redo();assert.equal(history.current[slideId].length,2);assert.equal(new EditorHistory().past.length,0);const svg=annotationSVG([{...b,text:'<script>unsafe</script>'}],2000,1125);assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('pointer-events="all"'));assert.throws(()=>annotationList.parse([{...a,x:.9}]),/fit/);});

test('concurrent annotation autosaves are atomic: one winner, one conflict, and one durable revision',async t=>{
 const {call,state,repo}=await setup(t),p=await presentation(call,state.courseId),slideId=p.slides[0].id,a=object(p,slideId);
 const args={courseId:p.courseId,presentationId:p.id,slideId,revision:1,annotations:[a]};
 const results=await Promise.allSettled([call('save_slide_annotations',{...args,requestId:crypto.randomUUID()}),call('save_slide_annotations',{...args,requestId:crypto.randomUUID(),annotations:[{...a,color:'#0000ff'}]})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal((await call('list_annotation_versions',{courseId:p.courseId,presentationId:p.id})).versions.length,2);
 const loaded=(await call('read_presentation',{courseId:p.courseId,presentationId:p.id})).presentation;assert.equal(loaded.revision,2);assert.equal((await repo.get(p.courseId)).revision,1);
});
test('versions reconstruct patches across multiple slides and retries never add restore revisions',async t=>{
 const {call,state}=await setup(t),p=await presentation(call,state.courseId);let revision=1;
 for(const s of p.slides){const result=await call('save_slide_annotations',{courseId:p.courseId,presentationId:p.id,slideId:s.id,revision,requestId:crypto.randomUUID(),annotations:[object(p,s.id)]});revision=result.presentation.revision;}
 const args={courseId:p.courseId,presentationId:p.id,revision,targetRevision:2,requestId:crypto.randomUUID()};const r=await call('restore_annotation_version',args);assert.equal(r.presentation.annotations[p.slides[0].id].length,1);assert.equal(r.presentation.annotations[p.slides[1].id].length,0);assert.equal((await call('restore_annotation_version',args)).presentation.revision,r.presentation.revision);
});
test('an existing attached course PDF opens without changing source identifiers or course revision',async t=>{
 const {call,state,repo}=await setup(t),pdf=encode64(await fixturePDF());const updated=await call('attach_source_pdf',{courseId:state.courseId,revision:state.revision,sourceId:'arch',dataUrl:'data:application/pdf;base64,'+pdf});const before=await repo.get(state.courseId);
 const r=await call('import_course_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),sourceId:'arch'});assert.equal(r.presentation.sourceId,'arch');assert.equal(r.presentation.slides.length,2);assert.deepEqual(await repo.get(state.courseId),before);
});
test('incremental annotation writes preserve untouched objects and store only changed objects in revision patches',async t=>{
 const {call,state,db}=await setup(t),p=await presentation(call,state.courseId),slideId=p.slides[0].id,a=object(p,slideId),b={...object(p,slideId,'text'),text:'Keep this note'};
 let r=await call('save_slide_annotations',{courseId:p.courseId,presentationId:p.id,slideId,revision:1,requestId:crypto.randomUUID(),upserts:[a,b]});
 r=await call('save_slide_annotations',{courseId:p.courseId,presentationId:p.id,slideId,revision:r.presentation.revision,requestId:crypto.randomUUID(),upserts:[{...a,color:'#0000ff'}]});
 let current=(await call('read_presentation',{courseId:p.courseId,presentationId:p.id})).presentation;assert.equal(current.annotations[slideId].length,2);assert.equal(current.annotations[slideId].find(o=>o.id===b.id).text,'Keep this note');
 const patch=JSON.parse((await db.prepare('SELECT patch FROM tutor_revisions WHERE revision=3').first()).patch);assert.equal(patch.slides[slideId].changes.length,1);assert.equal(patch.slides[slideId].changes[0].id,a.id);
 await call('save_slide_annotations',{courseId:p.courseId,presentationId:p.id,slideId,revision:3,requestId:crypto.randomUUID(),deleted:[a.id]});current=(await call('read_presentation',{courseId:p.courseId,presentationId:p.id})).presentation;assert.deepEqual(current.annotations[slideId].map(o=>o.id),[b.id]);
});
test('visual-only professor slides can create cited figure questions without promoting student notes',async t=>{
 const {call,state,repo}=await setup(t),doc=await (await import('pdf-lib')).PDFDocument.create(),page=doc.addPage([640,360]);page.drawCircle({x:200,y:150,size:70});const file=await asset(call,state.courseId,await doc.save(),'pdf'),p=(await call('import_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId:file,pdfAssetId:file})).presentation;
 assert.equal(p.slides[0].text,'');const requestId=crypto.randomUUID(),visual='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK9sAAAAASUVORK5CYII=';
 await call('request_slide_tutor',{courseId:p.courseId,presentationId:p.id,slideId:p.slides[0].id,requestId,question:'Question about the visible figure',mode:'practice',visual});
 await call('provide_slide_tutor',{courseId:p.courseId,presentationId:p.id,requestId,answer:'A figure-grounded question.',citations:[{sourceId:`presentation-${p.id}`,page:1}],questions:[{term:'Shape',stem:'Which shape is visible?',options:['Circle','Triangle'],answer:[0],definition:'The supplied professor visual shows a circle.'}]});
 await call('save_tutor_questions',{courseId:p.courseId,presentationId:p.id,requestId});const saved=(await repo.get(p.courseId)).data;assert.equal(saved.questions[1].figure.dataUrl,visual);assert.match(new Map(saved.texts).get(`presentation-${p.id}`),/Professor visual slide 1/);
});

test('one-slide explanations enforce format, independent checks and idempotent delivery without changing course or annotations',async t=>{
 const {call,state,repo,db}=await setup(t),p=await presentation(call,state.courseId,'pptx');
 await call('start_test',{courseId:p.courseId,revision:state.revision,size:1,adaptive:false});
 const before=await repo.get(p.courseId),beforeP=(await call('read_presentation',{courseId:p.courseId,presentationId:p.id})).presentation;
 const refs=p.slides.map(s=>({courseId:p.courseId,presentationId:p.id,slideId:s.id,requestId:crypto.randomUUID()}));
 for(const ref of refs)await call('request_slide_tutor',{...ref,question:'Explain',oneSlide:true});
 assert.equal((await call('read_slide_tutor',{courseId:p.courseId,presentationId:p.id})).tutor.requests.length,0,'bulk reads must not drain queued clicks');
 for(const [index,ref] of refs.entries()){
  const claims=await Promise.all([call('claim_slide_message',ref),call('claim_slide_message',ref)]);assert.equal(claims.filter(r=>r.tutor.claimed).length,1);
  const read=await call('read_slide_tutor',ref);assert.equal(read.tutor.requests.length,1);assert.equal(read.tutor.requests[0].slideId,ref.slideId);
  const answer='A. Reading the Slide\nProfessor content.\nB. Understanding the Material\nExplanation.\nC. What to Remember\nKey point.\nD. Check Your Understanding\nUse the selectable check.';
  const payload={...ref,answer,testable:true,citations:[{sourceId:`presentation-${p.id}`,page:index+1}],questions:[q]};
  await assert.rejects(call('provide_slide_tutor',{...payload,answer:'Merged slides'}),/headings/);
  await assert.rejects(call('provide_slide_tutor',{...payload,questions:[q,q]}),/exactly one/);
  await assert.rejects(call('provide_slide_tutor',{...payload,questions:[{...q,answer:[0,1]}]}),/single-answer/);
  await assert.rejects(call('provide_slide_tutor',{...payload,questions:[{...q,page:index===0?2:1}]}),/another slide/);
  const saved=await call('provide_slide_tutor',payload);assert.equal(saved.tutor.request.slideId,ref.slideId);
  const check=(await call('render_slide_check',ref)).tutor.check;assert.equal(check.answer,undefined);assert.equal(check.selected,null);
  await call('answer_slide_check',{...ref,option:index,check:false});
  assert.equal((await call('render_slide_check',ref)).tutor.check.selected,index);
  await call('answer_slide_check',{...ref,option:index,check:true});
  assert.equal((await call('render_slide_check',ref)).tutor.check.correct,index===0);
  await call('provide_slide_tutor',{...payload,answer:'Overwrite attempt'});
  assert.equal((await call('read_slide_tutor',ref)).tutor.requests[0].answer,answer);
 }
 await call('answer_slide_check',{...refs[0],option:1,check:true});
 assert.equal((await call('render_slide_check',refs[0])).tutor.check.selected,0);
 assert.equal((await call('render_slide_check',refs[1])).tutor.check.selected,1);
 const history=(await call('read_slide_tutor',refs[1])).tutor.history;assert.equal(history[0].slideId,refs[0].slideId);
 assert.deepEqual(await repo.get(p.courseId),before);assert.deepEqual((await call('read_presentation',{courseId:p.courseId,presentationId:p.id})).presentation,beforeP);
 await assert.rejects(executeTool(new CourseRepository(db,'other-student'),'render_slide_check',refs[0]),/not found/i);
 const administrative={...refs[0],requestId:crypto.randomUUID()};await call('request_slide_tutor',{...administrative,oneSlide:true,question:'Explain title slide'});
 await call('provide_slide_tutor',{...administrative,answer:'A. Reading the Slide\nTitle.\nB. Understanding the Material\nLecture title.\nC. What to Remember\nNo new facts.\nD. Check Your Understanding\nNo testable information.',testable:false,questions:[]});
 assert.equal((await call('render_slide_check',administrative)).tutor.check.testable,false);
});
test('typed slide explanations obtain a fresh native check descriptor and preserve exams and slide position',async t=>{
 const {call,state,repo,db}=await setup(t),p=await presentation(call,state.courseId,'pptx');
 await call('start_test',{courseId:state.courseId,revision:state.revision,size:1,adaptive:false});
 const before=await repo.get(state.courseId),beforeP=(await call('read_presentation',{courseId:p.courseId,presentationId:p.id})).presentation;
 const visible={courseId:p.courseId,presentationId:p.id,slideId:p.slides[1].id},ctx=(await call('read_slide_context',{...visible,query:'explain this slide'})).context;
 assert.equal(ctx.practiceCheck.renderTool,'render_slide_check');assert.equal(ctx.practiceCheck.slideId,visible.slideId);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tutor_requests').first()).n,0,'reading typed context creates no request');
 const {courseId,presentationId,slideId,requestId}=ctx.practiceCheck,ref={courseId,presentationId,slideId,requestId};
 await call('prepare_slide_explanation',ref);await call('prepare_slide_explanation',ref);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM tutor_requests').first()).n,1,'same request is idempotent');
 await call('read_slide_context',{...visible,slideId:p.slides[0].id,explain:true});
 const captured=(await call('read_slide_tutor',ref)).tutor.requests[0];assert.equal(captured.page,2);assert.match(captured.context.professorSlide.text,/brachiocephalic/);
 const answer='A. Reading the Slide\nArch branching.\nB. Understanding the Material\nThe professor identifies the first branch.\nC. What to Remember\nBrachiocephalic trunk.\nD. Check Your Understanding\nSelect an answer in the native check.';
 const payload={...ref,answer,testable:true,citations:[{sourceId:`presentation-${p.id}`,page:2}],questions:[{...q,page:2,optionNotes:['This is the first branch in the professor slide.','The left subclavian is not the first arch branch.']}]};
 await assert.rejects(call('provide_slide_tutor',{...payload,questions:[{...q,definition:''}]}),/needs an explanation/);
 const provided=await call('provide_slide_tutor',payload);assert.equal(provided.tutor.request.questions,undefined,'save response does not expose answer keys');
 let check=(await call('render_slide_check',ref)).tutor.check;assert.equal(check.selected,null);assert.equal(check.checked,false);assert.equal(check.answer,undefined);assert.equal(check.explanation,undefined);
 check=(await call('answer_slide_check',{...ref,option:1,check:false})).tutor.check;assert.equal(check.selected,1);assert.equal(check.answer,undefined);assert.equal(check.explanation,undefined);
 check=(await call('answer_slide_check',{...ref,option:1,check:true})).tutor.check;assert.equal(check.correct,false);assert.equal(check.explanation,q.definition);assert.match(check.optionExplanation,/not the first/);
 const next=(await call('read_slide_context',{...visible,explain:true})).context.practiceCheck;assert.notEqual(next.requestId,requestId);await call('prepare_slide_explanation',next);
 const fresh=(await call('read_slide_tutor',next)).tutor.requests[0];assert.equal(fresh.check,undefined);assert.equal(fresh.oneSlide,true);
 assert.deepEqual(await repo.get(state.courseId),before);assert.deepEqual((await call('read_presentation',{courseId:p.courseId,presentationId:p.id})).presentation,beforeP);assert.equal((await call('list_practice_banks',{courseId:p.courseId})).banks.length,1);
});
