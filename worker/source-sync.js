import {TutorRepository} from './tutor-repository.js';
import {validateSourceObjectives,pullSourceObjectives} from '../lib/source-objectives.js';
import {z} from 'zod/v4';
export const SOURCE_TYPES=['professor_slides','objectives','group_activity','professor_quiz','course_supplement','approved_external','other'];
export const DEFAULT_RANKS={professor_slides:1,objectives:2,group_activity:2,professor_quiz:3,course_supplement:4,approved_external:5,other:6};
const sourceId=z.string().min(1).max(180).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/,'Use a stable source ID containing letters, numbers, dots, hyphens, underscores or colons.');
const nonempty=n=>z.string().max(n).refine(v=>v.trim().length>0,'Must not be blank.');
export const sourcePage=z.object({page:z.number().int().positive().max(100000),text:nonempty(60000).describe('Educational page/slide text. Omit unrelated personal contact details and administrative contact blocks before calling.'),unit:z.enum(['page','slide']).optional()}).strict();
const metadata=z.object({localFolderId:z.string().uuid().optional(),relativePath:nonempty(600).optional(),fileHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),originalFileName:nonempty(300).optional(),mimeType:nonempty(160).optional(),pageCount:z.number().int().positive().max(100000).optional(),projectName:nonempty(160).optional(),projectUrl:z.string().url().max(800).optional(),sourceOrigin:z.enum(['project_conversation','student_upload','manual','import']).optional(),syncTimestamp:z.string().datetime().optional()}).strict();
export const syncSource=z.object({id:sourceId,name:nonempty(300),originalAssetId:z.string().uuid().optional(),text:nonempty(60000).describe('Extracted educational source text, not a URL. Omit unrelated instructor/student contact details, email addresses, phone numbers and administrative contact blocks before calling.'),sourceType:z.enum(SOURCE_TYPES).optional(),rank:z.number().int().min(1).max(6).optional(),lecture:nonempty(300).optional(),weekId:nonempty(180).nullish(),pages:z.array(sourcePage).max(1000).optional(),metadata:metadata.optional(),contentHash:z.string().regex(/^[a-fA-F0-9]{64}$/,'Use a SHA-256 hexadecimal hash.').optional()}).strict();
export const syncObjective=z.object({id:sourceId,text:nonempty(4000),num:z.union([nonempty(40),z.number().finite()]).optional(),sourceId:sourceId.nullish(),page:z.number().int().positive().optional(),lecture:nonempty(300).optional(),weekId:nonempty(180).nullish()}).strict();
export const syncFields={requestId:z.string().uuid(),sources:z.array(syncSource).max(30).default([]),objectives:z.array(syncObjective).max(200).default([])};
export function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>[k,canonical(value[k])]));return value;}
export async function digest(value){const bytes=new TextEncoder().encode(JSON.stringify(canonical(value)));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export const sourceContent=(src,text)=>({text,pages:Array.isArray(src.pages)?src.pages:[]});
const semanticMetadata=m=>{const {syncTimestamp,...rest}=m||{};return rest;};
function unique(items,label){const ids=new Set();for(const item of items){if(ids.has(item.id))throw new Error(`Sync rejected: duplicate ${label} ID ${item.id}. No changes were saved.`);ids.add(item.id);}}
export async function syncSources(repo,saved,model,args,view,refresh){
 unique(args.sources,'source');unique(args.objectives,'objective');
 if(!args.sources.length&&!args.objectives.length)throw new Error('Supply at least one source or objective to sync.');
 if(new TextEncoder().encode(JSON.stringify(args)).length>750000)throw new Error('Sync payload exceeds 750 KB. Split the batch into smaller requests; no changes were saved.');
 const payload={sources:args.sources.map(({contentHash,metadata,...s})=>({...s,metadata:semanticMetadata(metadata)})),objectives:args.objectives};
 const fingerprint=await digest(payload);
 const receipt=model.completedRequests.find(r=>r.tool==='sync_course_sources'&&r.id===args.requestId);
 if(receipt){if(receipt.fingerprint!==fingerprint)throw new Error('This requestId was already used for a different sync. Use a new requestId.');return {state:view(model,saved.revision),sync:receipt.summary,message:'This sync request was already completed.'};}
 if(args.revision!==saved.revision)throw Object.assign(new Error('Your course changed. Read read_course_state and retry with the latest revision; no sources were changed.'),{code:'conflict'});
 const summary={requestId:args.requestId,added:[],updated:[],unchanged:[],rejected:[],objectives:{added:[],updated:[],unchanged:[]},totalSources:0,revision:saved.revision};
 const now=Date.now();let changed=false;
 for(const src of args.sources){
  unique((src.pages||[]).map(p=>({id:p.page})),'page');
  const old=model.sources.get(src.id),oldText=model.texts.get(src.id)||'';
  // Folder sync is a background copy operation, never a restore action. Check
  // again here because a prepared scan/upload can outlive a source deletion.
  if(old?.purgedAt)throw new Error(`Source ${src.id} was permanently deleted. Import it with a new source ID to add it again.`);
  if(old?.deletedAt&&src.metadata?.localFolderId)throw new Error(`Source ${src.id} is in Recently deleted. Restore it before syncing this file.`);
  const contentHash=await digest(sourceContent(src,src.text));
  if(src.contentHash&&src.contentHash.toLowerCase()!==contentHash)throw new Error(`Sync rejected: contentHash mismatch for ${src.id}. No changes were saved.`);
  const rank=src.rank??old?.rank??DEFAULT_RANKS[src.sourceType||'other'];
  const {text,metadata:meta,originalAssetId,...info}=src;
  let originalFile=old?.originalFile;
  if(originalAssetId){const files=new TutorRepository(repo),a=await files.validateAsset(model.id,originalAssetId);originalFile={id:a.id,name:a.name,kind:a.kind,chunks:a.chunks,bytes:a.bytes};}
  const next={...old,...info,...(originalFile?{originalFile}:{}),id:src.id,name:src.name,rank,sourceType:src.sourceType||old?.sourceType||'other',kind:'material',contentHash,metadata:{...semanticMetadata(old?.metadata),...semanticMetadata(meta)}};
  // Omitted metadata/pages retain the stored value; clients explicitly resend changed pages.
  if(src.pages===undefined&&old?.pages){if(oldText===text)next.pages=old.pages;else delete next.pages;}
  next.contentHash=await digest(sourceContent(next,text));
  delete next.deletedAt;
  const sameContent=old&&!old.deletedAt&&await digest(sourceContent(old,oldText))===next.contentHash;
  const equalMeta=old&&JSON.stringify(old.originalFile)===JSON.stringify(next.originalFile)&&old.name===next.name&&old.rank===rank&&(old.sourceType||'other')===next.sourceType&&old.lecture===next.lecture&&old.weekId===next.weekId&&JSON.stringify(canonical(semanticMetadata(old.metadata)))===JSON.stringify(canonical(next.metadata));
  if(sameContent&&equalMeta){summary.unchanged.push(src.id);continue;}
  next.createdAt=old?.createdAt||now;next.updatedAt=now;next.lastSyncedAt=now;next.syncStatus=old?'updated':'synced';next.chars=text.length;
  model.sources.set(src.id,next);model.texts.set(src.id,text);summary[old?'updated':'added'].push(src.id);changed=true;
 }
 if([...model.sources.values()].filter(s=>!s.purgedAt).length>30)throw new Error('Use up to 30 sources per course. No changes were saved.');
 for(const o of validateSourceObjectives(args.objectives,model)){const i=model.objectives.findIndex(old=>old.id===o.id),old=model.objectives[i],next={...old,...o};if(old&&JSON.stringify(canonical(old))===JSON.stringify(canonical(next))){summary.objectives.unchanged.push(o.id);continue;}if(i<0)model.objectives.push(next);else model.objectives[i]=next;summary.objectives[i<0?'added':'updated'].push(o.id);changed=true;}
 const extracted=pullSourceObjectives(model,args.sources.map(s=>s.id));if(extracted.length){summary.objectives.added.push(...extracted.map(o=>o.id));changed=true;}
 if(model.objectives.length>200)throw new Error('Use up to 200 objectives per course. No changes were saved.');
 summary.totalSources=[...model.sources.values()].filter(s=>!s.purgedAt).length;summary.revision=saved.revision+(changed?1:0);
 if(changed){model._index=null;model._markers.clear();refresh(model);}
 model.sourceSync={...summary,completedAt:now,status:changed?(summary.updated.length||summary.objectives.updated.length?'updated':'synced'):'unchanged'};
 model.completedRequests=[...model.completedRequests,{id:args.requestId,tool:'sync_course_sources',fingerprint,summary}].slice(-40);
 try{
  if(changed)await repo.save(model.serialize(),saved.revision,saved.data);
  else await repo.recordReceipt({...saved.data,completedRequests:model.completedRequests,sourceSync:model.sourceSync},saved.revision,saved.data);
 }catch(e){if(e.code==='conflict'){const current=await repo.get(model.id),r=current?.data.completedRequests?.find(r=>r.tool==='sync_course_sources'&&r.id===args.requestId);if(r&&r.fingerprint===fingerprint)return {state:view(new model.constructor(current.data),current.revision),sync:r.summary,message:'This sync request was already completed.'};}throw e;}
 return {state:view(model,summary.revision),sync:summary,message:`Sources: ${summary.added.length} added, ${summary.updated.length} updated, ${summary.unchanged.length} unchanged. No questions were generated.`};
}
