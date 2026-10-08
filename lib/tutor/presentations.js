import {unzipSync,strFromU8} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {getDocumentProxy} from 'unpdf';
export const MAX_ASSET=24*1024*1024,CHUNK_SIZE=240000,MAX_SLIDES=300;
export function decode64(value){try{return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}catch{throw new Error('Invalid file encoding.');}}
export function encode64(bytes){let out='';for(let i=0;i<bytes.length;i+=16000)out+=String.fromCharCode(...bytes.subarray(i,i+16000));return btoa(out);}
export function parseXml(xml){if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('XML entities are not supported.');const errors=[];const doc=new DOMParser({onError:(level,msg)=>errors.push(msg)}).parseFromString(xml,'application/xml');if(errors.length||!doc.documentElement)throw new Error('Corrupt presentation XML.');return doc;}
const tags=(doc,name)=>Array.from(doc.getElementsByTagNameNS('*',name));
function entries(bytes){let total=0;try{return unzipSync(bytes,{filter:e=>{if(/vbaProject|activeX/i.test(e.name))throw new Error('Macros and ActiveX presentations are not supported.');total+=e.originalSize;if(total>100*1024*1024||e.originalSize>(/\.xml$|\.rels$/.test(e.name)?8*1024*1024:MAX_ASSET))throw new Error('Expanded presentation is too large.');return /\.xml$|\.rels$/.test(e.name);}});}catch(e){throw new Error(`Could not read PPTX: ${e.message}`);}}
function target(base,path){const stack=base.split('/').slice(0,-1);for(const part of path.split('/')){if(part==='..')stack.pop();else if(part!=='.'&&part)stack.push(part);}return stack.join('/');}
export function pptxMetadata(bytes,{truncate=true}={}){
 if(bytes[0]!==80||bytes[1]!==75)throw new Error('Choose a valid PPTX ZIP file.');const files=entries(bytes);if(/macroEnabled|vbaProject/i.test(strFromU8(files['[Content_Types].xml']||new Uint8Array())))throw new Error('Macro-enabled presentations are not supported.');
 const xml=path=>{if(!files[path])throw new Error(`Missing PPTX component: ${path}`);return parseXml(strFromU8(files[path]));};
 const p=xml('ppt/presentation.xml'),rels=tags(xml('ppt/_rels/presentation.xml.rels'),'Relationship');
 const map=new Map(rels.filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),target('ppt/presentation.xml',r.getAttribute('Target'))]));
 const size=tags(p,'sldSz')[0],width=Number(size?.getAttribute('cx')),height=Number(size?.getAttribute('cy'));
 if(!(width>0&&height>0))throw new Error('Invalid PowerPoint slide size.');
 const slides=tags(p,'sldId').map((s,i)=>{const path=map.get(s.getAttribute('r:id'));if(!path||!/^ppt\/slides\/slide\d+\.xml$/.test(path))throw new Error('Invalid slide relationship.');
  const slide=xml(path),relPath=path.replace(/([^/]+)$/,'_rels/$1.rels');let notes='';
  if(files[relPath]){const note=tags(xml(relPath),'Relationship').find(r=>/\/notesSlide$/.test(r.getAttribute('Type'))&&r.getAttribute('TargetMode')!=='External');if(note){const notePath=target(path,note.getAttribute('Target'));const doc=xml(notePath);notes=tags(doc,'sp').filter(sp=>!tags(sp,'ph').some(ph=>['sldNum','hdr','ftr','dt'].includes(ph.getAttribute('type')))).flatMap(sp=>tags(sp,'t').map(t=>t.textContent)).join('\n');}}
  const text=tags(slide,'t').map(t=>t.textContent).join('\n');return {id:`slide-${s.getAttribute('id')||i+1}`,page:i+1,text:truncate?text.slice(0,12000):text,notes:truncate?notes.slice(0,8000):notes,width:width/12700,height:height/12700};
 });if(!slides.length||slides.length>MAX_SLIDES)throw new Error(`Use 1–${MAX_SLIDES} slides.`);return {width:width/12700,height:height/12700,slides};
}
export async function pdfMetadata(bytes){
 if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new Error('Choose a valid PDF.');
 // PDF.js may transfer/detach its input buffer. Keep the immutable source owned by the caller.
 let doc;try{doc=await getDocumentProxy(new Uint8Array(bytes),{isEvalSupported:false,stopAtErrors:true});if(!doc.numPages||doc.numPages>MAX_SLIDES)throw new Error(`Use 1–${MAX_SLIDES} pages.`);const slides=[];
  for(let page=1;page<=doc.numPages;page++){const p=await doc.getPage(page),v=p.getViewport({scale:1}),text=(await p.getTextContent()).items.map(t=>t.str||'').join(' ').slice(0,12000);slides.push({id:`slide-${page}`,page,width:v.width,height:v.height,text,notes:''});p.cleanup();}
  return {width:slides[0].width,height:slides[0].height,slides};
 }catch(e){throw new Error(`Could not read PDF: ${e.message}`);}finally{await doc?.loadingTask?.destroy();}
}
export function pairedMetadata(pptx,pdf){if(pptx.slides.length!==pdf.slides.length)throw new Error('The companion PDF must contain exactly the same slides in the same order.');if(pdf.slides.some(p=>Math.abs(p.width/p.height-pptx.width/pptx.height)>.03))throw new Error('The companion PDF aspect ratio does not match the PPTX.');return {...pptx,slides:pptx.slides.map((s,i)=>({...s,width:pdf.slides[i].width,height:pdf.slides[i].height}))};}
