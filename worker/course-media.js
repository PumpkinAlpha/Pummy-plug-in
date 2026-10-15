// Keep immutable question images outside the small course/exam JSON snapshot.
// Separate IDs preserve question copies when an original source is purged.
const prefix='pummy-media:';
export async function packMedia(data){
 const images=new Map(),pending=new Map();
 async function visit(value,key){
  if((key==='dataUrl'||key==='image')&&typeof value==='string'&&value.startsWith('data:image/')){
   if(!pending.has(value))pending.set(value,(async()=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)),id='media:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');images.set(id,value);return prefix+id;})());
   return pending.get(value);
  }
  if(Array.isArray(value))return Promise.all(value.map(item=>visit(item)));
  if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await visit(v,k)])));
  return value;
 }
 return {data:await visit(data),images};
}
export function hydrateMedia(value,images,key){
 if((key==='dataUrl'||key==='image')&&typeof value==='string'&&value.startsWith(prefix)){
  const image=images.get(value.slice(prefix.length));
  if(!image)throw new Error('A saved question image is unavailable. Retry loading this course.');
  return image;
 }
 if(Array.isArray(value))return value.map(item=>hydrateMedia(item,images));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,hydrateMedia(v,images,k)]));
 return value;
}
