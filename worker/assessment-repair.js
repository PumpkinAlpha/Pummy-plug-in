import {z} from 'zod/v4';
import {calibrateDifficulty,difficultyScore,representativeSample,duplicateQuestion,formatOf,formatDistribution} from '../lib/assessment-quality.js';
import {subtopicReport,evidenceCurrent} from '../lib/subtopic-coverage.js';
import {grounding} from './grounding.js';
import {EMPHASIS_RULES} from '../lib/professor-emphasis.js';
const id=z.string().min(1).max(180),message=z.string().trim().min(12).max(4000),revision=z.number().int().positive();
const state={courseId:id,revision},rubric={reasoning:z.number().int().min(1).max(4),integration:z.number().int().min(0).max(3),application:z.number().int().min(0).max(3),discrimination:z.number().int().min(0).max(2)};
export const cognitiveSchema=z.object({difficulty:z.object({...rubric,steps:z.array(message).min(2).max(4),relationships:z.array(message).min(2).max(6),rationale:message,score:z.number().optional(),rubric:z.string().optional()}),review:message,target:z.number().optional()});
const emphasis=z.object({kind:z.enum(['highlight','circle','colored_text']),text:z.string().max(4000),origin:z.literal('original').default('original'),region:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),w:z.number().positive().max(1),h:z.number().positive().max(1)}).optional()});
export const evidenceSchema=z.object({sourceId:id,page:z.number().int().positive().optional(),quote:message,contentHash:z.string().optional(),visualId:id.optional()});
export const assessmentSchema=z.object({runId:id,subtopicIds:z.array(id).min(1).max(20),focusCueIds:z.array(id).max(30).optional(),evidence:z.array(evidenceSchema).min(1).max(20),difficulty:z.object({...rubric,steps:z.array(message).min(2).max(4),relationships:z.array(message).min(2).max(6),rationale:message,score:z.number().optional(),rubric:z.string().optional()}),formatReason:message,review:z.record(z.string(),z.unknown()).nullable().optional()});
export {REPAIR_RULES} from '../lib/repair-instructions.js';
import {REPAIR_RULES} from '../lib/repair-instructions.js';
export function repairDefinitions(question,image){return [
 {name:'begin_bank_repair',title:'Plan verified bank repair',schema:z.object({...state,requestId:z.string().uuid(),sourceIds:z.array(id).min(1).max(30),bankName:z.string().min(1).max(300),topics:z.array(z.object({id,objectiveId:id.nullish(),detail:message,suitableTypes:z.array(z.enum(['mcq','multi','image','label','match','order'])).min(1).max(6)})).min(1).max(300),mode:z.enum(['coverage','gaps','custom']).default('coverage'),count:z.number().int().min(1).max(500).optional()}),readOnly:false},
 {name:'calibrate_bank_difficulty',title:'Calibrate cognitive difficulty baseline',schema:z.object({...state,runId:id,ratings:z.array(z.object({questionId:id,...rubric,rationale:message})).max(12)}),readOnly:false},
 {name:'read_bank_repair',title:'Read gap-repair work and review candidates',schema:z.object({courseId:id,runId:id.optional(),candidateId:id.optional()}),readOnly:true},
 {name:'map_bank_subtopic',title:'Verify targeted source evidence',schema:z.object({...state,runId:id,subtopicId:id,status:z.enum(['supported','source_missing','source_unverified','technical_blocked']),evidence:z.array(evidenceSchema).max(20).default([]),focusCueIds:z.array(id).max(30).default([]),inspectedSourceIds:z.array(id).min(1).max(30),reason:message,correctiveAction:message}),readOnly:false},
 {name:'stage_bank_questions',title:'Validate and stage advanced questions',schema:z.object({...state,runId:id,requestId:z.string().uuid(),questions:z.array(question).min(1).max(20)}),readOnly:false},
 {name:'review_bank_question',title:'Independently review and save a candidate',schema:z.object({...state,runId:id,candidateId:id,accepted:z.boolean(),...rubric,requiredSubtopicIds:z.array(id).max(20),checks:z.object({sourceSupport:z.boolean(),accuracy:z.boolean(),unambiguous:z.boolean(),reasoning:z.boolean(),distractors:z.boolean(),format:z.boolean(),explanations:z.boolean()}),critique:message,correctiveAction:message}),readOnly:false},
 {name:'finish_bank_repair',title:'Finish verified bank and report remaining gaps',schema:z.object({...state,runId:id}),readOnly:false},
 {name:'save_source_visual',title:'Save an original source page for visual assessment',schema:z.object({...state,sourceId:id,page:z.number().int().positive(),assetId:z.string().uuid(),dataUrl:image,emphasis:z.array(emphasis).max(200).default([])}),readOnly:false,appOnly:true},
 {name:'record_professor_emphasis',title:'Record focus cues seen in the original professor visual',schema:z.object({...state,sourceId:id,visualId:id,cues:z.array(emphasis).min(1).max(100),reason:message}),readOnly:false},
 {name:'read_source_visual',title:'Read original source diagram',schema:z.object({courseId:id,sourceId:id,page:z.number().int().positive()}),readOnly:true}
 ].map(d=>({...d,description:d.title+'. '+(d.appOnly?'Rendered from the selected original in the app.':'Preserves existing questions and progress. Follow read_bank_repair nextAction; unsupported source details remain visible.')}));}
const activeRun=(model,id)=>{const r=model.bankRepairs.find(r=>r.id===id);if(!r)throw Error('Repair run not found.');return r;};
const evidence=(entries,model,run)=>entries.map(e=>{if(!run.sourceIds.includes(e.sourceId))throw Error('Evidence must come from a selected source.');const next={...e,contentHash:model.sources.get(e.sourceId)?.contentHash};if(!evidenceCurrent(next,model))throw Error('Evidence quote/page/visual is not verified in the current stored source. Read that source again.');return next;});
function validateCandidate(q,model,run,validateQuestion){
 validateQuestion(q);const a=q.assessment;if(!a||a.runId!==run.id)throw Error('Generated questions require assessment metadata for this repair run.');
 if(!run.calibration)throw Error('Calibrate the baseline before generating.');
 const d=a.difficulty,score=difficultyScore(d);
 if(d.reasoning<2||d.integration<1||d.application<2||d.steps.length<2||new Set(d.steps).size!==d.steps.length||d.relationships.length<2||score<run.calibration.target)throw Error('The candidate is below the 2× cognitive-design target. Add meaningful supported reasoning and integration.');
 const topics=a.subtopicIds.map(id=>run.topics.find(t=>t.id===id));if(topics.some(t=>!t||t.status!=='supported'||t.failures>=3))throw Error('Choose supported subtopics with attempts remaining.');
 if(topics.some(t=>!t.suitableTypes.includes(formatOf(q))))throw Error('The question format does not fit the mapped subtopic.');
 if(topics.some(t=>t.objectiveId&&t.objectiveId!==(q.objectiveId||q.objective)))throw Error('Use the subtopic’s verified objective ID. Split questions across unrelated objectives.');
 a.focusCueIds=[...new Set(topics.flatMap(t=>t.focusCueIds||[]))];a.evidence=evidence(a.evidence,model,run);if(!a.evidence.some(e=>e.sourceId===q.sourceId&&(q.page==null||e.page===q.page)))throw Error('Question provenance must match its evidence.');
 if([...model.rootQuestions(),...run.candidates.filter(c=>c.question&&c.status!=='rejected').map(c=>c.question)].some(old=>duplicateQuestion(q,old)))throw Error('Duplicate or near-duplicate question. Test a new application of the missing subtopic.');
 const type=formatOf(q);
 if(['mcq','multi','image'].includes(type)){
  if(q.optionNotes?.length!==q.options.length||q.optionNotes.some(n=>!n.trim())||new Set(q.options.map(v=>v.trim().toLowerCase())).size!==q.options.length)throw Error('Explain every unique choice.');
  if((q.multi||q.type==='multi')&&(!/select|choose.*(?:all|more than one)|multiple/i.test(q.stem)||q.answer.length<2))throw Error('Multiple-select must explicitly instruct selecting multiple answers and have at least two correct choices.');
 }else if(q.explanation?.items?.length!==(type==='match'?q.pairs.length:type==='order'?q.items.length-1:q.targets.length))throw Error('Explain every matching pair, ordering transition or diagram target in explanation.items.');
 if(!q.explanation?.body?.length)throw Error('Generated assessments need a full grounded explanation.');
 if(type==='image'||type==='label'){
  const v=model.sourceVisuals.find(v=>v.id===q.visualId&&v.sourceId===q.sourceId&&v.page===q.page&&v.contentHash===model.sources.get(q.sourceId)?.contentHash);
  if(!v)throw Error('Visual assessments require a verified original source visual ID.');
 }
 return {...q,origin:'generated',assessment:{...a,difficulty:{...d,score,rubric:run.calibration.rubric},review:null}};
}
export async function executeRepair(repo,model,saved,name,args,{view,validateQuestion,ingest}){
 if(!name.includes('bank_repair')&&!['calibrate_bank_difficulty','map_bank_subtopic','stage_bank_questions','review_bank_question','save_source_visual','read_source_visual','record_professor_emphasis'].includes(name))return null;
 if(name==='read_source_visual'){
  const source=model.sources.get(args.sourceId);if(!source||source.deletedAt)throw Error('Source not found.');const v=model.sourceVisuals.find(v=>v.sourceId===source.id&&v.page===args.page&&v.contentHash===source.contentHash);
  if(!v)return {context:{status:source.originalFile||source.visualPdf?'technical_blocked':'source_missing',sourceId:source.id,page:args.page,reason:'This source page has not yet been rendered for the model. Open bank generation in Pummy to prepare its original diagrams; do not infer coordinates from extracted text.'}};
  const row=await repo.db.prepare('SELECT data_url FROM source_visuals WHERE user_id=? AND course_id=? AND id=?').bind(repo.userId,model.id,v.id).first();
  return row?{context:{...v,status:'verified_original',rules:'Inspect this original before generating labels. Coordinates are normalized to this exact image.'},visual:{dataUrl:row.data_url}}:{context:{status:'technical_blocked',reason:'The saved visual bytes are unavailable.'}};
 }
 if(name==='read_bank_repair')return readRepair(model,activeRun(model,args.runId||model.bankRepairs.at(-1)?.id),args.candidateId);
 if(args.revision!==saved.revision)throw Object.assign(Error('Your course changed. Read the latest revision and retry.'),{code:'conflict'});
 if(name==='record_professor_emphasis'){
  const v=model.sourceVisuals.find(v=>v.id===args.visualId&&v.sourceId===args.sourceId&&v.contentHash===model.sources.get(args.sourceId)?.contentHash);if(!v)throw Error('Inspect a current original professor source visual first.');
  v.emphasis=[...(v.emphasis||[]),...args.cues.map((c,i)=>({...c,id:crypto.randomUUID(),verification:'visual_review',reason:args.reason}))];
 }else if(name==='save_source_visual'){
  const s=model.sources.get(args.sourceId);if(!s||s.deletedAt||s.originalFile?.id!==args.assetId)throw Error('Render the selected source’s actual original asset.');
  if(args.page>(s.metadata?.pageCount||1000))throw Error('Invalid source page.');
  const key=new TextEncoder().encode(`${s.id}:${args.page}:${s.contentHash||s.updatedAt}`),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',key))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const id='visual:'+hash,v={id,sourceId:s.id,page:args.page,contentHash:s.contentHash,assetId:args.assetId,emphasis:args.emphasis.map((c,i)=>({...c,id:hash.slice(0,24)+':'+i,verification:'original_file_formatting'}))};
  await repo.db.prepare('INSERT OR REPLACE INTO source_visuals(user_id,course_id,id,data_url) VALUES(?,?,?,?)').bind(repo.userId,model.id,id,args.dataUrl).run();
  model.sourceVisuals=[...model.sourceVisuals.filter(old=>old.sourceId!==s.id||old.page!==args.page),v];
 }else if(name==='begin_bank_repair'){
  const old=model.bankRepairs.find(r=>r.id===args.requestId);if(old)return readRepair(model,old);
  if(args.sourceIds.some(id=>!model.sources.has(id)||model.sources.get(id).deletedAt))throw Error('Select active sources.');
  if(new Set(args.topics.map(t=>t.id)).size!==args.topics.length)throw Error('Subtopic IDs must be unique.');
  if(args.topics.some(t=>t.objectiveId&&!model.objective(t.objectiveId)))throw Error('Use verified objective IDs only.');
  const relevant=model.objectives.filter(o=>model.objective(o.id)&&(args.sourceIds.includes(o.sourceId)||args.sourceIds.some(id=>model.sources.get(id)?.lecture&&model.sources.get(id).lecture===o.lecture)));
  if(args.mode==='custom'&&!args.count)throw Error('Custom mode requires its requested question count.');
  if(args.mode==='coverage'&&relevant.some(o=>!args.topics.some(t=>t.objectiveId===o.id)))throw Error('Full coverage plans must decompose every relevant verified objective.');
  if(model.bankRepairs.filter(r=>!r.finishedAt).length>=3)throw Error('Finish an existing repair before starting another.');
  model.bankRepairs.push({id:args.requestId,bankName:args.bankName,sourceIds:args.sourceIds,mode:args.mode,count:args.count,topics:args.topics.map(t=>({...t,status:'pending',attempts:0})),sampleIds:representativeSample(model.rootQuestions().filter(q=>!q.sourceId||args.sourceIds.includes(q.sourceId))).map(q=>q.id),candidates:[],batches:[],createdAt:Date.now()});
 }else{
  const run=activeRun(model,args.runId);if(run.finishedAt){if(name==='finish_bank_repair')return {state:view(model,saved.revision),...readRepair(model,run)};throw Error('This repair is finished. Start a new audit to change its plan.');}
  if(name==='calibrate_bank_difficulty'){if(run.candidates.length)throw Error('The baseline is frozen after generation begins.');run.calibration=calibrateDifficulty(run.sampleIds.map(id=>model.questions.get(id)).filter(Boolean),args.ratings);}
  if(name==='map_bank_subtopic'){
   const t=run.topics.find(t=>t.id===args.subtopicId);if(!t)throw Error('Subtopic not found.');
   if(args.inspectedSourceIds.some(id=>!run.sourceIds.includes(id)))throw Error('Report inspected sources from this run.');
   if(args.status!=='supported'&&run.sourceIds.some(id=>!args.inspectedSourceIds.includes(id)))throw Error('Inspect every selected source before declaring unsupported material.');
   if(args.status==='supported'&&!args.evidence.length)throw Error('Supported subtopics need precise verified evidence.');
   const cues=model.sourceVisuals.filter(v=>run.sourceIds.includes(v.sourceId)&&v.contentHash===model.sources.get(v.sourceId)?.contentHash).flatMap(v=>v.emphasis||[]);
   if(args.focusCueIds.some(id=>!cues.some(c=>c.id===id)))throw Error('Professor focus must refer to a recorded original-file cue.');
   Object.assign(t,{status:args.status,evidence:evidence(args.evidence,model,run),focusCueIds:args.focusCueIds,inspectedSourceIds:args.inspectedSourceIds,reason:args.reason,correctiveAction:args.correctiveAction});
  }
  if(name==='stage_bank_questions'){
   if(run.batches.includes(args.requestId))return readRepair(model,run);
   if(model.activeQuestions().length+run.candidates.filter(c=>c.status==='pending').length+args.questions.length>500)throw Error('Course capacity reached. Preserve existing questions; report remaining subtopics as technically blocked.');
   const initial=run.candidates.length;let rejected=null;
   try{for(const raw of args.questions){
     const q=validateCandidate(structuredClone(raw),model,run,validateQuestion);
     if(q.visualId){const row=await repo.db.prepare('SELECT data_url FROM source_visuals WHERE user_id=? AND course_id=? AND id=?').bind(repo.userId,model.id,q.visualId).first();if(!row||row.data_url!==(q.figure?.dataUrl||q.image))throw Error('Use the exact saved source visual bytes.');}
     run.candidates.push({id:crypto.randomUUID(),question:q,status:'pending'});
   }}catch(e){rejected=e;run.candidates.splice(initial);}
   const touched=new Set(args.questions.flatMap(q=>q.assessment?.subtopicIds||[]));
   for(const id of touched){const t=run.topics.find(t=>t.id===id);if(!t)continue;t.attempts++;
    if(rejected){t.failures=(t.failures||0)+1;t.reason=rejected.message;t.correctiveAction='Retrieve current source evidence, correct the reported validation defect and generate a distinct supported candidate.';if(t.failures>=3)t.status='technical_blocked';}
   }
   if(rejected)run.lastDiagnostic={reason:rejected.message,correctiveAction:'Correct this defect before retrying; three consecutive failures block the subtopic.',requestId:args.requestId};
   run.batches.push(args.requestId);
  }
  if(name==='review_bank_question'){
   const c=run.candidates.find(c=>c.id===args.candidateId);if(!c)throw Error('Candidate not found.');if(c.status!=='pending')return readRepair(model,run);
   const a=c.question.assessment,score=difficultyScore(args);
   if(args.accepted&&(!Object.values(args.checks).every(Boolean)||args.reasoning<2||args.integration<1||args.application<2||score<run.calibration.target||a.subtopicIds.some(id=>!args.requiredSubtopicIds.includes(id))))throw Error('Independent review failed a required quality or actual-subtopic-use check. Reject with corrective action.');
   if(args.accepted){
    // Revalidate all live evidence and deduplication immediately before persistence.
    for(const e of a.evidence)if(!evidenceCurrent(e,model))throw Error('Source changed after staging; reject and retrieve current evidence.');
    if(model.rootQuestions().some(q=>duplicateQuestion(q,c.question)))throw Error('This candidate duplicates a question saved since staging.');
    const review={accepted:true,checks:args.checks,critique:args.critique,score,reviewedAt:Date.now()};
    const q=ingest(model,{...c.question,assessment:{...a,review}},model.questions.size);c.questionId=q.id;c.status='saved';
    model.completedRequests.push({id:c.id,tool:'add_questions',questionIds:[q.id],addedCount:1,generationId:run.id,bankName:run.bankName,bankSourceIds:run.sourceIds,completedAt:Date.now()});
    // Keep compact review history, not a second copy of each embedded diagram.
    for(const id of a.subtopicIds)run.topics.find(t=>t.id===id).failures=0;
    c.review=review;delete c.question;
   }else {c.status='rejected';c.critique=args.critique;c.correctiveAction=args.correctiveAction;for(const id of a.subtopicIds){const t=run.topics.find(t=>t.id===id);t.failures=(t.failures||0)+1;t.reason=args.critique;t.correctiveAction=args.correctiveAction;if(t.failures>=3)t.status='technical_blocked';}delete c.question;}
  }
  if(name==='finish_bank_repair'){
   const report=subtopicReport(model,run);if(run.candidates.some(c=>c.status==='pending'))throw Error('Review every staged candidate before finishing.');
   if(!report.terminal)throw Error('Supported gaps remain. Follow nextAction or classify each exact blocker with inspected sources.');
   const qs=model.rootQuestions().filter(q=>q.assessment?.runId===run.id);
   const suitable=new Set(run.topics.filter(t=>t.status==='supported').flatMap(t=>t.suitableTypes));
   const used=new Set(qs.map(formatOf));
   if(qs.length>=20&&suitable.size>1&&used.size===1)throw Error('This sufficiently large bank uses only one assessment format despite suitable alternatives. Add valid alternative formats before finishing.');
   if(run.mode==='custom'&&qs.length<(run.count||0)&&report.complete)throw Error('Custom question count is not reached. Stage additional distinct supported questions or record the exact limitation.');
   run.finishedAt=Date.now();run.finalReport=report;
   model.completedRequests.push({id:run.id,tool:'add_questions',addedCount:qs.length,questionIds:qs.map(q=>q.id),generationId:run.id,bankName:run.bankName,bankSourceIds:run.sourceIds,completedAt:Date.now()});
  }
 }
 const rev=await repo.save(model.serialize(),saved.revision,saved.data);
 const run=model.bankRepairs.find(r=>r.id===(args.runId||args.requestId));return {state:view(model,rev),...(run?readRepair(model,run):{})};
}
function readRepair(model,run,candidateId){
 const report=subtopicReport(model,run),pending=run.candidates.find(c=>c.status==='pending');let topic=report.topics.slice().sort((a,b)=>(b.focusCueIds?.length||0)-(a.focusCueIds?.length||0)).find(t=>!['assessed','source_missing','source_unverified','technical_blocked'].includes(t.status));
 const qs=model.rootQuestions().filter(q=>q.assessment?.runId===run.id),distribution=formatDistribution(qs,model.sourceVisuals.some(v=>run.sourceIds.includes(v.sourceId)));
 if(!topic&&run.mode==='custom'&&qs.length<(run.count||0))topic=run.topics.find(t=>t.status==='supported'&&(t.failures||0)<3);
 const suitable=new Set(run.topics.filter(t=>t.status==='supported').flatMap(t=>t.suitableTypes)),used=new Set(qs.map(formatOf));
 if(!topic&&qs.length>=20&&suitable.size>1&&used.size===1)topic=run.topics.find(t=>t.status==='supported'&&t.suitableTypes.some(type=>!used.has(type)));
 const nextAction=run.finishedAt?'finished':!run.calibration?'calibrate_bank_difficulty':pending?'review_bank_question':topic?.status==='pending'?'map_bank_subtopic':topic?'stage_bank_questions':'finish_bank_repair';
 const formatChoices=topic?.suitableTypes||[],recommendedFormat=formatChoices.slice().sort((a,b)=>((distribution.counts[a]||0)/Math.max(1,distribution.total)-(distribution.targets[a==='label'?'image':a]||.2))-((distribution.counts[b]||0)/Math.max(1,distribution.total)-(distribution.targets[b==='label'?'image':b]||.2)))[0];
 return {context:{runId:run.id,bankName:run.bankName,report,calibration:run.calibration||null,baselineSample:run.sampleIds.map(id=>model.questions.get(id)).filter(Boolean).map(({id,stem,options,type,multi})=>({id,stem,options,type,multi})),lastDiagnostic:run.lastDiagnostic||null,distribution,recommendedFormat,professorFocus:model.sourceVisuals.filter(v=>run.sourceIds.includes(v.sourceId)).flatMap(v=>(v.emphasis||[]).map(c=>({...c,sourceId:v.sourceId,page:v.page,visualId:v.id}))),nextAction,nextTopic:topic||null,candidate:candidateId?run.candidates.find(c=>c.id===candidateId):pending,candidateIds:run.candidates.filter(c=>c.status==='pending').map(c=>c.id),evidence:topic?grounding(model,topic.detail,10000,{onlySids:run.sourceIds,question:{objectiveId:topic.objectiveId}}):null,rules:REPAIR_RULES+EMPHASIS_RULES}};
}
