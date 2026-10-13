const cell=value=>String(value??'').replace(/[\t\r\n\u2028\u2029]+/g,' ').replace(/\s+/g,' ').trim();
export function quizletCards(questions){return questions.map(q=>{
 let front=q.stem||q.term,answer;
 if(q.type==='order'){front+=' | Put in order: '+[...q.items].sort((a,b)=>a.localeCompare(b)).join(' / ');answer=q.items.join(' → ');}
 else if(q.type==='match'){front+=' | Match: '+q.pairs.map(p=>p.left).join(' / ');answer=q.pairs.map(p=>p.left+' = '+p.right).join('; ');}
 else if(q.type==='label'){front+=' | Diagram: '+(q.figure?.file||'See original question diagram');answer=q.targets.map((t,i)=>(t.label||`Target ${i+1}`)+': '+t.answer).join('; ');}
 else {front+=' | '+(q.options||[]).map((option,i)=>String.fromCharCode(65+i)+'. '+option).join(' | ');answer=(q.answer||[]).map(i=>String.fromCharCode(65+i)+'. '+q.options[i]).join('; ');}
 const explanation=[q.definition,...(q.explanation?.body||[])].filter(Boolean).join(' ');
 return [cell(front),cell([answer,explanation].filter(Boolean).join(' — '))];
});}
export const quizletTSV=questions=>quizletCards(questions).map(card=>card.join('\t')).join('\n')+'\n';
