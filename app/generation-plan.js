export const BUILD_MODES={coverage:'Full coverage',gaps:'Based on your gaps',custom:'Custom'};

export function generationCapacity(state){return Math.max(0,500-(state.questionCount||0));}

export function gapSignals(state){
 const concepts=(state.progress?.concepts||[])
  .filter(concept=>concept.status==='learning'||(concept.attempts||0)>(concept.correct||0)||(concept.attempts>0&&concept.due<=Date.now()))
  .sort((a,b)=>((b.attempts||0)-(b.correct||0))-((a.attempts||0)-(a.correct||0)))
  .slice(0,60)
  .map(({name,status,attempts,correct,sourceIds})=>({name,status,attempts,correct,sourceIds}));
 const objectives=(state.progress?.objectives||[])
  .filter(objective=>!objective.mastered)
  .slice(0,80)
  .map(progress=>{const objective=state.objectives?.find(item=>item.id===progress.id);return {id:progress.id,text:objective?.text||'',retained:progress.retained,total:progress.total};});
 return {concepts,objectives};
}

export function buildGenerationPrompt(state,spec,requestId){
 const mode=spec.mode||'custom';
 const capacity=generationCapacity(state);
 const selected=spec.sourceIds||[];
 let scope;
 if(mode==='coverage')scope=`Full coverage mode. Analyze EVERY selected source and its explicit learning objectives. Generate as many distinct, course-grounded questions as needed to cover the testable facts and objectives; do not use a fixed question count. Include at least one question per supported objective and cover important facts within each source. Avoid duplicates of saved questions. The course has room for at most ${capacity} more questions. If the material or capacity prevents full coverage, say precisely what remains uncovered.`;
 else if(mode==='gaps')scope=`Based on your gaps mode. Use the student's saved progress signals below to target learning concepts, missed material, due reviews, and objectives that are not mastered. Prefer fresh questions on those areas over repeating existing stems. Generate as many questions as needed to address these gaps, within the course capacity of ${capacity}. If there is no usable attempt history, use uncovered objectives and explain that the plan is based on coverage gaps. Progress signals: ${JSON.stringify(gapSignals(state))}`;
 else scope=`Custom mode. Create exactly ${spec.count} distinct, course-grounded questions. If needed, save them in multiple batches to reach the requested total without exceeding the tool's per-call limit.`;
 return `Build a question bank for existing Pummy course ${state.courseId}, not a new course. ${scope} Student instructions: ${spec.instructions||'None supplied.'}\nLinked ChatGPT Project: ${state.project?.name||'not linked'} ${state.project?.url||''}. Only use Project files actually accessible in this current conversation, or these selected saved reference IDs: ${JSON.stringify(selected)}. Use retrieve_sources repeatedly as needed across every selected source; use read_source with a page/range when needed. A Project URL does NOT grant access to its files. Never invent sources, page numbers, or coverage. ${spec.generateExplanations?'Include a full course-grounded explanation:{body:["..."],sources:["exact source name and page when known"]} with every question in the same add_questions call.':'Full explanations are optional.'} For every text-choice question, include optionNotes explaining why EACH choice is correct or incorrect. Read read_course_state for the latest revision. Append the questions with add_questions. Each call can add up to 200 questions and the course can store up to 500. If you need multiple calls, use a unique requestId for each earlier batch and use this EXACT requestId on the FINAL add_questions call: ${requestId}. Make the final call only after all earlier batches are saved, so Pummy can open the completed bank. If no questions can be made, do not call add_questions; explain why. If Project source excerpts were used, include those excerpts in sources. Keep keys out of chat. ${spec.launchAfterBuild?'Do not start the exam with tools; Pummy will open it after the final save is confirmed.':'Do not start or replace my exam.'}`;
}
