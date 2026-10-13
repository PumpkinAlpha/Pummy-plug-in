import {uploadPresentationFile} from './tutor-files.js';
import {extractQuestionFile,minimizeContacts,MAX_TEXT} from './question-files.js';
import {pptxMetadata} from '../lib/tutor/presentations.js';
import {legacyPptSlides} from '../lib/tutor/legacy-ppt.js';
export const SOURCE_FILE_ACCEPT='.ppt,.pptx,.pdf,.docx,.txt,.md,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';
export async function extractSourceFile(file,options={}){
 const extension=file.name.split('.').at(-1).toLowerCase();let extracted;
 if(['ppt','pptx'].includes(extension)){
  const bytes=new Uint8Array(await file.arrayBuffer()),slides=extension==='ppt'?legacyPptSlides(bytes):pptxMetadata(bytes,{truncate:false}).slides;
  const pages=slides.map(s=>({page:s.page,unit:'slide',text:minimizeContacts(s.text).trim()||'Visual-only slide '+s.page+'. No searchable text was extracted; inspect the original slide for figures and labels.'}));
  if(!pages.length)throw new Error('This presentation has no readable slide text. Export it to PDF and use OCR before importing a reference.');
  const text=pages.map(s=>`--- Slide ${s.page} ---\n${s.text}`).join('\n\n');
  if(text.length>MAX_TEXT)throw new Error('This presentation contains more than 60,000 characters. Split it into smaller presentations; nothing was imported.');
  const warnings=[];const empty=slides.filter(s=>!s.text.trim()).map(s=>s.page);if(empty.length)warnings.push(`No text on slides ${empty.join(', ')}. Image-only content is not included.`);
  if(slides.some(s=>minimizeContacts(s.text)!==s.text))warnings.push('Email addresses and labeled contact lines were omitted. Review other personal details before saving.');
  extracted={name:minimizeContacts(file.name).slice(0,300),text,pages,pageCount:slides.length,mimeType:extension==='ppt'?'application/vnd.ms-powerpoint':'application/vnd.openxmlformats-officedocument.presentationml.presentation',warnings};
 }else{
  if(!['pdf','docx','txt','md'].includes(extension))throw new Error('Choose PowerPoint (.ppt or .pptx), PDF, Word (.docx), TXT, or Markdown.');
  extracted=await extractQuestionFile(file,options);extracted.warnings=extracted.warnings.filter(w=>!w.startsWith('Text only:'));
 }
 return {...extracted,originalFile:file,warnings:[...extracted.warnings,'The original file is kept unchanged alongside this extracted text copy. The text copy is used for questions and tutoring; the original retains its images, layout and embedded media.',...(['ppt','pptx'].includes(extension)?['PowerPoint speaker notes are not mixed into the slide reference.']:[])]};
}
export async function saveManualSource(call,courseId,file,folder,attempt,onUploadProgress=()=>{}){
 const text=minimizeContacts(file.text).trim();if(!text||text.length>MAX_TEXT)throw new Error('Review source text containing 1–60,000 characters.');
 if(!file.originalFile)throw new Error('Choose the original source file before importing.');
 if(!attempt.originalAssetId)attempt.originalAssetId=await uploadPresentationFile(call,courseId,file.originalFile,{source:true,onProgress:onUploadProgress});
 const state=(await call('read_course_state',{courseId})).state;
 const grouping=folder?.kind==='week'?{weekId:folder.label}:folder?.kind==='lecture'?{lecture:folder.label}:{};
 const pages=file.pages?.filter(p=>p.text.trim()).map(p=>({...p,text:minimizeContacts(p.text)}));
 const source={id:attempt.sourceId,originalAssetId:attempt.originalAssetId,name:file.name.trim(),text,sourceType:file.sourceType,rank:file.rank,...grouping,...(pages?.length?{pages}:{}),metadata:{originalFileName:file.originalFileName||file.name,mimeType:file.mimeType,sourceOrigin:'student_upload',...file.syncMetadata,...(file.pageCount?{pageCount:file.pageCount}:{})}};
 return call('sync_course_sources',{courseId,revision:state.revision,requestId:attempt.requestId,sources:[source]});
}

// Keep each file's receipt across retries; a failed file must not block the others.
export async function saveManualSources(call,courseId,entries,folder,onProgress=()=>{}){
 for(const entry of entries){
  if(!entry.file||entry.status==='saved')continue;
  entry.status='saving';entry.error='';onProgress();
  try{entry.result=await saveManualSource(call,courseId,entry.file,folder,entry.attempt,progress=>{entry.progress=Math.round(progress.completed/progress.total*100);onProgress();});entry.status='saved';}
  catch(e){entry.status='failed';entry.error=e.message||'Could not import this file. Retry.';}
  onProgress();
 }
 return entries;
}
