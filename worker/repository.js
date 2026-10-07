export class CourseRepository {
  constructor(db,userId){this.db=db;this.userId=userId;}
  async list(){const {results}=await this.db.prepare('SELECT id, name, revision, updated_at FROM courses WHERE user_id=? ORDER BY updated_at DESC').bind(this.userId).all();return results;}
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
