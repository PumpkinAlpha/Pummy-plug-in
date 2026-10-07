// Keep tutor handoffs small and tied to the server's current request, not a stale view.
export function pendingKey(s){return s?.generation?`question:${s.courseId}:${s.generation.id}`:s?.explanationRequest?`explanation:${s.courseId}:${s.explanationRequest.id}`:'';}
export function tutorContext(s){const q=s?.question;return {courseId:s?.courseId,revision:s?.revision,phase:s?.session?.phase,project:s?.project||null,question:q?{id:q.id,stem:q.stem,options:q.options,type:q.type,term:q.term,objective:q.objective}:null,generation:s?.generation?{id:s.generation.id,sessionId:s.generation.sessionId,instruction:'Read open_test for the current prompt before preparing this request.'}:null,explanationRequest:s?.explanationRequest?{id:s.explanationRequest.id,questionId:s.explanationRequest.questionId,choice:s.explanationRequest.choice}:null};}
export function requestTracker(storage){
 const active=new Set(),sent=new Map(),cooldown=90000;
 const read=key=>{try{return Number(storage?.getItem('pummy-request:'+key))||sent.get(key)||0;}catch{return sent.get(key)||0;}};
 return {
  status(key,now=Date.now()){return active.has(key)?'sending':now-read(key)<cooldown?'sent':'idle';},
  begin(key,now=Date.now()){if(!key||this.status(key,now)!=='idle')return false;active.add(key);sent.set(key,now);try{storage?.setItem('pummy-request:'+key,String(now));}catch{}return true;},
  finish(key,ok){active.delete(key);if(!ok){sent.delete(key);try{storage?.removeItem('pummy-request:'+key);}catch{}}},
 };
}
