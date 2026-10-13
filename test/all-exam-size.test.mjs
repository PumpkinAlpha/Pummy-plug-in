import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';

const args=s=>({courseId:s.courseId,revision:s.revision,sessionId:s.session?.id});
const question=i=>({term:`Concept ${i}`,stem:`Choose the answer for ${i}.`,options:['Correct','Incorrect'],answer:[0],sourceId:i%2?'odd':'even',objectiveId:i%2?'odd-objective':'even-objective',weekId:i%2?'Week 1':'Week 2',setId:i%2?'set-odd':'set-even',multi:!!(i%2)});
async function setup(t,count=250){
 const db=new LocalD1(),repo=new CourseRepository(db,'all-size');t.after(()=>db.close());
 let s=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'All bank',questions:Array.from({length:Math.min(200,count)},(_,i)=>question(i)),sources:[{id:'even',name:'Even source',text:'Learning objectives\n1. Even concepts.'},{id:'odd',name:'Odd source',text:'Learning objectives\n1. Odd concepts.'}],objectives:[{id:'even-objective',text:'Even concepts.',sourceId:'even'},{id:'odd-objective',text:'Odd concepts.',sourceId:'odd'}]})).state;
 for(let offset=200;offset<count;offset+=200)s=(await executeTool(repo,'add_questions',{...args(s),requestId:crypto.randomUUID(),questions:Array.from({length:Math.min(200,count-offset)},(_,i)=>question(i+offset))})).state;
 return {db,repo,state:s};
}

test('All starts every eligible bank question beyond 100 with finite session settings',async t=>{
 const {repo,state}=await setup(t,500);
 const s=(await executeTool(repo,'start_test',{...args(state),size:'all',adaptive:false,questionIds:state.questionIndex.map(q=>q.id)})).state;
 assert.equal(s.session.total,500);assert.equal(s.preferences.size,'all');assert.equal(s.session.opts.size,500);assert.equal(s.session.opts.sizeMode,'all');
 const saved=(await repo.get(s.courseId)).data;assert.equal(saved.session.queue.length,499);assert.equal(new Set([s.question.id,...saved.session.queue.map(item=>item.id)]).size,500);
 assert.ok(saved.session.queue.every(item=>item.k==='q'));assert.equal(saved.preferences.size,'all');
 const reloaded=(await executeTool(new CourseRepository(repo.db,'all-size'),'read_course_state',{courseId:s.courseId})).state;
 assert.equal(reloaded.preferences.size,'all');assert.equal(reloaded.session.opts.size,500);
});

test('All respects every strict filter and rejects empty subsets atomically',async t=>{
 const {repo,state}=await setup(t);
 const filtered=(await executeTool(repo,'start_test',{...args(state),size:'all',adaptive:false,sourceIds:['even'],types:['mcq'],weekId:'Week 2',objectiveIds:['even-objective'],setId:'set-even'})).state;
 assert.equal(filtered.session.total,125);assert.equal(filtered.session.opts.size,125);
 const saved=(await repo.get(state.courseId)).data,allowed=new Set(state.questionIndex.filter(q=>q.sourceId==='even').map(q=>q.id));
 assert.ok(saved.session.queue.every(item=>allowed.has(item.id)));assert.equal(filtered.question.source.id,'even');
 for(const filter of [{sourceIds:[]},{types:[]},{objectiveIds:[]},{weekId:'Missing week'},{setId:'missing-set'},{sourceIds:['even'],types:['multi']}]){
  await assert.rejects(executeTool(repo,'start_test',{...args(filtered),size:'all',adaptive:false,restart:true,...filter}),/No questions match/);
  assert.equal((await repo.get(state.courseId)).revision,filtered.revision);
 }
});

test('All includes seen questions sharing due concepts exactly once and preserves review priority',async t=>{
 const {repo,state}=await setup(t,5),saved=await repo.get(state.courseId);
 const original=saved.data.questions[0].conceptId;
 for(let i=0;i<3;i++)Object.assign(saved.data.questions[i],{conceptId:original,attempts:1,lastResult:'correct',lastSeen:Date.now()});
 Object.assign(saved.data.concepts.find(c=>c.id===original),{status:'review',due:1,attempts:3,correct:3});
 const revision=await repo.save(saved.data,saved.revision);
 const s=(await executeTool(repo,'start_test',{courseId:state.courseId,revision,size:'all',adaptive:true,practiceFirst:false,includeReviews:true})).state;
 assert.equal(s.session.total,5);assert.equal(s.generation,null);assert.equal(s.question.id,saved.data.questions[0].id);
 const queue=(await repo.get(state.courseId)).data.session.queue;
 assert.equal(new Set([s.question.id,...queue.map(item=>item.id)]).size,5);assert.deepEqual(new Set([s.question.id,...queue.map(item=>item.id)]),new Set(saved.data.questions.map(q=>q.id)));
 assert.equal(s.preferences.includeReviews,true);
 const noReviews=(await executeTool(repo,'start_test',{...args(s),size:'all',adaptive:false,practiceFirst:false,includeReviews:false,restart:true})).state;
 assert.equal(noReviews.session.total,5);assert.equal(noReviews.preferences.includeReviews,false);
});

test('All preferences and saved custom tests roundtrip while numeric exams and active resumes stay unchanged',async t=>{
 const {repo,state}=await setup(t,30);
 let s=(await executeTool(repo,'start_test',{...args(state),size:20,adaptive:false})).state;
 assert.equal(s.session.total,20);assert.equal(s.session.opts.size,20);assert.equal(s.session.opts.sizeMode,undefined);
 const activeBefore=(await repo.get(s.courseId)).data.session;
 s=(await executeTool(repo,'save_preferences',{...args(s),size:'all',adaptive:false})).state;
 assert.equal(s.preferences.size,'all');assert.deepEqual((await repo.get(s.courseId)).data.session,activeBefore);
 s=(await executeTool(repo,'start_test',{...args(s),size:'all',adaptive:false})).state;
 assert.deepEqual((await repo.get(s.courseId)).data.session,activeBefore);assert.equal(s.session.total,20);
 const testId=crypto.randomUUID(),questionIds=s.questionIndex.slice(0,25).map(q=>q.id);
 s=(await executeTool(repo,'save_custom_test',{...args(s),testId,name:'All selected',questionIds,size:'all',adaptive:false})).state;
 assert.equal(s.customTests[0].preferences.size,'all');assert.equal(s.session.id,activeBefore.id);
 s=(await executeTool(repo,'start_test',{...args(s),customTestId:testId,restart:true})).state;
 assert.equal(s.session.total,25);assert.equal(s.session.opts.size,25);assert.equal(s.session.opts.sizeMode,'all');assert.equal(s.preferences.size,'all');
 s=(await executeTool(repo,'save_preferences',{...args(s),size:20,adaptive:false})).state;
 assert.equal(s.preferences.size,20);assert.equal(s.session.total,25);
 await assert.rejects(executeTool(repo,'save_preferences',{...args(s),size:501}));
 await assert.rejects(executeTool(repo,'save_preferences',{...args(s),size:'20'}));
});

test('custom counts and saved selections can use the full bank beyond 100 questions',async t=>{
 const {repo,state}=await setup(t),allIds=state.questionIndex.map(q=>q.id);
 let s=(await executeTool(repo,'start_test',{...args(state),size:150,examMode:'custom',adaptive:false})).state;
 assert.equal(s.session.total,150);assert.equal(s.session.opts.size,150);assert.equal(s.session.opts.examMode,'custom');
 const testId=crypto.randomUUID();
 s=(await executeTool(repo,'save_custom_test',{...args(s),testId,name:'Full selection',questionIds:allIds,size:'all',adaptive:false})).state;
 assert.equal(s.customTests[0].questionIds.length,250);
 s=(await executeTool(repo,'start_test',{...args(s),customTestId:testId,restart:true})).state;
 assert.equal(s.session.total,250);assert.equal(s.session.opts.size,250);
 s=(await executeTool(repo,'start_test',{...args(s),questionIds:allIds.slice(0,5),size:20,examMode:'custom',adaptive:false,restart:true})).state;
 assert.equal(s.session.total,5);assert.equal(s.preferences.size,20);
});

test('exam modes filter by exact professor origin and current struggle status without exposing answer keys',async t=>{
 const {repo,state}=await setup(t,10),saved=await repo.get(state.courseId),questions=saved.data.questions,concepts=saved.data.concepts;
 questions[1].origin='own';questions[2].origin='generated';questions[5].origin='own';questions[8].origin='own';questions[9].origin='generated';
 const setConcept=(i,values)=>Object.assign(concepts.find(c=>c.id===questions[i].conceptId),values);
 setConcept(1,{attempts:1,status:'learning',interval:0});questions[1].lastResult='correct';
 setConcept(2,{attempts:1,status:'review',interval:7});questions[2].lastResult='wrong';questions[2].lastSeen=Date.now();
 setConcept(3,{attempts:3,status:'review',interval:21});questions[3].lastResult='wrong';
 setConcept(4,{attempts:3,status:'review',interval:7});questions[4].lastResult='correct';
 questions[5].lastResult='wrong';
 setConcept(6,{attempts:1,status:'review',interval:7});questions[6].lastResult='wrong';questions[6].lastSeen=1;
 setConcept(7,{attempts:1,status:'learning',interval:0});questions[7].lastResult='correct';
 const revision=await repo.save(saved.data,saved.revision);
 let s=(await executeTool(repo,'read_course_state',{courseId:state.courseId})).state;
 const expected=new Set([1,2,5,6,7].map(i=>questions[i].id));
 assert.deepEqual(new Set(s.questionIndex.filter(q=>q.struggling).map(q=>q.id)),expected);
 assert.equal(s.questionIndex.find(q=>q.id===questions[1].id).origin,'own');
 assert.ok(s.questionIndex.every(q=>!('answer' in q)&&!('definition' in q)));
 s=(await executeTool(repo,'start_test',{courseId:state.courseId,revision,size:'all',examMode:'struggling',adaptive:false})).state;
 assert.equal(s.preferences.examMode,'struggling');assert.equal(s.session.opts.examMode,'struggling');assert.equal(s.session.total,5);
 assert.deepEqual(new Set([s.question.id,...(await repo.get(s.courseId)).data.session.queue.map(item=>item.id)]),expected);
 s=(await executeTool(repo,'start_test',{...args(s),size:'all',examMode:'professor',adaptive:false,restart:true,sourceIds:['odd'],types:['multi'],weekId:'Week 1',objectiveIds:['odd-objective'],setId:'set-odd'})).state;
 assert.equal(s.session.total,2);
 const professorIds=[s.question.id,...(await repo.get(s.courseId)).data.session.queue.map(item=>item.id)];
 assert.deepEqual(new Set(professorIds),new Set([questions[3].id,questions[7].id]));
 s=(await executeTool(repo,'start_test',{...args(s),size:'all',examMode:'all',adaptive:false,restart:true})).state;
 assert.equal(s.session.total,10);assert.equal(s.preferences.examMode,'all');
 const active=(await repo.get(s.courseId)).data.session;
 s=(await executeTool(repo,'save_preferences',{...args(s),size:'all',examMode:'struggling',adaptive:false})).state;
 s=(await executeTool(repo,'start_test',{...args(s),size:'all',examMode:'struggling',adaptive:false})).state;
 assert.deepEqual((await repo.get(s.courseId)).data.session,active);assert.equal(s.session.opts.examMode,'all');
});

test('empty struggling and professor modes never widen to all questions',async t=>{
 const {repo,state}=await setup(t,3),before=await repo.get(state.courseId);
 await assert.rejects(executeTool(repo,'start_test',{...args(state),size:'all',examMode:'struggling',adaptive:false}),/No questions match/);
 assert.deepEqual(await repo.get(state.courseId),before);
 before.data.questions.forEach(q=>q.origin='own');
 const revision=await repo.save(before.data,before.revision),after=await repo.get(state.courseId);
 await assert.rejects(executeTool(repo,'start_test',{courseId:state.courseId,revision,size:'all',examMode:'professor',adaptive:false}),/No questions match/);
 assert.deepEqual(await repo.get(state.courseId),after);
});
