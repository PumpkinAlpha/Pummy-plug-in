import {legacyPptSlides} from '../lib/tutor/legacy-ppt.js';
import {parse,slideToSvgFile} from '@web-ppt/core';
import {unzipSync} from 'fflate';
let cache=null;
export function isNativePowerPoint(p){return p.renderMode==='powerpoint'||(['ppt','pptx'].includes(p.kind)&&!p.assets.pdf);}
export async function nativeDeck(call,p,loadAsset){
 const key=`${p.ownerId}:${p.courseId}:${p.originalAssetId}`;
 if(cache?.key!==key){const old=cache,entry={key,promise:null};
  entry.promise=(async()=>{const bytes=await loadAsset(call,p.courseId,p.assets.original);checkPowerPointExpansion(bytes);const deck=await parse(p.kind==='ppt'?legacyPptSlides(bytes,{rendererView:true}):bytes);
   if(deck.slides.length!==p.slides.length||!(deck.width>0&&deck.height>0)||Math.abs(deck.width/deck.height-p.slides[0].width/p.slides[0].height)>.03){deck.dispose?.();throw Error('The direct PowerPoint view could not match the original slides. Try an exported companion PDF.');}
   return deck;
  })().catch(e=>{if(cache===entry)cache=null;throw e;});cache=entry;
  if(old)old.promise.then(deck=>deck.dispose?.()).catch(()=>{});
 }
 return cache.promise;
}
export function checkPowerPointExpansion(bytes){
 if(bytes[0]!==80||bytes[1]!==75)return;
 let total=0,entries=0;
 unzipSync(bytes,{filter:entry=>{total+=entry.originalSize;entries++;if(total>128*1024*1024||entry.originalSize>32*1024*1024||entries>4096)throw Error('Expanded PowerPoint is too large for direct viewing. Split the deck or use a companion PDF.');return false;}});
}
// The renderer output is used as an inert image, never inserted into active DOM.
// Also strip active content and external URLs before rasterizing the SVG.
export function cleanPowerPointSvg(svg){
 const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
 if(doc.querySelector('parsererror'))throw Error('Could not render this PowerPoint slide. Try a companion PDF.');
 for(const node of [...doc.querySelectorAll('*')]){
  if(node.localName==='a'){node.replaceWith(...node.childNodes);continue;}
  if(node.namespaceURI!=='http://www.w3.org/2000/svg'||/^(script|foreignObject|style|animate|animateTransform|set)$/i.test(node.localName)){node.remove();continue;}
  for(const attr of [...node.attributes]){
   const name=attr.localName,value=attr.value.trim();
   if(/^on/i.test(name)||name==='href'&&!/^(#|data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,])/i.test(value)||/url\s*\(\s*['"]?(?!#)/i.test(value))node.removeAttributeNode(attr);
  }
 }
 return new XMLSerializer().serializeToString(doc.documentElement);
}
export async function nativeSlideImage(call,p,page,width,loadAsset){
 const deck=await nativeDeck(call,p,loadAsset),slide=deck.slides[page-1];
 if(!slide)throw Error('Slide not found.');
 if(!slide.elements.length&&p.slides[page-1].text.trim())throw Error('This slide uses content the direct viewer cannot render. Add a companion PDF for its exact visuals.');
 const svg=cleanPowerPointSvg(await slideToSvgFile(deck,slide));
 const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Could not render this slide. Try a companion PDF.'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
 const scale=Math.min(width/deck.width,8192/deck.height,Math.sqrt(16000000/(deck.width*deck.height))),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(deck.width*scale));canvas.height=Math.max(1,Math.floor(deck.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
}
export async function nativeTextAt(call,p,page,px,py,loadAsset){
 const deck=await nativeDeck(call,p,loadAsset),x=px*deck.width,y=py*deck.height;
 const shape=[...deck.slides[page-1].elements].reverse().find(e=>e.kind==='shape'&&e.text&&x>=e.x&&x<=e.x+e.w&&y>=e.y&&y<=e.y+e.h);
 if(!shape)return null;
 const text=shape.text.paragraphs.map(paragraph=>paragraph.runs.map(run=>run.text).join('')).join('\n');
 return {text,box:{x:shape.x/deck.width,y:shape.y/deck.height,w:shape.w/deck.width,h:shape.h/deck.height},fontSize:(shape.text.paragraphs[0]?.runs[0]?.size||18)/deck.width};
}
