import React,{useState} from 'react';
import {EXPLANATION_DEPTHS} from '../lib/explanation-depth.js';
export function ExplanationDepth({value,onChange}){return <label>Explanation depth<select value={value} onChange={e=>onChange(e.target.value)}>{Object.entries(EXPLANATION_DEPTHS).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>;}
export function BankExplanationForm({questions,busy,connected,onGenerate}){
 const [depth,setDepth]=useState('comprehensive');
 return <form className="course-form" onSubmit={e=>{e.preventDefault();onGenerate({questionIds:questions.map(q=>q.id),depth});}}><p>{questions.length} saved question{questions.length===1?' is':'s are'} missing full explanations. Generate explanations before practicing; they remain hidden until you submit an answer.</p><ExplanationDepth value={depth} onChange={setDepth}/>{!connected&&<p className="fine">Open Pummy in ChatGPT to generate explanations from your course sources.</p>}<button className="primary" disabled={busy||!connected||!questions.length}>Generate explanations</button></form>;
}
export function BankExplanationStatus({request,connected,busy,onContinue}){if(!request?.pending)return null;return <div className="notice" role="status"><span>Bank explanations: {request.completed} of {request.total} saved. Check the ChatGPT conversation for progress.</span><button className="secondary" disabled={busy||!connected} onClick={onContinue}>Continue explanation generation</button></div>;}
