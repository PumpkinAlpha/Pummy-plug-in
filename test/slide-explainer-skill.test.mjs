import test from 'node:test';
import assert from 'node:assert/strict';
import {SLIDE_EXPLAINER_SKILL,SLIDE_EXPLAINER_SUMMARY} from '../worker/slide-explainer-skill.js';
test('slide instructions put the question last, after explanation and citations',()=>{
 for(const prompt of [SLIDE_EXPLAINER_SKILL,SLIDE_EXPLAINER_SUMMARY]){
  assert.match(prompt,/final tool call/i);assert.match(prompt,/final generated content/i);assert.match(prompt,/citations?.*before|before.*citations?/is);
 }
 assert.match(SLIDE_EXPLAINER_SKILL,/at the end of section C, before section D/);
});
