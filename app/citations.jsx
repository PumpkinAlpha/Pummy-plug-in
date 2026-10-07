import React,{createContext,useContext} from 'react';
const Context=createContext({sources:[],onOpen:()=>{}});
export const CiteProvider=({sources,onOpen,children})=><Context.Provider value={{sources,onOpen}}>{children}</Context.Provider>;
export function Cite({raw,file,range}){const {sources,onOpen}=useContext(Context);const source=file&&sources.find(s=>s.name.toLowerCase().trim()===file.toLowerCase().trim());return source?<button className="inline-cite" onClick={()=>onOpen(source.id,range?{page:Number(range.match(/\d+/)?.[0])}:undefined)} title={`Read ${source.name}`}>{raw}</button>:raw;}
