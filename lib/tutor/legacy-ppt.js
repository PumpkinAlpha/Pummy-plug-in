// Bounded, read-only MS-CFB / MS-PPT text extraction. Never opens embedded objects.
// Live slide order follows Current User -> UserEdit -> persist directory -> slide list.
const fail=()=>{throw new Error('Could not read this PowerPoint .ppt file. Save a fresh .pptx copy and try again.');};
const u32=(v,p)=>v.getUint32(p,true),i32=(v,p)=>v.getInt32(p,true);
function compoundStreams(bytes){
 const signature=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
 if(bytes.length<512||bytes.length>24*1024*1024||signature.some((n,i)=>bytes[i]!==n))fail();
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),major=v.getUint16(26,true),shift=v.getUint16(30,true);
 if(v.getUint16(28,true)!==0xfffe||!((major===3&&shift===9)||(major===4&&shift===12))||v.getUint16(32,true)!==6||u32(v,56)!==4096)fail();
 const size=2**shift,sectors=Math.floor(bytes.length/size)-1;
 const sector=id=>{if(!Number.isInteger(id)||id<0||id>=sectors)fail();return bytes.subarray((id+1)*size,(id+2)*size);};
 const fatIds=[];for(let p=76;p<512;p+=4){const id=i32(v,p);if(id>=0)fatIds.push(id);}
 const fatCount=u32(v,44),difatCount=u32(v,72);if(!fatCount||fatCount>sectors||difatCount>sectors)fail();
 let next=i32(v,68);const seen=new Set();for(let n=0;n<difatCount;n++){if(seen.has(next))fail();seen.add(next);const s=sector(next),d=new DataView(s.buffer,s.byteOffset,s.byteLength);for(let p=0;p<size-4;p+=4){const id=i32(d,p);if(id>=0)fatIds.push(id);}next=i32(d,size-4);}
 if(difatCount&&next!==-2||fatIds.length!==fatCount||new Set(fatIds).size!==fatIds.length)fail();
 const fat=fatIds.flatMap(id=>{const s=sector(id),d=new DataView(s.buffer,s.byteOffset,s.byteLength);return Array.from({length:size/4},(_,i)=>i32(d,i*4));});
 function chain(start,allocation,limit){const ids=[],visited=new Set();let id=start;while(id!==-2){if(!Number.isInteger(id)||id<0||id>=limit||visited.has(id))fail();visited.add(id);ids.push(id);id=allocation[id];}return ids;}
 const join=(ids,get,length)=>{const parts=ids.map(get),available=parts.reduce((n,p)=>n+p.length,0);if(length>available||length>bytes.length)fail();const out=new Uint8Array(length??available);let at=0;for(const part of parts){const copy=part.subarray(0,out.length-at);out.set(copy,at);at+=copy.length;if(at===out.length)break;}return out;};
 const dir=join(chain(i32(v,48),fat,sectors),sector);if(dir.length>2*1024*1024||dir.length%128)fail();
 const entries=[];for(let p=0;p<dir.length;p+=128){const d=new DataView(dir.buffer,p,128),type=dir[p+66],len=d.getUint16(64,true);if(type&&!([1,2,5].includes(type)&&len>=2&&len<=64&&len%2===0))fail();const name=type?new TextDecoder('utf-16le').decode(dir.subarray(p,p+len-2)):'';const length=u32(d,120);if(type===2||type===5){if(u32(d,124)||length>bytes.length)fail();}entries.push({name,type,left:i32(d,68),right:i32(d,72),child:i32(d,76),start:i32(d,116),length});}
 if(entries[0]?.type!==5)fail();if(entries.some(e=>/^(Macros|VBA|_VBA_PROJECT(?:_CUR)?|PROJECT|PROJECTwm)$/i.test(e.name)))throw new Error('Macro-enabled PowerPoint files are not supported. Save a macro-free .pptx copy.');
 const roots=[],stack=[entries[0].child],visited=new Set();while(stack.length){const id=stack.pop();if(id===-1)continue;if(id<0||id>=entries.length||visited.has(id))fail();visited.add(id);const e=entries[id];roots.push(e);stack.push(e.left,e.right);}
 const wanted=roots.filter(e=>e.type===2&&['Current User','PowerPoint Document'].includes(e.name));if(wanted.length!==2||new Set(wanted.map(e=>e.name)).size!==2)fail();
 const miniCount=u32(v,64);if(miniCount>sectors)fail();let mini=[],miniStream;
 if(wanted.some(e=>e.length<4096)){const ids=chain(i32(v,60),fat,sectors);if(ids.length!==miniCount)fail();const data=join(ids,sector);const d=new DataView(data.buffer);mini=Array.from({length:data.length/4},(_,i)=>i32(d,i*4));miniStream=join(chain(entries[0].start,fat,sectors),sector,entries[0].length);}
 const streams=new Map(wanted.map(e=>[e.name,e.length<4096?join(chain(e.start,mini,Math.floor(miniStream.length/64)),id=>miniStream.subarray(id*64,id*64+64),e.length):join(chain(e.start,fat,sectors),sector,e.length)]));
 streams.rendererCopy=document=>{
  const entry=wanted.find(e=>e.name==='PowerPoint Document'),copy=bytes.slice(),small=entry.length<4096,ids=chain(entry.start,small?mini:fat,small?Math.floor(miniStream.length/64):sectors),rootIds=small?chain(entries[0].start,fat,sectors):null,block=small?64:size;
  if(document.length!==entry.length)fail();
  ids.forEach((id,index)=>{const logical=id*64,physical=small?(rootIds[Math.floor(logical/size)]+1)*size+logical%size:(id+1)*size;copy.set(document.subarray(index*block,Math.min(document.length,(index+1)*block)),physical);});
  return copy;
 };
 return streams;
}
export function legacyPptSlides(bytes,{metadata=false,rendererView=false}={}){
 const streams=compoundStreams(bytes),data=streams.get('PowerPoint Document'),current=streams.get('Current User'),v=new DataView(data.buffer,data.byteOffset,data.byteLength);
 let count=0;
 function record(offset,end=data.length){if(!Number.isInteger(offset)||offset<0||offset+8>end||++count>200000)fail();const flags=v.getUint16(offset,true),length=u32(v,offset+4);if(offset+8+length>end)fail();return {offset,start:offset+8,end:offset+8+length,type:v.getUint16(offset+2,true),version:flags&15,instance:flags>>>4,length};}
 function children(r){const out=[];for(let at=r.start;at<r.end;){const child=record(at,r.end);out.push(child);at=child.end;}return out;}
 function text(r,depth=0){if(depth>64)fail();if(r.type===4000){if(r.length%2)fail();return new TextDecoder('utf-16le',{fatal:true}).decode(data.subarray(r.start,r.end)).replace(/[\r\v]/g,'\n');}if(r.type===4008){let out='';for(let p=r.start;p<r.end;p++)out+=String.fromCharCode(data[p]);return out.replace(/[\r\v]/g,'\n');}if(r.version===15||r.type===0xf00d)return children(r).map(c=>text(c,depth+1)).filter(Boolean).join('\n');return '';}
 if(current.length<28)fail();const cv=new DataView(current.buffer,current.byteOffset,current.byteLength);
 if(cv.getUint16(2,true)!==4086)fail();if(u32(cv,12)!==0xe391c05f)throw new Error('Encrypted PowerPoint files are not supported. Choose an unlocked .ppt or .pptx copy.');
 let offset=u32(cv,16),docId;const directory=new Map(),seen=new Set(),activeDirectories=new Set();
 do{if(seen.has(offset)||seen.size>=10000)fail();seen.add(offset);const edit=record(offset);if(edit.type!==4085||![28,32].includes(edit.length))fail();if(edit.length===32&&u32(v,edit.start+28))throw new Error('Encrypted PowerPoint files are not supported.');docId??=u32(v,edit.start+16);const previous=u32(v,edit.start+8),persistOffset=u32(v,edit.start+12);if(previous>=offset&&previous||persistOffset>=offset||persistOffset<=previous)fail();activeDirectories.add(persistOffset);const persist=record(persistOffset);if(persist.type!==6002)fail();for(let p=persist.start;p<persist.end;){if(p+4>persist.end)fail();const header=u32(v,p),first=header&0xfffff,n=header>>>20;p+=4;if(!n||!first||first+n>0xfffff||p+n*4>persist.end)fail();for(let i=0;i<n;i++,p+=4){const at=u32(v,p);if(at>=persistOffset)fail();if(!directory.has(first+i))directory.set(first+i,at);}}offset=previous;}while(offset);
 const resolve=(id,type)=>{if(!directory.has(id))fail();const r=record(directory.get(id));if(r.type!==type||r.version!==15)fail();return r;};
 const doc=resolve(docId,1000),list=children(doc).find(r=>r.type===4080&&r.instance===0&&r.version===15);if(!list)fail();
 if(rendererView){
  // Some renderers choose the first historic Document and all persisted objects.
  // Suppress superseded records in a same-size, in-memory copy only. The original
  // remains byte-for-byte unchanged in storage, downloads and editable exports.
  const document=data.slice(),view=new DataView(document.buffer),active=new Set(directory.values());
  for(let at=0;at+8<=data.length;){const r=record(at);if(([1000,1006,1008,1016].includes(r.type)&&!active.has(at))||(r.type===1000&&at!==doc.offset)||(r.type===6002&&!activeDirectories.has(at))){view.setUint16(at,0,true);view.setUint16(at+2,0,true);}at=r.end;}
  return streams.rendererCopy(document);
 }
 const slides=[];let active;for(const r of children(list)){if(r.type===1011){if(r.length!==20)fail();active={id:u32(v,r.start+12),ref:u32(v,r.start),outline:[]};slides.push(active);if(slides.length>300)throw new Error('Use up to 300 slides per PowerPoint file.');}else if(active){const value=text(r);if(value.trim())active.outline.push(value);}}
 if(!slides.length)fail();const result=slides.map((s,i)=>{const shapeText=text(resolve(s.ref,1006)),pieces=[...s.outline,...(shapeText?[shapeText]:[])];return {page:i+1,unit:'slide',text:[...new Set(pieces)].join('\n').trim()};});
 if(!metadata)return result;
 const atom=children(doc).find(r=>r.type===1001&&r.length>=8),width=atom?i32(v,atom.start)/6:960,height=atom?i32(v,atom.start+4)/6:720;
 if(!(width>0&&height>0&&width<=20000&&height<=20000))fail();
 return {width,height,slides:result.map(s=>({...s,id:`slide-${s.page}`,width,height,notes:''}))};
}
