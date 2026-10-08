import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGenerationPrompt,gapSignals,generationCapacity} from '../app/generation-plan.js';

const state={courseId:'anatomy',questionCount:10,project:null,objectives:[{id:'o1',text:'Describe venous drainage.'}],progress:{concepts:[{name:'Superior vena cava',status:'learning',attempts:3,correct:1,sourceIds:['slide']},{name:'Aortic arch',status:'retained',attempts:3,correct:3,sourceIds:['slide']}],objectives:[{id:'o1',total:2,retained:0,mastered:false}]}};
const base={instructions:'',sourceIds:['slide'],generateExplanations:true,launchAfterBuild:true};

test('coverage mode lets source breadth determine count and reserves final receipt',()=>{
 const prompt=buildGenerationPrompt(state,{...base,mode:'coverage',count:null},'final-request');
 assert.match(prompt,/Full coverage mode/);
 assert.match(prompt,/do not use a fixed question count/);
 assert.match(prompt,/FINAL add_questions call: final-request/);
 assert.match(prompt,/explanation:/);
 assert.equal(generationCapacity(state),490);
});

test('gap mode uses saved weak concepts and unmastered objectives',()=>{
 const signals=gapSignals(state);
 assert.deepEqual(signals.concepts.map(item=>item.name),['Superior vena cava']);
 assert.deepEqual(signals.objectives.map(item=>item.id),['o1']);
 const prompt=buildGenerationPrompt(state,{...base,mode:'gaps',count:null},'final-request');
 assert.match(prompt,/Based on your gaps mode/);
 assert.match(prompt,/Superior vena cava/);
 assert.match(prompt,/Describe venous drainage/);
});

test('custom mode requests the entered exact count',()=>{
 const prompt=buildGenerationPrompt(state,{...base,mode:'custom',count:37},'final-request');
 assert.match(prompt,/Create exactly 37 distinct/);
});

test('generation capacity counts stored adaptive followups as well as root questions',()=>{
 const withFollowups={...state,storedQuestionCount:498};
 assert.equal(generationCapacity(withFollowups),2);
 assert.match(buildGenerationPrompt(withFollowups,{...base,mode:'coverage'},'final-request'),/at most 2 more questions/);
 assert.equal(generationCapacity({...state,storedQuestionCount:501}),0);
});

test('difficulty and generation preferences reach the prompt without claiming model routing',()=>{
 const prompt=buildGenerationPrompt(state,{...base,mode:'custom',count:8,difficulty:'mcat',questionModel:'gpt-6.1-sol',questionEffort:'high',explanationModel:'gpt-6-astra',explanationEffort:'xhigh'},'final-request');
 assert.match(prompt,/Difficulty: MCAT/);
 assert.match(prompt,/MCAT-style questions/);
 assert.match(prompt,/question model and effort: GPT-6\.1 Sol \/ High/);
 assert.match(prompt,/explanation model and effort: GPT-6 Astra \/ Extra high/);
 assert.match(prompt,/ChatGPT host controls the actual model and reasoning effort/);
 assert.match(prompt,/same add_questions call/);
});

test('quiz difficulty stays source-grounded and omits explanation preferences when off',()=>{
 const prompt=buildGenerationPrompt(state,{...base,generateExplanations:false,difficulty:'quiz',questionModel:'not-a-model'},'final-request');
 assert.match(prompt,/Difficulty: Quiz/);
 assert.match(prompt,/straightforward application/);
 assert.match(prompt,/question model and effort: Current ChatGPT model \/ Current ChatGPT effort/);
 assert.doesNotMatch(prompt,/requested explanation model and effort/);
});
