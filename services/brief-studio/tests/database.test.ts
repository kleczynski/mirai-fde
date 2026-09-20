import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
let db: PGlite;
const session='11111111-1111-4111-8111-111111111111';
const run='22222222-2222-4222-8222-222222222222';
beforeAll(async () => {
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create table interview_sessions(id uuid primary key,status text,expires_at timestamptz,state jsonb); insert into interview_sessions values('${session}','completed',now()+interval '1 day','{"revision":2}');`);
 await db.exec(readFileSync('supabase/migrations/20260920120000_brief_studio.sql','utf8'));
 const initial=(await db.query<{reserved_micros:number;limit_micros:number}>('select * from brief_budget')).rows[0];
 expect(Number(initial.reserved_micros)).toBe(960000); expect(Number(initial.limit_micros)-Number(initial.reserved_micros)).toBe(520000);
 await db.exec('update brief_budget set reserved_micros=0'); // isolated test state only
 await db.query("insert into brief_runs(id,session_id,actor_id,source_hash,source_context,expires_at) values($1,$2,$1,repeat('a',64),'{}',now()+interval '1 day')",[run,session]);
},30000);
afterAll(async()=>{await db.close();});
it('denies all participant reads and privileged budget calls',async()=>{
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  for(const table of ['brief_runs','brief_run_steps','brief_budget','brief_call_receipts']) await expect(db.query(`select * from ${table}`)).rejects.toThrow('permission denied');
  await expect(db.query("select reserve_brief_call($1,'audit','{}')",[run])).rejects.toThrow('permission denied');
  await db.exec('reset role');
 }
});
it('binds review to the source revision and brief hash atomically, with one winning decision',async()=>{
 const id=crypto.randomUUID();
 await db.query("insert into brief_runs(id,session_id,actor_id,source_hash,source_context,expires_at,status,brief_hash) values($1,$2,$1,repeat('a',64),'{}',now()+interval '1 day','waiting_admin_review',repeat('b',64))",[id,session]);
 const review=(revision:number,hash:string)=>db.query<{ok:boolean}>("select transition_brief($1,'waiting_admin_review',$2,$3,'{\"status\":\"completed\",\"decision\":\"approve\"}') as ok",[id,revision,hash]);
 expect((await review(1,'b'.repeat(64))).rows[0].ok).toBe(false);
 expect((await review(2,'c'.repeat(64))).rows[0].ok).toBe(false);
 expect((await Promise.all([review(2,'b'.repeat(64)),review(2,'b'.repeat(64))])).map(x=>x.rows[0].ok).sort()).toEqual([false,true]);
 await db.query('delete from brief_runs where id=$1',[id]);
});
it('atomically reserves once, caps six calls, retains unknown cost and receipts after purge',async()=>{
 for(const name of ['audit','opportunity','integration','author','critic','revision']) {
  expect((await db.query<{ok:boolean}>('select reserve_brief_call($1,$2,\'{}\') as ok',[run,name])).rows[0].ok).toBe(true);
  expect((await db.query<{ok:boolean}>('select reserve_brief_call($1,$2,\'{}\') as ok',[run,name])).rows[0].ok).toBe(false);
 }
 expect((await db.query<{reserved_micros:number}>('select reserved_micros from brief_runs')).rows[0].reserved_micros).toBe(240000);
 await expect(db.query("select reserve_brief_call($1,'seventh','{}')",[run])).rejects.toThrow('budget exceeded');
 await db.query('delete from interview_sessions where id=$1',[session]);
 expect((await db.query('select * from brief_runs')).rows).toHaveLength(0);
 expect((await db.query('select * from brief_run_steps')).rows).toHaveLength(0);
 expect((await db.query('select * from brief_call_receipts')).rows).toHaveLength(6);
 expect(Number((await db.query<{reserved_micros:number}>('select reserved_micros from brief_budget')).rows[0].reserved_micros)).toBe(240000);
});
it('rejects lifetime overflow across different runs and expired sources',async()=>{
 await db.query("insert into interview_sessions values($1,'completed',now()+interval '1 day',jsonb_build_object('revision',2))",[session]);
 await db.exec('update brief_budget set limit_micros=240000');
 const next=crypto.randomUUID();
 await db.query("insert into brief_runs(id,session_id,actor_id,source_hash,source_context,expires_at) values($1,$2,$1,repeat('a',64),'{}',now()+interval '1 day')",[next,session]);
 await expect(db.query("select reserve_brief_call($1,'audit','{}')",[next])).rejects.toThrow('budget exceeded');
 await db.query("update interview_sessions set expires_at=now()-interval '1 second'");
 await expect(db.query("select reserve_brief_call($1,'audit','{}')",[next])).rejects.toThrow('unavailable');
 expect((await db.query('select * from brief_run_steps')).rows).toHaveLength(0);
});
