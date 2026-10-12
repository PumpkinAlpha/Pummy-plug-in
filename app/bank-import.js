const term=q=>String(q.term||'').trim()||q.stem.trim().slice(0,48);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const journalVersion=1;
const payloadBytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function batchesFor(questions,sources,objectives,conceptProgress,name){
 const batches=[];let offset=0;
 while(offset<questions.length){let end=Math.min(offset+200,questions.length),batch;const requestId=crypto.randomUUID();
  while(true){const chunk=questions.slice(offset,end),terms=new Set(chunk.map(term));batch={requestId,questions:chunk,sources:offset?[]:sources,objectives:offset?[]:objectives,conceptProgress:(conceptProgress||[]).filter(p=>terms.has(p.term))};
   if(payloadBytes({...batch,name,courseId:'0'.repeat(180),revision:Number.MAX_SAFE_INTEGER})<=1350000)break;
   if(end-offset===1)throw Error(`${name} contains a question or reference payload too large for one import. Compress question images or split the references across courses; nothing was imported.`);
   end=offset+Math.max(1,Math.floor((end-offset)/2));
  }
  batches.push(batch);offset=end;
 }
 return batches;
}
function recoverIds(raw,signature,plans){
 try{const saved=JSON.parse(raw);if(saved?.version!==journalVersion||saved.signature!==signature||Date.now()-saved.updatedAt>86400000||saved.plans?.length!==plans.length)return;
  if(!saved.plans.every((p,i)=>p.ids?.length===plans[i].batches.length&&p.ids.every(uuid)&&Number.isInteger(p.next)&&p.next>=0&&p.next<=p.ids.length&&(p.courseId===null? p.next===0:uuid(p.courseId))&&(!plans[i].courseId||plans[i].courseId===p.courseId)))return;
  for(let i=0;i<plans.length;i++){const p=saved.plans[i];plans[i].batches.forEach((b,j)=>b.requestId=p.ids[j]);plans[i].next=p.next;plans[i].courseId=p.courseId;}
 }catch{}
}

// Retain the entire plan until completion. A lost response must retry the same
// receipt, and a later batch failure must not create another course on retry.
export async function importBankFiles({banks,appendCourseId=null,folder=null,attemptRef,call,storage=null,recoveryScope=''}){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({banks,appendCourseId,folder,recoveryScope})));
 const signature=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 const journalKey=recoveryScope?'pummy-bank-import:'+recoveryScope:null;
 const persist=attempt=>{if(!journalKey||!storage)return false;try{storage.setItem(journalKey,JSON.stringify({version:journalVersion,signature,updatedAt:Date.now(),plans:attempt.plans.map(p=>({courseId:p.courseId,next:p.next,ids:p.batches.map(b=>b.requestId)}))}));return true;}catch{return false;}};
 if(attemptRef.current?.signature!==signature){
  if(!banks.length)throw new Error('No keyed questions with available images were found.');
  if(appendCourseId&&banks.length!==1)throw new Error('Add one bank at a time to this course.');
  if(banks.length>20)throw new Error('Import up to 20 courses at a time.');
  for(const bank of banks){
   if(!bank.questions?.length||bank.questions.length>500)throw new Error(`${bank.name} needs 1–500 questions; split larger banks into smaller courses.`);
   if((bank.sources?.length||0)>30)throw new Error(`${bank.name} has more than 30 sources; split it into smaller banks.`);
   if((bank.objectives?.length||0)>200)throw new Error(`${bank.name} has more than 200 objectives; split it into smaller banks.`);
  }
  attemptRef.current={signature,plans:banks.map(bank=>{
   const {skipped,format,version,...payload}=bank;
   const sources=folder?payload.sources.map(({lecture,weekId,...source})=>({...source,...(folder.kind==='week'?{weekId:folder.label}:folder.kind==='lecture'?{lecture:folder.label}:{})})):payload.sources;
   const questions=folder?payload.questions.map(q=>({...q,weekId:folder.kind==='week'?folder.label:null,lecture:folder.kind==='lecture'?folder.label:''})):payload.questions;
   const batches=batchesFor(questions,sources,payload.objectives,payload.conceptProgress,payload.name);
   return {name:payload.name,courseId:appendCourseId,next:0,batches};
  })};
  if(journalKey&&storage)try{recoverIds(storage.getItem(journalKey),signature,attemptRef.current.plans);}catch{}
  // Count only pending batches. Confirmed writes may already fill the course after a reload.
  if(appendCourseId&&!attemptRef.current.plans[0].next){const {state}=await call('read_course_state',{courseId:appendCourseId});const firstId=attemptRef.current.plans[0].batches[0].requestId;const uncertain=state.questionImports?.some(r=>r.requestId===firstId);if(!uncertain&&(state.storedQuestionCount??state.questionCount)+banks[0].questions.length>500){attemptRef.current=null;throw new Error('This import would exceed 500 stored questions. Import it as a separate course.');}}
 }
 const attempt=attemptRef.current;
 let durable=persist(attempt);
 try{for(const plan of attempt.plans){while(plan.next<plan.batches.length){
  const batch=plan.batches[plan.next];let result;
  if(!plan.courseId)result=await call('import_questions',{...batch,name:plan.name});
  else{const {state}=await call('read_course_state',{courseId:plan.courseId});result=await call('add_questions',{...batch,courseId:plan.courseId,revision:state.revision});}
  plan.courseId=result.state.courseId;plan.next++;durable=persist(attempt)&&durable;
 }}}catch(e){throw new Error(`${e.message} Select the same JSON file again to retry; completed batches will be kept.${durable?' Recovery is available after reloading for 24 hours.':' Keep this panel open until the import finishes.'}`);}
 attemptRef.current=null;
 if(journalKey&&storage)try{storage.removeItem(journalKey);}catch{}
 return {count:banks.reduce((n,b)=>n+b.questions.length,0),skipped:banks.reduce((n,b)=>n+(b.skipped?.length||0),0)};
}
