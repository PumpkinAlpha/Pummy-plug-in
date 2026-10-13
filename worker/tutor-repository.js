import {CHUNK_SIZE,decode64} from '../lib/tutor/presentations.js';
import {retryStorage} from './storage-retry.js';
const conflict=()=>Object.assign(new Error('Annotations changed in another window. Your local changes are kept. Reload before saving.'),{code:'conflict'});
export class TutorRepository {
 constructor(courseRepo){this.db=courseRepo.db;this.userId=courseRepo.userId;this.courses=courseRepo;this.assetStore=courseRepo.assetStore;}
 async authorize(courseId){const c=await this.courses.get(courseId);if(!c)throw new Error('Course not found.');return c;}
 query(sql,...params){return this.db.prepare(sql).bind(this.userId,...params);}
 async list(courseId){const {results}=await this.query('SELECT id,metadata,revision,updated_at FROM tutor_presentations WHERE user_id=? AND course_id=? ORDER BY updated_at DESC',courseId).all();return results.map(r=>{const p=JSON.parse(r.metadata);return {id:p.id,name:p.name,kind:p.kind,sourceId:p.sourceId||null,folder:p.folder||null,slideCount:p.slides.length,originalAssetId:p.originalAssetId,pdfAssetId:p.pdfAssetId,revision:r.revision,updatedAt:r.updated_at};});}
 async get(courseId,id){const r=await this.query('SELECT * FROM tutor_presentations WHERE user_id=? AND course_id=? AND id=?',courseId,id).first();if(!r)throw new Error('Presentation not found.');const {results}=await this.query('SELECT slide_id,data FROM tutor_slide_annotations WHERE user_id=? AND course_id=? AND presentation_id=?',courseId,id).all();return {...JSON.parse(r.metadata),annotations:{...JSON.parse(r.annotations),...Object.fromEntries(results.map(s=>[s.slide_id,JSON.parse(s.data)]))},revision:r.revision,lastRequest:r.last_request};}
 async create(courseId,id,metadata){
  const ready=this.db.prepare("UPDATE tutor_assets SET ready=1 WHERE user_id=? AND course_id=? AND id IN (?,?) AND EXISTS(SELECT 1 FROM tutor_presentations WHERE user_id=? AND course_id=? AND id=? AND json_extract(metadata,'$.originalAssetId')=? AND json_extract(metadata,'$.pdfAssetId') IS ? AND coalesce(json_extract(metadata,'$.sourceId'),'')=?)").bind(this.userId,courseId,metadata.originalAssetId,metadata.pdfAssetId,this.userId,courseId,id,metadata.originalAssetId,metadata.pdfAssetId,metadata.sourceId||'');
  // Publishing metadata and making validated immutable assets readable is one transaction.
  // The conditional update also prevents a concurrent import from reusing another import's ID.
  await this.db.batch([this.query('INSERT OR IGNORE INTO tutor_presentations(user_id,course_id,id,metadata,updated_at) VALUES(?,?,?,?,?)',courseId,id,JSON.stringify(metadata),Date.now()),ready]);
  const current=await this.get(courseId,id);
  if(current.originalAssetId!==metadata.originalAssetId||current.pdfAssetId!==metadata.pdfAssetId||(current.sourceId||null)!==(metadata.sourceId||null))throw new Error('Presentation ID is already in use.');
  return current;
 }
 async versions(courseId,id){const {results}=await this.query("SELECT revision,created_at,json_extract(patch,'$.label') AS label FROM tutor_revisions WHERE user_id=? AND course_id=? AND presentation_id=? ORDER BY revision DESC",courseId,id).all();return [{revision:1,createdAt:null,label:'Original presentation'},...results.map(r=>({revision:r.revision,createdAt:r.created_at,label:r.label||'Annotations'}))];}
 async save(courseId,id,revision,requestId,next,label='Annotations'){
  const current=await this.get(courseId,id),receipt=await this.query('SELECT revision FROM tutor_revisions WHERE user_id=? AND course_id=? AND presentation_id=? AND request_id=?',courseId,id,requestId).first();if(receipt){if(receipt.revision!==current.revision)throw conflict();return current;}
  if(current.revision!==revision)throw conflict();
  const before=current.annotations,patch={label,slides:{}};
  for(const key of new Set([...Object.keys(before),...Object.keys(next)])){if(JSON.stringify(before[key]||[])!==JSON.stringify(next[key]||[])){const previous=new Map((before[key]||[]).map(a=>[a.id,a])),updated=new Map((next[key]||[]).map(a=>[a.id,a]));patch.slides[key]={beforeOrder:[...previous.keys()],afterOrder:[...updated.keys()],changes:[...new Set([...previous.keys(),...updated.keys()])].filter(id=>JSON.stringify(previous.get(id))!==JSON.stringify(updated.get(id))).map(id=>({id,before:previous.get(id)||null,after:updated.get(id)||null}))};}}
  if(!Object.keys(patch.slides).length)return current;
  const json=JSON.stringify(next);if(new TextEncoder().encode(json).length>1400000)throw new Error('Annotation storage limit reached. Export your project before adding more objects.');
  const now=Date.now();
  const statements=[this.db.prepare('UPDATE tutor_presentations SET revision=revision+1,last_request=?,updated_at=? WHERE user_id=? AND course_id=? AND id=? AND revision=?').bind(requestId,now,this.userId,courseId,id,revision)];
  for(const slideId of Object.keys(patch.slides))statements.push(this.db.prepare('INSERT OR REPLACE INTO tutor_slide_annotations(user_id,course_id,presentation_id,slide_id,data) SELECT user_id,course_id,id,?,? FROM tutor_presentations WHERE user_id=? AND course_id=? AND id=? AND revision=? AND last_request=?').bind(slideId,JSON.stringify(next[slideId]||[]),this.userId,courseId,id,revision+1,requestId));
  statements.push(this.db.prepare('INSERT INTO tutor_revisions(user_id,course_id,presentation_id,revision,request_id,patch,created_at) SELECT user_id,course_id,id,revision,?,?,? FROM tutor_presentations WHERE user_id=? AND course_id=? AND id=? AND revision=? AND last_request=? AND NOT EXISTS(SELECT 1 FROM tutor_revisions WHERE user_id=? AND course_id=? AND presentation_id=? AND request_id=?)').bind(requestId,JSON.stringify(patch),now,this.userId,courseId,id,revision+1,requestId,this.userId,courseId,id,requestId));
  const results=await this.db.batch(statements);if(results[0].meta.changes!==1){const retried=await this.query('SELECT revision FROM tutor_revisions WHERE user_id=? AND course_id=? AND presentation_id=? AND request_id=?',courseId,id,requestId).first();if(!retried)throw conflict();}return this.get(courseId,id);
 }
 async restore(courseId,id,revision,target,requestId){const current=await this.get(courseId,id);if(target<1||target>current.revision)throw new Error('Version not found.');const {results}=await this.query('SELECT patch FROM tutor_revisions WHERE user_id=? AND course_id=? AND presentation_id=? AND revision>? ORDER BY revision DESC',courseId,id,target).all();const annotations=structuredClone(current.annotations);for(const row of results)for(const [slide,p] of Object.entries(JSON.parse(row.patch).slides)){if(p.before){annotations[slide]=p.before;continue;}const objects=new Map((annotations[slide]||[]).map(a=>[a.id,a]));for(const c of p.changes){if(c.before)objects.set(c.id,c.before);else objects.delete(c.id);}annotations[slide]=p.beforeOrder.map(id=>objects.get(id)).filter(Boolean);}return this.save(courseId,id,revision,requestId,annotations,`Restored version ${target}`);}
 async asset(courseId,id){const r=await this.query('SELECT * FROM tutor_assets WHERE user_id=? AND course_id=? AND id=?',courseId,id).first();if(!r)throw new Error('File not found.');return r;}
 assetKey(courseId,id,index,hash){return 'files/'+[this.userId,courseId,id,index,hash].map(encodeURIComponent).join('/');}
 async chunkRecord(courseId,a,index,data){
  if(a.storage!=='r2')return data;
  if(!this.assetStore)throw new Error('File storage is temporarily unavailable. Retry shortly.');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  // Content-addressed keys prevent competing uploads from overwriting original bytes.
  await retryStorage(()=>this.assetStore.put(this.assetKey(courseId,a.id,index,hash),data));
  return hash;
 }
 async chunkData(courseId,a,index){
  const row=await this.query('SELECT data FROM tutor_asset_chunks WHERE user_id=? AND course_id=? AND asset_id=? AND chunk_index=?',courseId,a.id,index).first();
  if(!row)throw new Error('Upload is incomplete.');
  if(a.storage!=='r2')return row.data;
  const object=this.assetStore?await retryStorage(()=>this.assetStore.get(this.assetKey(courseId,a.id,index,row.data))):null;
  if(!object)throw new Error('Upload is incomplete. Retry the file upload.');
  return object.text();
 }
 async assetBytes(courseId,id){const a=await this.asset(courseId,id),bytes=new Uint8Array(a.bytes);let cursor=0;await Promise.all(Array.from({length:Math.min(3,a.chunks)},async()=>{while(cursor<a.chunks){const index=cursor++,part=decode64(await this.chunkData(courseId,a,index)),offset=index*CHUNK_SIZE/4*3;if(part.length!==Math.min(CHUNK_SIZE/4*3,a.bytes-offset))throw new Error('Original source upload has a size mismatch.');bytes.set(part,offset);}}));return bytes;}
 async assetData(courseId,id){const a=await this.asset(courseId,id),parts=[];for(let index=0;index<a.chunks;index++)parts.push(await this.chunkData(courseId,a,index));return parts.join('');}
 async validateAsset(courseId,id){
  const a=await this.asset(courseId,id);let decoded=0;
  for(let index=0;index<a.chunks;index++)decoded+=decode64(await this.chunkData(courseId,a,index)).length;
  if(decoded!==a.bytes)throw new Error('Original source upload has a size mismatch.');
  return a;
 }
 async request(courseId,presentationId,id){const r=await this.query('SELECT data FROM tutor_requests WHERE user_id=? AND course_id=? AND presentation_id=? AND id=?',courseId,presentationId,id).first();if(!r)throw new Error('Tutor request not found.');return JSON.parse(r.data);}
 async requestList(courseId,presentationId){const {results}=await this.query('SELECT data FROM tutor_requests WHERE user_id=? AND course_id=? AND presentation_id=? ORDER BY updated_at DESC LIMIT 20',courseId,presentationId).all();return results.map(r=>JSON.parse(r.data)).reverse();}
 async putRequest(courseId,presentationId,id,data){await this.query('INSERT OR IGNORE INTO tutor_requests(user_id,course_id,presentation_id,id,data,updated_at) VALUES(?,?,?,?,?,?)',courseId,presentationId,id,JSON.stringify(data),Date.now()).run();return this.request(courseId,presentationId,id);}
 async completeRequest(courseId,presentationId,id,data,expected,archive=null){
  const next=archive?{...data,archiveWriteId:crypto.randomUUID()}:data,json=JSON.stringify(next);
  const statement=this.db.prepare('UPDATE tutor_requests SET data=?,updated_at=? WHERE user_id=? AND course_id=? AND presentation_id=? AND id=? AND data=?').bind(json,Date.now(),this.userId,courseId,presentationId,id,JSON.stringify(expected));
  const gate='EXISTS(SELECT 1 FROM tutor_requests WHERE user_id=? AND course_id=? AND presentation_id=? AND id=? AND data=?)';
  const extra=archive?[archive(gate,[this.userId,courseId,presentationId,id,json])]:[];
  const [r]=await this.db.batch([statement,...extra]);if(!r.meta.changes)throw conflict();return next;
 }
}
