import test from 'node:test';
import assert from 'node:assert/strict';
import {banksFromFile} from '../app/import.js';
import {executeTool} from '../worker/tools.js';
import {LocalD1} from '../scripts/local-db.mjs';
import {CourseRepository} from '../worker/repository.js';

const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK9sAAAAASUVORK5CYII=';
const question={term:'Mock concept',stem:'Question?',options:['One','Two'],answer:[0],origin:'practice',keyed:true};
const backup=(raw,documents=[])=>({format:'daniel-ai-backup',documents:[['data/users/local/workup/courses/course',{name:'Backup'}],['data/users/local/workup/courses/course/questions/q',raw],...documents]});

test('invalid and empty structured JSON banks produce readable import errors',()=>{
 for(const data of [null,42,'bank',[],{}, {questions:[]}])assert.throws(()=>banksFromFile(data,'quiz.json'),/JSON must contain/);
 assert.equal(banksFromFile([question],'quiz.json')[0].name,'quiz');
});

test('backup conversion clears orphaned objective IDs and preserves inline explanation figures',async t=>{
 const [bank]=banksFromFile(backup({...question,objectiveId:'missing',explanation:{body:['Review this diagram.'],figures:[{dataUrl:image,file:'Diagram',page:1,unit:'page'}]}}),'backup.json');
 assert.equal(bank.questions[0].objective,undefined);
 assert.equal(bank.questions[0].objectiveId,undefined);
 assert.equal(bank.questions[0].explanation.figures[0].dataUrl,image);
 const db=new LocalD1();t.after(()=>db.close());const repo=new CourseRepository(db,'backup-test');
 const imported=await executeTool(repo,'import_questions',{...bank,requestId:crypto.randomUUID()});
 assert.equal(imported.state.questionCount,1);
});

test('large backup references fail before any source text can be silently truncated',()=>{
 const documents=[['data/users/local/workup/courses/course/sources/source',{name:'Long handout'}],['data/users/local/workup/courses/course/texts/chunk',{sid:'source',i:0,text:'x'.repeat(60001)}]];
 assert.throws(()=>banksFromFile(backup({...question,sourceId:'source'},documents),'backup.json'),/Long handout.*60,000.*nothing was imported/);
});

test('backup labels without a stored distractor bank keep their diagram and targets',()=>{
 const label={...question,type:'label',figure:{dataUrl:image},targets:[{x:0,y:0,w:.2,h:.2,answer:'Left'},{x:.5,y:.5,w:.2,h:.2,answer:'Right'}]};
 const [bank]=banksFromFile(backup(label),'backup.json');
 assert.deepEqual(bank.questions[0].distractors,[]);
 assert.equal(bank.questions[0].figure.dataUrl,image);
});
