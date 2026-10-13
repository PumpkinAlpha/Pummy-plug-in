import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import {LocalD1} from '../scripts/local-db.mjs';

test('Drizzle discovers the additive tutor migration with the durable request uniqueness constraint',()=>{
 const migrations=readMigrationFiles({migrationsFolder:fileURLToPath(new URL('../drizzle',import.meta.url))});
 assert.equal(migrations.length,7);
 const sql=migrations[1].sql.join('\n');
 assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g)||[]).length,6);
 assert.match(migrations[2].sql.join('\n'),/CREATE TABLE `tutor_conversions`/);
 assert.match(migrations[3].sql.join('\n'),/ALTER TABLE `tutor_assets` ADD `storage` text DEFAULT 'd1' NOT NULL/);
 assert.match(migrations[4].sql.join('\n'),/CREATE TABLE `course_deletions`/);
 assert.match(migrations[5].sql.join('\n'),/CREATE TABLE `course_source_content`/);
 assert.match(migrations[6].sql.join('\n'),/CREATE TABLE `practice_banks`/);
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS `tutor_revisions_request_unique`/);
 assert.doesNotMatch(sql,/DROP|DELETE|ALTER TABLE `courses`/i);
});

test('upgrading and reopening an existing local database preserves course snapshots and tutor revisions',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'pummy-migration-'));let reopened;t.after(()=>{reopened?.close();rmSync(dir,{recursive:true,force:true});});const path=join(dir,'existing.sqlite');
 const old=new DatabaseSync(path),data=JSON.stringify({questions:[{id:'q1'}],session:{answers:[0],flags:['q1']},progress:{mastery:2}});
 old.exec(readFileSync(new URL('../drizzle/0000_illegal_iron_monger.sql',import.meta.url),'utf8'));
 old.prepare('INSERT INTO courses(user_id,id,name,data,revision,updated_at) VALUES(?,?,?,?,?,?)').run('student','course','Existing course',data,7,123);old.close();
 const db=new LocalD1(path);
 const before=await db.prepare('SELECT * FROM courses').first();assert.equal(before.data,data);assert.equal(before.revision,7);
 await db.prepare('INSERT INTO tutor_revisions(user_id,course_id,presentation_id,revision,request_id,patch,created_at) VALUES(?,?,?,?,?,?,?)').bind('student','course','presentation',2,'receipt','{}',456).run();
 await assert.rejects(db.prepare('INSERT INTO tutor_revisions(user_id,course_id,presentation_id,revision,request_id,patch,created_at) VALUES(?,?,?,?,?,?,?)').bind('student','course','presentation',3,'receipt','{}',457).run(),/UNIQUE/);db.close();
 reopened=new LocalD1(path);assert.deepEqual(await reopened.prepare('SELECT * FROM courses').first(),before);
 assert.equal((await reopened.prepare('SELECT count(*) AS count FROM tutor_revisions').first()).count,1);
 assert.equal((await reopened.prepare('SELECT count(*) AS count FROM pummy_migrations').first()).count,7);
});
