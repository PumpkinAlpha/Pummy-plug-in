import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strFromU8,strToU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {sourceObjectives,objectiveText,OBJECTIVE_RULES} from '../lib/source-objectives.js';
import {extractSourceFile,saveManualSource} from '../app/source-files.js';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';
import {executeTool} from '../worker/tools.js';
import {fixturePPTX} from './tutor-fixtures.mjs';
import {buildGenerationPrompt} from '../app/generation-plan.js';
import {explanationGuidance} from '../lib/explanation-depth.js';
import {importBankFiles} from '../app/bank-import.js';
import {PluginCourse,emptyCourse} from '../worker/course.js';
import {grounding,formatGrounding,MAX_CONTEXT} from '../worker/grounding.js';
import {uploadPresentationFile} from '../app/tutor-files.js';
const question={term:'Venous return',stem:'Which vessel?',options:['Vein','Aorta'],answer:[0]};
test('assignment sections do not become part of the preceding PowerPoint objective',()=>{
 const goals=sourceObjectives({id:'s',name:'Respiratory.pptx',pages:[{page:2,text:'Learning objectives\nExplain lung compliance.\nLecturio Assignments\nBreathing Mechanics (4:29 min & 2 questions)\nRespiratory – 2\nObjectives\nDiscuss pulmonary blood flow.\nLecturio Assignments\nPulmonary Blood Flow (2:35 min & 1 question)'}]});assert.deepEqual(goals.map(o=>o.text),['Explain lung compliance.','Discuss pulmonary blood flow.']);assert.ok(goals.every(o=>o.page===2));
});
test('long objective wording stays complete while grounding context remains bounded',()=>{
 const model=new PluginCourse(emptyCourse('long','Long objectives')),texts=Array.from({length:6},(_,i)=>'Describe '+String(i)+' '+('cardiovascular physiology '.repeat(110)).trim()+'.');model.sources.set('s',{id:'s',name:'Objectives.txt'});model.texts.set('s',texts.map((s,i)=>`${i+1}. ${s}`).join('\n'));model.objectives=sourceObjectives(model.sources.get('s'),model.texts.get('s'));const g=grounding(model,'cardiovascular physiology',12000);assert.ok(g.objectives.length);assert.ok(g.objectives.every(o=>texts.includes(o.text)));assert.ok(formatGrounding(g).length<=MAX_CONTEXT);
});
test('student-selected old backups restore questions and objective links while unverified goals remain excluded',async t=>{
 const {repo,call,state}=await setup(t),bank={name:'Old backup',questions:[{...question,objectiveId:'old',progress:{attempts:3,correctCount:2,lastSeen:123,lastResult:'wrong'}}],sources:[],objectives:[{id:'old',text:'Master cardiovascular physiology.'}]};
 await importBankFiles({banks:[bank],attemptRef:{current:null},call});const restored=(await repo.list()).find(c=>c.id!==state.courseId),saved=await repo.get(restored.id),read=(await call('read_course_state',{courseId:restored.id})).state;
 assert.equal(saved.data.objectives[0].text,bank.objectives[0].text);assert.equal(saved.data.questions[0].objectiveId,'old');assert.equal(saved.data.questions[0].attempts,3);assert.deepEqual(read.objectives,[]);assert.equal(read.unverifiedObjectiveCount,1);
 await importBankFiles({banks:[bank],appendCourseId:state.courseId,attemptRef:{current:null},call});assert.equal((await repo.get(state.courseId)).data.questions.at(-1).objectiveId,'old');assert.equal((await call('read_course_state',{courseId:state.courseId})).state.unverifiedObjectiveCount,1);
 await assert.rejects(call('import_questions',{...bank,requestId:crypto.randomUUID()}),/sourceId/);
});
async function setup(t){const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'objective-owner'),call=(n,a)=>executeTool(repo,n,a);const {state}=await call('import_questions',{requestId:crypto.randomUUID(),name:'Objectives',questions:[question]});return {db,repo,call,state};}
test('PowerPoint objective sections preserve original wording, numbering and real slide while ordinary topics produce none',()=>{
 const source={id:'ppt',name:'Cardiac.pptx',lecture:'Session 1',pages:[{page:1,unit:'slide',text:'Venous return\nThe vena cava drains into the right atrium.'},{page:2,unit:'slide',text:'Learning objectives\n1. Describe the venous drainage\nof the thorax.\n2. Compare systole and diastole.\nReferences\nDo not make this an objective.'}]};
 const objectives=sourceObjectives(source);assert.deepEqual(objectives.map(({text,num,page})=>({text,num,page})),[{text:'Describe the venous drainage of the thorax.',num:'1',page:2},{text:'Compare systole and diastole.',num:'2',page:2}]);assert.ok(objectives.every(o=>o.sourceId==='ppt'&&o.lecture==='Session 1'));
 assert.deepEqual(sourceObjectives({...source,pages:[source.pages[0]]}),[]);assert.deepEqual(sourceObjectives({...source,deletedAt:1}),[]);
});
test('objectives document type or filename extracts listed text without inferring goals; repeated objectives deduplicate',()=>{
 for(const source of [{id:'doc',name:'Session objectives.docx'},{id:'doc',name:'Week 1.docx',sourceType:'objectives'}]){
  const result=sourceObjectives(source,'Course objectives\n• Identify the aortic arch branches.\n• Explain venous return.\n• Explain venous return.');assert.deepEqual(result.map(o=>o.text),['Identify the aortic arch branches.','Explain venous return.']);assert.equal(new Set(result.map(o=>o.id)).size,2);
 }
 assert.deepEqual(sourceObjectives({id:'doc',name:'Objectives.docx'},'Course objectives\nCardiovascular physiology'),[]);
});
test('real PPTX and DOCX extraction paths automatically save only their supplied objective paragraphs',async t=>{
 const {call,state}=await setup(t),archive=unzipSync(fixturePPTX()),path='ppt/slides/slide7.xml';archive[path]=strToU8(strFromU8(archive[path]).replace('The jugular and subclavian veins unite.','Learning objectives</a:t></a:r></a:p><a:p><a:r><a:t>1. Describe venous return.'));
 const docx=zipSync({'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Learning objectives</w:t></w:r></w:p><w:p><w:r><w:t>1. Identify the aortic arch branches.</w:t></w:r></w:p></w:body></w:document>')});
 const originalAssetId=await uploadPresentationFile(call,state.courseId,new File([zipSync(archive)],'Standalone.pptx')),p=(await call('import_presentation',{courseId:state.courseId,presentationId:crypto.randomUUID(),originalAssetId})).presentation,context=(await call('read_slide_context',{courseId:state.courseId,presentationId:p.id,slideId:p.slides[0].id,query:'venous return'})).context;assert.equal(context.objectives[0].text,'Describe venous return.');assert.equal(context.objectives[0].page,1);assert.equal(context.objectives[0].sourceId,'presentation-'+p.id);
 for(const [name,bytes,expected] of [['Lecture.pptx',zipSync(archive),'Describe venous return.'],['Objectives.docx',docx,'Identify the aortic arch branches.']]){
  const parsed=await extractSourceFile(new File([bytes],name),{Parser:DOMParser}),result=await saveManualSource(call,state.courseId,{...parsed,sourceType:'professor_slides',rank:1},{kind:'lecture',label:'Session 1'},{sourceId:name.replace('.','-'),requestId:crypto.randomUUID()});const objective=result.state.objectives.find(o=>o.text===expected);assert.ok(objective);assert.equal(objective.lecture,'Session 1');if(name.endsWith('.pptx'))assert.equal(objective.page,1);
 }
});
test('sync, new bank imports and question appends reject invented, paraphrased, shortened, uncited or wrong-page objectives atomically',async t=>{
 const {repo,call,state}=await setup(t),source={id:'slides',name:'Lecture.pptx',pages:[{page:3,unit:'slide',text:'Objectives\n1. Describe venous return and its regulation.'}],text:'Objectives\n1. Describe venous return and its regulation.'};
 let current=(await call('sync_course_sources',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),sources:[source]})).state;const before=await repo.get(state.courseId),banks=(await call('list_practice_banks',{courseId:state.courseId})).banks;
 for(const objective of [{id:'made-up',text:'Analyze heart disease.',sourceId:'slides'},{id:'paraphrase',text:'Explain venous return and its control.',sourceId:'slides'},{id:'shortened',text:'Describe venous return',sourceId:'slides'},{id:'uncited',text:'Describe venous return and its regulation.'},{id:'bad-page',text:'Describe venous return and its regulation.',sourceId:'slides',page:9}]){
  await assert.rejects(call('sync_course_sources',{courseId:state.courseId,revision:current.revision,requestId:crypto.randomUUID(),objectives:[objective]}),/objective|sourceId/i);
  await assert.rejects(call('add_questions',{courseId:state.courseId,revision:current.revision,requestId:crypto.randomUUID(),questions:[question],objectives:[objective]}),/objective|sourceId/i);
  await assert.rejects(call('import_questions',{requestId:crypto.randomUUID(),name:'Invalid',questions:[question],sources:[source],objectives:[objective]}),/objective|sourceId/i);
 }
 assert.deepEqual(await repo.get(state.courseId),before);assert.deepEqual((await call('list_practice_banks',{courseId:state.courseId})).banks,banks);assert.equal((await repo.list()).length,1);
 current=(await call('sync_course_sources',{courseId:state.courseId,revision:current.revision,requestId:crypto.randomUUID(),objectives:[{id:'literal',text:'Describe venous return\nand its regulation.',sourceId:'slides',num:99,page:3}]})).state;const exact=current.objectives.find(o=>o.id==='literal');assert.equal(exact.text,'Describe venous return and its regulation.');assert.equal(exact.num,'1');assert.equal(exact.page,3);
});
test('existing unverified objective records stay stored but are excluded from coverage, grounding and displayed question objectives',async t=>{
 const {repo,call,state}=await setup(t),saved=await repo.get(state.courseId),legacy=structuredClone(saved.data);legacy.objectives=[{id:'invented',text:'Master all cardiovascular physiology.'}];legacy.questions[0].objectiveId='invented';await repo.save(legacy,saved.revision,saved.data);
 const before=await repo.get(state.courseId),read=(await call('read_course_state',{courseId:state.courseId})).state;assert.deepEqual(read.objectives,[]);assert.deepEqual(read.progress.objectives,[]);assert.equal(read.unverifiedObjectiveCount,1);assert.deepEqual((await call('retrieve_sources',{courseId:state.courseId,query:'cardiovascular'})).context.objectives,[]);assert.deepEqual(await repo.get(state.courseId),before);
 const active=(await call('start_test',{courseId:state.courseId,revision:read.revision,size:1,adaptive:false})).state;assert.equal(active.question.objective,null);assert.equal((await repo.get(state.courseId)).data.questions[0].objectiveId,'invented');
});
test('pulling selected old sources is idempotent, preserves exams and only includes supported current wording',async t=>{
 const {repo,call,state}=await setup(t),saved=await repo.get(state.courseId),old=structuredClone(saved.data);old.sources=[{id:'a',name:'A.pptx',kind:'material',lecture:'Folder A'},{id:'b',name:'Objectives.txt',kind:'material',lecture:'Folder B'}];old.texts=[['a','Objectives\n1. Describe venous return.'],['b','1. Identify the aorta.']];await repo.save(old,saved.revision,saved.data);
 let current=(await call('start_test',{courseId:state.courseId,revision:saved.revision+1,size:1,adaptive:false})).state;const before=await repo.get(state.courseId);current=(await call('pull_source_objectives',{courseId:state.courseId,revision:current.revision,sourceIds:['a']})).state;assert.deepEqual(current.objectives.map(o=>o.text),['Describe venous return.']);const again=(await call('pull_source_objectives',{courseId:state.courseId,revision:current.revision,sourceIds:['a']})).state;assert.equal(again.revision,current.revision);
 for(const key of ['questions','session','concepts','history'])assert.deepEqual((await repo.get(state.courseId)).data[key],before.data[key]);
 current=(await call('sync_course_sources',{courseId:state.courseId,revision:current.revision,requestId:crypto.randomUUID(),sources:[{id:'a',name:'A.pptx',text:'Objectives\n1. Describe cardiac output.'}]})).state;assert.deepEqual(current.objectives.map(o=>o.text),['Describe cardiac output.']);assert.equal(current.unverifiedObjectiveCount,1);
});
test('explanation objective text cannot create an official objective and every generation prompt forbids inferred objectives',async t=>{
 const {repo,call,state}=await setup(t);await call('add_questions',{courseId:state.courseId,revision:state.revision,requestId:crypto.randomUUID(),questions:[{...question,stem:'Another vessel?',explanation:{body:['Supported explanation.'],objective:'Invented official goal.'}}]});assert.equal((await repo.get(state.courseId)).data.questions.at(-1).explanation.objective,undefined);
 for(const mode of ['coverage','gaps','custom'])assert.ok(buildGenerationPrompt({...state,storedQuestionCount:1},{mode,count:1,sourceIds:[]},crypto.randomUUID()).includes(OBJECTIVE_RULES));assert.ok(explanationGuidance('comprehensive').includes(OBJECTIVE_RULES));assert.equal(objectiveText('Describe\n return.'),'Describe return.');
});
