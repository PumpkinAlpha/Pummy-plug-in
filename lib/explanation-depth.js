export const EXPLANATION_DEPTHS={quick:'Quick',comprehensive:'Comprehensive',mcat_uworld:'MCAT / UWorld level'};
export function explanationDepth(value){return EXPLANATION_DEPTHS[value]?value:'comprehensive';}
export function explanationGuidance(value){
 const depth=explanationDepth(value);
 return `Explanation depth: ${EXPLANATION_DEPTHS[depth]}. `+({
  quick:'Give a short explanation of the correct answer and a brief reason each other choice is wrong. Focus on the key takeaway.',
  comprehensive:'Explain the reasoning step by step, relevant mechanisms and supporting course concepts, and why every choice is correct or incorrect. Include useful distinctions and common mistakes.',
  mcat_uworld:'Give a detailed exam-preparation explanation with step-by-step reasoning, mechanisms, relevant clinical or passage interpretation, a comparison of every answer choice, common traps and a concise educational takeaway. Include only details supported by the supplied course material; mark missing context as gaps. This describes depth and reasoning style, not affiliation or copied proprietary questions.'
 })[depth];
}
export function hasFullExplanation(question){return !!question?.explanation?.body?.some(text=>typeof text==='string'&&text.trim());}
