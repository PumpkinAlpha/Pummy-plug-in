import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {PluginCourse,emptyCourse} from '../worker/course.js';
import {sourceObjectives} from '../lib/source-objectives.js';
import {pagesOf,grounding} from '../worker/grounding.js';
import {subtopicReport} from '../lib/subtopic-coverage.js';
// Keep the student's six actual references in ignored local QA storage, never GitHub.
const path=process.env.PUMMY_ANATOMY_SOURCE_FIXTURE||'work/anatomy-source-audit.json';
test('actual Session 21–22 references expose visual extraction gaps and never imply precise knowledge from objective links', {skip:!existsSync(path)&&'Supply a private Session 21–22 source fixture to exercise this course regression.'},()=>{
 const fixture=JSON.parse(readFileSync(path,'utf8')),model=new PluginCourse(emptyCourse('session-regression','Anatomy source regression'));
 for(const s of fixture.sourceTexts){model.sources.set(s.id,s);model.texts.set(s.id,s.text);}
 assert.equal(model.sources.size,6);
 const slides=fixture.sourceTexts.find(s=>s.sourceType==='professor_slides'),pages=pagesOf(slides,slides.text);assert.equal(pages.length,82);assert.equal(pages.filter(p=>!p.text.trim()).length,19);assert.ok(slides.originalFile);
 const objectives=fixture.sourceTexts.find(s=>s.sourceType==='objectives');model.objectives=sourceObjectives(objectives,objectives.text);assert.equal(model.objectives.length,11);assert.ok(model.objectives.every(o=>!o.text.includes('SESSION 22')));
 const topics=['Diagram labels','Precise appendix and liver projections','Side-specific trunk movements','Gallbladder visceral and referred pain pathways','Internal thoracic artery exact division level'];
 const report=subtopicReport(model,{id:'five-known-gaps',topics:topics.map((detail,i)=>({id:String(i),detail,status:i?'source_unverified':'technical_blocked',reason:'Original diagrams require inspection; a named objective or unkeyed answer option is not verified knowledge.',inspectedSourceIds:fixture.sourceTexts.map(s=>s.id)}))});
 assert.equal(report.topics.length,5);assert.equal(report.covered,0);assert.equal(report.complete,false);assert.equal(report.terminal,true);
 for(const query of ['appendix liver surface projections','trunk rotation flexion','gallbladder pain nerves','internal thoracic divide branches'])assert.ok(grounding(model,query,10000).excerpts.length>0);
 assert.equal(model.sourceVisuals.length,0);assert.equal(model.questions.size,0);
});
