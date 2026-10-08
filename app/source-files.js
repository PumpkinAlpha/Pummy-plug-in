import {extractQuestionFile,minimizeContacts,MAX_FILE_BYTES,MAX_TEXT} from './question-files.js';
import {pptxMetadata} from '../lib/tutor/presentations.js';
import {legacyPptSlides} from '../lib/tutor/legacy-ppt.js';
export const SOURCE_FILE_ACCEPT='.ppt,.pptx,.pdf,.docx,.txt,.md,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';
export async function extractSourceFile(file,options={}){
 if(file.size>MAX_FILE_BYTES)throw new Error('Choose a source file no larger than 24 MB.');
 const extension=file.name.split('.').at(-1).toLowerCase();let extracted;
 if(['ppt','pptx'].includes(extension)){
  const bytes=new Uint8Array(await file.arrayBuffer()),slides=extension==='ppt'?legacyPptSlides(bytes):pptxMetadata(bytes,{truncate:false}).slides;
  const pages=slides.filter(s=>s.text.trim()).map(s=>({page:s.page,unit:'slide',text:minimizeContacts(s.text)}));
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
 return {...extracted,warnings:[...extracted.warnings,'This saves extracted source text. Images, diagrams and slide layout are not included. For slide viewing and annotation, import the presentation in Interactive Tutor; PowerPoint viewing uses a matching PDF.',...(['ppt','pptx'].includes(extension)?['PowerPoint speaker notes are not mixed into the slide reference.']:[])]};
}
export async function saveManualSource(call,courseId,file,folder,attempt){
 const text=minimizeContacts(file.text).trim();if(!text||text.length>MAX_TEXT)throw new Error('Review source text containing 1–60,000 characters.');
 const state=(await call('read_course_state',{courseId})).state;
 const grouping=folder?.kind==='week'?{weekId:folder.label}:folder?.kind==='lecture'?{lecture:folder.label}:{};
 const pages=file.pages?.filter(p=>p.text.trim()).map(p=>({...p,text:minimizeContacts(p.text)}));
 const source={id:attempt.sourceId,name:file.name.trim(),text,sourceType:file.sourceType,rank:file.rank,...grouping,...(pages?.length?{pages}:{}),metadata:{originalFileName:file.originalFileName||file.name,mimeType:file.mimeType,sourceOrigin:'student_upload',...(file.pageCount?{pageCount:file.pageCount}:{})}};
 return call('sync_course_sources',{courseId,revision:state.revision,requestId:attempt.requestId,sources:[source]});
}
