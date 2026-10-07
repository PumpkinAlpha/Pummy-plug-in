// The host supplies saved batches and a final receipt, but no live token progress.
// Keep the estimate below completion until the exam has actually started.
export function generationPercent({phase='generating',elapsed=0,saved=0,total=0}){
 if(phase==='complete')return 100;
 if(phase==='opening')return 96;
 if(phase==='sending')return Math.min(8,2+Math.max(0,elapsed)*.6);
 const estimate=8+78*(1-Math.exp(-Math.max(0,elapsed)/90));
 const confirmed=total>0?92*Math.min(1,Math.max(0,saved)/total):Math.min(80,Math.max(0,saved)*2);
 return Math.min(94,Math.max(estimate,confirmed));
}
