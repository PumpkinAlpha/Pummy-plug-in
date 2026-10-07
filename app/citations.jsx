import React,{createContext,useContext} from 'react';
const Context=createContext({sources:[],onOpen:()=>{}});
export const CiteProvider=({sources,onOpen,children})=><Context.Provider value={{sources,onOpen}}>{children}</Context.Provider>;
export function Cite({raw,file}){const {sources,onOpen}=useContext(Context);const source=file&&sources.find(s=>s.name.toLowerCase().trim()===file.toLowerCase().trim());return source?<button className="inline-cite" onClick={()=>onOpen(source.id)} title={`Read ${source.name}`}>{raw}</button>:raw;}
