import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const bundle=await build({entryPoints:['app/markdown.jsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],plugins:[{name:'citation-test',setup(b){
 b.onResolve({filter:/^\.\/citations\.jsx$/},()=>({path:'citation',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const Cite=({raw})=>raw;'}));
}}]});
const module={exports:{}};
vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require:await import('node:module').then(m=>m.createRequire(import.meta.url))});
const render=text=>renderToStaticMarkup(createElement(module.exports.Markdown,{text}));

test('separator-only Markdown from a tutor cannot crash the exam view',()=>{
 assert.match(render('| --- | --- |\n| --- | --- |'),/---/);
 assert.match(render('| --- | --- |\n\nContinue studying.'),/Continue studying/);
});
test('Markdown tables still render their header and content',()=>{
 const html=render('| Topic | Result |\n| --- | --- |\n| Fractions | Correct |');
 assert.match(html,/<th>Topic<\/th>/);assert.match(html,/<td>Correct<\/td>/);
});
