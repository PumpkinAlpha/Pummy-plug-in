export const answerDraftKey=(courseId,sessionId,questionId)=>courseId&&sessionId&&questionId?`pummy-answer:${courseId}:${sessionId}:${questionId}`:null;
export function readAnswerDraft(storage,key){try{return key?JSON.parse(storage.getItem(key)):null;}catch{return null;}}
export function saveAnswerDraft(storage,key,draft){try{if(key)storage.setItem(key,JSON.stringify(draft));}catch{/* Storage quotas must not prevent submission. */}}
export function clearAnswerDraft(storage,key){try{if(key)storage.removeItem(key);}catch{}}
