// Educational design score, not an empirical ratio of student difficulty.
export const RUBRIC_VERSION='cognitive-v1';
export const RUBRIC={reasoning:[1,4],integration:[0,3],application:[0,3],discrimination:[0,2]};
export function difficultyScore(r){
 if(!r||Object.entries(RUBRIC).some(([k,[lo,hi]])=>!Number.isInteger(r[k])||r[k]<lo||r[k]>hi))throw Error('Supply all four cognitive-v1 rubric dimensions.');
 return Object.keys(RUBRIC).reduce((n,k)=>n+r[k],0);
}
export function validateCognitiveReview(cognitive,target=4){
 if(!cognitive||!cognitive.review?.trim())throw Error('Independently review the generated question and supply cognitive metadata before saving.');
 const d=cognitive.difficulty,score=difficultyScore(d);
 if(d.reasoning<2||d.integration<1||d.application<2||!Array.isArray(d.steps)||d.steps.length<2||new Set(d.steps).size!==d.steps.length||!Array.isArray(d.relationships)||d.relationships.length<2||score<target)throw Error('Generated question does not meet the calibrated cognitive challenge target.');
 return {...cognitive,difficulty:{...d,score,rubric:RUBRIC_VERSION},target};
}
export function representativeSample(questions,limit=12){
 const generated=questions.filter(q=>['generated','variant','followup'].includes(q.origin));
 // Some legacy AI banks were incorrectly stored as practice. Do not relabel them.
 const pool=(generated.length?generated:questions).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return Array.from({length:Math.min(limit,pool.length)},(_,i)=>pool[Math.floor(i*pool.length/Math.min(limit,pool.length))]);
}
export function calibrateDifficulty(sample,ratings){
 if(sample.length&&!sample.every(q=>ratings.some(r=>r.questionId===q.id)))throw Error('Rate every question in the representative baseline sample with the same rubric.');
 if(new Set(ratings.map(r=>r.questionId)).size!==ratings.length||ratings.some(r=>!sample.some(q=>q.id===r.questionId)))throw Error('Baseline ratings must refer to unique sampled questions.');
 const scores=ratings.map(r=>{if(!r.rationale?.trim())throw Error('Explain each baseline rating.');return difficultyScore(r);});
 const baseline=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:2;
 return {rubric:RUBRIC_VERSION,baseline,target:Math.max(4,Math.ceil(baseline*2)),sample:ratings,provisional:!scores.length,reason:!scores.length?'No existing questions; conservative design baseline of 2.':null};
}
export const normalized=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function duplicateQuestion(a,b){
 if(normalized(a.stem)===normalized(b.stem))return true;
 const x=new Set(normalized(a.stem).split(' ')),y=new Set(normalized(b.stem).split(' '));
 return x.size>6&&[...x].filter(w=>y.has(w)).length/new Set([...x,...y]).size>.9;
}
export function formatOf(q){return ['label','match','order'].includes(q.type)?q.type:q.figure||q.image?'image':q.multi||q.type==='multi'?'multi':'mcq';}
export function formatDistribution(questions,visualAvailable=true){
 const targets=visualAvailable?{mcq:.45,multi:.175,image:.20,match:.11,order:.065}:{mcq:.55,multi:.225,match:.15,order:.075};
 const counts=Object.fromEntries(['mcq','multi','image','label','match','order'].map(t=>[t,0]));for(const q of questions)counts[formatOf(q)]++;
 return {counts,total:questions.length,targets,visualAvailable,limitations:visualAvailable?[]:['Source diagrams have not been made available; no visual quota is enforced.']};
}
// Optional diagnostic partial credit; formal adaptive mastery still requires a full answer.
export function responseScore(q,response){
 const same=(a,b)=>normalized(a)===normalized(b);
 if(q.type==='order')return q.items.reduce((n,x,i)=>n+Number(same(x,response?.[i])),0)/q.items.length;
 if(q.type==='match')return q.pairs.reduce((n,x,i)=>n+Number(same(x.right,response?.[i])),0)/q.pairs.length;
 if(q.type==='label')return q.targets.reduce((n,x)=>n+Number(same(x.answer,response?.[x.id])),0)/q.targets.length;
 const selected=new Set(response||[]),answers=new Set(q.answer||[]);return Math.max(0,([...answers].filter(i=>selected.has(i)).length-[...selected].filter(i=>!answers.has(i)).length)/answers.size);
}
