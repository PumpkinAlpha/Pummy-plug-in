import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {PluginCourse,emptyCourse,ingest} from '../worker/course.js';
import {difficultyScore,calibrateDifficulty,responseScore,validateCognitiveReview} from '../lib/assessment-quality.js';
import {subtopicReport} from '../lib/subtopic-coverage.js';
const sourceText='Objectives\n1. Describe abdominal muscles and their movements.\nExternal oblique rotates the trunk contralaterally. Internal oblique rotates the trunk ipsilaterally. Bilateral rectus abdominis flexes the trunk. Skin is superficial to superficial fascia; deep fascia precedes muscle.';
const base={term:'Trunk movement',stem:'Which muscle flexes the trunk?',options:['Rectus abdominis','Internal oblique','External oblique'],answer:[0],origin:'practice',sourceId:'s',definition:'Original professor explanation.',progress:{attempts:3,correctCount:2,lastSeen:12,lastResult:'wrong'}};
const good={reasoning:2,integration:2,application:2,discrimination:1};
const checks={sourceSupport:true,accuracy:true,unambiguous:true,reasoning:true,distractors:true,format:true,explanations:true};
async function setup(t,topics){
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'quality-owner');let state=(await executeTool(repo,'import_questions',{requestId:crypto.randomUUID(),name:'Regression',questions:[base],sources:[{id:'s',name:'Professor.txt',text:sourceText}]})).state;
 const original=(await repo.get(state.courseId)).data,runId=crypto.randomUUID(),call=async(name,args={})=>{const payload={courseId:state.courseId,revision:state.revision,runId,...args};if(payload.runId===undefined)delete payload.runId;const r=await executeTool(repo,name,payload);if(r.state)state=r.state;return r;};
 topics=topics||[{id:'right-rotation',objectiveId:state.objectives[0].id,detail:'Right rotation requires distinguishing ipsilateral and contralateral muscle actions.',suitableTypes:['mcq','multi','match','order']}];
 await call('begin_bank_repair',{requestId:runId,sourceIds:['s'],bankName:'Verified gap repair',topics,mode:topics.every(t=>t.objectiveId)?'coverage':'gaps'});
 const read=await call('read_bank_repair');await call('calibrate_bank_difficulty',{ratings:read.context.baselineSample.map(q=>({questionId:q.id,reasoning:1,integration:0,application:0,discrimination:1,rationale:'This original item tests isolated muscle identification.'}))});
 return {db,repo,call,original,runId,get state(){return state;},topics};
}
async function map(ctx,subtopicId=ctx.topics[0].id){return ctx.call('map_bank_subtopic',{subtopicId,status:'supported',evidence:[{sourceId:'s',quote:'External oblique rotates the trunk contralaterally.'}],inspectedSourceIds:['s'],reason:'The professor source explicitly states this muscular action.',correctiveAction:'Test the side-specific action using two related muscle relationships.'});}
function question(ctx,extra={}){return {...base,progress:undefined,origin:'generated',objectiveId:ctx.topics[0].objectiveId,stem:'A patient turns the trunk to the right. Which combination respects the ipsilateral action of internal oblique and contralateral action of external oblique?',options:['Right internal and left external oblique','Left internal and right external oblique','Bilateral rectus abdominis'],answer:[0],optionNotes:['Right internal is ipsilateral and left external contralateral.','This combination rotates left under the source framing.','Bilateral rectus produces flexion.'],explanation:{body:['Right rotation integrates the ipsilateral internal and contralateral external oblique actions.']},assessment:{runId:ctx.runId,subtopicIds:[ctx.topics[0].id],evidence:[{sourceId:'s',quote:'External oblique rotates the trunk contralaterally.'},{sourceId:'s',quote:'Internal oblique rotates the trunk ipsilaterally.'}],difficulty:{...good,steps:['Determine which side of internal oblique rotates ipsilaterally.','Combine this with the external oblique on the opposite side.'],relationships:['Internal oblique is ipsilateral to the rotation.','External oblique is contralateral to the rotation.'],rationale:'Application requires combining the two supported sided actions.'},formatReason:'Choices distinguish plausible confusion of ipsilateral and contralateral actions.'},...extra};}
async function stage(ctx,q=question(ctx)){const r=await ctx.call('stage_bank_questions',{requestId:crypto.randomUUID(),questions:[q]});return r.context.candidateIds.at(-1);}
async function review(ctx,candidateId,extra={}){return ctx.call('review_bank_question',{candidateId,accepted:true,...good,requiredSubtopicIds:[ctx.topics[0].id],checks,critique:'Independent solution combines right internal with left external; all other choices contradict the source.',correctiveAction:'No correction required after the independent source-grounded review.',...extra});}

test('durable retrieve/generate/review/save/reassess loop gates coverage and preserves professor records',async t=>{
 const ctx=await setup(t);await map(ctx);let r=await ctx.call('read_bank_repair');assert.equal(r.context.report.percent,0);
 const candidateId=await stage(ctx);assert.equal(ctx.state.questionCount,1);assert.equal(ctx.state.coverageReport.covered,0);
 await assert.rejects(ctx.call('finish_bank_repair'),/Review every/);
 await assert.rejects(review(ctx,candidateId,{checks:{...checks,accuracy:false}}),/Independent review failed/);
 await review(ctx,candidateId);assert.equal(ctx.state.questionCount,2);assert.equal(ctx.state.coverageReport.complete,true);
 r=await ctx.call('finish_bank_repair');assert.equal(r.context.nextAction,'finished');
 const stored=await ctx.repo.get(ctx.state.courseId);assert.deepEqual(stored.data.questions[0],ctx.original.questions[0]);assert.deepEqual(stored.data.preferences,ctx.original.preferences);assert.deepEqual(stored.data.history,ctx.original.history);
 const saved=stored.data.questions[1];assert.equal(saved.origin,'generated');assert.equal(saved.objectiveId,ctx.topics[0].objectiveId);assert.ok(saved.assessment.review.accepted);assert.ok(saved.assessment.difficulty.score>=r.context.calibration.target);
 assert.equal((await ctx.call('read_course_state')).state.coverageReport.percent,100);
 assert.equal((await ctx.call('list_practice_banks')).banks.filter(b=>b.groupId==='prompt:'+ctx.runId).length,1);
 const exported=(await ctx.call('export_bank')).export;const restored=await executeTool(ctx.repo,'restore_saved_bank',{...exported,requestId:crypto.randomUUID()});assert.equal(restored.state.questionCount,2);
 const restoredData=await ctx.repo.get(restored.state.courseId);assert.deepEqual(restoredData.data.questions[1].assessment,saved.assessment);
 await assert.rejects(ctx.call('stage_bank_questions',{requestId:crypto.randomUUID(),questions:[question(ctx)]}),/finished/);
});
test('unsupported precise details stay visible, never count complete and require all sources inspected',async t=>{
 const ctx=await setup(t,[{id:'division-level',detail:'The precise internal thoracic artery terminal division level.',suitableTypes:['mcq']}]);
 await ctx.call('map_bank_subtopic',{subtopicId:'division-level',status:'source_unverified',inspectedSourceIds:['s'],reason:'The complete supplied source does not give a division level.',correctiveAction:'Request the professor vascular diagram or authorization for an additional reference.'});
 const r=await ctx.call('finish_bank_repair');assert.equal(r.context.report.complete,false);assert.equal(r.context.report.percent,0);assert.equal(r.context.report.topics[0].status,'source_unverified');assert.equal(ctx.state.questionCount,1);
});
test('source quotes, exact pages, duplicate stems and shallow cognition are rejected before persistence',async t=>{
 const ctx=await setup(t);await map(ctx);const q=question(ctx),before=await ctx.repo.get(ctx.state.courseId);
 for(const bad of [{...q,assessment:{...q.assessment,evidence:[{sourceId:'s',page:99,quote:'The invented detail is unsupported.'}]}},{...q,stem:base.stem},{...q,assessment:{...q.assessment,difficulty:{...q.assessment.difficulty,reasoning:1}}}])assert.ok((await ctx.call('stage_bank_questions',{requestId:crypto.randomUUID(),questions:[bad]})).context.lastDiagnostic);
 assert.deepEqual((await ctx.repo.get(ctx.state.courseId)).data.questions,before.data.questions);
});
test('independent rejections are bounded with a meaningful corrective action',async t=>{
 const ctx=await setup(t);await map(ctx);
 for(let i=0;i<3;i++){const id=await stage(ctx);await review(ctx,id,{accepted:false,checks:{...checks,accuracy:false},critique:'This candidate requires a clearer distinction of the paired muscle actions.',correctiveAction:'Retrieve both action statements again and repair the sided muscle pairing.'});}
 const r=await ctx.call('read_bank_repair');assert.equal(r.context.report.topics[0].status,'technical_blocked');assert.equal(r.context.report.topics[0].attempts,3);assert.match(r.context.report.topics[0].correctiveAction,/Retrieve both/);assert.match((await ctx.call('stage_bank_questions',{requestId:crypto.randomUUID(),questions:[question(ctx)]})).context.lastDiagnostic.reason,/attempts remaining/);assert.equal(ctx.state.questionCount,1);
});
test('source updates invalidate previously reviewed conceptual coverage',async t=>{
 const ctx=await setup(t);await map(ctx);await review(ctx,await stage(ctx));assert.equal(ctx.state.coverageReport.percent,100);
 await ctx.call('sync_course_sources',{runId:undefined,requestId:crypto.randomUUID(),sources:[{id:'s',name:'Professor.txt',text:'Objectives\n1. Describe abdominal muscles and their movements.\nThe revised source omits muscle action details.'}]});
 assert.equal(ctx.state.coverageReport.covered,0);assert.equal(ctx.state.coverageReport.complete,false);
});
test('AI bank questions cannot bypass staging and are never stored as professor questions',async t=>{
 const ctx=await setup(t);await assert.rejects(ctx.call('add_questions',{requestId:crypto.randomUUID(),questions:[question(ctx)]}),/AI-generated/);assert.equal(ctx.state.questionCount,1);
});
test('rubric uses the same baseline scale and partial credit penalizes over-selection',()=>{
 assert.equal(difficultyScore(good),7);assert.equal(calibrateDifficulty([{id:'a'}],[{questionId:'a',reasoning:2,integration:1,application:1,discrimination:1,rationale:'Two linked interpretation steps.'}]).target,10);
 assert.equal(responseScore({multi:true,answer:[0,1]},[0,1,2]),.5);assert.equal(responseScore({multi:true,answer:[0,1]},[0,1]),1);
 assert.equal(responseScore({type:'order',items:['a','b','c']},['b','a','c']),1/3);assert.equal(responseScore({type:'match',pairs:[{right:'A'},{right:'B'}]},{0:'A',1:'C'}),.5);
 assert.throws(()=>validateCognitiveReview(null),/Independently review/);
 assert.throws(()=>validateCognitiveReview({review:'Reviewed against the available course source.',difficulty:{...good,reasoning:1,steps:['Recall the name.'],relationships:['One fact.']}}),/challenge target/);
});
test('verified original emphasis prioritizes a mapped subtopic without falsely covering it',async t=>{
 const ctx=await setup(t,[{id:'ordinary',detail:'An ordinary source-supported muscle relationship.',suitableTypes:['mcq']},{id:'focus',detail:'A professor-highlighted muscle relationship.',suitableTypes:['mcq']}]);
 const saved=await ctx.repo.get(ctx.state.courseId),model=new PluginCourse(saved.data),assetId=crypto.randomUUID();model.sources.get('s').originalFile={id:assetId};await ctx.repo.save(model.serialize(),saved.revision,saved.data);await ctx.call('read_course_state');
 await ctx.call('save_source_visual',{sourceId:'s',page:1,assetId,dataUrl:'data:image/png;base64,YQ==',emphasis:[{kind:'highlight',text:'External oblique rotates the trunk contralaterally.'}]});
 const v=ctx.state.sourceVisuals[0],cue=v.emphasis[0];await ctx.call('map_bank_subtopic',{subtopicId:'focus',status:'supported',evidence:[{sourceId:'s',quote:'External oblique rotates the trunk contralaterally.'}],focusCueIds:[cue.id],inspectedSourceIds:['s'],reason:'This original professor-highlighted relationship is explicitly supported.',correctiveAction:'Prioritize this focus topic in the next generated question.'});
 const r=await ctx.call('read_bank_repair');assert.equal(r.context.nextTopic.id,'focus');assert.equal(r.context.report.covered,0);assert.equal(r.context.professorFocus[0].sourceId,'s');
});
test('fake source visuals cannot satisfy anatomy labeling coverage',async t=>{
 const ctx=await setup(t);const r=await ctx.call('read_source_visual',{sourceId:'s',page:1});assert.equal(r.context.status,'source_missing');
 await assert.rejects(ctx.call('save_source_visual',{sourceId:'s',page:1,assetId:crypto.randomUUID(),dataUrl:'data:image/png;base64,YQ=='}),/actual original/);
});
