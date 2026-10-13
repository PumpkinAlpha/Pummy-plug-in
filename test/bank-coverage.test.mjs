import test from 'node:test';
import assert from 'node:assert/strict';
import {bankObjectiveCoverage} from '../lib/bank-coverage.js';
import {questionsInFolder} from '../app/folders.js';
const sources=[{id:'a',lecture:'A',weekId:'1'},{id:'b',lecture:'B',weekId:'2'}];
const objectives=[{id:'a1',sourceId:'a',lecture:'A',weekId:'1'},{id:'a2',sourceId:'a',lecture:'A',weekId:'1'},{id:'b1',sourceId:'b',lecture:'B',weekId:'2'}];
test('coverage deduplicates links, ignores missing tags and deleted sources, and never invents a denominator',()=>{
 assert.deepEqual(bankObjectiveCoverage([{sourceId:'a',objectiveId:'a1'},{sourceId:'a',objectiveId:'a1'},{sourceId:'a',objectiveId:'invented'}],objectives,sources),{percent:50,covered:1,total:2});
 assert.deepEqual(bankObjectiveCoverage([{sourceId:'a'}],[],sources),{percent:null,covered:0,total:0});
 assert.deepEqual(bankObjectiveCoverage([{sourceId:'a',objectiveId:'a1'}],objectives,[{...sources[0],deletedAt:1}]),{percent:null,covered:0,total:0});
});
test('folder view coverage recalculates from its questions and objectives instead of the entire combined bank',()=>{
 const state={sources,questionIndex:[{sourceId:'a',objectiveId:'a1'},{sourceId:'b',objectiveId:'b1'}]},folder={kind:'week',label:'2'};
 const questions=questionsInFolder(state,folder),scoped=questionsInFolder({...state,questionIndex:objectives},folder);
 assert.deepEqual(bankObjectiveCoverage(questions,scoped,sources,['a','b']),{percent:100,covered:1,total:1});
 assert.deepEqual(bankObjectiveCoverage(state.questionIndex,objectives,sources,['a','b']),{percent:67,covered:2,total:3});
});
