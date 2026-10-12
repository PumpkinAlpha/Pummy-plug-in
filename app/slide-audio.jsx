import React,{useEffect,useRef,useState} from 'react';
import {audioManifest,slideAudio} from '../lib/tutor/audio.js';
import {loadAsset,downloadFile} from './tutor-files.js';
export function SlideAudio({p,page,call,onOriginal}){
 const source=useRef(null),[tracks,setTracks]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{if(p.kind!=='pptx')return;let active=true,urls=[];setTracks([]);setError('');setLoading(true);
  const get=source.current||(source.current=loadAsset(call,p.courseId,p.assets.original).then(bytes=>({bytes,manifest:audioManifest(bytes)})).catch(e=>{source.current=null;throw e;}));
  get.then(({bytes,manifest})=>{if(!active)return;const found=slideAudio(bytes,manifest,page).map(t=>{if(!t.bytes)return t;const url=URL.createObjectURL(new Blob([t.bytes],{type:t.type}));urls.push(url);return {...t,url};});setTracks(found);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;urls.forEach(url=>URL.revokeObjectURL(url));};
 },[p.id,page]);
 if(p.kind==='pdf')return null;
 if(p.kind==='ppt')return <section className="tutor-audio" aria-label="Slide audio"><p className="fine">Audio remains in the original PPT. Open it in PowerPoint to play it.</p><button onClick={onOriginal}>Download original PowerPoint</button></section>;
 if(!loading&&!error&&!tracks.length)return null;
 return <section className="tutor-audio" aria-label="Slide audio"><h3>Slide audio</h3>{loading&&<p role="status">Loading embedded audio…</p>}{error&&<p role="alert">Could not read the slide audio. Download the original PowerPoint to listen.</p>}{tracks.map((t,i)=><AudioTrack key={page+':'+i} track={t}/>)}<button onClick={onOriginal}>Download original PowerPoint</button></section>;
}
function AudioTrack({track:t}){const [failed,setFailed]=useState(false),ref=useRef(null);useEffect(()=>{const audio=ref.current;return()=>audio?.pause();},[]);if(!t.url)return <p className="fine">{t.external?'This audio is linked outside the presentation. Open the original in PowerPoint.':'The embedded audio file is missing.'}</p>;return <div className="tutor-audio-track"><span>{t.name}</span><audio ref={ref} aria-label={`Play ${t.name}`} controls preload="metadata" src={t.url} onError={()=>setFailed(true)}/>{failed&&<p className="fine">This browser cannot play this format. Download the audio or open the original in PowerPoint.</p>}<button onClick={()=>downloadFile(t.bytes,t.name,t.type)}>Download audio</button></div>;}
