// Only original-file formatting is authoritative. Student ink stays separate.
export const EMPHASIS_RULES='Treat highlighted, circled and non-black educational text in ORIGINAL professor material as professor focus topics. Inspect source visuals to recover flattened circles/highlights and image text. Record cues with source, page and original visual ID using record_professor_emphasis; prioritize these subtopics when repairing gaps and selecting exam questions. Do not treat student annotations, decorative logos or contact/footer text as professor focus. Formatting changes priority, never factual support or completeness.';
export const nonBlack=value=>{const s=String(value||'').replace(/^#/,'');if(!/^[0-9a-f]{6}$/i.test(s))return false;return Math.max(...s.match(/../g).map(v=>parseInt(v,16)))>40;};
const tags=(doc,name)=>Array.from(doc.getElementsByTagNameNS('*',name));
export function pptxEmphasis(slide,width,height){
 const cues=[];
 for(const shape of tags(slide,'sp')){
  for(const run of tags(shape,'r')){
   const text=tags(run,'t').map(t=>t.textContent).join('').trim();if(!text)continue;
   const props=tags(run,'rPr')[0]||tags(shape,'defRPr')[0];if(!props)continue;
   if(tags(props,'highlight').length)cues.push({kind:'highlight',text,origin:'original'});
   const fill=tags(props,'solidFill')[0],rgb=fill&&tags(fill,'srgbClr')[0]?.getAttribute('val'),theme=fill&&tags(fill,'schemeClr')[0]?.getAttribute('val');
   if(nonBlack(rgb)||/^accent[1-6]$/.test(theme||''))cues.push({kind:'colored_text',text,origin:'original'});
  }
  if(tags(shape,'prstGeom').some(g=>g.getAttribute('prst')==='ellipse')){
   const xfrm=tags(shape,'xfrm')[0],off=xfrm&&tags(xfrm,'off')[0],ext=xfrm&&tags(xfrm,'ext')[0];
   if(off&&ext){const region={x:Number(off.getAttribute('x'))/width,y:Number(off.getAttribute('y'))/height,w:Number(ext.getAttribute('cx'))/width,h:Number(ext.getAttribute('cy'))/height};
    if(Object.values(region).every(Number.isFinite)&&region.x>=0&&region.y>=0&&region.w>0&&region.h>0&&region.x+region.w<=1.001&&region.y+region.h<=1.001)cues.push({kind:'circle',text:tags(shape,'t').map(t=>t.textContent).join(' '),region,origin:'original'});
   }
  }
 }
 return cues;
}
export function pdfEmphasis(ops,OPS,annotations,viewport){
 const result=[];let colored=false;const stack=[];
 for(let i=0;i<ops.fnArray.length;i++){
  const f=ops.fnArray[i],a=ops.argsArray[i];
  if(f===OPS.save)stack.push(colored);if(f===OPS.restore)colored=stack.pop()??false;
  if(f===OPS.setFillRGBColor){const first=a?.[0];colored=typeof first==='string'?nonBlack(first):Array.from(a||[]).some(n=>n>40);}
  if(f===OPS.setFillGray)colored=Number(a?.[0])>.16;
  if(colored&&(f===OPS.showText||f===OPS.showSpacedText)){
   const text=(a?.[0]||[]).filter(x=>x&&typeof x==='object').map(g=>g.unicode||'').join('').trim();
   if(text.length>=3)result.push({kind:'colored_text',text,origin:'original'});
  }
 }
 for(const a of annotations||[]){
  if(!['Highlight','Circle'].includes(a.subtype)||!a.rect)continue;
  const rect=viewport.convertToViewportRectangle(a.rect),x=Math.min(rect[0],rect[2])/viewport.width,y=Math.min(rect[1],rect[3])/viewport.height,w=Math.abs(rect[2]-rect[0])/viewport.width,h=Math.abs(rect[3]-rect[1])/viewport.height;
  if(x>=0&&y>=0&&w>0&&h>0&&x+w<=1.001&&y+h<=1.001)result.push({kind:a.subtype==='Highlight'?'highlight':'circle',text:'',region:{x,y,w,h},origin:'original'});
 }
 return result;
}
