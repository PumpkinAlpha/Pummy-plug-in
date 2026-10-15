import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from '@modelcontextprotocol/ext-apps';

const app=new App({name:'pummy-slide-check',version:'0.6.1'},{},{autoResize:true});
function SlideCheck(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),identity=useRef(null),locked=useRef(false);
 function accept(result){
  if(result.isError)throw new Error(result.content?.find(c=>c.type==='text')?.text||'Could not save the answer.');
  const next=result.structuredContent?.tutor?.check;if(!next)return;
  const key=JSON.stringify([next.courseId,next.presentationId,next.requestId,next.slideId]);
  if(identity.current&&identity.current!==key)return; // Never replace this slide's question.
  identity.current=key;setData(previous=>previous?.checked?previous:next);
 }
 async function refresh(ids){accept(await app.callServerTool({name:'render_slide_check',arguments:ids}));}
 useEffect(()=>{
  app.ontoolresult=r=>{
   if(identity.current)return; // This widget belongs to its first result for its lifetime.
   try{
    accept(r);const c=r.structuredContent?.tutor?.check;if(!c)return;
    locked.current=true;setBusy(true);
    refresh({courseId:c.courseId,presentationId:c.presentationId,requestId:c.requestId}).catch(e=>setError(e.message)).finally(()=>{locked.current=false;setBusy(false);});
   }catch(e){setError(e.message);}
  };
  app.connect().catch(e=>setError(e.message));
 },[]);
 async function answer(option,check){
  if(locked.current||data.checked)return;locked.current=true;setBusy(true);setError('');
  setData(previous=>({...previous,selected:option}));
  try{accept(await app.callServerTool({name:'answer_slide_check',arguments:{courseId:data.courseId,presentationId:data.presentationId,requestId:data.requestId,option,check}}));}
  catch(e){setError(e.message);try{await refresh({courseId:data.courseId,presentationId:data.presentationId,requestId:data.requestId});}catch{}}
  finally{locked.current=false;setBusy(false);}
 }
 return <section aria-label="Slide comprehension check">
  <h2>D. Check Your Understanding{data?` — Slide ${data.page}`:''}</h2>
  <p>Informal practice · saved separately from your exam</p>
  {!data&&!error&&<p role="status">Loading slide check…</p>}
  {data&&!data.testable&&<p>This slide introduces no testable information; no question is needed.</p>}
  {data?.testable&&<><fieldset disabled={busy||data.checked}><legend>{data.stem}</legend>{data.options.map((option,index)=><label key={index}><input type="radio" name={data.requestId} checked={data.selected===index} onChange={()=>answer(index,false)}/>{option}</label>)}</fieldset>
   <button disabled={busy||data.checked||data.selected===null} onClick={()=>answer(data.selected,true)}>{data.checked?'Answer checked':'Check answer'}</button>
   {data.checked&&<div role="status"><strong>{data.correct?'Correct':'Incorrect'}</strong><p>Correct answer: {data.options[data.answer]}</p>{data.explanation&&<p>{data.explanation}</p>}{data.optionExplanation&&data.optionExplanation!==data.explanation&&<p>{data.optionExplanation}</p>}</div>}</>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
createRoot(document.getElementById('root')).render(<SlideCheck/>);
