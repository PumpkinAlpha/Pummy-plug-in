import test from 'node:test';
import assert from 'node:assert/strict';
import {briefChoiceExplanation,explanationReferences,answerMap} from '../app/explanation-display.js';
import {customTheme,contrast} from '../app/themes.js';
test('citations resolve exact saved names and supplied pages, without inventing references',()=>{
 const sources=[{id:'a',name:'Lecture.pdf'},{id:'b',name:'Lecture.pdf supplement'}];
 assert.deepEqual(explanationReferences({sources:['[Lecture.pdf, page 7]','Lecture.pdf','Unknown paper','Lecture.pdf wrong name']},sources),[{id:'a',name:'Lecture.pdf',page:7},{id:'a',name:'Lecture.pdf',page:undefined}]);
 assert.deepEqual(explanationReferences({sources:[]},sources,{source:{id:'a',name:'Lecture.pdf',page:3}}),[{id:'a',name:'Lecture.pdf',page:3,questionSource:true}]);
 assert.deepEqual(explanationReferences({},[],{source:{id:'gone',name:'Deleted source'}}),[]);
});
test('choice briefs use saved concise rationales and never fabricate missing reasons',()=>{
 const q={options:['One','Two'],answer:[1],optionNotes:['One is odd. A longer discussion.','Two is even.'],definition:'Two is divisible by two.'};
 assert.equal(briefChoiceExplanation(q,0),'One is odd.');
 assert.equal(briefChoiceExplanation({...q,optionNotes:[]},1),'Two is divisible by two.');
 assert.match(briefChoiceExplanation({...q,optionNotes:[],definition:''},0),/Not in the saved answer key/);
});
test('answer graphic uses the revealed ordering key, not the shuffled board',()=>{
 assert.deepEqual(answerMap({type:'order',items:['C','A','B'],correctItems:['A','B','C']}),['A','B','C']);
 assert.deepEqual(answerMap({options:['One','Two'],answer:[1]}),['Two']);
});
test('custom themes sanitize saved colors and keep conflicting text and background readable',()=>{
 for(const values of [{surface:'#ffffff',background:'#000000',text:'#ffffff',accent:'#ffff00'},{surface:'#0d1526',text:'#0d1526',accent:'#0d1526'},{surface:'url(bad)',text:null}]){
  const {variables:v}=customTheme(values);assert.ok(contrast(v['--ink'],v['--panel'])>=4.5);assert.ok(contrast(v['--ink'],v['--bg'])>=4.5);assert.ok(contrast(v['--on-primary'],v['--primary'])>=4.5);
  assert.ok(Object.values(v).every(value=>/^#[\da-f]{6}$/i.test(value)));
 }
});
