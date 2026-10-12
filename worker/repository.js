import {bucket,isDue} from '../lib/pummy-core.mjs';
const storedSnapshots=new WeakMap(),externalSnapshots=new WeakSet();
function sourceEntries(data){
  const content=new Map((data.texts||[]).map(([id,text],position)=>[id,{id,text,pages:null,visualPdf:null,position}]));
  for(const source of data.sources||[])if(Array.isArray(source.pages)||'visualPdf' in source){const entry=content.get(source.id)||{id:source.id,text:null,position:content.size};content.set(source.id,{...entry,pages:Array.isArray(source.pages)?JSON.stringify(source.pages):null,visualPdf:'visualPdf' in source?JSON.stringify(source.visualPdf)??null:null});}
  return content;
}
function packCourse(data){
  const content=sourceEntries(data),sources=(data.sources||[]).map(source=>{const {visualPdf,...metadata}=source;if(Array.isArray(metadata.pages))delete metadata.pages;return metadata;});
  const writeId=crypto.randomUUID(),json=JSON.stringify({...data,sources,texts:[],_sourceStorage:{version:1,writeId}});
  if(new TextEncoder().encode(json).length>900000)throw new Error('The saved questions and exam history exceed course capacity. Export progress and split the question bank into smaller courses. Source files are stored separately.');
    return {json,writeId,content:[...content.values()],assetIds:[...new Set((data.sources||[]).map(s=>s.originalFile?.id).filter(Boolean))]};
}
export class CourseRepository {
  constructor(db,userId,converter=null,assetStore=null,profile=null){this.db=db;this.userId=userId;this.converter=converter;this.assetStore=assetStore;this.profile=profile;}
  async list(){const {results}=await this.db.prepare("SELECT id, name, revision, updated_at, data FROM courses WHERE user_id=? UNION ALL SELECT course_id AS id, name, revision, updated_at, '{}' AS data FROM course_deletions WHERE user_id=? ORDER BY updated_at DESC").bind(this.userId,this.userId).all();return results.map(({data,...row})=>{const saved=JSON.parse(data),concepts=saved.concepts||[],questions=saved.questions||[],sources=(saved.sources||[]).filter(s=>!s.deletedAt);const weeks=new Set([...sources.map(s=>s.weekId),...questions.map(q=>q.weekId)].filter(Boolean));const lectures=new Set(sources.map(s=>s.lecture).filter(Boolean));const unassigned=lectures.size&&(sources.some(s=>!s.lecture)||questions.some(q=>!sources.some(s=>s.id===q.sourceId&&s.lecture)));return {...row,questionCount:questions.filter(q=>q.keyed&&!['followup','variant'].includes(q.origin)).length,sourceCount:sources.length,weekCount:weeks.size||(lectures.size+Number(!!unassigned))||(sources.length||questions.length?1:0),due:concepts.filter(isDue).length,learning:concepts.filter(c=>bucket(c)==='learning').length,retained:concepts.filter(c=>bucket(c)==='retained').length,professorCount:questions.filter(q=>q.keyed&&q.origin==='practice').length};});}
  async get(id){
    // Read the snapshot and its source rows together so a concurrent sync cannot
    // pair an older exam revision with newer source text.
    const [snapshot,sourceRows]=await this.db.batch([
      this.db.prepare('SELECT data, revision FROM courses WHERE user_id=? AND id=?').bind(this.userId,id),
      this.db.prepare('SELECT source_id AS id,text,pages,visual_pdf AS visualPdf,position FROM course_source_content WHERE user_id=? AND course_id=? ORDER BY position').bind(this.userId,id)
    ]);
    const row=snapshot.results[0];
    if(!row)return null;
    const data=JSON.parse(row.data);
    if(data._sourceStorage?.version===1){
      externalSnapshots.add(data);
      const content=sourceRows.results,byId=new Map(content.map(entry=>[entry.id,entry]));
      data.sources=(data.sources||[]).map(source=>{const entry=byId.get(source.id);return {...source,...(entry?.pages!=null?{pages:JSON.parse(entry.pages)}:{}),...(entry?.visualPdf!=null?{visualPdf:JSON.parse(entry.visualPdf)}:{})};});
      data.texts=content.filter(entry=>entry.text!==null).sort((a,b)=>a.position-b.position).map(entry=>[entry.id,entry.text]);
      delete data._sourceStorage;
    }
    storedSnapshots.set(data,row.data);return {data,revision:row.revision};
  }
  async delete(id,revision){
    // Preserve a retryable receipt before removing course-owned database records.
    // A stale revision creates no receipt and cannot delete files or child rows.
    const pending='EXISTS(SELECT 1 FROM course_deletions WHERE user_id=? AND course_id=? AND revision=?)';
    const statements=[this.db.prepare('INSERT OR IGNORE INTO course_deletions(user_id,course_id,name,revision,updated_at,has_r2) SELECT user_id,id,name,revision,updated_at,EXISTS(SELECT 1 FROM tutor_assets WHERE user_id=courses.user_id AND course_id=courses.id AND storage=\'r2\') FROM courses WHERE user_id=? AND id=? AND revision=?').bind(this.userId,id,revision)];
    for(const table of ['course_source_content','tutor_asset_chunks','tutor_assets','tutor_slide_annotations','tutor_revisions','tutor_requests','tutor_conversions','tutor_presentations'])statements.push(this.db.prepare(`DELETE FROM ${table} WHERE user_id=? AND course_id=? AND ${pending}`).bind(this.userId,id,this.userId,id,revision));
    statements.push(this.db.prepare(`DELETE FROM courses WHERE user_id=? AND id=? AND revision=? AND ${pending}`).bind(this.userId,id,revision,this.userId,id,revision));
    await this.db.batch(statements);
    const receipt=await this.db.prepare('SELECT has_r2 FROM course_deletions WHERE user_id=? AND course_id=? AND revision=?').bind(this.userId,id,revision).first();
    if(!receipt)throw Object.assign(new Error('This course changed in another window. Refresh before deleting it.'),{code:'conflict'});
    try{
      if(receipt.has_r2&&!this.assetStore)throw new Error('File storage is temporarily unavailable.');
      if(this.assetStore){
        const prefix='files/'+[this.userId,id].map(encodeURIComponent).join('/')+'/';
        // Prefix listing also finds abandoned uploads and uncommitted chunk objects.
        let cursor;
        do{const page=await this.assetStore.list({prefix,limit:1000,...(cursor?{cursor}:{})});if(page.objects.length)await this.assetStore.delete(page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:null;}while(cursor);
      }
      await this.db.prepare('DELETE FROM course_deletions WHERE user_id=? AND course_id=? AND revision=?').bind(this.userId,id,revision).run();
    }catch(e){throw new Error('Course deletion is pending. Retry Delete course to finish removing its files. '+e.message);}
  }
  async save(data,revision,expectedData){
    const packed=packCourse(data),{json}=packed;
    const write=revision===0
      ?this.db.prepare('INSERT OR IGNORE INTO courses (user_id,id,name,data,revision,updated_at) SELECT ?,?,?,?,1,? WHERE NOT EXISTS(SELECT 1 FROM course_deletions WHERE user_id=? AND course_id=?)').bind(this.userId,data.id,data.name,json,Date.now(),this.userId,data.id)
      :this.db.prepare('UPDATE courses SET name=?,data=?,revision=revision+1,updated_at=? WHERE user_id=? AND id=? AND revision=?'+(expectedData?' AND data=?':'')).bind(data.name,json,Date.now(),this.userId,data.id,revision,...(expectedData?[storedSnapshots.get(expectedData)||JSON.stringify(expectedData)]:[]));
    const [result]=await this.db.batch([write,...this.contentWrites(data.id,packed,expectedData)]);
    if(result.meta.changes!==1)throw Object.assign(new Error('Your test changed in another window. Refresh to continue; your answer has not been overwritten.'),{code:'conflict'});
    return revision+1;
  }
  async recordReceipt(data,revision,expectedData){
    const packed=packCourse(data);
    const write=this.db.prepare('UPDATE courses SET data=? WHERE user_id=? AND id=? AND revision=? AND data=?').bind(packed.json,this.userId,data.id,revision,storedSnapshots.get(expectedData)||JSON.stringify(expectedData));
    const [result]=await this.db.batch([write,...this.contentWrites(data.id,packed,expectedData)]);
    if(result.meta.changes!==1)throw Object.assign(new Error('Your course changed. Refresh and retry.'),{code:'conflict'});
    return revision;
  }
  contentWrites(id,{writeId,content,assetIds},expectedData){
    // Only the winning snapshot write may replace its source rows. The unique
    // token also protects receipt writes that intentionally retain the revision.
    const current="EXISTS(SELECT 1 FROM courses WHERE user_id=? AND id=? AND json_extract(data,'$._sourceStorage.writeId')=?)";
    const hasPrevious=externalSnapshots.has(expectedData),previous=hasPrevious?sourceEntries(expectedData):new Map(),nextIds=new Set(content.map(entry=>entry.id)),statements=[];
    if(!hasPrevious)statements.push(this.db.prepare(`DELETE FROM course_source_content WHERE user_id=? AND course_id=? AND ${current}`).bind(this.userId,id,this.userId,id,writeId));
    for(const sourceId of previous.keys())if(!nextIds.has(sourceId))statements.push(this.db.prepare(`DELETE FROM course_source_content WHERE user_id=? AND course_id=? AND source_id=? AND ${current}`).bind(this.userId,id,sourceId,this.userId,id,writeId));
    for(const entry of content){const old=previous.get(entry.id);if(old&&old.text===entry.text&&old.pages===entry.pages&&old.visualPdf===entry.visualPdf&&old.position===entry.position)continue;statements.push(this.db.prepare(`INSERT INTO course_source_content(user_id,course_id,source_id,text,pages,visual_pdf,position) SELECT ?,?,?,?,?,?,? WHERE ${current} ON CONFLICT(user_id,course_id,source_id) DO UPDATE SET text=excluded.text,pages=excluded.pages,visual_pdf=excluded.visual_pdf,position=excluded.position`).bind(this.userId,id,entry.id,entry.text,entry.pages,entry.visualPdf??null,entry.position,this.userId,id,writeId));}
    // Original files become readable only when the matching course write wins.
    for(const assetId of assetIds)statements.push(this.db.prepare(`UPDATE tutor_assets SET ready=1 WHERE user_id=? AND course_id=? AND id=? AND ready=0 AND ${current}`).bind(this.userId,id,assetId,this.userId,id,writeId));
    return statements;
  }
}
