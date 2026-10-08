// Retain both write IDs so a failed second step can be retried without adding
// the authored questions again, including an uncertain first-step response.
export async function saveDraftCustomTest({state,name,questions,attemptRef,call,getState}){
 const signature=JSON.stringify({courseId:state.courseId,name,questions});
 if(attemptRef.current?.signature===signature&&state.customTests?.some(test=>test.id===attemptRef.current.testId)){
  attemptRef.current=null;return;
 }
 if((state.customTests?.length||0)>=30)throw new Error('This course has 30 custom tests. Edit an existing selection before adding another test.');
 if(attemptRef.current?.signature!==signature)attemptRef.current={signature,requestId:crypto.randomUUID(),testId:crypto.randomUUID(),beforeIds:(state.questionIndex||[]).map(question=>question.id)};
 const attempt=attemptRef.current;
 if(!attempt.questionIds){
  const added=await call('add_questions',{courseId:state.courseId,revision:state.revision,requestId:attempt.requestId,questions:questions.map(question=>({...question,term:name,origin:'own'})),sources:[],objectives:[]});
  const receipt=added.state.questionImports?.find(item=>item.requestId===attempt.requestId);
  const ids=Array.isArray(receipt?.questionIds)?receipt.questionIds:(added.state.questionIndex||[]).filter(question=>!attempt.beforeIds.includes(question.id)).map(question=>question.id);
  if(ids.length!==questions.length||new Set(ids).size!==ids.length)throw new Error('Some questions were not added. Refresh the bank before saving this test.');
  attempt.questionIds=ids;
 }
 const current=getState();
 if(current?.courseId!==state.courseId)throw new Error('Reopen the original course to finish saving this custom test.');
 await call('save_custom_test',{courseId:state.courseId,revision:current.revision,testId:attempt.testId,name,questionIds:attempt.questionIds,size:attempt.questionIds.length,adaptive:false,generateExplanations:false,practiceFirst:false,includeReviews:false,types:null,sourceIds:null,objectiveIds:null,weekId:'all',setId:null});
 attemptRef.current=null;
}
