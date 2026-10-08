import React,{createContext,useContext} from 'react';
import {explanationReferences} from './explanation-display.js';
const Context=createContext({sources:[],onOpen:()=>{}});
export const CiteProvider=({sources,onOpen,children})=><Context.Provider value={{sources,onOpen}}>{children}</Context.Provider>;
export function Cite({raw,file,range}){const {sources,onOpen}=useContext(Context);const source=file&&sources.find(s=>s.name.toLowerCase().trim()===file.toLowerCase().trim());return source?<button className="inline-cite" onClick={()=>onOpen(source.id,range?{page:Number(range.match(/\d+/)?.[0])}:undefined)} title={`Read ${source.name}`}>{raw}</button>:raw;}
export function ExplanationCitations({explanation,question,compact=false}){
 const {sources,onOpen}=useContext(Context),refs=explanationReferences(explanation,sources,question);
 if(!refs.length)return compact?null:<p className="fine">No saved source citation is available for this explanation.</p>;
 return <span className={compact?'explanation-citations compact':'explanation-citations'}>{!compact&&'Sources: '}{refs.map((r,i)=><button key={`${r.id}:${r.page}`} className="inline-cite" aria-label={`Read ${r.name}${r.page?`, page ${r.page}`:''}`} title={`${r.questionSource?'Question source: ':''}${r.name}${r.page?`, page ${r.page}`:''}`} onClick={()=>onOpen(r.id,r.page?{page:r.page}:undefined)}>{compact?`[${i+1}]`:`${r.questionSource?'Question source: ':''}${r.name}${r.page?`, page ${r.page}`:''}`}</button>)}</span>;
}
