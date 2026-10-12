import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pdfMetadata,pptxMetadata,pairedMetadata} from '../lib/tutor/presentations.js';
import {legacyPptSlides} from '../lib/tutor/legacy-ppt.js';
import {boundedBytes} from '../lib/stream-bytes.js';
import {MAX_CONVERSION_BYTES,MAX_CONVERTED_PDF_BYTES} from '../worker/presentation-converter.js';

const run=promisify(execFile);
const filter='pdf:impress_pdf_Export:'+JSON.stringify({ExportHiddenSlides:{type:'boolean',value:'true'},ExportNotesPages:{type:'boolean',value:'false'},ExportOnlyNotesPages:{type:'boolean',value:'false'},UseLosslessCompression:{type:'boolean',value:'true'}});
// Each job has its own filenames/profile. No shell or user-controlled command arguments.
export function createPresentationConverter({executable=process.env.PUMMY_SOFFICE||'soffice',timeout=90000}={}){
 let pending=0,queue=Promise.resolve();
 return {async fetch(request){
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  const kind=request.headers.get('content-type')==='application/vnd.ms-powerpoint'?'ppt':request.headers.get('content-type')==='application/vnd.openxmlformats-officedocument.presentationml.presentation'?'pptx':null;
  if(!kind)return new Response('Choose a PPT or PPTX file.',{status:415});
  if(pending>=4)return new Response('The slide converter is busy. Try again shortly.',{status:503});
  // Reserve capacity before reading a body; concurrent uploads also consume memory.
  pending++;let dir,release;
  try{
   let bytes,meta;try{bytes=await boundedBytes(request,MAX_CONVERSION_BYTES,'PowerPoint');meta=kind==='pptx'?pptxMetadata(bytes):legacyPptSlides(bytes);}catch(e){return new Response(e.message,{status:e.status||400});}
   const accepted=Date.now(),previous=queue;queue=new Promise(resolve=>{release=resolve;});await previous;
   if(Date.now()-accepted>30000)return new Response('The slide converter is busy. Try again shortly.',{status:503});
   dir=await mkdtemp(join(tmpdir(),'pummy-slides-'));const profile=join(dir,'profile');await mkdir(profile);
   // Disable macro execution even when the converter is used independently of the worker.
   await writeFile(join(profile,'registrymodifications.xcu'),'<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>');
   const input=join(dir,'presentation.'+kind);await writeFile(input,bytes);
   await run(executable,['-env:UserInstallation='+pathToFileURL(profile).href,'--headless','--nologo','--nodefault','--norestore','--convert-to',filter,'--outdir',dir,input],{timeout,killSignal:'SIGKILL',maxBuffer:200000});
   const output=join(dir,'presentation.pdf');if((await stat(output)).size>MAX_CONVERTED_PDF_BYTES)throw new Error('Converted PDF is too large.');const pdf=await readFile(output);
   const rendered=await pdfMetadata(pdf);if(kind==='pptx')pairedMetadata(meta,rendered);else if(meta.length!==rendered.slides.length)throw new Error('The generated PDF does not contain every slide.');
   return new Response(pdf,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store'}});
  }catch(e){return new Response(e.code==='ENOENT'?'Slide conversion is unavailable. Install LibreOffice or set PUMMY_SOFFICE.':e.killed?'Slide conversion timed out. Try a smaller presentation.':'Could not convert this presentation to PDF. Try again or supply a PDF exported from PowerPoint.',{status:422});}
  finally{try{if(dir)await rm(dir,{recursive:true,force:true});}finally{pending--;release?.();}}
 }};
}
