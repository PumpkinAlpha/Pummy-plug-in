import {GroundedIndex,grounding,formatGrounding,relevantObjectives,provenance,validateProvenance} from './grounding.js';
import { CourseModel, Exam, createSession, cleanQuestion, isDue, bucket, summarize, isInteractive, questionType, objectiveConcepts } from '../lib/pummy-core.mjs';
export function emptyCourse(id,name){return {id,name,questions:[],concepts:[],sources:[],texts:[],objectives:[],folderNames:{},folderTags:{},session:null,generation:null,explanationRequest:null,history:[],preferences:{}};}
export class PluginCourse extends CourseModel {
 constructor(data){data=structuredClone(data);super({get:()=>({name:data.name}),update:()=>{}},data.id);this.nameData=data.name;for(const k of ['questions','concepts','sources'])this[k]=new Map((data[k]||[]).map(x=>[x.id,x]));this.texts=new Map(data.texts||[]);this.objectives=data.objectives||[];this.folderNames=data.folderNames||{};this.folderTags=data.folderTags||{};this.session=data.session;this.generation=data.generation;this.explanationRequest=data.explanationRequest||null;this.history=data.history||[];this.preferences=data.preferences||{};this.project=data.project||null;this.customTests=data.customTests||[];this.completedRequests=data.completedRequests||[];this.sourceSync=data.sourceSync||null;this.loaded=true;}
 get name(){return this.nameData;}
 index(){if(!this._index)this._index=new GroundedIndex([...this.sources.values()],this.texts);return this._index;}
 materialFor(query,budget,opts={}){const onlySids=this.session?.opts?.sourceIds??null;const g=grounding(this,query,Math.min(budget||10000,10000),{onlySids,...opts});const formatted=formatGrounding(g);this._lastGrounding=provenance(g);return formatted;}
 objectivesForPrompt(){const q=this.questions.get(this.session?.stack?.at(-1)?.qid)||{};return JSON.stringify(relevantObjectives(this,`${q.term||''} ${q.stem||''}`,q).map(o=>({...o,text:o.text.slice(0,350)}))).replace(/</g,'\\u003c');}
 ingestQuestion(raw,opts){const generated=['followup','variant'].includes(opts?.origin);if(generated)validateProvenance(raw,this,this.generation?.grounding||this._lastGrounding);const q=super.ingestQuestion(raw,opts);if(q&&generated){if(raw.sourceId)q.sourceId=raw.sourceId;if(raw.page)q.page=raw.page;q.grounding=this.generation?.grounding||this._lastGrounding;}return q;}

 scheduleSummary(){} saveConcept(){} saveSession(){if(this.session)this.session.updatedAt=Date.now();} clearSession(){this.session=null;} touch(){}
 serialize(){return {id:this.id,name:this.nameData,questions:[...this.questions.values()],concepts:[...this.concepts.values()],sources:[...this.sources.values()],texts:[...this.texts],objectives:this.objectives,folderNames:this.folderNames,folderTags:this.folderTags,session:this.session,generation:this.generation,explanationRequest:this.explanationRequest,history:this.history,preferences:this.preferences,project:this.project,customTests:this.customTests,completedRequests:this.completedRequests,sourceSync:this.sourceSync};}
}
export function createExam(model){
 const exam=new Exam(model,{aiAvailable:()=>true,autoExplain:false,askJSON:async prompt=>{
  prompt+='\nCitation rule: cite exact source names. Include a slide/page number ONLY if explicitly marked in the supplied excerpt; otherwise cite the filename alone. Keep explanations concise. In the same response as every text-choice question, include optionNotes with one grounded explanation for EACH choice (why it is correct or incorrect). These notes are shown by Explain more after submission; never leave them for a later request. If a foundation is unsupported, return outOfScope with a replacement MCQ testing the original concept from a fresh angle, using only the supplied reference and materials: {outOfScope:true,gap:"...",replacement:{term,stem,options,multi,answer,definition,optionNotes,conceptSummary}}. Do not invent a foundation.';
  if(model.session?.opts?.generateExplanations)prompt+='\nThis exam requests explanations prepared with the questions. Include a complete, course-grounded explanation:{body:["..."],sources:["exact source name, page N"]} with every generated or replacement question in this response. It stays hidden until the student submits an answer.';
  if(model.generation?.response){const result=model.generation.response;model.generation=null;return result;}
  if(model.replacement){const result=model.replacement;model.replacement=null;return result;}
  if(!model.generation||model.generation.prompt!==prompt)model.generation={id:crypto.randomUUID(),prompt,sessionId:model.session.id,grounding:model._lastGrounding};
  throw Object.assign(new Error('ChatGPT is preparing your next question.'),{code:'generation_required'});
 }});exam.prefetchNext=()=>{};return exam;
}
export function validateQuestion(raw){
 if(isInteractive(raw)){
  if(!raw.term?.trim())throw new Error('Interactive questions need a concept name.');
  if(raw.type==='order'&&(!raw.items||raw.items.length<3||new Set(raw.items).size!==raw.items.length))throw new Error('Ordering needs at least three unique items.');
  if(raw.type==='match'&&(!raw.pairs||raw.pairs.length<3||new Set(raw.pairs.map(p=>p.left)).size!==raw.pairs.length||new Set(raw.pairs.map(p=>p.right)).size!==raw.pairs.length))throw new Error('Matching needs at least three unique pairs.');
  if(raw.type==='label'&&(!raw.figure?.dataUrl||!raw.targets||raw.targets.length<2||new Set(raw.targets.map(t=>t.answer)).size!==raw.targets.length))throw new Error('Labeling needs an embedded diagram and at least two distinct labels.');
  return raw;
 }
 if(!raw||!Array.isArray(raw.answer)||raw.answer.length===0||raw.answer.some(i=>!Number.isInteger(i)||i<0||i>=raw.options?.length)||new Set(raw.answer).size!==raw.answer.length)throw new Error('Each question needs a valid answer array of zero-based option indexes.');
 const q=cleanQuestion(raw);if(!q||!q.keyed)throw new Error('Each question needs a stem, 2–12 choices, and a correct answer.');return q;
}
export function ingest(model,raw,i=0){
 const opts={origin:raw.origin||'practice',order:i,sourceId:raw.sourceId||null,lecture:raw.lecture||'',objectiveId:raw.objective||raw.objectiveId||null,figure:raw.figure||null};
 const q=isInteractive(raw)?model.ingestInteractive(raw,opts):model.ingestQuestion(raw,opts);
 if(!q)throw new Error('This question could not be imported.');
 q.order=i;q.type=raw.type==='image'?'mcq':raw.type||'mcq';q.image=raw.image||null;q.flagged=!!raw.flagged;q.flagReason=raw.flagReason||'';q.weekId=raw.weekId||null;q.setId=raw.setId||null;q.explanation=raw.explanation||null;
 if(raw.progress)Object.assign(q,raw.progress);
 return q;
}
export async function settle(exam){if(exam.pending)await exam.pending;}
function shuffled(items,key){let h=2166136261;for(const c of key){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}const out=[...items];for(let i=out.length-1;i>0;i--){h^=h<<13;h^=h>>>17;h^=h<<5;const j=(h>>>0)%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;}
function publicQuestion(model,q,depth,reveal,session){
 const type=questionType(q),src=model.sources.get(q.sourceId),objective=model.objective(q.objectiveId);
 const pub={revealed:!!reveal,id:q.id,term:q.term,stem:q.stem,options:q.options||[],multi:q.multi,type,origin:q.origin,lecture:q.lecture,objective:objective||null,source:src?{id:src.id,name:src.name,page:q.page}:null,depth,gap:q.gap||'',flagged:q.flagged,flagReason:q.flagReason||'',figure:q.figure,image:q.image};
 const seed=`${q.id}:${session?.id||''}:${q.attempts||0}`;
 if(q.type==='order'){pub.items=shuffled(q.items,seed);if(pub.items.every((v,i)=>v===q.items[i]))pub.items.reverse();}
 if(q.type==='match'){pub.pairs=q.pairs.map(p=>({left:p.left}));pub.bank=shuffled([...q.pairs.map(p=>p.right),...(q.extras||[])],q.id);}
 if(q.type==='label'){pub.targets=q.targets.map(({answer,...t})=>t);pub.bank=shuffled(q.bank,q.id);}
 if(reveal){Object.assign(pub,{answer:q.answer,definition:q.definition,optionNotes:q.optionNotes,optionMore:q.optionMore||{},explanation:q.explanation});if(isInteractive(q))Object.assign(pub,q.type==='order'?{correctItems:q.items}:q.type==='match'?{pairs:q.pairs}:{targets:q.targets});}
 return pub;
}
export function reviewResults(model,results){return (results||[]).map(r=>{const q=model.questions.get(r.qid);const active=model.session?.phase==='question'&&model.session.stack?.at(-1)?.qid===q?.id;return {...r,question:q?publicQuestion(model,q,r.depth,!active,model.session):null};});}
export function archiveSession(model){const s=model.session;if(!s)return;if(!model.history.some(h=>h.id===s.id)){model.history.unshift({id:s.id,date:s.finishedAt||Date.now(),total:s.total,done:s.done,firstTry:s.firstTry,resolved:s.resolved,unresolved:s.unresolved,results:s.results});model.history=model.history.slice(0,15);}}
export function view(model,revision){
 const s=model.session,q=s?.stack?.length?model.questions.get(s.stack.at(-1).qid):null;
 const feedback=s?.phase==='feedback'&&s.last?.qid===q?.id;
 const concepts=[...model.concepts.values()].map(c=>({id:c.id,name:c.name,status:bucket(c),due:c.due,interval:c.interval,attempts:c.attempts,correct:c.correct,sourceIds:c.sourceIds,prereqOf:c.prereqOf,summary:c.summary}));
 return {courseId:model.id,name:model.name,revision,questionCount:model.rootQuestions().filter(q=>q.keyed).length,
 preferences:model.preferences,project:model.project,customTests:model.customTests,folderNames:model.folderNames,folderTags:model.folderTags,questionIndex:model.rootQuestions().filter(q=>q.keyed).map(q=>({id:q.id,term:q.term,stem:q.stem,type:questionType(q),sourceId:q.sourceId,objectiveId:q.objectiveId,weekId:q.weekId,lecture:q.lecture,setId:q.setId})),hasMaterials:[...model.texts.values()].some(t=>t.trim()),sources:[...model.sources.values()].map(({id,name,weekId,lecture,rank,sourceType,contentHash,createdAt,updatedAt,lastSyncedAt,syncStatus,metadata})=>({id,name,weekId,lecture,rank,sourceType,contentHash,createdAt,updatedAt,lastSyncedAt,syncStatus,metadata})),sourceSync:model.sourceSync,questionImports:model.completedRequests.filter(r=>r.tool==='add_questions').map(r=>({requestId:r.id,addedCount:r.addedCount,completedAt:r.completedAt})),objectives:model.objectives,
 session:s?{id:s.id,phase:s.phase,adaptive:s.opts.adaptive!==false,opts:s.opts,total:s.total,done:s.done,firstTry:s.firstTry,resolved:s.resolved,unresolved:s.unresolved,rootMissed:s.rootMissed,maxDepth:s.maxDepth,streak:s.streak,results:reviewResults(model,s.results),feedback:feedback?{correct:s.last.correct,chosen:s.last.chosen}:null,nextType:s.next?.type,next:s.next?{type:s.next.type,outOfScope:s.next.outOfScope,gap:s.next.gap,ready:!!s.next.qid}:null,masteryNotices:s.masteryNotices||[],stack:s.stack.map(x=>({depth:x.depth,term:model.questions.get(x.qid)?.term})),retrying:!!s.retrying,queueLeft:s.queue.length,deferredCount:s.deferred?.length||0}:null,
 question:q?publicQuestion(model,q,s.stack.at(-1).depth,feedback,s):null,
 generation:model.generation?{id:model.generation.id,sessionId:model.generation.sessionId,prompt:model.generation.prompt,instruction:'Read the latest read_course_state. Generate a grounded question and call provide_question. For unsupported foundations, include a replacement in outOfScope to avoid another round trip; otherwise complete any replacement generation returned by the tool. Keep the new key hidden and wait for student Next.'}:null,
 explanationRequest:model.explanationRequest,history:model.history.map(h=>({...h,results:reviewResults(model,h.results)})),
 progress:{due:[...model.concepts.values()].filter(c=>isDue(c)).length,learning:concepts.filter(c=>c.status==='learning').map(c=>c.name),retained:concepts.filter(c=>c.status==='retained').length,counts:summarize([...model.concepts.values()]).counts,objectives:model.objectives.map(o=>{const cs=objectiveConcepts(model,o.id),retained=cs.filter(c=>bucket(c)==='retained').length;return {id:o.id,total:cs.length,retained,mastered:cs.length>0&&retained===cs.length};}),concepts},
 };
}
export {createSession,isInteractive};
