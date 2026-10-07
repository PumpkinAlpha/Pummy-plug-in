export const folderKey=folder=>`${folder.kind}:${folder.label}`;

export function studyFolders(state){
 const sources=state.sources||[],questions=state.questionIndex||[];
 const named=Object.keys(state.folderNames||{});
 const weeks=[...new Set([...sources.map(s=>s.weekId),...questions.map(q=>q.weekId),...named.filter(k=>k.startsWith('week:')).map(k=>k.slice(5))].filter(Boolean))].sort((a,b)=>String(b).localeCompare(String(a),undefined,{numeric:true}));
 const lectures=weeks.length?[]:[...new Set([...sources.map(s=>s.lecture),...questions.map(q=>q.lecture),...named.filter(k=>k.startsWith('lecture:')).map(k=>k.slice(8))].filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
 const hasUnassigned=weeks.length?sources.some(s=>!s.weekId)||questions.some(q=>!q.weekId&&!sources.some(s=>s.id===q.sourceId&&s.weekId)):lectures.length&&(sources.some(s=>!s.lecture)||questions.some(q=>!q.lecture&&!sources.some(s=>s.id===q.sourceId&&s.lecture)));
 const folders=weeks.length?[...weeks.map(label=>({label,kind:'week'})),...(hasUnassigned?[{label:'Other resources',kind:'unassigned'}]:[])]:lectures.length?[...lectures.map(label=>({label,kind:'lecture'})),...(hasUnassigned?[{label:'Other resources',kind:'unassigned'}]:[])]:[{label:'Study resources',kind:'all'}];
 return folders.map(folder=>({...folder,key:folderKey(folder),displayName:state.folderNames?.[folderKey(folder)]||folder.label}));
}

export function sourcesInFolder(state,folder){
 if(!folder)return [];
 const hasWeeks=studyFolders(state).some(f=>f.kind==='week');
 return (state.sources||[]).filter(source=>folder.kind==='all'||(folder.kind==='unassigned'?(hasWeeks?!source.weekId:!source.lecture):(folder.kind==='week'?source.weekId:source.lecture)===folder.label));
}

export function questionsInFolder(state,folder){
 if(!folder)return [];
 const sources=sourcesInFolder(state,folder),hasWeeks=studyFolders(state).some(f=>f.kind==='week');
 return (state.questionIndex||[]).filter(q=>folder.kind==='all'||(folder.kind==='week'?q.weekId===folder.label||sources.some(s=>s.id===q.sourceId):folder.kind==='lecture'?q.lecture===folder.label||sources.some(s=>s.id===q.sourceId):hasWeeks?!q.weekId&&!(state.sources||[]).some(s=>s.id===q.sourceId&&s.weekId):!q.lecture&&!(state.sources||[]).some(s=>s.id===q.sourceId&&s.lecture)));
}
