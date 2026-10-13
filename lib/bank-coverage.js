// Coverage counts verified objectives explicitly linked to bank questions.
// It does not estimate conceptual completeness from overlapping words.
export function bankObjectiveCoverage(questions,objectives,sources=[],sourceIds=[]){
 const active=new Map(sources.filter(s=>!s.deletedAt).map(s=>[s.id,s]));
 const selected=new Set([...sourceIds,...questions.map(q=>q.sourceId)].filter(id=>active.has(id)));
 const lectures=new Set(questions.map(q=>q.lecture).filter(Boolean)),weeks=new Set(questions.map(q=>q.weekId).filter(Boolean));
 for(const id of selected){const s=active.get(id);if(s.lecture)lectures.add(s.lecture);if(s.weekId)weeks.add(s.weekId);}
 const linked=new Set(questions.map(q=>q.objectiveId||q.objective).filter(id=>typeof id==='string'));
 const hasScope=selected.size||lectures.size||weeks.size;
 const relevant=objectives.filter(o=>active.has(o.sourceId)&&(!hasScope||selected.has(o.sourceId)||linked.has(o.id)||lectures.has(o.lecture||active.get(o.sourceId)?.lecture)||weeks.has(o.weekId||active.get(o.sourceId)?.weekId)));
 const covered=relevant.filter(o=>linked.has(o.id)).length;
 return {percent:relevant.length?Math.round(covered/relevant.length*100):null,covered,total:relevant.length};
}
