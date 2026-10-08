import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCustomTestText,validateCustomQuestion} from '../app/custom-test-parser.js';

test('TXT import preserves select-all keys and explanations before saving',()=>{
 const [draft]=parseCustomTestText('Which regions drain into the superior vena cava?\nA. Head\nB. Neck\nC. Heart muscle\nAnswer: A and B\nExplanation: Head and neck drain through the internal jugular veins.');
 assert.deepEqual(draft.answer,[0,1]);
 const question=validateCustomQuestion(draft,0);
 assert.equal(question.multi,true);
 assert.deepEqual(question.explanation.body,['Head and neck drain through the internal jugular veins.']);
});

test('Quizlet tab pairs become editable choices and invalid keys are rejected',()=>{
 const drafts=parseCustomTestText('What forms the brachiocephalic vein?\tInternal jugular and subclavian veins\nWhat drains the myocardium?\tCoronary sinus');
 assert.equal(drafts.length,2);
 assert.equal(drafts[0].options.length,2);
 assert.equal(drafts[0].options[0],'Internal jugular and subclavian veins');
 assert.throws(()=>parseCustomTestText('Question?\nA. One\nB. Two\nAnswer: C'),/invalid Answer/);
});

test('blank lines inside a question and adjacent numbered questions preserve keys and explanations',()=>{
 const drafts=parseCustomTestText('1. Which choices?\n\nA. One\n\nB. Two\n\nAnswer: A & B\n\nExplanation: Both apply.\n2. Which next choice?\nA. Three\nB. Four\nAnswer: B');
 assert.equal(drafts.length,2);
 assert.equal(drafts[0].stem,'Which choices?');
 assert.deepEqual(drafts[0].options,['One','Two']);
 assert.deepEqual(drafts[0].answer,[0,1]);
 assert.equal(drafts[0].explanation,'Both apply.');
 assert.deepEqual(drafts[1].answer,[1]);
});

test('duplicate choice labels and noninteger or repeated answer indexes cannot be saved',()=>{
 assert.throws(()=>parseCustomTestText('Question?\nA. One\nA. Two\nAnswer: A'),/duplicate choice letters/);
 const [draft]=parseCustomTestText('Question?\nA. One\nB. Two\nAnswer: A');
 for(const answer of [[0.5],[0,0],[NaN],[-1],[2]])assert.throws(()=>validateCustomQuestion({...draft,answer},0),/valid, distinct correct choices/);
 assert.throws(()=>parseCustomTestText('Question?\nA. One\nB. Two\nAnswer: A\nAnswer: B'),/more than one Answer/);
});

test('numbered rationale lines are preserved within a question explanation',()=>{
 const [draft]=parseCustomTestText('Question?\nA. One\nB. Two\nAnswer: A\nExplanation: Two reasons.\n1. First reason.\n2. Second reason.');
 assert.equal(draft.explanation,'Two reasons. 1. First reason. 2. Second reason.');
});
