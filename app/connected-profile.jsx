import React,{useEffect,useState} from 'react';
import {call} from './bridge.js';

export function ConnectedProfile(){
 const [profile,setProfile]=useState(null),[error,setError]=useState(''),[switching,setSwitching]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let alive=true;setError('');call('read_connected_profile',{}).then(r=>{if(alive)setProfile(r.profile);}).catch(()=>{if(alive)setError('Could not load the connected account.');});return()=>{alive=false;};},[attempt]);
 return <section className="connected-profile"><label>ChatGPT profile<select aria-label="ChatGPT profile" value={switching?'switch':'current'} disabled={!profile} onChange={e=>setSwitching(e.target.value==='switch')}><option value="current">{profile?(profile.email||profile.name):'Loading connected account…'}</option><option value="switch">Use another ChatGPT account…</option></select></label>{profile?.email&&<p className="fine">{profile.name}</p>}{error&&<p role="status">{error} <button onClick={()=>setAttempt(n=>n+1)}>Retry account</button></p>}{switching&&<p className="fine" role="status">Switch accounts in ChatGPT’s account menu, then reopen Pummy from that account. Each account has its own courses and progress. ChatGPT provides Pummy only the current connected account.</p>}</section>;
}
