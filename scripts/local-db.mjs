import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export class LocalD1 {
 constructor(path=':memory:'){
  this.db=new DatabaseSync(path);
  this.db.exec('CREATE TABLE IF NOT EXISTS pummy_migrations (name TEXT PRIMARY KEY)');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){
   if(this.db.prepare('SELECT name FROM pummy_migrations WHERE name=?').get(name))continue;
   const sql=readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8');
   this.db.exec('BEGIN');
   try{
    if(name!=='0000_illegal_iron_monger.sql'||!this.db.prepare("SELECT name FROM sqlite_master WHERE name='courses'").get())this.db.exec(sql);
    this.db.prepare('INSERT INTO pummy_migrations(name) VALUES (?)').run(name);
    this.db.exec('COMMIT');
   }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
 }
 prepare(sql){
  const db=this.db;let args=[];
  const execute=()=>{const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};};
  return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return execute();},_execute:execute};
 }
 async batch(statements){this.db.exec('BEGIN');try{const results=statements.map(s=>s._execute());this.db.exec('COMMIT');return results;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 close(){this.db.close();}
}
