import test from 'node:test';
import assert from 'node:assert/strict';
import {SLIDE_EXPLAINER_SKILL,SLIDE_EXPLAINER_SUMMARY} from '../worker/slide-explainer-skill.js';
test('slide instructions put the question last, after explanation and citations',()=>{
 for(const prompt of [SLIDE_EXPLAINER_SKILL,SLIDE_EXPLAINER_SUMMARY]){
  assert.match(prompt,/final tool call/i);assert.match(prompt,/final generated content/i);assert.match(prompt,/citations?.*(?:before|first)|before.*citations?/is);
 }
 assert.match(SLIDE_EXPLAINER_SKILL,/at the end of section C, before section D/);
});
test('typed and app explanations persistently require the native selectable workflow',()=>{
 for(const prompt of [SLIDE_EXPLAINER_SKILL,SLIDE_EXPLAINER_SUMMARY]){
  assert.match(prompt,/typed/i);assert.match(prompt,/app-initiated|initiated in Pummy/i);assert.match(prompt,/prepare_slide_explanation/);assert.match(prompt,/provide_slide_tutor/);assert.match(prompt,/render_slide_check/);assert.match(prompt,/no selection|no option selected/);assert.match(prompt,/Check answer/);assert.match(prompt,/never.*(?:plain-text MCQ|ask.*selectable|ask.*clickable)/is);
 }
});
