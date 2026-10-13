// Archive status controls availability; course question records still serve
// existing exams and recorded results. This overlay is never serialized back
// into the course snapshot, so restoring a bank restores its original progress.
const availability=new WeakMap();
export const bankIndexColumns="course_id,id,(json_extract(data,'$.deletedAt') IS NOT NULL OR json_extract(data,'$.purgedAt') IS NOT NULL) AS deleted,json_extract(data,'$.linkedQuestionIds') AS links,(SELECT json_group_array(json_extract(q.value,'$.id')) FROM json_each(practice_banks.data,'$.questions') q) AS question_ids";
export function deletedBankQuestions(rows){
 const deleted=new Set(),active=new Set();
 for(const row of rows){const target=row.deleted?deleted:active;for(const id of [...JSON.parse(row.links||'[]'),...JSON.parse(row.question_ids||'[]')])if(id)target.add(id);}
 for(const id of active)deleted.delete(id);
 return deleted;
}
export function setBankAvailability(data,ids){availability.set(data,ids);}
export function getBankAvailability(data){return availability.get(data)||new Set();}
export function unavailableQuestions(questions,deleted){
 const blocked=new Set(deleted);let grew=true;
 while(grew){grew=false;for(const q of questions)if(q.parentId&&blocked.has(q.parentId)&&!blocked.has(q.id)){blocked.add(q.id);grew=true;}}
 return blocked;
}
export function availableConcepts(questions,concepts,deleted){
 if(!deleted.size)return concepts;
 const blocked=unavailableQuestions(questions,deleted),ids=new Set(questions.filter(q=>!blocked.has(q.id)).map(q=>q.conceptId));let grew=true;
 while(grew){grew=false;for(const c of concepts)if(!ids.has(c.id)&&c.prereqOf?.some(id=>ids.has(id))){ids.add(c.id);grew=true;}}
 return concepts.filter(c=>ids.has(c.id));
}
