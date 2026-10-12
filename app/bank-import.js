const term=q=>String(q.term||'').trim()||q.stem.trim().slice(0,48);

// Retain the entire plan until completion. A lost response must retry the same
// receipt, and a later batch failure must not create another course on retry.
export async function importBankFiles({banks,appendCourseId=null,folder=null,attemptRef,call}){
 const signature=JSON.stringify({banks,appendCourseId,folder});
 if(attemptRef.current?.signature!==signature){
  if(!banks.length)throw new Error('No keyed questions with available images were found.');
  if(appendCourseId&&banks.length!==1)throw new Error('Add one bank at a time to this course.');
  if(banks.length>20)throw new Error('Import up to 20 courses at a time.');
  for(const bank of banks){
   if(!bank.questions?.length||bank.questions.length>500)throw new Error(`${bank.name} needs 1–500 questions; split larger banks into smaller courses.`);
   if((bank.sources?.length||0)>30)throw new Error(`${bank.name} has more than 30 sources; split it into smaller banks.`);
   if((bank.objectives?.length||0)>200)throw new Error(`${bank.name} has more than 200 objectives; split it into smaller banks.`);
  }
  if(appendCourseId){const {state}=await call('read_course_state',{courseId:appendCourseId});if((state.storedQuestionCount??state.questionCount)+banks[0].questions.length>500)throw new Error('This import would exceed 500 stored questions. Import it as a separate course.');}
  attemptRef.current={signature,plans:banks.map(bank=>{
   const {skipped,format,version,...payload}=bank;
   const sources=folder?payload.sources.map(({lecture,weekId,...source})=>({...source,...(folder.kind==='week'?{weekId:folder.label}:folder.kind==='lecture'?{lecture:folder.label}:{})})):payload.sources;
   const questions=folder?payload.questions.map(q=>({...q,weekId:folder.kind==='week'?folder.label:null,lecture:folder.kind==='lecture'?folder.label:''})):payload.questions;
   const batches=[];for(let offset=0;offset<questions.length;offset+=200){const chunk=questions.slice(offset,offset+200),terms=new Set(chunk.map(term));batches.push({requestId:crypto.randomUUID(),questions:chunk,sources:offset?[]:sources,objectives:offset?[]:payload.objectives,conceptProgress:(payload.conceptProgress||[]).filter(p=>terms.has(p.term))});}
   return {name:payload.name,courseId:appendCourseId,next:0,batches};
  })};
 }
 const attempt=attemptRef.current;
 try{for(const plan of attempt.plans){while(plan.next<plan.batches.length){
  const batch=plan.batches[plan.next];let result;
  if(!plan.courseId)result=await call('import_questions',{...batch,name:plan.name});
  else{const {state}=await call('read_course_state',{courseId:plan.courseId});result=await call('add_questions',{...batch,courseId:plan.courseId,revision:state.revision});}
  plan.courseId=result.state.courseId;plan.next++;
 }}}catch(e){throw new Error(`${e.message} Select the same JSON file again to retry; completed batches will be kept.`);}
 attemptRef.current=null;
 return {count:banks.reduce((n,b)=>n+b.questions.length,0),skipped:banks.reduce((n,b)=>n+(b.skipped?.length||0),0)};
}
