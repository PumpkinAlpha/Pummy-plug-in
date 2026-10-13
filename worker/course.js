import {getBankAvailability,unavailableQuestions,availableConcepts} from '../lib/bank-availability.js';
import {bankExplanationSummary} from './bank-explanations.js';
import {verifiedObjectives,sourceExplanation} from '../lib/source-objectives.js';
import {explanationGuidance,hasFullExplanation} from '../lib/explanation-depth.js';
import {GroundedIndex,grounding,formatGrounding,relevantObjectives,provenance,validateProvenance} from './grounding.js';
import { CourseModel, Exam, createSession as createEngineSession, cleanQuestion, isDue, bucket, summarize, isInteractive, questionType, objectiveConcepts } from '../lib/pummy-core.mjs';
export function emptyCourse(id,name){return {id,name,questions:[],concepts:[],sources:[],texts:[],objectives:[],folderNames:{},folderTags:{},session:null,generation:null,explanationRequest:null,history:[],preferences:{}};}
const answerPrefix=/^\s*\(?([A-L](?:\s*(?:,|and|&)\s*[A-L])*)\s*[.):]\s*/;
function suppliedQuestion(raw){
 const definition=String(raw.definition||'').trim(),match=definition.match(answerPrefix);
 // The original engine can infer a key from the explanation. Plugin calls already
 // supply an explicit key, so remove its display prefix before engine normalization.
 return {...raw,multi:raw.type==='multi'||!!raw.multi,definition:match?definition.slice(match[0].length):definition};
}
function keyConflict(raw){
 const match=String(raw.definition||'').trim().match(answerPrefix);if(!match)return '';
 const labels=match[1].match(/[A-L]/g),inferred=labels.map(letter=>letter.charCodeAt(0)-65).sort((a,b)=>a-b),answer=[...(raw.answer||[])].sort((a,b)=>a-b);
 return JSON.stringify(inferred)===JSON.stringify(answer)?'':'Supplied answer key conflicts with the explanation label. The supplied key was preserved; review the original source.';
}
export class PluginCourse extends CourseModel {
 constructor(data){const deleted=getBankAvailability(data);data=structuredClone(data);super({get:()=>({name:data.name}),update:()=>{}},data.id);this.nameData=data.name;for(const k of ['questions','concepts','sources'])this[k]=new Map((data[k]||[]).map(x=>[x.id,x]));this.texts=new Map(data.texts||[]);this.objectives=data.objectives||[];this.folderNames=data.folderNames||{};this.folderTags=data.folderTags||{};this.session=data.session;this.generation=data.generation;this.explanationRequest=data.explanationRequest||null;this.bankExplanationRequest=data.bankExplanationRequest||null;this.history=data.history||[];this.preferences=data.preferences||{};this.project=data.project||null;this.customTests=data.customTests||[];this.completedRequests=data.completedRequests||[];this.sourceSync=data.sourceSync||null;this.loaded=true;this.deletedBankQuestionIds=deleted;}
 isAvailableQuestion(q){if(!q)return false;const seen=new Set();while(q&&!seen.has(q.id)){if(this.deletedBankQuestionIds.has(q.id))return false;seen.add(q.id);q=this.questions.get(q.parentId);}return true;}
 rootQuestions(){return super.rootQuestions().filter(q=>this.isAvailableQuestion(q));}
 activeQuestions(){const blocked=unavailableQuestions([...this.questions.values()],this.deletedBankQuestionIds);return [...this.questions.values()].filter(q=>!blocked.has(q.id));}
 activeBankExplanationRequest(){const r=this.bankExplanationRequest;if(!r)return null;const questionIds=r.questionIds.filter(id=>this.isAvailableQuestion(this.questions.get(id)));return {...r,questionIds,completed:r.completed.filter(id=>questionIds.includes(id))};}
 activeConcepts(){return availableConcepts([...this.questions.values()],[...this.concepts.values()],this.deletedBankQuestionIds);}
 get name(){return this.nameData;}
 objective(id){const o=id?this.objectives.find(o=>o.id===id):null;return o?verifiedObjectives({objectives:[o],sources:this.sources,texts:this.texts})[0]||null:null;}
 index(){if(!this._index)this._index=new GroundedIndex([...this.sources.values()],this.texts);return this._index;}
 materialFor(query,budget,opts={}){const onlySids=this.session?.opts?.sourceIds??null;const g=grounding(this,query,Math.min(budget||10000,10000),{onlySids,...opts});const formatted=formatGrounding(g);this._lastGrounding=provenance(g);return formatted;}
 objectivesForPrompt(){const q=this.questions.get(this.session?.stack?.at(-1)?.qid)||{};return JSON.stringify(relevantObjectives(this,`${q.term||''} ${q.stem||''}`,q).map(o=>({...o,text:o.text}))).replace(/</g,'\\u003c');}
 ingestQuestion(raw,opts){raw={...raw,explanation:sourceExplanation(raw.explanation,this)};const generated=['followup','variant'].includes(opts?.origin);if(generated)validateProvenance(raw,this,this.generation?.grounding||this._lastGrounding);const q=super.ingestQuestion(suppliedQuestion(raw),opts);if(q){const conflict=keyConflict(raw);if(conflict){q.flagged=true;q.flagReason=conflict;}}if(q&&generated){if(raw.sourceId)q.sourceId=raw.sourceId;if(raw.page)q.page=raw.page;q.grounding=this.generation?.grounding||this._lastGrounding;}return q;}

 scheduleSummary(){} saveConcept(){} saveSession(){if(this.session)this.session.updatedAt=Date.now();} clearSession(){this.session=null;} touch(){}
 serialize(){return {id:this.id,name:this.nameData,questions:[...this.questions.values()],concepts:[...this.concepts.values()],sources:[...this.sources.values()],texts:[...this.texts],objectives:this.objectives,folderNames:this.folderNames,folderTags:this.folderTags,session:this.session,generation:this.generation,explanationRequest:this.explanationRequest,bankExplanationRequest:this.bankExplanationRequest,history:this.history,preferences:this.preferences,project:this.project,customTests:this.customTests,completedRequests:this.completedRequests,sourceSync:this.sourceSync};}
}
export function createSession(model,options){
 if(options.size!=='all'){const session=createEngineSession(model,options);session.opts.explanationDepth=options.explanationDepth||'comprehensive';session.opts.examMode=options.examMode||'custom';return session;}
 const eligible=model.rootQuestions().filter(q=>q.keyed&&(isInteractive(q)||q.answer?.length)&&(options.questionIds==null||options.questionIds.includes(q.id))&&(options.sourceIds==null||options.sourceIds.includes(q.sourceId))&&(options.types==null||options.types.includes(questionType(q))));
 const session=createEngineSession(model,{...options,size:Math.max(1,eligible.length+model.concepts.size)}),byId=new Map(eligible.map(q=>[q.id,q])),used=new Set(),queue=[];
 const add=id=>{if(byId.has(id)&&!used.has(id)){queue.push({k:'q',id});used.add(id);}};
 // Keep the scheduler's priority order, but All examines every saved question
 // once. A due concept's review slot uses an eligible bank question, rather than
 // adding a generated variant alongside the same bank question.
 for(const item of session.queue){
  if(item.k==='q')add(item.id);
  else {const candidates=eligible.filter(q=>q.conceptId===item.id&&!used.has(q.id)).sort((a,b)=>Number(a.attempts>0)-Number(b.attempts>0)||(a.lastSeen||0)-(b.lastSeen||0)||(a.order||0)-(b.order||0));if(candidates.length)add(candidates[0].id);}
 }
 eligible.forEach(q=>add(q.id));
 session.queue=queue;session.total=queue.length;session.phase=queue.length?'loading':'done';session.opts.size=queue.length;session.opts.sizeMode='all';session.opts.explanationDepth=options.explanationDepth||'comprehensive';session.opts.examMode=options.examMode||'custom';
 model.saveSession();return session;
}
export function createExam(model){
 const exam=new Exam(model,{aiAvailable:()=>true,autoExplain:false,askJSON:async prompt=>{
  prompt+='\nCitation rule: cite exact source names. Include a slide/page number ONLY if explicitly marked in the supplied excerpt; otherwise cite the filename alone. Keep optionNotes concise; full explanations follow the selected depth. In the same response as every text-choice question, include optionNotes with one grounded explanation for EACH choice (why it is correct or incorrect). These notes are shown by Explain more after submission; never leave them for a later request. If a foundation is unsupported, return outOfScope with a replacement MCQ testing the original concept from a fresh angle, using only the supplied reference and materials: {outOfScope:true,gap:"...",replacement:{term,stem,options,multi,answer,definition,optionNotes,conceptSummary}}. Do not invent a foundation.';
  if(model.session?.opts?.generateExplanations)prompt+=explanationGuidance(model.session?.opts?.explanationDepth||model.preferences.explanationDepth)+'\nThis exam requests explanations prepared with the questions. Include a complete, course-grounded explanation:{body:["..."],sources:["exact source name, page N"]} with every generated or replacement question in this response. It stays hidden until the student submits an answer.';
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
 if(raw.type==='image'&&!raw.figure?.dataUrl&&!raw.image)throw new Error('Image questions need an embedded image or figure.');
 if(!raw||!Array.isArray(raw.answer)||raw.answer.length===0||raw.answer.some(i=>!Number.isInteger(i)||i<0||i>=raw.options?.length)||new Set(raw.answer).size!==raw.answer.length)throw new Error('Each question needs a valid answer array of zero-based option indexes.');
 const q=cleanQuestion(suppliedQuestion(raw));if(!q||!q.keyed)throw new Error('Each question needs a stem, 2–12 choices, and a correct answer.');return q;
}
export function ingest(model,raw,i=0){
 const opts={origin:raw.origin||'practice',order:i,sourceId:raw.sourceId||null,lecture:raw.lecture||'',objectiveId:raw.objective||raw.objectiveId||null,figure:raw.figure||(raw.image?{dataUrl:raw.image,file:'Attached diagram',unit:'page',page:raw.page||1,marks:[]}:null)};
 const q=isInteractive(raw)?model.ingestInteractive(raw,opts):model.ingestQuestion(raw,opts);
 if(!q)throw new Error('This question could not be imported.');
 q.order=i;if(raw.page)q.page=raw.page;q.type=raw.type==='image'?'mcq':raw.type||'mcq';q.image=raw.figure?raw.image||null:null;q.flagged=q.flagged||!!raw.flagged;q.flagReason=[raw.flagReason,q.flagReason].filter(Boolean).join('\n');q.weekId=raw.weekId||null;q.setId=raw.setId||null;q.explanation=raw.explanation||null;
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
export function isStrugglingQuestion(model,q){
 const status=bucket(model.concepts.get(q.conceptId));
 return status!=='retained'&&(status==='learning'||q.lastResult==='wrong');
}
export function view(model,revision){
 const verified=verifiedObjectives(model),roots=model.rootQuestions().filter(q=>q.keyed),rootIds=new Set(roots.map(q=>q.id));
 const s=model.session,q=s?.stack?.length?model.questions.get(s.stack.at(-1).qid):null;
 const feedback=s?.phase==='feedback'&&s.last?.qid===q?.id;
 const activeConcepts=model.activeConcepts(),activeQuestions=new Map(model.activeQuestions().map(q=>[q.id,q])),progressModel={...model,questions:activeQuestions,concepts:new Map(activeConcepts.map(c=>[c.id,c]))};
 const concepts=activeConcepts.map(c=>({id:c.id,name:c.name,status:bucket(c),due:c.due,interval:c.interval,attempts:c.attempts,correct:c.correct,sourceIds:c.sourceIds,prereqOf:c.prereqOf,summary:c.summary}));
 return {courseId:model.id,name:model.name,revision,questionCount:roots.length,storedQuestionCount:activeQuestions.size,
 preferences:model.preferences,project:model.project,customTests:model.customTests.map(t=>({...t,questionIds:t.questionIds.filter(id=>rootIds.has(id))})).filter(t=>t.questionIds.length),folderNames:model.folderNames,folderTags:model.folderTags,questionIndex:roots.map(q=>({id:q.id,term:q.term,stem:q.stem,type:questionType(q),origin:q.origin,hasExplanation:hasFullExplanation(q),struggling:isStrugglingQuestion(model,q),sourceId:q.sourceId,objectiveId:q.objectiveId,weekId:q.weekId,lecture:q.lecture,setId:q.setId})),hasMaterials:[...model.sources.values()].some(s=>!s.deletedAt&&(model.texts.get(s.id)||'').trim()),purgedSourceIds:[...model.sources.values()].filter(s=>s.purgedAt).map(s=>s.id),deletedSources:[...model.sources.values()].filter(s=>s.deletedAt&&(!s.purgedAt||s.purgePending)).map(({id,name,deletedAt})=>({id,name,deletedAt})),sources:[...model.sources.values()].filter(s=>!s.deletedAt).map(({id,name,weekId,lecture,rank,sourceType,contentHash,createdAt,updatedAt,lastSyncedAt,syncStatus,metadata,originalFile,visualPdf})=>({id,name,weekId,lecture,rank,sourceType,contentHash,createdAt,updatedAt,lastSyncedAt,syncStatus,metadata,originalFile,hasPresentation:!!visualPdf||['pdf','ppt','pptx'].includes(originalFile?.kind)})),sourceSync:model.sourceSync,questionImports:model.completedRequests.filter(r=>r.tool==='add_questions').map(r=>({requestId:r.id,addedCount:r.addedCount,questionIds:r.questionIds,completedAt:r.completedAt})),objectives:verified,unverifiedObjectiveCount:model.objectives.length-verified.length,
 session:s?{id:s.id,phase:s.phase,adaptive:s.opts.adaptive!==false,opts:s.opts,total:s.total,done:s.done,firstTry:s.firstTry,resolved:s.resolved,unresolved:s.unresolved,rootMissed:s.rootMissed,maxDepth:s.maxDepth,streak:s.streak,results:reviewResults(model,s.results),feedback:feedback?{correct:s.last.correct,chosen:s.last.chosen}:null,nextType:s.next?.type,next:s.next?{type:s.next.type,outOfScope:s.next.outOfScope,gap:s.next.gap,ready:!!s.next.qid}:null,masteryNotices:s.masteryNotices||[],stack:s.stack.map(x=>({depth:x.depth,term:model.questions.get(x.qid)?.term})),retrying:!!s.retrying,queueLeft:s.queue.length,deferredCount:s.deferred?.length||0}:null,
 question:q?publicQuestion(model,q,s.stack.at(-1).depth,feedback,s):null,
 generation:model.generation?{id:model.generation.id,sessionId:model.generation.sessionId,prompt:model.generation.prompt,instruction:'Read the latest read_course_state. Generate a grounded question and call provide_question. For unsupported foundations, include a replacement in outOfScope to avoid another round trip; otherwise complete any replacement generation returned by the tool. Keep the new key hidden and wait for student Next.'}:null,
 explanationRequest:model.explanationRequest,bankExplanationRequest:bankExplanationSummary(model.activeBankExplanationRequest()),history:model.history.map(h=>({...h,results:reviewResults(model,h.results)})),
 progress:{due:activeConcepts.filter(c=>isDue(c)).length,learning:concepts.filter(c=>c.status==='learning').map(c=>c.name),retained:concepts.filter(c=>c.status==='retained').length,counts:summarize(activeConcepts).counts,objectives:verified.map(o=>{const cs=objectiveConcepts(progressModel,o.id),retained=cs.filter(c=>bucket(c)==='retained').length;return {id:o.id,total:cs.length,retained,mastered:cs.length>0&&retained===cs.length};}),concepts},
 };
}
export {isInteractive};
