// Hosts attach the latest model context to the next user message. Serialize
// context updates with sends so a later visible slide cannot replace a click.
let contextQueue=Promise.resolve();
export function queueSlideContext(work){const next=contextQueue.catch(()=>{}).then(work);contextQueue=next.catch(()=>{});return next;}
export async function sendSlideExplanation({bridge,call,args,visual,notes=[]}){
 const captured={...args,annotationIds:[...(args.annotationIds||[])],...(args.region?{region:{...args.region}}:{})};
 return queueSlideContext(async()=>{
  const requestId=crypto.randomUUID();
  const result=await call('prepare_slide_explanation',{...captured,requestId,...(visual?{visual}:{})});
  const request=result.tutor.request,context={...request.context,courseId:captured.courseId,presentationId:captured.presentationId,slideId:captured.slideId,page:request.page,requestId,answerInConversation:true,studentAnnotations:notes};
  await bridge.updateModelContext({structuredContent:{interactiveTutor:context},content:[{type:'text',text:'This user message requests exactly the saved Pummy slide explanation identified by interactiveTutor.requestId. Read only that request with read_slide_tutor, save the full professor-grounded explanation and one informal check, write sections A–C and citations first, then use render_slide_check as the final content. Do not follow later slide changes or alter formal exams.'},...(visual?[{type:'image',mimeType:'image/jpeg',data:visual.split(',')[1]}]:[])]});
  try{
   const sent=await bridge.sendMessage({role:'user',content:[{type:'text',text:'explain this slide'}]});
   if(sent.isError)throw Error('ChatGPT could not send the message. Please try it in the chat.');
   return {requestId};
  }finally{
   // Subsequent typed explanations must prepare a fresh check rather than reuse
   // this message's selected or checked answer. Never resend an uncertain message.
   await bridge.updateModelContext({structuredContent:{interactiveTutor:{...context,requestId:undefined,practiceCheck:{courseId:captured.courseId,presentationId:captured.presentationId,slideId:captured.slideId,prepareTool:'prepare_slide_explanation'},studentAnnotations:notes}},content:[{type:'text',text:'For the next typed slide explanation, read_slide_context with explain=true returns a fresh practiceCheck descriptor. Prepare it, save the explanation and question, write the explanation and citations first, then render the native selectable check last.'},...(visual?[{type:'image',mimeType:'image/jpeg',data:visual.split(',')[1]}]:[])]}).catch(()=>{});
  }
 });
}
