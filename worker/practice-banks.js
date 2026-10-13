import {getBankAvailability,unavailableQuestions} from '../lib/bank-availability.js';
import {verifiedObjectives} from '../lib/source-objectives.js';
import {bankObjectiveCoverage} from '../lib/bank-coverage.js';
// Archive copies live outside the course snapshot. Editing them cannot alter
// scheduler state, active answer keys, or the questions recorded in past exams.
const conflict=()=>Object.assign(new Error('This question bank changed in another window. Reopen it before saving.'),{code:'conflict'});
export function bankInsert(repo,courseId,bank,condition='1',bindings=[]){
 const data=JSON.stringify(bank);
 if(new TextEncoder().encode(data).length>1800000)throw new Error('This archived bank is too large. Split it into smaller question batches.');
 return repo.db.prepare(`INSERT OR IGNORE INTO practice_banks(user_id,course_id,id,name,data,revision,created_at,updated_at) SELECT ?,?,?,?,?,1,?,? WHERE ${condition}`).bind(repo.userId,courseId,bank.id,bank.name,data,bank.createdAt,bank.createdAt,...bindings);
}
function withSource(q,data){const source=data.sources?.find(s=>s.id===q.sourceId);return {...q,lecture:q.lecture||source?.lecture||'',weekId:q.weekId||source?.weekId||null,sourceName:source?.name||q.sourceName||null};}
export function captureBanks(repo,data,previous,writeId){
 const oldIds=new Set((previous?.questions||[]).map(q=>q.id)),fresh=(data.questions||[]).filter(q=>!oldIds.has(q.id)),byId=new Map(fresh.map(q=>[q.id,q])),banks=[];
 const receipts=(data.completedRequests||[]).filter(r=>r.tool==='add_questions'&&r.questionIds?.some(id=>byId.has(id)));
 for(const receipt of receipts){const questions=receipt.questionIds.map(id=>byId.get(id)).filter(Boolean);questions.forEach(q=>byId.delete(q.id));if(questions.length)banks.push({id:'batch:'+receipt.id,name:receipt.bankName||questions[0].setId||'Practice question bank',...(receipt.generationId?{groupId:'prompt:'+receipt.generationId}:{}),sourceIds:receipt.bankSourceIds||[],createdAt:receipt.completedAt||Date.now(),questions});}
 if(byId.size)banks.push({id:previous?'generated:'+writeId:'import:'+data.id,name:previous?'Adaptive practice questions':'Imported question bank',createdAt:Date.now(),questions:[...byId.values()]});
 const condition="EXISTS(SELECT 1 FROM courses WHERE user_id=? AND id=? AND json_extract(data,'$._sourceStorage.writeId')=?)";
 return banks.flatMap(bank=>[bankInsert(repo,data.id,{...bank,questions:bank.questions.map(q=>withSource(q,data))},condition,[repo.userId,data.id,writeId]),repo.db.prepare(`UPDATE practice_banks SET data=json_set(data,'$.linkedQuestionIds',json(?)) WHERE user_id=? AND course_id=? AND id=? AND ${condition}`).bind(JSON.stringify(bank.questions.map(q=>q.id)),repo.userId,data.id,bank.id,repo.userId,data.id,writeId)]);
}
function legacyBanks(data,stored){
 const covered=new Set(stored.flatMap(b=>[...b.questions.map(q=>q.id),...(b.linkedQuestionIds||[])])),byId=new Map((data.questions||[]).filter(q=>q.keyed&&!covered.has(q.id)).map(q=>[q.id,q])),banks=[];
 const add=(id,name,questions,createdAt=0)=>{if(!questions.length)return;questions.forEach(q=>byId.delete(q.id));banks.push({id,name,createdAt,revision:0,recovered:true,questions:questions.map(q=>withSource(q,data))});};
 for(const r of data.completedRequests||[])if(r.tool==='add_questions'){add('batch:'+r.id,r.bankName||'Saved practice question bank',(r.questionIds||[]).map(id=>byId.get(id)).filter(Boolean),r.completedAt);const bank=banks.at(-1);if(bank?.id==='batch:'+r.id){if(r.generationId)bank.groupId='prompt:'+r.generationId;bank.sourceIds=r.bankSourceIds||[];}}
 const groups=new Map();for(const q of byId.values()){const key=q.setId||q.sourceId||q.lecture||q.weekId||'course';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(q);}
 for(const [key,questions] of groups)add('recovered:'+key,questions[0].setId||data.sources?.find(s=>s.id===key)?.name||'Recovered course questions',questions);
 return banks;
}
export async function bankEntries(repo,courseId,data){
 const {results}=await repo.db.prepare('SELECT data,revision,updated_at FROM practice_banks WHERE user_id=? AND course_id=? ORDER BY created_at DESC,id').bind(repo.userId,courseId).all();
 const stored=results.map(r=>({...JSON.parse(r.data),revision:r.revision,updatedAt:r.updated_at})),known=new Set(stored.map(b=>b.id));
 // Older slide practice may never have been appended to the course bank.
 // Recover those completed responses as editable archive copies as well.
 const rows=await repo.db.prepare("SELECT r.data,p.metadata FROM tutor_requests r LEFT JOIN tutor_presentations p ON p.user_id=r.user_id AND p.course_id=r.course_id AND p.id=r.presentation_id WHERE r.user_id=? AND r.course_id=? AND json_extract(r.data,'$.status')='complete' AND json_array_length(r.data,'$.questions')>0 ORDER BY r.updated_at DESC").bind(repo.userId,courseId).all();
 for(const row of rows.results){const r=JSON.parse(row.data),p=JSON.parse(row.metadata||'{}'),id='batch:'+r.appendId;if(known.has(id))continue;const source=data.sources?.find(s=>s.id===p.sourceId),linkedQuestionIds=data.completedRequests?.find(item=>item.id===r.appendId)?.questionIds||[];
  stored.push({id,name:(p.name||'Slide practice')+' · slide '+r.page,createdAt:r.completedAt||r.createdAt||0,revision:0,recovered:true,linkedQuestionIds,questions:r.questions.map((q,i)=>({...q,id:r.appendId+':'+i,lecture:source?.lecture||(p.folder?.kind==='lecture'?p.folder.label:''),weekId:source?.weekId||(p.folder?.kind==='week'?p.folder.label:null),sourceName:p.name||null}))});known.add(id);
 }
 return [...stored,...legacyBanks(data,stored)];
}
function groupBanks(entries){
 const groups=new Map(),result=[];
 for(const bank of [...entries].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id))){
  if(!bank.groupId){result.push({...bank,_members:[bank]});continue;}
  if(!groups.has(bank.groupId)){const group={id:'group:'+bank.groupId,name:bank.groupName||bank.name,groupId:bank.groupId,createdAt:bank.createdAt,revision:0,questions:[],linkedQuestionIds:[],sourceIds:[],_members:[]};groups.set(bank.groupId,group);result.push(group);}
  const group=groups.get(bank.groupId);if(bank.groupName)group.name=bank.groupName;group._members.push(bank);group.revision+=bank.revision+1;group.createdAt=Math.min(group.createdAt||0,bank.createdAt||0);group.updatedAt=Math.max(group.updatedAt||0,bank.updatedAt||0);group.questions.push(...bank.questions);group.linkedQuestionIds.push(...(bank.linkedQuestionIds||[]));group.sourceIds.push(...(bank.sourceIds||[]));group.recovered=group.recovered||bank.recovered;
 }
 for(const bank of result){if(bank.groupId)bank.questions.sort((a,b)=>(a.order??Number.MAX_SAFE_INTEGER)-(b.order??Number.MAX_SAFE_INTEGER));bank.memberCount=bank._members.length;bank.sourceIds=[...new Set(bank.sourceIds||[])];if(bank._members.every(b=>b.deletedAt))bank.deletedAt=Math.max(...bank._members.map(b=>b.deletedAt));}
 return result.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)||a.id.localeCompare(b.id));
}
const publicBank=({_members,...bank})=>bank;
export async function allBanks(repo,courseId,data){return groupBanks((await bankEntries(repo,courseId,data)).filter(b=>!b.deletedAt&&!b.purgedAt));}

// Check every member before writing any of them. The failing SQL expression
// aborts the entire D1 batch if another editor changed a member in the meantime.
async function writeBanks(repo,saved,members,next,invalidate=false){
 const expected=JSON.stringify(members.map(({id,revision})=>({id,revision})));
 const guard=repo.db.prepare(`SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM json_each(?) e LEFT JOIN practice_banks b ON b.user_id=? AND b.course_id=? AND b.id=json_extract(e.value,'$.id')
  WHERE (json_extract(e.value,'$.revision')=0 AND b.id IS NOT NULL) OR
   (json_extract(e.value,'$.revision')>0 AND (b.id IS NULL OR b.revision!=json_extract(e.value,'$.revision')))
 ) AND EXISTS(SELECT 1 FROM courses WHERE user_id=? AND id=? AND revision=?) THEN 1 ELSE json('practice-bank-conflict') END AS ready`).bind(expected,repo.userId,saved.data.id,repo.userId,saved.data.id,saved.revision);
 const writes=next.map(bank=>{
  const {revision,updatedAt,_members,memberCount,...data}=bank,json=JSON.stringify(data);
  if(new TextEncoder().encode(json).length>1800000)throw new Error('This archived bank is too large to save.');
  if(revision===0)return bankInsert(repo,saved.data.id,data);
  if(data.purgedAt)return repo.db.prepare('UPDATE practice_banks SET name=?,data=?,revision=revision+1,updated_at=? WHERE user_id=? AND course_id=? AND id=?').bind(data.name,json,Date.now(),repo.userId,saved.data.id,data.id);
  // Preserve links added atomically by a concurrent course append.
  return repo.db.prepare("UPDATE practice_banks SET name=?,data=json_set(?,'$.linkedQuestionIds',json(COALESCE(json_extract(data,'$.linkedQuestionIds'),json_extract(?,'$.linkedQuestionIds'),'[]'))),revision=revision+1,updated_at=? WHERE user_id=? AND course_id=? AND id=?").bind(data.name,json,json,Date.now(),repo.userId,saved.data.id,data.id);
 });
 if(invalidate)writes.push(repo.db.prepare('UPDATE courses SET revision=revision+1,updated_at=? WHERE user_id=? AND id=? AND revision=?').bind(Date.now(),repo.userId,saved.data.id,saved.revision));
 try{await repo.db.batch([guard,...writes]);}catch(e){if(/practice-bank-conflict|malformed JSON|invalid JSON/i.test(e.message))throw conflict();throw e;}
}
export async function executeBanks(repo,saved,name,args,validateQuestion,renderState){
 const changed=async message=>({state:renderState(await repo.get(args.courseId)),courses:await repo.list(),message});
 const entries=await bankEntries(repo,args.courseId,saved.data),banks=groupBanks(entries.filter(b=>!b.deletedAt&&!b.purgedAt));
 const objectives=verifiedObjectives({objectives:saved.data.objectives||[],sources:new Map((saved.data.sources||[]).map(s=>[s.id,s])),texts:new Map(saved.data.texts||[])});
 const summary=bank=>{const {questions,...b}=publicBank(bank);return {...b,count:questions.length,coverage:bankObjectiveCoverage(questions,objectives,saved.data.sources,bank.sourceIds),questionIndex:questions.map(({id,sourceId,objectiveId,objective,lecture,weekId})=>({id,sourceId,objectiveId:objectiveId||objective,lecture,weekId}))};};
 if(name==='list_practice_banks')return {banks:banks.map(summary),deletedBanks:groupBanks(entries.filter(b=>b.deletedAt&&!b.purgedAt)).map(summary)};
 if(name==='combine_practice_banks'){
  const id='group:combined:'+args.requestId,existing=banks.find(b=>b.id===id);if(existing)return {bank:publicBank(existing),message:'Question banks combined.'};
  if(new Set(args.banks.map(b=>b.id)).size!==args.banks.length)throw new Error('Choose different question banks.');
  const chosen=args.banks.map(ref=>{const b=banks.find(b=>b.id===ref.id);if(!b||b.revision!==ref.revision)throw conflict();return b;});
  const members=chosen.flatMap(b=>b._members);await writeBanks(repo,saved,members,members.map(b=>({...b,groupId:'combined:'+args.requestId,groupName:args.name})));
  return {bank:publicBank((await allBanks(repo,args.courseId,saved.data)).find(b=>b.id===id)),message:'Question banks combined. All questions and exam progress preserved.'};
 }
 if(name==='purge_practice_bank'&&entries.some(b=>b.purgedAt&&(b.id===args.bankId||b.purgedBankId===args.bankId)))return changed('Question bank permanently deleted.');
 const pool=['restore_practice_bank','purge_practice_bank'].includes(name)?groupBanks(entries.filter(b=>b.deletedAt&&!b.purgedAt)):banks;
 const bank=pool.find(b=>b.id===args.bankId);if(!bank)throw new Error('Question bank not found.');
 if(name==='read_practice_bank')return {bank:publicBank(bank)};
 if(bank.revision!==args.bankRevision)throw conflict();
 if(name==='purge_practice_bank'){
  // Keep only identifiers that prevent old course/tutor copies being recovered
  // into the archive again. No question text, answer keys or diagrams remain.
  await writeBanks(repo,saved,bank._members,bank._members.map(b=>({id:b.id,name:'Deleted bank',purgedBankId:bank.id,revision:b.revision,createdAt:b.createdAt,deletedAt:b.deletedAt,purgedAt:Date.now(),questions:[],linkedQuestionIds:[...new Set([...b.questions.map(q=>q.id),...(b.linkedQuestionIds||[])])]})),true);
  return changed('Question bank permanently deleted.');
 }
 if(name==='delete_practice_bank'||name==='restore_practice_bank'){
  const remove=name==='delete_practice_bank';
  if(!remove){const deleted=new Set(getBankAvailability(saved.data));for(const member of bank._members)for(const id of [...member.questions.map(q=>q.id),...(member.linkedQuestionIds||[])])deleted.delete(id);const blocked=unavailableQuestions(saved.data.questions||[],deleted);if((saved.data.questions||[]).filter(q=>!blocked.has(q.id)).length>500)throw new Error('Restoring this bank would exceed 500 active questions. Delete another bank before restoring it.');}
  await writeBanks(repo,saved,bank._members,bank._members.map(b=>({...b,deletedAt:remove?Date.now():null})),true);
  return changed(remove?'Question bank moved to Recently deleted. Its questions are excluded from new tests; saved exams and results are kept.':'Question bank restored.');
 }
 const edits=args.questions||[{questionId:args.questionId,question:args.question}],byId=new Map();
 for(const edit of edits){
  if(byId.has(edit.questionId))throw new Error('Each question may only be edited once.');
  const original=bank.questions.find(q=>q.id===edit.questionId);if(!original)throw new Error('Question not found in this bank.');
  validateQuestion(edit.question);let question={...edit.question};
  const hasObjective=Object.hasOwn(question,'objectiveId')||Object.hasOwn(question,'objective'),objectiveId=question.objectiveId??question.objective;
  if(hasObjective)question={...question,objectiveId:objectiveId||null,objective:undefined};
  if(objectiveId&&objectiveId!==(original.objectiveId||original.objective)&&!objectives.some(o=>o.id===objectiveId))throw new Error('Choose a verified course objective.');
  if(JSON.stringify(original.options)!==JSON.stringify(question.options)||JSON.stringify(original.answer)!==JSON.stringify(question.answer))question.optionNotes=[];
  if(question.type==='label')question.bank=[...question.targets.map(t=>t.answer),...(question.distractors||[])];
  byId.set(edit.questionId,question);
 }
 const renamed=args.name.trim()!==bank.name;
 const updates=bank._members.filter(b=>renamed||b.questions.some(q=>byId.has(q.id))).map(b=>({...b,...(bank.groupId?{groupName:args.name.trim()}:{name:args.name.trim()}),questions:b.questions.map(q=>byId.has(q.id)?{...q,...byId.get(q.id),id:q.id}:q)}));
 await writeBanks(repo,saved,bank._members,updates);
 return {bank:publicBank((await allBanks(repo,args.courseId,saved.data)).find(b=>b.id===bank.id)),message:'Question-bank copy saved. Exam answers and progress preserved.'};
}
