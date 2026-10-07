import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
const repo = resolve(process.argv[2] || '/Users/danieldehkordi/Desktop/Test/App');
await mkdir('lib', {recursive:true});
const noopStore = `export const saveDoc=()=>Promise.resolve(),removeDoc=saveDoc,listDocs=async()=>[],coursePath=id=>id,subPath=(id,s)=>id+'/'+s,docPath=(id,s,q)=>id+'/'+s+'/'+q,coursesPath=()=>'',ROOT=()=>'';`;
const result=await build({stdin:{contents:`export { Exam, createSession, MAX_DEPTH } from ${JSON.stringify(repo+'/src/engine.js')}; export { CourseModel, cleanQuestion } from ${JSON.stringify(repo+'/src/model.js')}; export { isDue, bucket, summarize } from ${JSON.stringify(repo+'/src/srs.js')}; export { gradeAnswer, isInteractive } from ${JSON.stringify(repo+'/src/grade.js')}; export { questionType, QUESTION_TYPES } from ${JSON.stringify(repo+'/src/question-types.js')}; export { objectiveConcepts } from ${JSON.stringify(repo+'/src/coverage.js')}; export { conceptId } from ${JSON.stringify(repo+'/src/util.js')};`,resolveDir:repo},bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,plugins:[{name:'chatgpt-host-adapter',setup(b){
 b.onLoad({filter:/\/src\/(engine|store|ai|explain)\.js$/},async({path})=>{
  if(basename(path)==='store.js')return {contents:noopStore,loader:'js'};
  if(basename(path)==='ai.js')return {contents:`export const askJSON=async()=>{throw new Error('Generation must be supplied by the host')},aiAvailable=()=>false,aiErrorMessage=e=>e?.message;`,loader:'js'};
  if(basename(path)==='explain.js')return {contents:`export const explainQuestion=async()=>null;`,loader:'js'};
  let code=await readFile(path,'utf8');
  code=code.replace('constructor(m) {','constructor(m, services = {}) {').replace('this.m = m;','this.m = m;\n    this.services = { askJSON, aiAvailable, getGen, explainQuestion, autoExplain: false, ...services };');
  const start=code.indexOf('export class Exam');
  code=code.slice(0,start)+code.slice(start).replaceAll('aiAvailable()', 'this.services.aiAvailable()').replaceAll('await askJSON(', 'await this.services.askJSON(').replaceAll('getGen()', 'this.services.getGen()').replaceAll("lsGet('wk-autoexp', true)", 'this.services.autoExplain').replaceAll('explainQuestion(this.m', 'this.services.explainQuestion(this.m');
  return {contents:code,loader:'js',resolveDir:repo+'/src'};
 });
}}]});
await writeFile('lib/pummy-core.mjs',result.outputFiles[0].text);
console.log('Bundled existing Pummy exam engine, course model, source retrieval, prompts, grading, and spaced repetition.');
