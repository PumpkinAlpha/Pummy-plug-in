import React,{useEffect,useState} from 'react';
import {renderPageAsImage} from 'unpdf';

export function CitationPage({dataUrl,page,name,fallbackText}){
 const [image,setImage]=useState(null),[error,setError]=useState('');
 useEffect(()=>{
  if(!dataUrl)return;
  let active=true;
  setImage(null);setError('');
  (async()=>{
   const encoded=dataUrl.slice(dataUrl.indexOf(',')+1);
   const binary=atob(encoded);
   const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
   const url=await renderPageAsImage(bytes,page,{width:1400,toDataURL:true});
   if(active)setImage(url);
  })().catch(()=>{if(active)setError('The original page could not be displayed. Showing the extracted text.');});
  return()=>{active=false;};
 },[dataUrl,page]);
 if(error)return <><p className="source-visual-error" role="alert">{error}</p><pre className="source-text">{fallbackText}</pre></>;
 return <div className="source-page-stage" role="status" aria-label={image?`Original page ${page} from ${name}`:'Rendering original page'}>{image?<img className="source-page-image" src={image} alt={`Original page ${page} from ${name}`}/>:<p className="fine">Rendering original page…</p>}</div>;
}
