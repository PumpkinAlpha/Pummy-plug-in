import { DatabaseSync } from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export class LocalD1 {
 constructor(path=':memory:'){this.db=new DatabaseSync(path);for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql'))){const sql=readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8');if(!this.db.prepare("SELECT name FROM sqlite_master WHERE name='courses'").get())this.db.exec(sql);}}
 prepare(sql){const db=this.db;let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};}
 close(){this.db.close();}
}
