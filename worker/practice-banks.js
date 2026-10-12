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
 for(const receipt of receipts){const questions=receipt.questionIds.map(id=>byId.get(id)).filter(Boolean);questions.forEach(q=>byId.delete(q.id));if(questions.length)banks.push({id:'batch:'+receipt.id,name:questions[0].setId||'Practice question bank',createdAt:receipt.completedAt||Date.now(),questions});}
 if(byId.size)banks.push({id:previous?'generated:'+writeId:'import:'+data.id,name:previous?'Adaptive practice questions':'Imported question bank',createdAt:Date.now(),questions:[...byId.values()]});
 const condition="EXISTS(SELECT 1 FROM courses WHERE user_id=? AND id=? AND json_extract(data,'$._sourceStorage.writeId')=?)";
 return banks.flatMap(bank=>[bankInsert(repo,data.id,{...bank,questions:bank.questions.map(q=>withSource(q,data))},condition,[repo.userId,data.id,writeId]),repo.db.prepare(`UPDATE practice_banks SET data=json_set(data,'$.linkedQuestionIds',json(?)) WHERE user_id=? AND course_id=? AND id=? AND ${condition}`).bind(JSON.stringify(bank.questions.map(q=>q.id)),repo.userId,data.id,bank.id,repo.userId,data.id,writeId)]);
}
function legacyBanks(data,stored){
 const covered=new Set(stored.flatMap(b=>[...b.questions.map(q=>q.id),...(b.linkedQuestionIds||[])])),byId=new Map((data.questions||[]).filter(q=>q.keyed&&!covered.has(q.id)).map(q=>[q.id,q])),banks=[];
 const add=(id,name,questions,createdAt=0)=>{if(!questions.length)return;questions.forEach(q=>byId.delete(q.id));banks.push({id,name,createdAt,revision:0,recovered:true,questions:questions.map(q=>withSource(q,data))});};
 for(const r of data.completedRequests||[])if(r.tool==='add_questions')add('batch:'+r.id,'Saved practice question bank',(r.questionIds||[]).map(id=>byId.get(id)).filter(Boolean),r.completedAt);
 const groups=new Map();for(const q of byId.values()){const key=q.setId||q.sourceId||q.lecture||q.weekId||'course';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(q);}
 for(const [key,questions] of groups)add('recovered:'+key,questions[0].setId||data.sources?.find(s=>s.id===key)?.name||'Recovered course questions',questions);
 return banks;
}
export async function allBanks(repo,courseId,data){
 const {results}=await repo.db.prepare('SELECT data,revision,updated_at FROM practice_banks WHERE user_id=? AND course_id=? ORDER BY created_at DESC,id').bind(repo.userId,courseId).all();
 const stored=results.map(r=>({...JSON.parse(r.data),revision:r.revision,updatedAt:r.updated_at})),known=new Set(stored.map(b=>b.id));
 // Older slide practice may never have been appended to the course bank.
 // Recover those completed responses as editable archive copies as well.
 const rows=await repo.db.prepare("SELECT r.data,p.metadata FROM tutor_requests r LEFT JOIN tutor_presentations p ON p.user_id=r.user_id AND p.course_id=r.course_id AND p.id=r.presentation_id WHERE r.user_id=? AND r.course_id=? AND json_extract(r.data,'$.status')='complete' AND json_array_length(r.data,'$.questions')>0 ORDER BY r.updated_at DESC").bind(repo.userId,courseId).all();
 for(const row of rows.results){const r=JSON.parse(row.data),p=JSON.parse(row.metadata||'{}'),id='batch:'+r.appendId;if(known.has(id))continue;const source=data.sources?.find(s=>s.id===p.sourceId),linkedQuestionIds=data.completedRequests?.find(item=>item.id===r.appendId)?.questionIds||[];
  stored.push({id,name:(p.name||'Slide practice')+' · slide '+r.page,createdAt:r.completedAt||r.createdAt,revision:0,recovered:true,linkedQuestionIds,questions:r.questions.map((q,i)=>({...q,id:r.appendId+':'+i,lecture:source?.lecture||(p.folder?.kind==='lecture'?p.folder.label:''),weekId:source?.weekId||(p.folder?.kind==='week'?p.folder.label:null),sourceName:p.name||null}))});known.add(id);
 }
 return [...stored,...legacyBanks(data,stored)];
}
export async function executeBanks(repo,saved,name,args,validateQuestion){
 const banks=await allBanks(repo,args.courseId,saved.data);
 if(name==='list_practice_banks')return {banks:banks.map(({questions,...b})=>({...b,count:questions.length,questionIndex:questions.map(({id,sourceId,lecture,weekId})=>({id,sourceId,lecture,weekId}))}))};
 const bank=banks.find(b=>b.id===args.bankId);if(!bank)throw new Error('Question bank not found.');
 if(name==='read_practice_bank')return {bank};
 if(bank.revision!==args.bankRevision)throw conflict();
 const index=bank.questions.findIndex(q=>q.id===args.questionId);if(index<0)throw new Error('Question not found in this bank.');
 validateQuestion(args.question);
 const original=bank.questions[index];
 if(JSON.stringify(original.options)!==JSON.stringify(args.question.options)||JSON.stringify(original.answer)!==JSON.stringify(args.question.answer))args.question.optionNotes=[];
 if(args.question.type==='label')args.question.bank=[...args.question.targets.map(t=>t.answer),...(args.question.distractors||[])];
 const next={...bank,name:args.name.trim(),questions:bank.questions.map((q,i)=>i===index?{...q,...args.question,id:q.id}:q)};
 delete next.revision;delete next.updatedAt;
 const json=JSON.stringify(next);if(new TextEncoder().encode(json).length>1800000)throw new Error('This question bank is too large to save.');
 let result;
 if(bank.revision===0){result=await bankInsert(repo,args.courseId,next,'EXISTS(SELECT 1 FROM courses WHERE user_id=? AND id=?)',[repo.userId,args.courseId]).run();}
 else result=await repo.db.prepare('UPDATE practice_banks SET name=?,data=?,revision=revision+1,updated_at=? WHERE user_id=? AND course_id=? AND id=? AND revision=?').bind(next.name,json,Date.now(),repo.userId,args.courseId,bank.id,bank.revision).run();
 if(result.meta.changes!==1)throw conflict();
 return {bank:{...next,revision:bank.revision+1,updatedAt:Date.now()},message:'Question-bank copy saved. Exam answers and progress preserved.'};
}
