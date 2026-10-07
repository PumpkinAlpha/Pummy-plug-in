import React,{useEffect,useRef} from 'react';

export function GenerationConfetti({celebrationId}){
 const canvasRef=useRef(null);
 useEffect(()=>{
  if(window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
  if(!ctx)return;
  let width=0,height=0,frame=0;
  const resize=()=>{
   const bounds=canvas.getBoundingClientRect();
   width=bounds.width;height=bounds.height;
   const ratio=Math.min(window.devicePixelRatio||1,2);
   canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
   ctx.setTransform(ratio,0,0,ratio,0,0);
  };
  resize();window.addEventListener('resize',resize);
  const colors=['#60a5fa','#a78bfa','#f472b6','#fbbf24','#34d399','#fb923c'];
  const particles=Array.from({length:200},(_,i)=>({
   x:Math.random(),y:Math.random()*1.05-.35,
   speed:110+Math.random()*140,drift:(Math.random()-.5)*140,
   size:5+Math.random()*7,rotation:Math.random()*Math.PI,
   spin:(Math.random()-.5)*8,color:colors[i%colors.length],round:i%5===0
  }));
  let start;
  const draw=time=>{
   start??=time;
   const elapsed=(time-start)/1000;
   ctx.clearRect(0,0,width,height);
   if(elapsed>=4.5)return;
   ctx.globalAlpha=Math.min(1,(4.5-elapsed)/.9);
   for(const p of particles){
    const x=p.x*width+p.drift*elapsed+Math.sin(elapsed*2+p.rotation)*22;
    const y=p.y*height+p.speed*elapsed+35*elapsed*elapsed;
    if(y>height+20)continue;
    ctx.save();ctx.translate(x,y);ctx.rotate(p.rotation+p.spin*elapsed);
    ctx.scale(Math.max(.2,Math.abs(Math.cos(elapsed*3+p.rotation))),1);
    ctx.fillStyle=p.color;
    if(p.round){ctx.beginPath();ctx.arc(0,0,p.size/2,0,Math.PI*2);ctx.fill();}
    else ctx.fillRect(-p.size/2,-p.size/3,p.size,p.size*.65);
    ctx.restore();
   }
   frame=requestAnimationFrame(draw);
  };
  frame=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);};
 },[celebrationId]);
 return <canvas ref={canvasRef} className="exam-generation-confetti" aria-hidden="true"/>;
}
