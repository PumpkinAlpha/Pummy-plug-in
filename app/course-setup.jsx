import React,{useEffect,useState} from 'react';
import {QUESTION_FILE_ACCEPT} from './question-files.js';
import {syncStatus} from './source-sync.js';
import {LocalFolderSync} from './local-folder.jsx';
import {ExplanationDepth,BankExplanationStatus} from './explanation-settings.jsx';
import {folderKey,studyFolders,sourcesInFolder,questionsInFolder} from './folders.js';
import {BUILD_MODES,MODEL_PREFERENCES,EFFORT_PREFERENCES,QUESTION_DIFFICULTIES,generationCapacity,gapSignals} from './generation-plan.js';

const SOURCE_TYPES=['professor_slides','objectives','group_activity','professor_quiz','course_supplement','approved_external','other'];
const DEFAULT_RANKS={professor_slides:1,objectives:2,group_activity:2,professor_quiz:3,course_supplement:4,approved_external:5,other:6};
const typeLabel=type=>(type||'other').replaceAll('_',' ');

export function CourseForm({state,busy,folderScope,onFolderChange,onSave,onCreateFolder,onAddSource,onUpdateSource,onDeleteSource,onRestoreSource,onImport,onImportSource,onDownloadSource,onBuild,onOpenSource,navigationGuard,connected,onExplain,onContinueExplanations}){
 const folders=studyFolders(state);
 const [selectedKey,setSelectedKey]=useState(()=>folderScope?folderKey(folderScope):folders[0]?.key);
 const [sourceName,setSourceName]=useState(''),[text,setText]=useState(''),[sourceType,setSourceType]=useState('professor_slides'),[rank,setRank]=useState(1);
 const [editingId,setEditingId]=useState(null),[editType,setEditType]=useState('other'),[editRank,setEditRank]=useState(6),[editFolder,setEditFolder]=useState('');
 const [creatingFolder,setCreatingFolder]=useState(false),[folderName,setFolderName]=useState('');
 useEffect(()=>{if(folderScope)setSelectedKey(folderKey(folderScope));},[folderScope?.kind,folderScope?.label]);
 const selected=folders.find(f=>f.key===selectedKey)||folders[0];
 useEffect(()=>{onFolderChange?.(selected||null);},[selected?.key,selected?.displayName]);
 const visibleSources=sourcesInFolder(state,selected);
 const missing=questionsInFolder(state,selected).filter(q=>!q.hasExplanation);
 const folderOptions=folders.some(f=>f.kind==='all')?folders:[...folders,...(!folders.some(f=>f.kind==='unassigned')?[{kind:'unassigned',label:'Other resources',key:'unassigned:Other resources',displayName:'Other resources'}]:[])];
 const beginEdit=source=>{
  setEditingId(source.id);setEditType(source.sourceType||'other');setEditRank(source.rank||1);
  setEditFolder(folderOptions.find(f=>sourcesInFolder(state,f).some(s=>s.id===source.id))?.key||selected.key);
 };
 const folderFields=folder=>folder?.kind==='week'?{weekId:folder.label}:folder?.kind==='lecture'?{lecture:folder.label}:{};
 const newFolderKind=folders.some(folder=>folder.kind==='week')?'week':'lecture';
 return <section className="course-setup"><h2>Course & sources</h2>
  <div className="source-folder-control"><label className="source-folder-picker">Subfolder<select value={selected?.key||''} onChange={e=>{setSelectedKey(e.target.value);setEditingId(null);}}>{folders.map(f=><option key={f.key} value={f.key}>{f.displayName}</option>)}</select></label><button className="secondary" type="button" disabled={busy} onClick={()=>setCreatingFolder(true)}>+ Add subfolder</button></div>
  {creatingFolder&&<form className="source-folder-create" onSubmit={e=>{e.preventDefault();const label=folderName.trim();if(!label)return;onCreateFolder({kind:newFolderKind,label},()=>{setSelectedKey(folderKey({kind:newFolderKind,label}));setFolderName('');setCreatingFolder(false);setEditingId(null);});}}><label>New subfolder name<input autoFocus required maxLength={160} value={folderName} onChange={e=>setFolderName(e.target.value)} placeholder="e.g. Week 4"/></label><button className="primary" disabled={busy||!folderName.trim()}>Create subfolder</button><button className="quiet" type="button" onClick={()=>{setCreatingFolder(false);setFolderName('');}}>Cancel</button></form>}
  <LocalFolderSync state={state} folder={selected} busy={busy} navigationGuard={navigationGuard}/>
  <section className="course-sources">
   <div className="section-heading"><h3>{selected?.displayName} references · {visibleSources.length}</h3><div className="source-import-actions"><button className="secondary" disabled={busy} onClick={()=>onImportSource(selected)}>Manual import</button><button className="secondary" disabled={busy||!visibleSources.length} onClick={()=>onBuild(visibleSources.map(s=>s.id))}>Build questions from sources</button>{missing.length>0&&<button className="secondary" disabled={busy||!!state.bankExplanationRequest?.pending} onClick={()=>onExplain(missing)}>Generate missing explanations ({missing.length})</button>}</div></div>
   <BankExplanationStatus request={state.bankExplanationRequest} connected={connected} busy={busy} onContinue={onContinueExplanations}/>
   {!visibleSources.length&&<p className="muted">No references in this subfolder. Add one below, or choose another subfolder.</p>}
   {visibleSources.map(source=><div className="reference-row" key={source.id}><div className="reference-heading"><b>{source.name}</b><div className="source-import-actions">{['pdf','ppt','pptx'].includes(source.originalFile?.kind)&&<button className="secondary" disabled={busy} aria-label={'Open presentation '+source.name} onClick={()=>onOpenSource(source)}>Open slides</button>}{source.originalFile?<button className="secondary" disabled={busy} aria-label={`Download original ${source.name}`} onClick={()=>onDownloadSource(source)}>Download original</button>:<button className="secondary" disabled={busy} aria-label={`Add original file for ${source.name}`} onClick={()=>onImportSource(selected,source)}>Add original file</button>}<button className="secondary source-delete" disabled={busy} aria-label={`Delete source ${source.name}`} onClick={()=>onDeleteSource(source)}>Delete source</button></div></div><button className="source-meta-trigger" type="button" aria-label={`Edit type and priority for ${source.name}`} onClick={()=>beginEdit(source)}>{typeLabel(source.sourceType)} · Priority {source.rank||1}</button>{editingId===source.id&&<form className="source-meta-editor" onSubmit={e=>{e.preventDefault();const folder=folderOptions.find(f=>f.key===editFolder)||selected;onUpdateSource({sourceId:source.id,sourceType:editType,rank:editRank,folder:{kind:folder.kind,label:folder.label}},()=>setEditingId(null));}}><label>Source type<select value={editType} onChange={e=>{const type=e.target.value;setEditType(type);setEditRank(DEFAULT_RANKS[type]);}}>{SOURCE_TYPES.map(type=><option key={type} value={type}>{typeLabel(type)}</option>)}</select></label><label>Priority<select value={editRank} onChange={e=>setEditRank(Number(e.target.value))}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Subfolder<select value={editFolder} onChange={e=>setEditFolder(e.target.value)}>{folderOptions.map(f=><option key={f.key} value={f.key}>{f.displayName}</option>)}</select></label><div className="source-meta-actions"><button className="secondary" type="button" onClick={()=>setEditingId(null)}>Cancel</button><button className="primary" disabled={busy}>Save source</button></div></form>}<span className="fine">{source.originalFile?'Original file preserved · Separate text copy':'Extracted text only · Original file not attached'}</span><span className="fine">Last synced: {(source.lastSyncedAt||(state.sourceSync?.unchanged?.includes(source.id)&&state.sourceSync.completedAt))?new Date(state.sourceSync?.unchanged?.includes(source.id)?state.sourceSync.completedAt:source.lastSyncedAt).toLocaleString():'Not synced'} · {syncStatus(source,state.sourceSync)}</span></div>)}
   {!!state.deletedSources?.length&&<details className="deleted-sources"><summary>Recently deleted sources · {state.deletedSources.length}</summary><p className="fine">Saved questions and progress are kept. Restore a source to use it again.</p>{state.deletedSources.map(source=><div className="reference-heading" key={source.id}><span>{source.name}</span><button className="secondary" disabled={busy} aria-label={`Restore source ${source.name}`} onClick={()=>onRestoreSource(source)}>Restore</button></div>)}</details>}
   <details><summary>Add a source excerpt</summary><form onSubmit={e=>{e.preventDefault();onAddSource({id:crypto.randomUUID(),name:sourceName,text,sourceType,rank,...folderFields(selected)},()=>{setText('');setSourceName('');});}}><label>Filename or source title<input required maxLength={300} value={sourceName} onChange={e=>setSourceName(e.target.value)}/></label><label>Source type<select value={sourceType} onChange={e=>{setSourceType(e.target.value);setRank(DEFAULT_RANKS[e.target.value]);}}>{SOURCE_TYPES.map(type=><option key={type} value={type}>{typeLabel(type)}</option>)}</select></label><label>Priority (1 is highest)<select value={rank} onChange={e=>setRank(Number(e.target.value))}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Course material<textarea required maxLength={60000} value={text} onChange={e=>setText(e.target.value)} placeholder="Paste an excerpt. Keep slide/page markers if available."/></label><button className="secondary" disabled={busy||!text.trim()||!sourceName.trim()}>Add reference</button></form></details>
   <label className="file-button">Add question bank to this subfolder<input type="file" accept={QUESTION_FILE_ACCEPT} disabled={busy} onChange={e=>{const file=e.target.files[0];e.target.value='';if(file)onImport(file,selected);}}/></label><p className="fine">JSON, TXT, Word (.docx), or text PDF. Adds questions without resetting your current exam.</p>
  </section>
 </section>;
}

export function NewCourse({busy,onCreate}){const [name,setName]=useState('');return <form className="course-form" onSubmit={e=>{e.preventDefault();onCreate({requestId:crypto.randomUUID(),name});}}><label>Course name<input autoFocus required maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Thoracic Anatomy"/></label><p className="fine">Add files or connect a local study folder after creating the course.</p><button className="primary" disabled={busy||!name.trim()}>Create course</button></form>;}

export function BuildQuestions({state,folderScope,busy,connected,onBuild,initialSourceIds,launchAfterBuild=false,examSettings=null}){
 const [mode,setMode]=useState(launchAfterBuild&&examSettings?.examMode==='struggling'?'gaps':launchAfterBuild&&examSettings?.examMode==='custom'?'custom':'coverage');
 const [instructions,setInstructions]=useState('');
 const [count,setCount]=useState(launchAfterBuild?Math.min(generationCapacity(state),Number(examSettings?.size)||10):10);
 const scopedSources=folderScope?sourcesInFolder(state,folderScope):state.sources;
 const [sourceIds,setSourceIds]=useState(initialSourceIds?.filter(id=>scopedSources.some(s=>s.id===id))||scopedSources.map(source=>source.id));
 const [generateExplanations,setGenerateExplanations]=useState(!!examSettings?.generateExplanations);
 const [difficulty,setDifficulty]=useState('exam');
 const [questionModel,setQuestionModel]=useState('current'),[questionEffort,setQuestionEffort]=useState('current');
 const [explanationDepth,setExplanationDepth]=useState(examSettings?.explanationDepth||'comprehensive');
 const [explanationModel,setExplanationModel]=useState('current'),[explanationEffort,setExplanationEffort]=useState('current');
 const capacity=generationCapacity(state),customMax=capacity,gaps=gapSignals(state);
 const invalidCount=mode==='custom'&&(!Number.isInteger(count)||count<1||count>customMax);
 const submit=event=>{event.preventDefault();if(!capacity||invalidCount)return;onBuild({folder:folderScope,mode,instructions:instructions.trim(),count:mode==='custom'?count:null,sourceIds,generateExplanations,difficulty,questionModel,questionEffort,explanationModel,explanationEffort,explanationDepth,launchAfterBuild,examSettings});};
 return <form className="course-form build-questions-form" onSubmit={submit}>
  <fieldset className="generation-mode-options"><legend>How should Pummy build this bank?</legend><div className="generation-mode-grid">{Object.entries(BUILD_MODES).map(([id,label])=><button type="button" key={id} className={'generation-mode'+(mode===id?' selected':'')} aria-pressed={mode===id} onClick={()=>setMode(id)}><strong>{label}</strong><span>{id==='coverage'?'Cover the selected sources and objectives.':id==='gaps'?'Focus on material you missed or have not mastered.':'Choose the exact number of questions.'}</span></button>)}</div></fieldset>
  {mode==='custom'&&<label>Number of questions<input type="number" min="1" max={customMax} required value={count} onChange={event=>setCount(Number(event.target.value))}/></label>}
  {mode==='gaps'&&<p className="fine" role="status">{gaps.concepts.length||gaps.objectives.length?`Using ${gaps.concepts.length} learning or missed concepts and ${gaps.objectives.length} objectives not yet mastered.`:'No attempt history yet. Pummy will use uncovered objectives, if available.'}</p>}
  {mode==='coverage'&&<p className="fine">Pummy will choose the number of questions needed for the selected material. It will report any material it cannot cover.</p>}
  <section className="generation-settings" aria-label="Question generation settings"><h3>Question settings</h3><div className="generation-settings-grid">
   <label>Difficulty<select value={difficulty} onChange={event=>setDifficulty(event.target.value)}>{Object.entries(QUESTION_DIFFICULTIES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Question model preference<select value={questionModel} onChange={event=>setQuestionModel(event.target.value)}>{Object.entries(MODEL_PREFERENCES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Question effort preference<select value={questionEffort} onChange={event=>setQuestionEffort(event.target.value)}>{Object.entries(EFFORT_PREFERENCES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  </div></section>
  <label>Topics, objectives, or instructions (optional)<textarea maxLength={4000} value={instructions} onChange={event=>setInstructions(event.target.value)} placeholder="e.g. Emphasize the aortic arch and lecture objectives 1–3."/></label>
  {scopedSources.length>0&&<fieldset><legend>Saved course references</legend>{scopedSources.map(source=><label className="toggle" key={source.id}><input type="checkbox" checked={sourceIds.includes(source.id)} onChange={()=>setSourceIds(sourceIds.includes(source.id)?sourceIds.filter(id=>id!==source.id):[...sourceIds,source.id])}/>{source.name}</label>)}</fieldset>}
  <label className="toggle"><input type="checkbox" checked={generateExplanations} onChange={event=>setGenerateExplanations(event.target.checked)}/>Generate full explanations with these questions</label>
  {generateExplanations&&<section className="generation-settings" aria-label="Explanation generation settings"><h3>Explanation settings</h3><div className="generation-settings-grid"><ExplanationDepth value={explanationDepth} onChange={setExplanationDepth}/>
   <label>Explanation model preference<select value={explanationModel} onChange={event=>setExplanationModel(event.target.value)}>{Object.entries(MODEL_PREFERENCES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Explanation effort preference<select value={explanationEffort} onChange={event=>setExplanationEffort(event.target.value)}>{Object.entries(EFFORT_PREFERENCES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  </div></section>}
  <p className="fine generation-host-note">Pummy sends model and effort preferences with the request. Set the actual model and effort in ChatGPT before generating; this panel cannot switch them. Questions and explanations are created in the same ChatGPT response.</p>
  {!capacity&&<p className="error-text">This course has reached its 500-question limit.</p>}
  {invalidCount&&<p className="error-text">Enter 1–{customMax} questions.</p>}
  <p className="fine">{launchAfterBuild?'The exam opens after the final batch is saved. ':''}Sync your local files in Course & sources before generating questions.</p>
  {!connected&&<p className="fine">Open Pummy inside a ChatGPT conversation to generate new questions.</p>}
  <button className="primary" disabled={busy||!connected||!capacity||invalidCount}>{launchAfterBuild?'Generate and start exam':'Ask ChatGPT to build questions'}</button>
 </form>;
}
