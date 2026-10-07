import {bucket,isDue} from '../lib/pummy-core.mjs';
export class CourseRepository {
  constructor(db,userId){this.db=db;this.userId=userId;}
  async list(){const {results}=await this.db.prepare('SELECT id, name, revision, updated_at, data FROM courses WHERE user_id=? ORDER BY updated_at DESC').bind(this.userId).all();return results.map(({data,...row})=>{const saved=JSON.parse(data),concepts=saved.concepts||[],questions=saved.questions||[],sources=saved.sources||[];const weeks=new Set([...sources.map(s=>s.weekId),...questions.map(q=>q.weekId)].filter(Boolean));return {...row,questionCount:questions.filter(q=>q.keyed&&!['followup','variant'].includes(q.origin)).length,sourceCount:sources.length,weekCount:weeks.size||new Set(sources.map(s=>s.lecture).filter(Boolean)).size,due:concepts.filter(isDue).length,learning:concepts.filter(c=>bucket(c)==='learning').length,retained:concepts.filter(c=>bucket(c)==='retained').length,professorCount:questions.filter(q=>q.keyed&&q.origin==='practice').length};});}
  async get(id){const row=await this.db.prepare('SELECT data, revision FROM courses WHERE user_id=? AND id=?').bind(this.userId,id).first();return row?{data:JSON.parse(row.data),revision:row.revision}:null;}
  async save(data,revision,expectedData){
    const json=JSON.stringify(data);
    if(new TextEncoder().encode(json).length>900000)throw new Error('This course is too large. Import fewer questions or shorter source excerpts.');
    const result=revision===0
      ?await this.db.prepare('INSERT OR IGNORE INTO courses (user_id,id,name,data,revision,updated_at) VALUES (?,?,?,?,1,?)').bind(this.userId,data.id,data.name,json,Date.now()).run()
      :await this.db.prepare('UPDATE courses SET name=?,data=?,revision=revision+1,updated_at=? WHERE user_id=? AND id=? AND revision=?'+(expectedData?' AND data=?':'')).bind(data.name,json,Date.now(),this.userId,data.id,revision,...(expectedData?[JSON.stringify(expectedData)]:[])).run();
    if(result.meta.changes!==1)throw Object.assign(new Error('Your test changed in another window. Refresh to continue; your answer has not been overwritten.'),{code:'conflict'});
    return revision+1;
  }
  async recordReceipt(data,revision,expectedData){
    const json=JSON.stringify(data);
    if(new TextEncoder().encode(json).length>900000)throw new Error('This course is too large. Split the sources into smaller courses.');
    const result=await this.db.prepare('UPDATE courses SET data=? WHERE user_id=? AND id=? AND revision=? AND data=?').bind(json,this.userId,data.id,revision,JSON.stringify(expectedData)).run();
    if(result.meta.changes!==1)throw Object.assign(new Error('Your course changed. Refresh and retry.'),{code:'conflict'});
    return revision;
  }
}
