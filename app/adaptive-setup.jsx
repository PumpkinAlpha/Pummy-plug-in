import React,{useEffect,useState} from 'react';
import {ExamGenerationProgress} from './generation-progress.jsx';
import {EXAM_MODES,matchingExamQuestions} from './exam-settings.js';

import {ExplanationDepth,BankExplanationStatus} from './explanation-settings.jsx';
const TYPES=[['mcq','Single choice'],['multi','Select all'],['image','Image / identify'],['label','Diagram labeling'],['order','Ordering'],['match','Matching']];
const defaults={size:'all',examMode:'all',adaptive:true,generateExplanations:false,explanationDepth:'comprehensive',practiceFirst:true,includeReviews:true,types:null,sourceIds:null,objectiveIds:null,weekId:'all',setId:null};
function savedSettings(state){const saved=state.preferences||{};return {...defaults,...saved,examMode:saved.examMode||(saved.size==null||saved.size==='all'?'all':'custom'),size:saved.size==='all'||saved.size==null?'all':Math.min(saved.size,state.questionIndex?.length||500)};}

export function AdaptiveSetup({state,busy,connected,resume,onResume,onStart,onBuild,onSave,buildJob,onExplain,onContinueExplanations}){
 const [p,setP]=useState(()=>savedSettings(state));
 const [customSize,setCustomSize]=useState(()=>savedSettings(state).size==='all'?Math.min(20,state.questionIndex?.length||20):savedSettings(state).size);
 useEffect(()=>{const saved=savedSettings(state);setP(saved);setCustomSize(saved.size==='all'?Math.min(20,state.questionIndex?.length||20):saved.size);},[state.courseId]);
 const bank=state.questionIndex||[];
 const weeks=[...new Set([...state.sources,...bank].map(item=>item.weekId).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 const patch=(key,value)=>setP(current=>({...current,[key]:value}));
 const toggle=(key,value,all)=>patch(key,p[key]===null?all.filter(item=>item!==value):p[key].includes(value)?p[key].filter(item=>item!==value):[...p[key],value]);
 const custom=p.examMode==='custom',matching=matchingExamQuestions(state,p),customMax=Math.max(1,bank.length?matching.length:500);
 const bad=(custom&&(!Number.isInteger(Number(p.size))||Number(p.size)<1||Number(p.size)>customMax))||['types','sourceIds','objectiveIds'].some(key=>p[key]!==null&&!p[key].length);
 const missing=matching.filter(q=>!q.hasExplanation);
 const settings={...p,size:custom?Number(p.size):'all',adaptive:connected&&p.adaptive,generateExplanations:connected&&p.generateExplanations};
 const chooseMode=mode=>setP(current=>({...current,examMode:mode,size:mode==='custom'?Math.min(Number(customSize)||20,Math.max(1,bank.length?matchingExamQuestions(state,{...current,examMode:'custom'}).length:500)):'all'}));
 return <section className="setup adaptive-setup">
  <span className="eyebrow">Exam configuration</span><h2>Adaptive exam</h2>
  <p className="muted">Choose what to study. Start with saved questions or generate a fresh set from your course sources.</p>
  <fieldset className="generation-mode-options exam-mode-options"><legend>Which questions should be in this exam?</legend><div className="generation-mode-grid exam-mode-grid">{Object.entries(EXAM_MODES).map(([mode,{label,description}])=><button type="button" key={mode} className={'generation-mode'+(p.examMode===mode?' selected':'')} aria-pressed={p.examMode===mode} disabled={busy||!!buildJob} onClick={()=>chooseMode(mode)}><strong>{label}</strong><span>{description}</span></button>)}</div></fieldset>
  {resume&&<div className="notice"><span>Your current exam is saved.</span><button className="primary" disabled={busy} onClick={onResume}>Resume exam</button></div>}
  {buildJob&&<ExamGenerationProgress job={buildJob} state={state}/>}
  <div className="adaptive-start-actions"><button className="primary" disabled={busy||bad||resume||!matching.length||!!buildJob} onClick={()=>onStart(settings)}>{connected&&p.adaptive?'Start adaptive exam':'Start bank practice'}</button><button className="secondary" disabled={busy||bad||resume||!connected||p.examMode==='professor'||!!buildJob} onClick={()=>onBuild(settings)}>Generate questions and start exam</button>{missing.length>0&&<button className="secondary" disabled={busy||!!state.bankExplanationRequest?.pending||!!buildJob} onClick={()=>onExplain(missing)}>Generate missing explanations ({missing.length})</button>}</div>
  <BankExplanationStatus request={state.bankExplanationRequest} connected={connected} busy={busy} onContinue={onContinueExplanations}/>
  {!matching.length&&bank.length>0&&<p className="fine">No saved questions match this mode and its filters.</p>}
  {p.examMode==='professor'&&<p className="fine">Professor questions use your imported bank.</p>}
  {!connected&&<p className="fine">Open Pummy in a ChatGPT conversation to generate questions and adaptive follow-ups. Saved bank questions can still be practiced here.</p>}
  <div className="settings-grid">{custom?<label>Number of questions<input type="number" min="1" max={customMax} value={p.size} onChange={e=>{setCustomSize(e.target.value);patch('size',e.target.value);}}/></label>:<div className="exam-size-control"><span>Questions in this exam</span><strong>{matching.length} matching question{matching.length===1?'':'s'}</strong></div>}<label>Week<select value={p.weekId} onChange={e=>patch('weekId',e.target.value)}><option value="all">All weeks</option>{weeks.map(w=><option key={w}>{w}</option>)}</select></label><label>Practice set<select value={p.setId||''} onChange={e=>patch('setId',e.target.value||null)}><option value="">All sets</option>{[...new Set(bank.map(q=>q.setId).filter(Boolean))].map(id=><option key={id}>{id}</option>)}</select></label></div>
  <label className="toggle"><input type="checkbox" checked={connected&&p.adaptive} disabled={!connected} onChange={e=>patch('adaptive',e.target.checked)}/>Adaptive follow-ups after missed questions</label>
  <label className="toggle"><input type="checkbox" checked={connected&&p.generateExplanations} disabled={!connected} onChange={e=>patch('generateExplanations',e.target.checked)}/>Generate full explanations with new questions</label>
  {p.generateExplanations&&<ExplanationDepth value={p.explanationDepth} onChange={value=>patch('explanationDepth',value)}/>}
  <p className="fine">When enabled, new questions include their explanations before the exam shows them. Explanations remain hidden until you submit an answer.</p>
  <label className="toggle"><input type="checkbox" checked={p.practiceFirst} onChange={e=>patch('practiceFirst',e.target.checked)}/>Professor and flagged questions first</label>
  <label className="toggle"><input type="checkbox" checked={p.includeReviews} onChange={e=>patch('includeReviews',e.target.checked)}/>Include scheduled concept reviews</label>
  <details><summary>Question types</summary><div className="filter-options"><label className="toggle"><input type="checkbox" checked={p.types===null} onChange={e=>patch('types',e.target.checked?null:[])}/>All question types</label>{TYPES.map(([id,label])=><label className="toggle" key={id}><input type="checkbox" checked={p.types===null||p.types.includes(id)} onChange={()=>toggle('types',id,TYPES.map(type=>type[0]))}/>{label}</label>)}</div></details>
  <details><summary>Sources and objectives to cover</summary><h3>Course sources</h3><label className="toggle"><input type="checkbox" checked={p.sourceIds===null} onChange={e=>patch('sourceIds',e.target.checked?null:[])}/>All sources</label>{state.sources.map(source=><label className="toggle" key={source.id}><input type="checkbox" checked={p.sourceIds===null||p.sourceIds.includes(source.id)} onChange={()=>toggle('sourceIds',source.id,state.sources.map(s=>s.id))}/>{source.name}</label>)}<h3>Learning objectives</h3><label className="toggle"><input type="checkbox" checked={p.objectiveIds===null} onChange={e=>patch('objectiveIds',e.target.checked?null:[])}/>All objectives</label>{[...state.objectives,{id:'__untagged__',text:'Questions not linked to an objective'}].map(objective=><label className="toggle" key={objective.id}><input type="checkbox" checked={p.objectiveIds===null||p.objectiveIds.includes(objective.id)} onChange={()=>toggle('objectiveIds',objective.id,[...state.objectives.map(o=>o.id),'__untagged__'])}/>{objective.num?`Objective ${objective.num}: `:''}{objective.text}</label>)}</details>
  {bad&&<p className="error-text">Choose a custom count of 1–{customMax}, and at least one item in each enabled filter.</p>}
  <button className="quiet" disabled={busy||bad} onClick={()=>onSave(settings)}>Save default exam settings</button>
 </section>;
}
