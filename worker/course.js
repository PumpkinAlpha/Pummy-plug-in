import { CourseModel, Exam, createSession, cleanQuestion, isDue, bucket } from '../lib/pummy-core.mjs';
export function emptyCourse(id,name){return {id,name,questions:[],concepts:[],sources:[],texts:[],objectives:[],session:null,generation:null};}
export class PluginCourse extends CourseModel {
  constructor(data){super({get:()=>({name:data.name}),update:()=>{}},data.id);this.nameData=data.name;this.questions=new Map(data.questions.map(q=>[q.id,q]));this.concepts=new Map(data.concepts.map(c=>[c.id,c]));this.sources=new Map(data.sources.map(s=>[s.id,s]));this.texts=new Map(data.texts);this.objectives=data.objectives;this.session=data.session;this.generation=data.generation;this.loaded=true;}
  scheduleSummary(){} saveConcept(){} saveSession(){if(this.session)this.session.updatedAt=Date.now();} clearSession(){this.session=null;} touch(){}
  serialize(){return {id:this.id,name:this.nameData,questions:[...this.questions.values()],concepts:[...this.concepts.values()],sources:[...this.sources.values()],texts:[...this.texts],objectives:this.objectives,session:this.session,generation:this.generation};}
}
export function createExam(model){
 const exam=new Exam(model,{aiAvailable:()=>true,autoExplain:false,askJSON:async prompt=>{
   if(model.generation?.response){const result=model.generation.response;model.generation=null;return result;}
   if(!model.generation||model.generation.prompt!==prompt)model.generation={id:crypto.randomUUID(),prompt,sessionId:model.session.id};
   throw Object.assign(new Error('ChatGPT is preparing your next question.'),{code:'generation_required'});
 }});
 exam.prefetchNext=()=>{};
 return exam;
}
export function validateQuestion(raw){
 if(!raw|| !Array.isArray(raw.answer)||raw.answer.length===0||raw.answer.some(i=>!Number.isInteger(i)||i<0||i>=raw.options?.length)||new Set(raw.answer).size!==raw.answer.length)throw new Error('Each question needs a valid answer array of zero-based option indexes.');
 if(raw.type&&!['mcq','multi'].includes(raw.type))throw new Error('This plugin currently supports single-choice and select-all questions.');
 const q=cleanQuestion(raw);if(!q||!q.keyed)throw new Error('Each question needs a stem, 2–12 choices, and a correct answer.');
 if(q.stem.length>12000||q.options.some(x=>x.length>4000)||q.definition.length>16000)throw new Error('This question exceeds the text limit.');
 return q;
}
export async function settle(exam){if(exam.pending)await exam.pending;}
export function view(model,revision){
 const s=model.session;const q=s?.stack?.length?model.questions.get(s.stack.at(-1).qid):null;
 const feedback=s?.phase==='feedback'&&s.last?.qid===q?.id;
 const question=q?{id:q.id,term:q.term,stem:q.stem,options:q.options,multi:q.multi,depth:s.stack.at(-1).depth,gap:q.gap||'',flagged:q.flagged,...(feedback?{answer:q.answer,definition:q.definition,optionNotes:q.optionNotes,explanation:q.explanation}: {})}:null;
 return {courseId:model.id,name:model.name,revision,questionCount:model.rootQuestions().filter(q=>q.keyed&&q.options?.length>=2&&!q.figure&&!q.image).length,
   session:s?{id:s.id,phase:s.phase,adaptive:s.opts.adaptive!==false,total:s.total,done:s.done,firstTry:s.firstTry,resolved:s.resolved,unresolved:s.unresolved,rootMissed:s.rootMissed,maxDepth:s.maxDepth,streak:s.streak,results:s.results,feedback:feedback?{correct:s.last.correct,chosen:s.last.chosen}:null,nextType:s.next?.type}:null,
   question,generation:model.generation?{id:model.generation.id,sessionId:model.generation.sessionId,prompt:model.generation.prompt,instruction:'Generate ONE grounded question following the prompt, then call provide_question with courseId, generationId, revision and question. Do not answer for the student or reveal the new answer key in chat.'}:null,
   progress:{due:[...model.concepts.values()].filter(c=>isDue(c)).length,learning:[...model.concepts.values()].filter(c=>bucket(c)==='learning').map(c=>c.name),retained:[...model.concepts.values()].filter(c=>bucket(c)==='retained').length},
 };
}
export { createSession };
