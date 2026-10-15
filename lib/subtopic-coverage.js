import {normalized} from './assessment-quality.js';
export function evidenceCurrent(e,model){
 const source=model.sources.get(e.sourceId);if(!source||source.deletedAt||e.contentHash!==source.contentHash)return false;
 if(e.visualId)return (model.sourceVisuals||[]).some(v=>v.id===e.visualId&&v.sourceId===e.sourceId&&v.page===e.page&&v.contentHash===source.contentHash);
 const pages=Array.isArray(source.pages)?source.pages:[];
 const text=e.page!=null?(pages.find(p=>p.page===e.page)?.text||pageText(model.texts.get(source.id)||'',e.page)):model.texts.get(source.id)||'';
 return normalized(e.quote).length>=12&&normalized(text).includes(normalized(e.quote));
}
function pageText(text,page){return text.match(new RegExp('--- (?:Page|Slide) '+page+' ---\\n([\\s\\S]*?)(?=--- (?:Page|Slide) \\d+ ---|$)'))?.[1]||'';}
export function subtopicReport(model,run,questions=model.rootQuestions()){
 if(!run)return {status:'not_audited',percent:null,topics:[],complete:false};
 const topics=run.topics.map(t=>{
  const evidence=t.evidence||[],fresh=evidence.length&&evidence.every(e=>evidenceCurrent(e,model));
  const assessed=questions.filter(q=>q.assessment?.runId===run.id&&q.assessment?.review?.accepted&&q.assessment.subtopicIds.includes(t.id)&&q.assessment.evidence.every(e=>evidenceCurrent(e,model)));
  const status=assessed.length?'assessed':t.status==='supported'&&!fresh?'source_unverified':t.status||'pending';
  return {...t,status,questionIds:assessed.map(q=>q.id),...(t.status==='supported'&&!fresh?{reason:'Source content changed; retrieve and verify the evidence again.'}:{})};
 });
 const covered=topics.filter(t=>t.status==='assessed').length,total=topics.length;
 const complete=total>0&&covered===total,terminal=topics.every(t=>['assessed','source_missing','source_unverified','technical_blocked'].includes(t.status));
 return {runId:run.id,status:complete?'complete':terminal?'incomplete_with_diagnostics':'repairing',complete,terminal,covered,total,percent:total?Math.round(covered/total*100):null,topics};
}
