const root=q=>['practice','own','generated'].includes(q.origin)&&q.keyed;
export function banksFromFile(data,name){
 if(data.format==='daniel-ai-backup'&&Array.isArray(data.documents)){
  const assets=new Map((data.assets||[]).filter(a=>/^image\/(png|jpeg|webp|gif)$/.test(a.type)).map(a=>[a.id,`data:${a.type};base64,${a.data}`]));const courses=new Map();
  for(const [path,v] of data.documents){const p=path?.match(/^data\/users\/local\/workup\/courses\/([^/]+)(?:\/(sources|texts|questions|concepts|state)\/([^/]+))?$/);if(!p)continue;if(!courses.has(p[1]))courses.set(p[1],{name:'Imported course',questions:[],sources:[],texts:[],concepts:[],objectives:[]});const c=courses.get(p[1]);if(!p[2])c.name=v.name;else if(p[2]==='state'){if(p[3]==='objectives')c.objectives=v.items||[];}else c[p[2]].push({...v,id:p[3]});}
  return [...courses.values()].map(c=>{
   const skipped=[];const questions=c.questions.filter(root).flatMap(q=>{
    const figure=q.figure?{dataUrl:q.figure.dataUrl||assets.get(q.figure.assetId),file:q.figure.file,unit:q.figure.unit,page:q.figure.page,marks:q.figure.marks||[]}:undefined;
    const image=q.image?(q.image.startsWith('data:')?q.image:assets.get(q.image)):undefined;
    if((q.figure&&!figure.dataUrl)||(q.image&&!image)){skipped.push(q.term||q.stem);return [];}
    const explanation=q.explanation?{...q.explanation,figures:q.explanation.figures?.flatMap(f=>(f.assetIds||[]).map(a=>({dataUrl:assets.get(a),file:f.file,unit:f.unit||'page',page:f.page||1,caption:f.caption})).filter(f=>f.dataUrl)).slice(0,6)}:undefined;
    return [{...q,figure,image,explanation,objective:c.objectives.some(o=>o.id===q.objectiveId)?q.objectiveId:undefined,sourceId:c.sources.some(s=>s.id===q.sourceId)?q.sourceId:undefined,distractors:q.type==='label'?q.bank.filter(x=>!q.targets.some(t=>t.answer===x)):undefined,progress:{attempts:q.attempts||0,correctCount:q.correctCount||0,lastSeen:q.lastSeen||0,lastResult:q.lastResult||null}}];
   });
   return {name:c.name,questions,sources:c.sources.map(s=>({...s,rank:s.rank||3,text:c.texts.filter(t=>t.sid===s.id).sort((a,b)=>a.i-b.i).map(t=>t.text).join('').slice(0,60000)})),objectives:c.objectives,conceptProgress:c.concepts.map(c=>({term:c.name,status:c.status||'new',interval:c.interval||0,ease:c.ease||2.6,due:c.due||0,reps:c.reps||0,lapses:c.lapses||0,attempts:c.attempts||0,correct:c.correct||0,lastSeen:c.lastSeen||0})),skipped};
  }).filter(c=>c.questions.length);
 }
 return (Array.isArray(data)?[{name:name.replace(/\.json$/i,''),questions:data}]:[data]).map(c=>({...c,name:c.name||name.replace(/\.json$/i,''),sources:c.sources||[],objectives:c.objectives||[],conceptProgress:c.conceptProgress||[],skipped:[]}));
}
export const demo={name:'Arithmetic · practice demo',questions:[
 {term:'Order of operations',stem:'What is 3 + 4 × 2?',options:['14','11','10','7'],answer:[1],definition:'Multiply before adding: 4 × 2 = 8, then 3 + 8 = 11.'},
 {term:'Fractions',stem:'Which fraction is equivalent to one half?',options:['2/4','1/4','2/3','3/4'],answer:[0],definition:'Multiplying numerator and denominator by the same number preserves value.'},
 {term:'Percentages',stem:'What is 25% of 80?',options:['25','40','20','60'],answer:[2],definition:'25% is one quarter; 80 ÷ 4 = 20.'},
 {term:'Negative numbers',stem:'What is −3 + 5?',options:['−8','−2','8','2'],answer:[3],definition:'Start at −3 and move five units right.'},
 {term:'Exponents',stem:'What does 2³ equal?',options:['6','8','9','5'],answer:[1],definition:'2³ = 2 × 2 × 2 = 8.'}
].map(q=>({...q,sourceId:'arithmetic-reference'})),sources:[{id:'arithmetic-reference',name:'Demo reference',text:'Arithmetic reference: Multiplication and division happen before addition and subtraction; operations at the same precedence are evaluated from left to right. Multiplication is repeated addition. Fractions represent a numerator divided by a denominator; multiplying both by the same nonzero number preserves value. One half is 1/2 = 2/4 = 50%. A percent means per hundred. 25% = 1/4. To find 25% of a number, divide by four. Adding a positive number moves right on the number line; adding a negative moves left. Powers mean repeated multiplication; 2³ = 2 × 2 × 2 = 8.'}]};
