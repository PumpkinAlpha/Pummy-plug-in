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
