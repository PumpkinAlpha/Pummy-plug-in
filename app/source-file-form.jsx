import React,{useEffect,useRef,useState} from 'react';
import {SOURCE_FILE_ACCEPT,extractSourceFile,saveManualSources} from './source-files.js';
const ranks={professor_slides:1,objectives:2,group_activity:2,professor_quiz:3,course_supplement:4,approved_external:5,other:6};
export function SourceFileForm({state,folder,busy,call,run,onSaved,existingSource}){
 const [entries,setEntries]=useState([]),[selected,setSelected]=useState(null),[extracting,setExtracting]=useState(false),[error,setError]=useState(''),[locked,setLocked]=useState(false);
 const queue=useRef([]),generation=useRef(0),disabled=busy||extracting||locked;
 useEffect(()=>()=>{generation.current++;},[]);
 const refresh=()=>setEntries([...queue.current]);
 const current=entries.find(e=>e.id===selected),file=current?.file;
 const editingDisabled=busy||extracting||current?.status==='saved';
 async function choose(rawFiles){
  if(!rawFiles.length)return;
  const version=++generation.current;
  queue.current=rawFiles.map(raw=>({id:crypto.randomUUID(),raw,status:'reading',error:''}));
  setSelected(queue.current[0].id);setError('');setExtracting(true);refresh();
  for(const entry of queue.current){
   try{const parsed=await extractSourceFile(entry.raw);if(version!==generation.current)return;entry.file={...parsed,originalFileName:entry.raw.name,name:existingSource?.name||parsed.name,sourceType:existingSource?.sourceType||'professor_slides',rank:existingSource?.rank||1};entry.status='ready';}
   catch(e){if(version!==generation.current)return;entry.status='unreadable';entry.error=e.message;}
   refresh();
  }
  if(version===generation.current)setExtracting(false);
 }
 const update=patch=>{current.file={...file,...patch};if(current.attempt)current.attempt={...current.attempt,requestId:crypto.randomUUID()};current.status='ready';current.error='';refresh();};
 const remove=id=>{queue.current=queue.current.filter(e=>e.id!==id);if(selected===id)setSelected(queue.current[0]?.id||null);if(!queue.current.length)setLocked(false);refresh();};
 const save=()=>run(async()=>{
  setError('');setLocked(true);
  for(const entry of queue.current)if(entry.file&&!entry.attempt)entry.attempt={sourceId:existingSource?.id||'manual-source-'+crypto.randomUUID(),requestId:crypto.randomUUID()};
  await saveManualSources(call,state.courseId,queue.current,folder,refresh);
  const saved=queue.current.filter(e=>e.status==='saved').length;
  if(saved===queue.current.length)onSaved({count:saved});
  else setError(`${saved} of ${queue.current.length} files imported. See the result beside each file. Edit, retry, or remove failed files.`);
 });
 const pending=entries.filter(e=>e.file&&e.status!=='saved'),valid=pending.length>0&&pending.every(e=>e.file.name.trim()&&e.file.text.trim());
 return <div className="course-form source-file-form"><p>Import references into <b>{folder?.displayName||state.name}</b>. You can build questions from them after saving.</p>
 <label>Choose source file<input type="file" accept={SOURCE_FILE_ACCEPT} multiple={!existingSource} disabled={disabled} onChange={e=>{const raw=Array.from(e.target.files||[]);e.target.value='';choose(raw);}}/></label>
 <p className="fine">{existingSource?'Choose the original file.':'Select one or more files at once.'} PowerPoint (.ppt, .pptx), PDF, Word (.docx), TXT, or Markdown. Each original is kept alongside its text copy.</p>
 {extracting&&<p role="status">Reading source text…</p>}{error&&<p role="alert">{error}</p>}
 {entries.length>0&&<ul className="source-upload-queue" aria-label="Selected files">{entries.map(entry=><li key={entry.id}>
 <button type="button" className="quiet" aria-pressed={selected===entry.id} onClick={()=>setSelected(entry.id)}>{entry.raw.name}</button>
 <span role="status">{({reading:'Reading…',ready:'Ready to import',saving:entry.progress===100?'Validating original…':'Uploading… '+(entry.progress||0)+'%',saved:'Imported',failed:'Upload failed',unreadable:'Could not read'})[entry.status]}</span>
 {entry.error&&<p role="alert">{entry.error}</p>}{!busy&&!extracting&&entry.status!=='saved'&&<button type="button" className="quiet" aria-label={'Remove '+entry.raw.name} onClick={()=>remove(entry.id)}>Remove</button>}
 </li>)}</ul>}
 {file&&<><label>Source title<input value={file.name} maxLength={300} disabled={editingDisabled} onChange={e=>update({name:e.target.value})}/></label>
 <div className="settings-grid"><label>Source type<select value={file.sourceType} disabled={editingDisabled} onChange={e=>update({sourceType:e.target.value,rank:ranks[e.target.value]})}>{Object.keys(ranks).map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</select></label>
 <label>Priority (1 is highest)<select value={file.rank} disabled={editingDisabled} onChange={e=>update({rank:Number(e.target.value)})}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>
 <label>Review extracted source text ({file.text.length.toLocaleString()} / 60,000)<textarea rows={12} maxLength={60000} disabled={editingDisabled} value={file.text} onChange={e=>update({text:e.target.value,pages:undefined})}/></label>{file.warnings.map((w,i)=><p className="fine" key={i}>{w}</p>)}</>}
 {locked&&error&&<p className="fine">Retries keep the same import IDs and skip files already imported.</p>}
 {entries.length>0&&pending.length>0&&<button className="primary" disabled={busy||extracting||!valid} onClick={save}>{busy?'Importing files…':locked?'Retry failed uploads':entries.length===1?'Import source':`Import ${pending.length} sources`}</button>}
 {entries.length>0&&entries.every(e=>e.status==='saved')&&<button className="primary" disabled={busy} onClick={()=>onSaved({count:entries.length})}>Done</button>}
 </div>;
}
