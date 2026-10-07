import React,{useEffect,useState} from 'react';

const TYPES=[['mcq','Single choice'],['multi','Select all'],['image','Image / identify'],['label','Diagram labeling'],['order','Ordering'],['match','Matching']];
const defaults={size:20,adaptive:true,generateExplanations:false,practiceFirst:true,includeReviews:true,types:null,sourceIds:null,objectiveIds:null,weekId:'all',setId:null};

export function AdaptiveSetup({state,busy,connected,resume,onResume,onStart,onBuild,onSave,buildJob}){
 const [p,setP]=useState({...defaults,...state.preferences});
 useEffect(()=>setP({...defaults,...state.preferences}),[state.courseId]);
 const bank=state.questionIndex||[];
 const weeks=[...new Set(state.sources.map(s=>s.weekId).filter(Boolean))];
 const patch=(key,value)=>setP(current=>({...current,[key]:value}));
 const toggle=(key,value,all)=>patch(key,p[key]===null?all.filter(item=>item!==value):p[key].includes(value)?p[key].filter(item=>item!==value):[...p[key],value]);
 const bad=!Number.isInteger(Number(p.size))||Number(p.size)<1||Number(p.size)>100||['types','sourceIds','objectiveIds'].some(key=>p[key]!==null&&!p[key].length);
 const settings={...p,size:Number(p.size),adaptive:connected&&p.adaptive,generateExplanations:connected&&p.generateExplanations};
 return <section className="setup adaptive-setup">
  <span className="eyebrow">Exam configuration</span><h2>Adaptive exam</h2>
  <p className="muted">Choose what to study. Start with saved questions or generate a fresh set from your course sources.</p>
  {resume&&<div className="notice"><span>Your current exam is saved.</span><button className="primary" disabled={busy} onClick={onResume}>Resume exam</button></div>}
  {buildJob&&<p className="notice" role="status">Generating {buildJob.label}. The exam will open when the bank is saved.</p>}
  <div className="adaptive-start-actions"><button className="primary" disabled={busy||bad||resume||!bank.length} onClick={()=>onStart(settings)}>Start adaptive exam</button><button className="secondary" disabled={busy||resume||!connected||!!buildJob} onClick={()=>onBuild(settings)}>Generate questions and start exam</button></div>
  {!connected&&<p className="fine">Open Pummy in a ChatGPT conversation to generate questions and adaptive follow-ups. Saved bank questions can still be practiced here.</p>}
  <div className="settings-grid"><label>Questions in this exam<input type="number" min="1" max="100" value={p.size} onChange={e=>patch('size',e.target.value)}/></label><label>Week<select value={p.weekId} onChange={e=>patch('weekId',e.target.value)}><option value="all">All weeks</option>{weeks.map(w=><option key={w}>{w}</option>)}</select></label><label>Practice set<select value={p.setId||''} onChange={e=>patch('setId',e.target.value||null)}><option value="">All sets</option>{[...new Set(bank.map(q=>q.setId).filter(Boolean))].map(id=><option key={id}>{id}</option>)}</select></label></div>
  <label className="toggle"><input type="checkbox" checked={connected&&p.adaptive} disabled={!connected} onChange={e=>patch('adaptive',e.target.checked)}/>Adaptive follow-ups after missed questions</label>
  <label className="toggle"><input type="checkbox" checked={connected&&p.generateExplanations} disabled={!connected} onChange={e=>patch('generateExplanations',e.target.checked)}/>Generate full explanations with new questions</label>
  <p className="fine">When enabled, new questions include their explanations before the exam shows them. Explanations remain hidden until you submit an answer.</p>
  <label className="toggle"><input type="checkbox" checked={p.practiceFirst} onChange={e=>patch('practiceFirst',e.target.checked)}/>Professor and flagged questions first</label>
  <label className="toggle"><input type="checkbox" checked={p.includeReviews} onChange={e=>patch('includeReviews',e.target.checked)}/>Include scheduled concept reviews</label>
  <details><summary>Question types</summary><div className="filter-options"><label className="toggle"><input type="checkbox" checked={p.types===null} onChange={e=>patch('types',e.target.checked?null:[])}/>All question types</label>{TYPES.map(([id,label])=><label className="toggle" key={id}><input type="checkbox" checked={p.types===null||p.types.includes(id)} onChange={()=>toggle('types',id,TYPES.map(type=>type[0]))}/>{label}</label>)}</div></details>
  <details><summary>Sources and objectives to cover</summary><h3>Course sources</h3><label className="toggle"><input type="checkbox" checked={p.sourceIds===null} onChange={e=>patch('sourceIds',e.target.checked?null:[])}/>All sources</label>{state.sources.map(source=><label className="toggle" key={source.id}><input type="checkbox" checked={p.sourceIds===null||p.sourceIds.includes(source.id)} onChange={()=>toggle('sourceIds',source.id,state.sources.map(s=>s.id))}/>{source.name}</label>)}<h3>Learning objectives</h3><label className="toggle"><input type="checkbox" checked={p.objectiveIds===null} onChange={e=>patch('objectiveIds',e.target.checked?null:[])}/>All objectives</label>{[...state.objectives,{id:'__untagged__',text:'Questions not linked to an objective'}].map(objective=><label className="toggle" key={objective.id}><input type="checkbox" checked={p.objectiveIds===null||p.objectiveIds.includes(objective.id)} onChange={()=>toggle('objectiveIds',objective.id,[...state.objectives.map(o=>o.id),'__untagged__'])}/>{objective.num?`Objective ${objective.num}: `:''}{objective.text}</label>)}</details>
  {bad&&<p className="error-text">Choose 1–100 questions and at least one item in each enabled filter.</p>}
  <button className="quiet" disabled={busy||bad} onClick={()=>onSave(settings)}>Save default exam settings</button>
 </section>;
}
