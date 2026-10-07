import { z } from 'zod';
import { PluginCourse, emptyCourse, validateQuestion, createExam, createSession, settle, view } from './course.js';
const id=z.string().min(1).max(180),revision=z.number().int().min(1);
const question=z.object({term:z.string().max(300).optional(),stem:z.string().min(1).max(12000),options:z.array(z.string().min(1).max(4000)).min(2).max(12),answer:z.array(z.number().int().min(0).max(11)).min(1).max(12),multi:z.boolean().optional(),definition:z.string().max(16000).optional(),optionNotes:z.array(z.string().max(8000)).max(12).optional(),conceptSummary:z.string().max(4000).optional(),gap:z.string().max(2000).optional(),objective:z.string().max(180).optional(),sourceId:id.optional(),page:z.number().int().positive().optional()});
const courseArgs={courseId:id};
const stateArgs={...courseArgs,revision};
export const definitions=[
 {name:'open_test',title:'Adaptive test',description:'Open or resume the Pummy adaptive test interface. Does not start or reset a test. If no courseId is given, shows the course library. Questions appear without answer keys until submitted.',schema:z.object({courseId:id.optional()}),readOnly:true,opener:true},
 {name:'list_courses',title:'List courses',description:'List your imported question banks and saved test progress.',schema:z.object({}),readOnly:true},
 {name:'import_questions',title:'Import question bank',description:'Create a question bank from user-provided questions and course excerpts. Answer indexes are zero-based. Use the same requestId on retries. No existing bank is overwritten. Use only questions the user asked to import or generate.',schema:z.object({requestId:z.string().uuid(),name:z.string().min(1).max(160),questions:z.array(question).min(1).max(200),sources:z.array(z.object({id,name:z.string().min(1).max(300),text:z.string().max(60000),rank:z.number().int().min(1).max(6).default(3)})).max(30).default([])}),readOnly:false},
 {name:'start_test',title:'Start adaptive test',description:'Start a new test or resume an active one. Adaptive mode asks foundation questions after misses and climbs back up. Never restart an active test unless the user requests it. Preserve revision from the latest tool result.',schema:z.object({...stateArgs,size:z.number().int().min(1).max(100).default(20),adaptive:z.boolean().default(true),restart:z.boolean().default(false)}),readOnly:false},
 {name:'submit_answer',title:'Submit selected answer',description:'Submit ONLY the student’s selected answer indexes for the visible question. Never choose or submit an answer for the student. If the result includes generation, generate one question following its prompt and call provide_question without revealing the answer in chat.',schema:z.object({...stateArgs,sessionId:id,questionId:id,choices:z.array(z.number().int().min(0).max(11)).min(1).max(12)}),readOnly:false},
 {name:'next_question',title:'Continue test',description:'Continue from feedback or a checkpoint. If generation is present, complete it with provide_question before continuing. Do not bypass a pending foundation question.',schema:z.object({...stateArgs,sessionId:id}),readOnly:false},
 {name:'provide_question',title:'Prepare foundation or return question',description:'Complete the outstanding generation request with ONE grounded foundation question or a new version requested by generation.prompt. Pass generation.id and latest revision. Answer indexes are zero-based. Never reveal this new question’s answer key to the student. If the prompt permits outOfScope, return outOfScope:true and a gap instead of inventing unsupported material.',schema:z.object({...stateArgs,generationId:id,question:z.union([question,z.object({outOfScope:z.literal(true),gap:z.string().max(2000)})])}),readOnly:false},
 {name:'skip_question',title:'Move on from this concept',description:'Leave the current concept unresolved and continue. Use only when the student explicitly asks to skip or presses Move on.',schema:z.object({...stateArgs,sessionId:id}),readOnly:false},
 {name:'flag_question',title:'Flag question',description:'Flag or unflag the current question for later practice.',schema:z.object({...stateArgs,sessionId:id,questionId:id,flagged:z.boolean()}),readOnly:false},
];
export const outputShape={state:z.record(z.unknown()).optional(),courses:z.array(z.object({id:z.string(),name:z.string(),revision:z.number(),updated_at:z.number()})).optional(),message:z.string().optional()};
export async function executeTool(repo,name,raw){
 const def=definitions.find(t=>t.name===name);if(!def)throw new Error('Unknown tool.');
 const args=def.schema.parse(raw);
 if(name==='list_courses'||(name==='open_test'&&!args.courseId))return {courses:await repo.list()};
 if(name==='import_questions'){
  const courseId=args.requestId;
  const old=await repo.get(courseId);if(old)return {state:view(new PluginCourse(old.data),old.revision),message:'This import was already saved.'};
  const qs=args.questions.map(validateQuestion);
  if(new Set(args.sources.map(s=>s.id)).size!==args.sources.length)throw new Error('Source IDs must be unique.');
  if(args.questions.some(q=>q.sourceId&&!args.sources.some(s=>s.id===q.sourceId)))throw new Error('A question references a missing source.');
  const model=new PluginCourse(emptyCourse(courseId,args.name.trim()));
  for(const src of args.sources){model.sources.set(src.id,{id:src.id,name:src.name,kind:'material',rank:src.rank,createdAt:Date.now()});model.texts.set(src.id,src.text);}
  qs.forEach((q,i)=>model.ingestQuestion(q,{origin:'practice',order:i,sourceId:args.questions[i].sourceId||null}));
  const rev=await repo.save(model.serialize(),0);return {state:view(model,rev),message:`Imported ${qs.length} questions.`};
 }
 const saved=await repo.get(args.courseId);if(!saved)throw new Error('Course not found. Import a question bank first.');
 const model=new PluginCourse(saved.data),exam=createExam(model),s=model.session;
 if(name==='open_test')return {state:view(model,saved.revision)};
 if(name==='submit_answer'&&s?.id===args.sessionId&&s.phase==='feedback'&&s.last?.qid===args.questionId&&JSON.stringify([...s.last.chosen].sort())===JSON.stringify([...args.choices].sort()))return {state:view(model,saved.revision),message:'That answer was already saved.'};
 if(args.revision!==saved.revision)throw Object.assign(new Error('Your test changed. Refresh before continuing.'),{code:'conflict'});
 if(name==='start_test'){
  if(!s||s.phase==='done'||args.restart){
   model.generation=null;
   const questionIds=model.rootQuestions().filter(q=>q.keyed&&q.options?.length>=2&&!q.figure&&!q.image).map(q=>q.id);
   if(!questionIds.length)throw new Error('This bank has no supported text questions.');
   createSession(model,{size:args.size,adaptive:args.adaptive,questionIds});
   await exam.begin();
  }
 }else{
  if(!s)throw new Error('Start a test first.');
  if(args.sessionId&&args.sessionId!==s.id)throw new Error('This test has been replaced. Refresh to continue.');
  if(name==='submit_answer'){
   const q=exam.current()?.q;
   if(s.phase!=='question'||q?.id!==args.questionId)throw new Error('That question is no longer active. Refresh to continue.');
   if(new Set(args.choices).size!==args.choices.length||args.choices.some(i=>i>=q.options.length)||(!q.multi&&args.choices.length!==1))throw new Error('Select a valid answer.');
   exam.submit(args.choices);await settle(exam);
  }else if(name==='provide_question'){
   if(!model.generation||model.generation.id!==args.generationId||model.generation.sessionId!==s.id)throw new Error('This generation request has expired. Refresh to continue.');
   if(!args.question.outOfScope)validateQuestion(args.question);
   else if(s.next?.type!=='deeper')throw new Error('A return or review question needs a valid question, not outOfScope.');
   model.generation.response=args.question;
   if(s.phase==='loading')await exam.advanceRoot();
   else if(s.phase==='feedback'&&s.next&&!s.next.qid){exam.retryGeneration();await settle(exam);}
   else throw new Error('No next question is pending.');
  }else if(name==='next_question'){
   if(model.generation)return {state:view(model,saved.revision),message:'Prepare the requested question with provide_question before continuing.'};
   if(s.phase==='checkpoint')await exam.continueCheckpoint();
   else if(s.phase==='feedback')await exam.proceed();
   else throw new Error('Submit your answer before continuing.');
   await settle(exam);
  }else if(name==='skip_question'){
   if(!['question','feedback','loading'].includes(s.phase))throw new Error('No question to skip.');
   model.generation=null;
   if(s.stack.length&&s.rootQid){s.rootMissed=true;exam.finalizeRoot(false);await exam.advanceRoot();}
   else {if(s.queue.length)s.queue.shift();s.total=Math.max(s.done,s.total-1);await exam.advanceRoot();}
   await settle(exam);
  }else if(name==='flag_question'){
   if(exam.current()?.q.id!==args.questionId)throw new Error('Flag the current question.');
   exam.flag(args.questionId,'Flagged during ChatGPT practice',args.flagged);
  }
 }
 const rev=await repo.save(model.serialize(),saved.revision);
 return {state:view(model,rev)};
}
