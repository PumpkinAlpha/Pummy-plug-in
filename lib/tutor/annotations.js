import {z} from 'zod/v4';
const unit=z.number().finite().min(0).max(1),color=z.string().regex(/^(#[0-9a-fA-F]{6}|none)$/);
export const regionSchema=z.object({x:unit,y:unit,w:unit,h:unit}).refine(b=>b.x+b.w<=1.001&&b.y+b.h<=1.001,'Region must fit the slide');
export const annotationSchema=z.object({
 id:z.string().uuid(),courseId:z.string().max(180),presentationId:z.string().uuid(),slideId:z.string().max(180),
 type:z.enum(['pen','pencil','highlight','text','rect','roundRect','ellipse','line','arrow','connector','freeform','callout','sticky','comment','image']),
 x:unit,y:unit,w:unit,h:unit,rotation:z.number().finite().min(-360).max(360).default(0),
 color:color.default('#ff8736'),fill:color.default('none'),opacity:unit.default(1),stroke:z.number().min(.0001).max(.05).default(.003),
 points:z.array(z.object({x:unit,y:unit,p:unit.default(.5)})).max(10000).optional(),text:z.string().max(8000).optional(),
 font:z.enum(['Arial','Georgia','Verdana','Courier New']).default('Arial'),fontSize:z.number().min(.005).max(.15).default(.025),
 bold:z.boolean().default(false),italic:z.boolean().default(false),underline:z.boolean().default(false),align:z.enum(['left','center','right']).default('left'),
 layer:z.number().int().min(0).max(10000),groupId:z.string().uuid().optional(),
 image:z.string().max(350000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/).optional(),
 createdAt:z.number().int().nonnegative(),modifiedAt:z.number().int().nonnegative(),author:z.string().max(180).optional()
}).refine(a=>a.x+a.w<=1.001&&a.y+a.h<=1.001,'Object must fit the slide');
export const annotationList=z.array(annotationSchema).max(300).refine(a=>new Set(a.map(x=>x.id)).size===a.length,'Annotation IDs must be unique');
export const clamp=(n,min=0,max=1)=>Math.min(max,Math.max(min,n));
export function bounds(objects){if(!objects.length)return null;const x=Math.min(...objects.map(o=>o.x)),y=Math.min(...objects.map(o=>o.y));return {x,y,w:Math.max(...objects.map(o=>o.x+o.w))-x,h:Math.max(...objects.map(o=>o.y+o.h))-y};}
export function moveObjects(objects,ids,dx,dy){const selected=objects.filter(o=>ids.includes(o.id)),b=bounds(selected);if(!b)return objects;dx=clamp(dx,-b.x,1-b.x-b.w);dy=clamp(dy,-b.y,1-b.y-b.h);return objects.map(o=>ids.includes(o.id)?{...o,x:o.x+dx,y:o.y+dy,modifiedAt:Date.now()}:o);}
export function resizeObjects(objects,ids,target){const b=bounds(objects.filter(o=>ids.includes(o.id)));if(!b)return objects;return objects.map(o=>ids.includes(o.id)?{...o,x:target.x+(o.x-b.x)*target.w/(b.w||1),y:target.y+(o.y-b.y)*target.h/(b.h||1),w:o.w*target.w/(b.w||1),h:o.h*target.h/(b.h||1),modifiedAt:Date.now()}:o);}
export function selectionAt(objects,id,shift=false,selected=[]){const hit=objects.find(o=>o.id===id);if(!hit)return [];const ids=hit.groupId?objects.filter(o=>o.groupId===hit.groupId).map(o=>o.id):[id];return shift?(selected.includes(id)?selected.filter(x=>!ids.includes(x)):[...new Set([...selected,...ids])]):ids;}
export function groupObjects(objects,ids,groupId=crypto.randomUUID()){return objects.map(o=>ids.includes(o.id)?{...o,groupId,modifiedAt:Date.now()}:o);}
export class EditorHistory {
 constructor(initial={}){this.current=structuredClone(initial);this.past=[];this.future=[];}
 commit(next){if(JSON.stringify(next)===JSON.stringify(this.current))return false;this.past.push(this.current);if(this.past.length>100)this.past.shift();this.current=structuredClone(next);this.future=[];return true;}
 undo(){if(!this.past.length)return false;this.future.push(this.current);this.current=this.past.pop();return true;}
 redo(){if(!this.future.length)return false;this.past.push(this.current);this.current=this.future.pop();return true;}
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function annotationMarkup(objects,width=1000,height=562.5){return [...objects].sort((a,b)=>a.layer-b.layer).map(a=>{
 const x=a.x*width,y=a.y*height,w=a.w*width,h=a.h*height,sw=a.stroke*width;
 const props=`stroke="${esc(a.color)}" stroke-width="${sw}" fill="${esc(a.fill)}" stroke-linecap="round" stroke-linejoin="round"`;
 let content='';
 if(['pen','pencil','highlight','freeform'].includes(a.type)){
  const points=a.points||[],segments=[];for(let i=1;i<points.length;i++){const prev=points[i-1],p=points[i],pressure=a.type==='highlight'?-1:Math.round((prev.p+p.p)*4),last=segments.at(-1);if(last?.pressure===pressure)last.path+=` L ${x+p.x*w} ${y+p.y*h}`;else segments.push({pressure,path:`M ${x+prev.x*w} ${y+prev.y*h} L ${x+p.x*w} ${y+p.y*h}`});}content=segments.map(s=>`<path d="${s.path}" stroke="${esc(a.color)}" stroke-width="${sw*(s.pressure===-1?1:.4+s.pressure/8)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');if(points.length===1)content=`<circle cx="${x+points[0].x*w}" cy="${y+points[0].y*h}" r="${sw/2}" fill="${esc(a.color)}"/>`;
 }else if(a.type==='ellipse')content=`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" ${props}/>`;
 else if(['line','arrow','connector'].includes(a.type)){const start=a.points?.[0]||{x:0,y:0},end=a.points?.[1]||{x:1,y:1},sx=x+start.x*w,sy=y+start.y*h,ex=x+end.x*w,ey=y+end.y*h;content=`<path d="M ${sx} ${sy} L ${ex} ${ey}" ${props}/>`;if(a.type==='arrow'){const angle=Math.atan2(ey-sy,ex-sx),l=Math.max(12,sw*4);content+=`<path d="M ${ex-l*Math.cos(angle-.45)} ${ey-l*Math.sin(angle-.45)} L ${ex} ${ey} L ${ex-l*Math.cos(angle+.45)} ${ey-l*Math.sin(angle+.45)}" ${props}/>`;}}
 else if(a.type==='image')content=`<image x="${x}" y="${y}" width="${w}" height="${h}" href="${esc(a.image)}" preserveAspectRatio="xMidYMid meet"/>`;
 else {content=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${['roundRect','callout','sticky','comment'].includes(a.type)?Math.min(w,h)*.12:0}" ${props}/>`;if(a.type==='callout')content+=`<path d="M ${x+w*.2} ${y+h} l ${w*.1} ${h*.2} l ${w*.1} ${-h*.2}" ${props}/>`;
  if(a.text){const size=a.fontSize*width,tx=a.align==='center'?x+w/2:a.align==='right'?x+w-6:x+6;content+=`<text x="${tx}" y="${y+size+4}" fill="${esc(a.color)}" font-family="${a.font}" font-size="${size}" font-weight="${a.bold?'bold':'normal'}" font-style="${a.italic?'italic':'normal'}" text-decoration="${a.underline?'underline':'none'}" text-anchor="${a.align==='center'?'middle':a.align==='right'?'end':'start'}">${a.text.split('\n').map((line,i)=>`<tspan x="${tx}" dy="${i?size*1.2:0}">${esc(line)}</tspan>`).join('')}</text>`;}
 }
 return `<g data-id="${a.id}" opacity="${a.opacity}" transform="rotate(${a.rotation} ${x+w/2} ${y+h/2})">${content}<rect x="${x}" y="${y}" width="${Math.max(w,2)}" height="${Math.max(h,2)}" fill="transparent" stroke="none" pointer-events="all"/></g>`;
}).join('');}
export function annotationSVG(objects,width,height,{hitTargets=false}={}){const markup=annotationMarkup(objects,width,height);return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${hitTargets?markup:markup.replace(/<rect[^>]*pointer-events="all"\/>/g,'')}</svg>`;}
