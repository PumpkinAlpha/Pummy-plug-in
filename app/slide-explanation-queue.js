// ui/message acknowledges delivery, not completion of an assistant turn.
// Only the student's explicit confirmation releases the next request.
export class SlideExplanationQueue {
 constructor({storage,key,prepare,send}){
  Object.assign(this,{storage,key,prepare,send});this.listeners=new Set();this.running=false;
  this.items=JSON.parse(storage.getItem(key)||'[]');
  for(const item of this.items)if(['preparing','sending'].includes(item.status))item.status='uncertain';
  if(this.items[0]?.status==='ready')this.items[0].status='held';
 }
 subscribe(fn){this.listeners.add(fn);fn(this.items);return()=>this.listeners.delete(fn);}
 changed(){this.storage.setItem(this.key,JSON.stringify(this.items));for(const fn of this.listeners)fn([...this.items]);}
 enqueue(args,page,capture){
  const item={args:structuredClone(args),page,status:'preparing'};
  this.items.push(item);try{this.changed();}catch(e){this.items.pop();throw e;}
  // Reserve FIFO position synchronously, before image preparation or network work.
  Promise.resolve().then(capture).then(visual=>this.prepare({...item.args,...(visual?{visual}:{})})).then(()=>{
   item.status='ready';this.changed();return this.dispatch();
  }).catch(e=>{item.status='uncertain';item.error=e.message;try{this.changed();}catch{for(const fn of this.listeners)fn([...this.items]);}});
 }
 async dispatch(){
  const item=this.items[0];if(this.running||item?.status!=='ready')return;
  this.running=true;
  try{
   item.status='sending';this.changed(); // Persist before crossing the host boundary.
   await this.send(item);item.status='sent';this.changed();
  }catch(e){item.status='uncertain';item.error=e.message;try{this.changed();}catch{for(const fn of this.listeners)fn([...this.items]);}}
  finally{this.running=false;}
 }
 async confirmFinished(){
  if(this.running)return;
  if(this.items[0]?.status==='held'){this.items[0].status='ready';await this.dispatch();return;}
  if(!['sent','uncertain'].includes(this.items[0]?.status))return;
  const previous=this.items;this.items=this.items.slice(1);
  try{this.changed();}catch(e){this.items=previous;throw e;}
  await this.dispatch();
 }
}

export function slideExplanationPrompt({args,page}){
 return `Explain only slide ${page} for this Pummy request: ${JSON.stringify({courseId:args.courseId,presentationId:args.presentationId,slideId:args.slideId,requestId:args.requestId})}. Read read_slide_tutor with exactly these course, presentation and request IDs; the visible slide may have changed. Use that saved professor context and earlier conversation explanations, preserve lecture sequence, and avoid unnecessary repetition. Produce one independent assistant response for this request only; never combine queued slides or append to an earlier explanation. Use exactly these headings in order: A. Reading the Slide; B. Understanding the Material; C. What to Remember; D. Check Your Understanding. Save the explanation with provide_slide_tutor, set testable, and supply exactly one single-answer MCQ when the slide introduces testable information, otherwise zero questions and explain why. In section D call render_slide_check with these same IDs for the selectable question; do not reveal the key or ask me to type an answer. Complete only this request and end your turn. Do not fetch or process the next queued request, change exam progress, submit an answer, or save questions to the bank.`;
}
