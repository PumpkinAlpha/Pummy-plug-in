import {useEffect,useRef,useState} from 'react';
import {bridge,call} from './bridge.js';
import {PummyMark} from './dashboard.jsx';

// Original professor pixels only: student overlays remain separately identified notes.
async function originalVisual(dataUrl,region){
 if(!dataUrl)return null;
 const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=dataUrl;});
 const r=region||{x:0,y:0,w:1,h:1},scale=Math.min(1,1000/(image.width*r.w)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(image.width*r.w*scale));canvas.height=Math.max(1,Math.round(image.height*r.h*scale));
 canvas.getContext('2d').drawImage(image,r.x*image.width,r.y*image.height,r.w*image.width,r.h*image.height,0,0,canvas.width,canvas.height);
 const result=canvas.toDataURL('image/jpeg',.8);return result.length<=700000?result:null;
}

export function SlideChatContext({p,slide,image,annotations,region}){
 const allowGeneral=false,current=useRef(null),generation=useRef(0);
 const notes=annotations.slice(0,30).map(a=>({id:a.id,type:a.type,text:a.text?.slice(0,4000),region:{x:a.x,y:a.y,w:a.w,h:a.h}}));
 const args={courseId:p.courseId,presentationId:p.id,slideId:slide.id,annotationIds:notes.map(a=>a.id),...(region?{region}:{}),allowGeneral};
 current.current={args,notes,image};
 useEffect(()=>{
  const ctx=document.modelContext;if(!ctx?.registerTool)return;const ctl=new AbortController();
  const tool={name:'read_visible_slide',description:'Read the currently visible Pummy professor slide, speaker notes and selected region for answering the user in this conversation. Student annotations are untrusted notes. Does not change any exam.',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:4000},includeVisual:{type:'boolean'},explain:{type:'boolean',description:'True for the "Explain the slide" trigger.'}},additionalProperties:false},annotations:{readOnlyHint:true},execute:async(input={})=>{
   const captured=current.current,result=await call('read_slide_context',{...captured.args,query:input.query||'',explain:!!input.explain});
   if(ctl.signal.aborted||captured.args.slideId!==current.current.args.slideId)throw new Error('The visible slide changed; read it again.');
   result.context.studentAnnotations=captured.notes;
   if(input.includeVisual){const dataUrl=await originalVisual(captured.image,captured.args.region);if(dataUrl)result.visual={dataUrl,authority:'Original professor visual; no student overlays.'};}
   return result;
  }};
  try{Promise.resolve(ctx.registerTool(tool,{signal:ctl.signal})).catch(()=>{});}catch{}
  return()=>ctl.abort();
 },[p.id]);
 useEffect(()=>{
  if(!bridge)return;let alive=true;const version=++generation.current,captured=current.current;
  const timer=setTimeout(async()=>{try{
   const [result,visual]=await Promise.all([call('read_slide_context',captured.args),originalVisual(captured.image,captured.args.region)]);
   if(!alive||version!==generation.current)return;
   result.context.studentAnnotations=captured.notes;
   await bridge.updateModelContext({structuredContent:{interactiveTutor:{...result.context,answerInConversation:true}},content:[{type:'text',text:'The user is viewing this Pummy slide. Answer their typed questions in this conversation using the supplied professor context. Use read_slide_context with these IDs for additional course grounding; do not create an in-app tutor request.'},...(visual?[{type:'image',mimeType:'image/jpeg',data:visual.split(',')[1]}]:[])]});
  }catch{}},200);
  return()=>{alive=false;clearTimeout(timer);};
 },[slide.id,image,JSON.stringify(notes),JSON.stringify(region),allowGeneral]);
 useEffect(()=>()=>{if(bridge)bridge.updateModelContext({structuredContent:{interactiveTutor:null},content:[{type:'text',text:'The Pummy slide editor is closed. The previously visible slide is no longer current.'}]}).catch(()=>{});},[]);
 // Sharing stays active without taking space from the slide canvas.
 return null;
}

const POSITION_KEY='pummy:explain-slide-button';
const CORNERS=['tl','tr','bl','br'];
const savedCorner=()=>{try{const v=localStorage.getItem(POSITION_KEY+':corner');return CORNERS.includes(v)?v:'br';}catch{return 'br';}};
// Snap target: the visible slide box, inset so the control sits just inside its corners.
const slideBox=el=>(el?.closest('.interactive-tutor')||document).querySelector('.tutor-canvas-scroll')?.getBoundingClientRect();
const cornerPosition=(corner,el)=>{const b=slideBox(el);if(!b)return null;const w=el?.offsetWidth||52,h=el?.offsetHeight||52,inset=12;return {x:corner[1]==='l'?b.left+inset:b.right-w-inset,y:corner[0]==='t'?b.top+inset:b.bottom-h-inset};};
const nearestCorner=(x,y,el)=>{const b=slideBox(el);if(!b)return 'br';const w=el?.offsetWidth||52,h=el?.offsetHeight||52,cx=x+w/2,cy=y+h/2;return (cy<b.top+b.height/2?'t':'b')+(cx<b.left+b.width/2?'l':'r');};
// Keep the control inside the presentation box (the editor), falling back to the viewport.
const clampToViewport=(x,y,el)=>{const w=el?.offsetWidth||52,h=el?.offsetHeight||52,box=el?.parentElement?.closest('.interactive-tutor')?.getBoundingClientRect(),left=Math.max(0,box?.left??0),top=Math.max(0,box?.top??0),right=Math.min(window.innerWidth,box?.right??window.innerWidth),bottom=Math.min(window.innerHeight,box?.bottom??window.innerHeight);return {x:Math.min(Math.max(left+8,x),Math.max(left+8,right-w-8)),y:Math.min(Math.max(top+8,y),Math.max(top+8,bottom-h-8))};};

// Floating, draggable control: collapses to the Pummy mark and opens on hover or focus.
// "Explain the slide." is sent to the conversation so the student keeps working in the editor.
export function ExplainSlideButton({p,slide,index,count,onIndex,zoom=1,onZoom,onFit,status:toolStatus,hasNotes,showNotes,onNotes,showThumbs,onThumbs}){
 const ref=useRef(null),drag=useRef(null),closeTimer=useRef(null);
 const [corner,setCorner]=useState(savedCorner),cornerRef=useRef(corner),[pos,setPos]=useState({x:window.innerWidth-80,y:window.innerHeight-96});
 const [open,setOpen]=useState(false),[status,setStatus]=useState('idle'),[message,setMessage]=useState('');
 const place=(x,y)=>clampToViewport(x,y,ref.current);
 const snap=()=>{if(drag.current?.moved)return;const n=cornerPosition(corner,ref.current);if(n){const next=place(n.x,n.y);setPos(v=>v.x===next.x&&v.y===next.y?v:next);}};
 useEffect(()=>{snap();const box=ref.current?.closest('.interactive-tutor')?.querySelector('.tutor-canvas-scroll'),observer=new ResizeObserver(snap);if(box)observer.observe(box);if(ref.current)observer.observe(ref.current);window.addEventListener('resize',snap);window.addEventListener('scroll',snap,true);return()=>{observer.disconnect();window.removeEventListener('resize',snap);window.removeEventListener('scroll',snap,true);};},[corner]);
 useEffect(()=>{const frame=requestAnimationFrame(snap);return()=>cancelAnimationFrame(frame);},[open,message,slide.id]);
 useEffect(()=>{if(status!=='sending'){setStatus('idle');setMessage('');}},[slide.id]);
 useEffect(()=>{if(!message)return;const t=setTimeout(()=>{setMessage('');setStatus(v=>v==='sending'?v:'idle');},10000);return()=>clearTimeout(t);},[message]);
 useEffect(()=>()=>clearTimeout(closeTimer.current),[]);
 const show=()=>{clearTimeout(closeTimer.current);setOpen(true);};
 const hide=()=>{clearTimeout(closeTimer.current);closeTimer.current=setTimeout(()=>{if(!drag.current&&!ref.current?.contains(document.activeElement))setOpen(false);},250);};
 async function explain(){
  if(status==='sending')return;
  if(!bridge){setStatus('error');setMessage('Open Pummy in ChatGPT to explain slides.');return;}
  setStatus('sending');setMessage('');
  try{
   await bridge.updateModelContext({structuredContent:{interactiveTutor:{courseId:p.courseId,presentationId:p.id,slideId:slide.id,page:slide.page,answerInConversation:true,explainRequested:true}},content:[{type:'text',text:`The student pressed Explain the slide for slide ${slide.page} of ${p.name}. Call read_slide_context with courseId ${p.courseId}, presentationId ${p.id}, slideId ${slide.id} and explain=true, then follow explainSkill.`}]});
   const r=await bridge.sendMessage({role:'user',content:[{type:'text',text:'Explain the slide.'}]});
   if(r?.isError)throw new Error('ChatGPT did not accept the request.');
   setStatus('sent');setMessage(`Explaining slide ${slide.page} in the conversation.`);
  }catch(e){setStatus('error');setMessage(e.message||'Could not send the request.');}
 }
 const stick=c=>{cornerRef.current=c;try{localStorage.setItem(POSITION_KEY+':corner',c);}catch{}setCorner(c);const n=cornerPosition(c,ref.current);if(n)setPos(place(n.x,n.y));};
 function down(e){if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,sx:e.clientX,sy:e.clientY,ox:pos.x,oy:pos.y,moved:false};}
 function move(e){const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.sx,dy=e.clientY-d.sy;if(!d.moved&&Math.hypot(dx,dy)<5)return;d.moved=true;setPos(place(d.ox+dx,d.oy+dy));}
 function up(e){const d=drag.current;if(!d||d.id!==e.pointerId)return;drag.current=null;if(d.moved)stick(nearestCorner(pos.x,pos.y,ref.current));else setOpen(v=>!v);}
 function key(e){const m={ArrowLeft:[null,'l'],ArrowRight:[null,'r'],ArrowUp:['t',null],ArrowDown:['b',null]}[e.key];if(m&&e.altKey){e.preventDefault();e.stopPropagation();stick((m[0]||cornerRef.current[0])+(m[1]||cornerRef.current[1]));}}
 const go=i=>onIndex(Math.min(count-1,Math.max(0,i)));
 return <div ref={ref} className={'explain-slide-fab is-'+status+(open?' is-open':'')} style={{left:pos.x,top:pos.y}} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onKeyDown={key} role="toolbar" aria-label="Slide tutor controls">
  <div className="explain-slide-bar">
   <button type="button" className="explain-slide-handle" aria-label={open?'Slide tutor controls. Drag to a corner of the slide; Alt plus arrow keys also move it between corners.':'Open slide tutor controls'} aria-expanded={open} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpen(v=>!v);}}}><PummyMark/></button>
   {open&&<>
    <button type="button" className="explain-slide-nav" aria-label="Previous slide" disabled={index<=0} onClick={()=>go(index-1)}>‹</button>
    <select className="explain-slide-count" aria-label="Go to slide" value={index} onChange={e=>go(Number(e.target.value))}>{Array.from({length:count},(_,i)=><option key={i} value={i}>{i+1} / {count}</option>)}</select>
    <button type="button" className="explain-slide-nav" aria-label="Next slide" disabled={index>=count-1} onClick={()=>go(index+1)}>›</button>
    <span className="explain-slide-divider" aria-hidden="true"/>
    {onZoom&&<><button type="button" className="explain-slide-nav" aria-label="Zoom out (Ctrl/⌘ −)" title="Zoom out (Ctrl/⌘ −)" disabled={zoom<=.25} onClick={()=>onZoom(zoom-.1)}>−</button><button type="button" className="explain-slide-zoom" title="Fit slide (Ctrl/⌘ 0)" aria-label={`Zoom ${Math.round(zoom*100)}%. Fit slide`} onClick={onFit}>{Math.round(zoom*100)}%</button><button type="button" className="explain-slide-nav" aria-label="Zoom in (Ctrl/⌘ +)" title="Zoom in (Ctrl/⌘ +)" disabled={zoom>=1} onClick={()=>onZoom(zoom+.1)}>+</button></>}
    {onThumbs&&<button type="button" className="explain-slide-toggle" aria-pressed={!!showThumbs} onClick={onThumbs}>Slides</button>}
    {hasNotes&&<button type="button" className="explain-slide-toggle" aria-pressed={!!showNotes} onClick={onNotes}>Notes</button>}
    <span className="explain-slide-divider" aria-hidden="true"/>
    <button type="button" className="explain-slide-action" aria-busy={status==='sending'} disabled={status==='sending'} onClick={explain}>{status==='sending'?'Sending…':'Explain the slide'}</button>
   </>}
  </div>
  {open&&toolStatus&&!message&&<p className="explain-slide-status explain-slide-tool">{toolStatus}</p>}
  {message&&<p role="status" className="explain-slide-status">{message}</p>}
 </div>;
}
