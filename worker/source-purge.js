import {PluginCourse,view} from './course.js';
import {bankEntries,bankInsert} from './practice-banks.js';
const conflict=()=>Object.assign(new Error('Your sources changed. Refresh before deleting forever.'),{code:'conflict'});

export async function purgeSource(repo,saved,args){
 let model=new PluginCourse(saved.data),source=model.sources.get(args.sourceId);
 if(!source?.deletedAt)throw new Error('Move this source to Recently deleted first.');
 if(source.purgedAt&&!source.purgePending)return {state:view(model,saved.revision),message:'Source permanently deleted.'};
 if(!source.purgePending){
  if(args.revision!==saved.revision)throw conflict();
  const rows=(await repo.db.prepare('SELECT id,metadata,revision FROM tutor_presentations WHERE user_id=? AND course_id=?').bind(repo.userId,args.courseId).all()).results;
  const linked=rows.filter(p=>JSON.parse(p.metadata).sourceId===source.id),ids=linked.map(p=>p.id),candidates=new Set([source.originalFile?.id,...linked.flatMap(p=>{const m=JSON.parse(p.metadata);return [m.originalAssetId,m.pdfAssetId];})].filter(Boolean));
  const conversions=(await repo.db.prepare('SELECT original_asset_id,pdf_asset_id FROM tutor_conversions WHERE user_id=? AND course_id=?').bind(repo.userId,args.courseId).all()).results;
  for(const c of conversions)if(candidates.has(c.original_asset_id))candidates.add(c.pdf_asset_id);
  const shared=new Set([...model.sources.values()].filter(s=>s.id!==source.id).map(s=>s.originalFile?.id).filter(Boolean));
  for(const p of rows.filter(p=>!ids.includes(p.id))){const m=JSON.parse(p.metadata);for(const id of [m.originalAssetId,m.pdfAssetId])if(id)shared.add(id);}
  for(const c of conversions)if(shared.has(c.original_asset_id))shared.add(c.pdf_asset_id);
  const assets=[...candidates].filter(id=>!shared.has(id));
  const r2=(await repo.db.prepare("SELECT id FROM tutor_assets WHERE user_id=? AND course_id=? AND storage='r2' AND id IN (SELECT value FROM json_each(?))").bind(repo.userId,args.courseId,JSON.stringify(assets)).all()).results.map(a=>a.id);
  if(r2.length&&!repo.assetStore)throw new Error('File storage is temporarily unavailable. Retry Delete forever shortly.');
  const requests=(await repo.db.prepare('SELECT presentation_id,id,data FROM tutor_requests WHERE user_id=? AND course_id=? AND presentation_id IN (SELECT value FROM json_each(?))').bind(repo.userId,args.courseId,JSON.stringify(ids)).all()).results;
  const recovered=(await bankEntries(repo,args.courseId,saved.data)).filter(b=>b.revision===0);
  const retired={id:source.id,name:source.name,deletedAt:source.deletedAt,purgedAt:Date.now(),purgePending:{assets:r2}};
  model.sources.set(source.id,retired);model.texts.delete(source.id);model.objectives=model.objectives.filter(o=>o.sourceId!==source.id);model._index=null;
  const revision=await repo.save(model.serialize(),saved.revision,saved.data,writeId=>{
   const gate="EXISTS(SELECT 1 FROM courses WHERE user_id=? AND id=? AND json_extract(data,'$._sourceStorage.writeId')=?)",scope=[repo.userId,args.courseId,writeId];
   const statements=[];
   // Independent tutor writes must still match the snapshot used to identify
   // shared files and recover older practice checks. A mismatch rolls back all.
   statements.push(repo.db.prepare(`SELECT CASE WHEN NOT ${gate} OR (
    (SELECT count(*) FROM tutor_presentations WHERE user_id=? AND course_id=?)=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM json_each(?) e LEFT JOIN tutor_presentations p ON p.user_id=? AND p.course_id=? AND p.id=json_extract(e.value,'$.id') WHERE p.id IS NULL OR p.metadata!=json_extract(e.value,'$.metadata') OR p.revision!=json_extract(e.value,'$.revision')) AND
    (SELECT count(*) FROM tutor_requests WHERE user_id=? AND course_id=? AND presentation_id IN (SELECT value FROM json_each(?)))=json_array_length(?) AND NOT EXISTS(SELECT 1 FROM json_each(?) e LEFT JOIN tutor_requests r ON r.user_id=? AND r.course_id=? AND r.presentation_id=json_extract(e.value,'$.presentation_id') AND r.id=json_extract(e.value,'$.id') WHERE r.id IS NULL OR r.data!=json_extract(e.value,'$.data'))
   ) THEN 1 ELSE json('source-purge-conflict') END`).bind(...scope,repo.userId,args.courseId,JSON.stringify(rows),JSON.stringify(rows),repo.userId,args.courseId,repo.userId,args.courseId,JSON.stringify(ids),JSON.stringify(requests),JSON.stringify(requests),repo.userId,args.courseId));
   for(const bank of recovered)statements.push(bankInsert(repo,args.courseId,bank,gate,scope));
   for(const table of ['tutor_slide_annotations','tutor_revisions','tutor_requests'])statements.push(repo.db.prepare(`DELETE FROM ${table} WHERE user_id=? AND course_id=? AND presentation_id IN (SELECT value FROM json_each(?)) AND ${gate}`).bind(repo.userId,args.courseId,JSON.stringify(ids),...scope));
   statements.push(repo.db.prepare(`DELETE FROM tutor_presentations WHERE user_id=? AND course_id=? AND id IN (SELECT value FROM json_each(?)) AND ${gate}`).bind(repo.userId,args.courseId,JSON.stringify(ids),...scope));
   for(const [table,column] of [['tutor_asset_chunks','asset_id'],['tutor_assets','id']])statements.push(repo.db.prepare(`DELETE FROM ${table} WHERE user_id=? AND course_id=? AND ${column} IN (SELECT value FROM json_each(?)) AND ${gate}`).bind(repo.userId,args.courseId,JSON.stringify(assets),...scope));
   statements.push(repo.db.prepare(`DELETE FROM tutor_conversions WHERE user_id=? AND course_id=? AND (original_asset_id IN (SELECT value FROM json_each(?)) OR pdf_asset_id IN (SELECT value FROM json_each(?))) AND ${gate}`).bind(repo.userId,args.courseId,JSON.stringify(assets),JSON.stringify(assets),...scope));
   return statements;
  }).catch(e=>{if(/source-purge-conflict|malformed JSON|invalid JSON/i.test(e.message))throw conflict();throw e;});
  saved={data:model.serialize(),revision};source=retired;
 }
 try{
  for(const assetId of source.purgePending.assets){
   if(!repo.assetStore)throw new Error('File storage is temporarily unavailable.');
   const prefix='files/'+[repo.userId,args.courseId,assetId].map(encodeURIComponent).join('/')+'/';let cursor;
   do{const page=await repo.assetStore.list({prefix,limit:1000,...(cursor?{cursor}:{})});if(page.objects.length)await repo.assetStore.delete(page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:null;}while(cursor);
  }
  // Only a compact identifier remains to block stale uploads and local sync.
  // Reload before saving so concurrent answers and course edits are preserved.
  for(let attempt=0;attempt<3;attempt++){
   const current=await repo.get(args.courseId);if(!current)throw new Error('Course not found.');const next=new PluginCourse(current.data),s=next.sources.get(args.sourceId);
   if(!s?.purgePending)return {state:view(next,current.revision),message:'Source permanently deleted.'};
   next.sources.set(args.sourceId,{id:s.id,name:'Deleted source',deletedAt:s.deletedAt,purgedAt:s.purgedAt});
   try{const revision=await repo.save(next.serialize(),current.revision,current.data);return {state:view(next,revision),message:'Source permanently deleted.'};}catch(e){if(e.code!=='conflict'||attempt===2)throw e;}
  }
 }catch(e){throw new Error('Permanent deletion is pending. Retry Delete forever to finish removing its files. '+e.message);}
}
