import React,{useEffect,useRef,useState} from 'react';
import {generationPercent} from './generation-meter.js';
import './generation-progress.css';

export function GenerationProgress({title,detail,startedAt,summary,progressId,phase='generating',saved=0,total=0,elapsedSeconds=0}){
 const [now,setNow]=useState(Date.now);
 const meter=useRef({id:progressId||startedAt,value:0});
 useEffect(()=>{
  setNow(Date.now());
  if(!startedAt)return;
  const timer=setInterval(()=>setNow(Date.now()),250);
  return()=>clearInterval(timer);
 },[startedAt]);
 const seconds=startedAt?Math.max(0,(now-startedAt)/1000):elapsedSeconds;
 const id=progressId||startedAt;
 if(meter.current.id!==id)meter.current={id,value:0};
 const value=Math.max(meter.current.value,generationPercent({phase,elapsed:seconds,saved,total}));
 meter.current.value=value;
 const percent=Math.round(value);
 const strength=value/100;
 const wholeSeconds=Math.floor(seconds);
 const elapsed=wholeSeconds<60?`${wholeSeconds}s`:`${Math.floor(wholeSeconds/60)}m ${wholeSeconds%60}s`;
 return <div className={'generation-progress'+(phase==='complete'?' is-complete':'')} style={{'--generation-brightness':1+strength*.7,'--generation-glow':`${3+strength*17}px`,'--generation-pulse-duration':`${2.4-strength*1.65}s`,'--generation-pulse-min':.75-strength*.3,'--generation-pulse-boost':1.04+strength*.36}}>
  <div role="status"><strong>{title}</strong>{detail&&<p className="fine">{detail}</p>}</div>
  <div className="generation-progress-track" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%${phase==='complete'?' complete':' estimated'}${summary?` · ${summary}`:''}`}><span style={{width:`${value}%`}}><i/></span></div>
  <div className="generation-progress-meta"><span>{phase==='complete'?'100% · Ready':`${percent}% · Estimated progress`}</span>{startedAt&&<span>{elapsed} elapsed</span>}</div>
  {summary&&<p className="generation-progress-summary">{summary}</p>}
 </div>;
}

export function ExamGenerationProgress({job,state}){
 const saved=(state.questionIndex||[]).filter(question=>!job.beforeIds.includes(question.id)).length;
 const complete=job.phase==='complete';
 const opening=job.phase==='opening';
 const sending=job.phase==='sending';
 return <GenerationProgress
  title={complete?'Your exam is ready!':sending?'Sending exam request…':opening?'Opening your exam…':`Generating ${job.label}…`}
  detail={complete?'Your new questions are saved. Let’s begin.':sending?'Sending your course sources and exam settings to ChatGPT.':opening?'Your questions are saved. Preparing the exam.':'ChatGPT is preparing your questions. The exam will open automatically after the final save.'}
  startedAt={job.sentAt}
  progressId={job.id} phase={job.phase} saved={saved} total={job.count}
  summary={saved?`${saved}${job.count?` of ${job.count}`:''} questions saved`:sending?'Sending request':'Waiting for the first saved batch'}
 />;
}
