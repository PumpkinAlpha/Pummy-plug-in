import React,{useRef,useState} from 'react';
import {fileSourceId,minimizeContacts,stageQuestionFile,questionFileMessage,MAX_TEXT} from './question-files.js';
import {sourcesInFolder} from './folders.js';
export function QuestionFileForm({file,state,folder,busy,connected,call,message,run,onWait,job,onClose}){
 const folderSources=folder?sourcesInFolder(state,folder):state.sources;
 const [text,setText]=useState(file.text),[sourceId,setSourceId]=useState(folderSources.find(s=>s.metadata?.originalFileName?.toLowerCase()===file.name.toLowerCase()||s.name.toLowerCase()===file.name.toLowerCase())?.id||''),[sourceType,setSourceType]=useState('professor_quiz'),[rank,setRank]=useState(3),[sent,setSent]=useState(false),[importError,setImportError]=useState('');
 const staged=useRef(null);const completed=!!job?.id&&job?.receipt?.requestId===job.id;
 const send=()=>run(async()=>{
  setImportError('');try{
  if(!connected)throw new Error('Open Pummy in ChatGPT to convert this file into questions.');
  if(!staged.current)staged.current={courseId:state.courseId,file:{...file,text:minimizeContacts(text),sourceType,rank},sourceId:sourceId||await fileSourceId(file.name,folder),syncId:crypto.randomUUID(),id:crypto.randomUUID()};
  const request=staged.current;const result=await stageQuestionFile(call,request.courseId,request.file,request.sourceId,request.syncId,folder);
  await message(result.state,questionFileMessage(request.courseId,request.sourceId,request.id,folder));setSent(true);onWait({id:request.id,courseId:request.courseId,sentAt:Date.now()});
  }catch(e){setImportError(e.message);throw e;}
 });
 return <div className="course-form"><p><b>{file.name}</b> → {state.name}</p>{file.warnings.map((w,i)=><p className="fine" key={i}>{w}</p>)}<p className="fine">Professor quiz priority is 3: slides (1) and objectives/group activities (2) win reference conflicts. Original professor answer keys are preserved for grading, not automatically rewritten.</p>
 <label>Reference to save<select disabled={!!staged.current||busy} value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">Save file reference in {folder?.displayName||state.name}</option>{folderSources.map(s=><option value={s.id} key={s.id}>Update {s.name}</option>)}</select></label>{sourceId&&<p className="fine">This replaces the selected reference text, not existing questions or progress.</p>}
 <label>Source type<select disabled={!!staged.current||busy} value={sourceType} onChange={e=>{setSourceType(e.target.value);setRank({professor_slides:1,objectives:2,group_activity:2,professor_quiz:3,course_supplement:4,approved_external:5,other:6}[e.target.value]);}}>{['professor_quiz','professor_slides','objectives','group_activity','course_supplement','approved_external','other'].map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</select></label>
 <label>Priority (1 is highest)<select disabled={!!staged.current||busy} value={rank} onChange={e=>setRank(Number(e.target.value))}>{[1,2,3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></label>
 <label>Review extracted text ({text.length.toLocaleString()} / 60,000)<textarea rows={12} maxLength={MAX_TEXT} disabled={!!staged.current||busy} value={text} onChange={e=>setText(e.target.value)}/></label><p className="fine">Only the reviewed text is saved to Pummy and read by ChatGPT. The original file is not uploaded. Remove unrelated contact details. Conversion needs this app opened in ChatGPT; it does not run in the standalone website.</p>
 {importError&&<p role="alert">{importError}</p>}
 {completed?<><p role="status">Added {job.receipt.addedCount} questions. Your current exam and progress were preserved.</p><button className="primary" onClick={onClose}>Done</button></>:<><button className="primary" disabled={busy||!connected||!text.trim()||(sent&&!job?.timedOut)} onClick={send}>{busy?'Saving…':staged.current?'Retry the same request':'Add questions with ChatGPT'}</button>{sent&&<p role="status">{job?.timedOut?'Still waiting. Check the ChatGPT conversation for a permission prompt, missing key, or error. Retry uses the same request to avoid duplicate questions.':'Source saved; waiting for ChatGPT to save the questions. This is not yet a completed import.'}</p>}</>}
 </div>;
}
