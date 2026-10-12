import test from 'node:test';
import assert from 'node:assert/strict';
import {examFolderOptions,examPracticeOptions,matchingExamQuestions,dashboardExamSettings} from '../app/exam-settings.js';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';

test('exam menus include named empty folders, lecture folders and saved tests without question set tags',()=>{
 const state={sources:[{id:'slides',lecture:'lecture-1'}],folderNames:{'lecture:lecture-1':'Week 1','lecture:lecture-2':'Week 2'},questionIndex:[{id:'q1',sourceId:'slides',type:'mcq'},{id:'q2',lecture:'lecture-2',type:'mcq',setId:'Imported quiz'}],customTests:[{id:'saved',name:'Midterm practice',questionIds:['q1']}]};
 assert.deepEqual(examFolderOptions(state).map(f=>f.displayName),['Week 1','Week 2']);
 assert.deepEqual(examFolderOptions({folderNames:{'week:Week 10':'Final week'},sources:[],questionIndex:[]}).map(f=>f.displayName),['Final week']);
 assert.deepEqual(examPracticeOptions(state).map(o=>o.label),['Midterm practice','Imported quiz']);
 assert.deepEqual(matchingExamQuestions(state,{studyFolder:{kind:'lecture',label:'lecture-1'},practiceTestId:'saved'}).map(q=>q.id),['q1']);
 assert.equal(matchingExamQuestions(state,{studyFolder:{kind:'lecture',label:'lecture-2'},practiceTestId:'saved'}).length,0);
 assert.equal(matchingExamQuestions(state,{practiceTestId:'missing'}).length,0);
 const scoped=dashboardExamSettings({preferences:{studyFolder:{kind:'lecture',label:'old'},practiceTestId:'old'}},{weekId:'Week 3'},false);
 assert.equal(scoped.studyFolder,null);assert.equal(scoped.practiceTestId,null);
});

test('saved selector choices survive reload and server exams contain exactly the matching folder/test intersection',async t=>{
 const db=new LocalD1(),repo=new CourseRepository(db,'selector-review');t.after(()=>db.close());
 const args=s=>({courseId:s.courseId,revision:s.revision});
 let {state:s}=await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Selector fixture',sources:[{id:'a',name:'Week A slides',text:'One plus one is two.',lecture:'Lecture A'},{id:'b',name:'Week B slides',text:'Two plus two is four.',lecture:'Lecture B'}],questions:[0,1,2].map(i=>({term:`Concept ${i}`,stem:`Sample ${i}?`,options:['Correct','Incorrect'],answer:[0],sourceId:i===2?'b':'a'}))});
 const testId=crypto.randomUUID(),ids=s.questionIndex.map(q=>q.id);
 s=(await executeTool(repo,'save_custom_test',{...args(s),testId,name:'Saved practice',questionIds:[ids[0],ids[2]],size:'all',adaptive:false})).state;
 const selection={studyFolder:{kind:'lecture',label:'Lecture A'},practiceTestId:testId,size:'all',adaptive:false};
 s=(await executeTool(repo,'save_preferences',{...args(s),...selection})).state;
 const reloaded=(await executeTool(repo,'read_course_state',{courseId:s.courseId})).state;
 assert.deepEqual(reloaded.preferences.studyFolder,selection.studyFolder);assert.equal(reloaded.preferences.practiceTestId,testId);
 assert.deepEqual(matchingExamQuestions(reloaded,reloaded.preferences).map(q=>q.id),[ids[0]]);
 s=(await executeTool(repo,'start_test',{...args(s),...selection})).state;
 assert.equal(s.session.total,1);assert.equal(s.question.id,ids[0]);assert.equal(s.question.answer,undefined);
 const originalRevision=s.revision;
 await assert.rejects(executeTool(repo,'start_test',{...args(s),...selection,studyFolder:{kind:'lecture',label:'Empty folder'},restart:true}),/No questions match/);
 assert.equal((await repo.get(s.courseId)).revision,originalRevision);
 s=(await executeTool(repo,'start_test',{...args(s),size:'all',adaptive:false,restart:true})).state;
 assert.equal(s.session.total,3);
});
