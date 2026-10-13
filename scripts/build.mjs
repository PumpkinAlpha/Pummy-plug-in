import { build } from 'esbuild';
import { readFile,writeFile,mkdir,cp,rm } from 'node:fs/promises';
await mkdir('app',{recursive:true});
const app=await build({entryPoints:['app/main.jsx'],bundle:true,write:false,format:'iife',target:'es2022',minify:true,jsx:'automatic',loader:{'.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},outdir:'app/bundle'});
const notices=await readFile('THIRD_PARTY_NOTICES.md','utf8');
const js=('/*\n'+notices+'\n*/\n'+app.outputFiles.find(f=>f.path.endsWith('.js')).text).replace(/<\/script/gi,'<\\/script');
const css=app.outputFiles.find(f=>f.path.endsWith('.css')).text;
const favicon=`data:image/png;base64,${(await readFile('app/pummy-logo.png')).toString('base64')}`;
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Adaptive practice tests with foundation questions and saved progress."><title>Pummy Adaptive Test</title><link rel="icon" type="image/png" href="${favicon}"><style>${css}</style></head><body><div id="root"><main class="workspace"><section class="layout"><div role="status"><h1>Opening Pummy…</h1><p>If this screen stays here, close and reopen the panel. Your progress is saved.</p><noscript>JavaScript is required to display the exam.</noscript></div></section></main></div><script>${js}</script></body></html>`;
await writeFile('app/view.html',html);
const check=await build({entryPoints:['app/slide-check.jsx'],bundle:true,write:false,format:'iife',target:'es2022',minify:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const checkJS=check.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
await writeFile('app/slide-check.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pummy slide check</title><style>body{font:16px system-ui;margin:16px;color:light-dark(#18202c,#eee);background:light-dark(#fff,#202124);color-scheme:light dark}h2{font-size:18px}fieldset{border:0;padding:0}label{display:flex;gap:10px;padding:10px;cursor:pointer}button{margin-top:12px;padding:10px 16px}p{line-height:1.5}[role=alert]{color:light-dark(#a21,#faa)}</style></head><body><div id="root"></div><script>${checkJS}</script></body></html>`);

await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});
await build({entryPoints:['worker/index.js'],bundle:true,platform:'browser',format:'esm',target:'es2022',outfile:'dist/server/index.js',loader:{'.html':'text','.png':'dataurl'},minify:true});
await cp('.openai','dist/.openai',{recursive:true});await cp('drizzle','dist/drizzle',{recursive:true});
console.log('Built standalone MCP App UI and Cloudflare Worker.');
