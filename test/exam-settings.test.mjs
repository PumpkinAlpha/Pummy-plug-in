import test from 'node:test';
import assert from 'node:assert/strict';
import {customSelectionSettings,dashboardExamSettings,generatedExamSettings,matchingExamQuestions} from '../app/exam-settings.js';

test('editing a saved selection retains adaptive, review and source preferences',()=>{
 const preferences={size:20,adaptive:true,generateExplanations:true,practiceFirst:true,includeReviews:true,types:['multi'],sourceIds:['lecture'],objectiveIds:['objective'],weekId:'Week 4',setId:'professor'};
 const state={customTests:[{id:'saved',preferences}]};
 assert.deepEqual(customSelectionSettings(state,'saved',Array.from({length:50},(_,i)=>String(i))),preferences);
 assert.equal(customSelectionSettings(state,'saved',['q1','q2']).size,2);
 assert.deepEqual(state.customTests[0].preferences,preferences);
});
test('a new saved selection keeps fast-practice defaults and includes the full selection',()=>{
 const settings=customSelectionSettings({},'new',Array.from({length:150},(_,i)=>String(i)));
 assert.equal(settings.size,150);assert.equal(settings.adaptive,false);assert.equal(settings.includeReviews,false);assert.equal(settings.sourceIds,null);
});
test('All stays All in saved selections, dashboard study and generated exams',()=>{
 const state={preferences:{size:'all'},customTests:[{id:'saved',preferences:{size:'all'}}]};
 const ids=Array.from({length:250},(_,i)=>String(i));
 assert.equal(customSelectionSettings(state,'saved',ids).size,'all');
 assert.equal(dashboardExamSettings(state,{},false).size,'all');
 const settings=generatedExamSettings({size:'all'},ids);
 assert.equal(settings.size,'all');assert.equal(settings.questionIds.length,250);
 assert.equal(generatedExamSettings({size:20},ids).size,20);
 assert.equal(generatedExamSettings({size:250},ids).size,250);
});
test('exam mode counts apply the same bank filters without broadening empty modes',()=>{
 const state={sources:[{id:'source',weekId:'Week 4'}],questionIndex:[
  {id:'professor',origin:'practice',sourceId:'source',type:'mcq',struggling:true},
  {id:'own',origin:'own',sourceId:'source',type:'multi',struggling:false},
  {id:'generated',origin:'generated',sourceId:'other',type:'mcq',struggling:true}
 ]};
 assert.deepEqual(matchingExamQuestions(state,{examMode:'professor'}).map(q=>q.id),['professor']);
 assert.deepEqual(matchingExamQuestions(state,{examMode:'struggling',weekId:'Week 4'}).map(q=>q.id),['professor']);
 assert.deepEqual(matchingExamQuestions(state,{examMode:'all',types:['multi']}).map(q=>q.id),['own']);
 assert.equal(matchingExamQuestions(state,{examMode:'struggling',types:['multi']}).length,0);
 assert.equal(matchingExamQuestions(state,{examMode:'all',sourceIds:[]}).length,0);
});
