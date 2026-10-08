export function briefChoiceExplanation(question,index){
 const letter=String.fromCharCode(65+index);
 const note=question.optionNotes?.[index]||question.explanation?.choices?.find(c=>c.letter.replace(/[.)]/g,'').trim().toUpperCase()===letter)?.text||question.optionMore?.[index];
 if(note?.trim())return note.trim().split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
 return question.answer?.includes(index)?question.definition?.trim().split(/(?<=[.!?])\s+/)[0]||'Correct according to the saved answer key.':'Not in the saved answer key; see the correct choice below.';
}
export function explanationReferences(explanation,sources,question){
 const refs=[];
 for(const raw of explanation?.sources||[]){
  const clean=raw.replace(/^\[|\]$/g,'').trim();
  const source=[...sources].sort((a,b)=>b.name.length-a.name.length).find(s=>clean.toLowerCase()===s.name.toLowerCase()||clean.toLowerCase().startsWith(s.name.toLowerCase()+', ')||clean.toLowerCase().startsWith(s.name.toLowerCase()+' · '));
  if(!source)continue;
  const suffix=clean.slice(source.name.length),page=suffix.match(/^\s*[,·]\s*(?:pages?|slides?|p\.)\s*(\d+)\s*$/i);
  if(suffix&&!page)continue;
  const ref={id:source.id,name:source.name,page:page?Number(page[1]):undefined};
  if(!refs.some(r=>r.id===ref.id&&r.page===ref.page))refs.push(ref);
 }
 if(!refs.length&&question?.source&&sources.some(s=>s.id===question.source.id))refs.push({...question.source,questionSource:true});
 return refs;
}
export function answerMap(question,explanation){
 if(question?.type==='order')return question.correctItems||question.items||[];
 if(question?.type==='match')return (question.pairs||[]).map(p=>`${p.left} → ${p.right}`);
 if(question?.type==='label')return (question.targets||[]).map(t=>t.answer);
 if(question?.answer?.length)return question.answer.map(i=>question.options[i]);
 return [explanation?.body?.[0]||'Review the explanation below.'];
}
