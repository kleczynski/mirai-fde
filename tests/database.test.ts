import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createSession, createTurn } from '../src/domain/interview';
import { extractWithRules } from '../src/domain/extraction';
import { reviewFinding } from '../src/domain/contract';
const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002';
let db: PGlite;
const session = createSession('text');
async function user(id:string) { await db.exec(`reset role; select set_config('test.uid','${id}',false); set role authenticated;`); }
async function save(s:unknown) { return db.query('select public.save_interview($1::jsonb)',[JSON.stringify(s)]); }
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role; grant usage on schema auth,public to anon,authenticated,service_role; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$; insert into auth.users values('${a}'),('${b}');`);
  await db.exec(readFileSync('supabase/migrations/202609150001_discovery.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260917120000_fix_save_interview_normalization.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260918120000_interview_invitations.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260918130000_claim_invitation_by_raw_token.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260918140000_remove_hash_claim_rpc.sql','utf8'));
  const rateMigration = readFileSync('supabase/migrations/20260915153915_api_rate_limit.sql','utf8').split('select cron.schedule')[0];
  await db.exec(rateMigration);
  await user(a);
},30000);
afterAll(async()=>{await db.close();});
describe.sequential('Actual Postgres migration, RLS and atomic persistence',()=>{
  it('atomically enforces a per-user API limit without exposing its counters',async()=>{
    for (let i=0;i<3;i++) expect((await db.query<{allowed:boolean}>("select public.consume_interview_rate_limit('extract',3) as allowed")).rows[0].allowed).toBe(true);
    expect((await db.query<{allowed:boolean}>("select public.consume_interview_rate_limit('extract',3) as allowed")).rows[0].allowed).toBe(false);
    await expect(db.query('select * from interview_api_rate_limits')).rejects.toThrow('permission denied');
    await user(b);
    expect((await db.query<{allowed:boolean}>("select public.consume_interview_rate_limit('extract',3) as allowed")).rows[0].allowed).toBe(true);
    await user(a);
  });
  it('saves and retries without duplicates',async()=>{session.turns=[createTurn('agent','Co robisz?',session),createTurn('participant','Koordynuję projekty.',session)]; await save(session); await save(session); expect((await db.query('select * from conversation_turns')).rows).toHaveLength(2);});
  it('isolates sessions and every child table from a second participant',async()=>{await user(b); for(const table of ['interview_sessions','conversation_turns','transcript_segments','session_summaries','pain_points','workflows','automation_opportunities','extracted_insights']) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0); await expect(save({...session,revision:2})).rejects.toThrow('Access denied'); await db.query('delete from interview_sessions where id=$1',[session.id]); await user(a); expect((await db.query('select * from interview_sessions')).rows).toHaveLength(1);});
  it('rejects stale writes and immutable transcript changes',async()=>{await expect(save({...session,status:'paused'})).rejects.toThrow('Stale revision'); const changed=structuredClone(session); changed.revision++; changed.turns[1].text='Tampered'; await expect(save(changed)).rejects.toThrow('append-only');});
  it('does not permit direct writes around the atomic function',async()=>{await expect(db.query("update interview_sessions set status='completed'")).rejects.toThrow('permission denied');});
  it('stores extracted data and confirmed export atomically',async()=>{session.revision++; session.completedAt=new Date().toISOString(); session.status='review'; session.result=extractWithRules(session); session.modelResult=structuredClone(session.result); await save(session); expect((await db.query('select * from extracted_insights')).rows).toHaveLength(1); session.revision++; session.status='completed'; await expect(save(session)).rejects.toThrow('Confirmation required'); session.result.participantContext=session.result.participantContext.map(f=>reviewFinding(f,f.text)); session.result.recommendedNextStep=reviewFinding(session.result.recommendedNextStep,session.result.recommendedNextStep.text); await save(session); const rows=await db.query<{confirmed_at:string}>('select confirmed_at from session_summaries'); expect(rows.rows[0].confirmed_at).toBeTruthy(); });
  it('hides completed results and populated insights from another owner',async()=>{await user(b);for(const table of ['session_summaries','extracted_insights','transcript_segments']) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);await user(a);});
  it('hides expired sessions and rejects attempts to resume them',async()=>{await db.exec('reset role');await db.query("update interview_sessions set expires_at=now()-interval '1 second' where id=$1",[session.id]);await user(a);expect((await db.query('select * from interview_sessions')).rows).toHaveLength(0);expect((await db.query('select * from transcript_segments')).rows).toHaveLength(0);await expect(save({...session,revision:session.revision+1})).rejects.toThrow('Session expired');});
  it('cascades deletion and removes transcripts and results',async()=>{await db.query('delete from interview_sessions where id=$1',[session.id]); for(const table of ['conversation_turns','transcript_segments','session_summaries','extracted_insights']) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0); });
  it('claims one invitation atomically and protects its session ID',async()=>{
    const token='A'.repeat(43), tokenHash=createHash('sha256').update(token).digest('hex'), reserved=crypto.randomUUID();
    await db.exec('reset role');
    await db.query('insert into interview_invitations(label,industry,token_hash,created_by) values($1,$2,$3,$4)',['Karolina','Edukacja',tokenHash,a]);
    await user(a);
    await expect(db.query('select label from interview_invitations')).rejects.toThrow('permission denied');
    expect((await db.query<{claim:{sessionId:string;canCreate:boolean}}>('select public.claim_interview_invitation_v2($1,$2) as claim',[token,reserved])).rows[0].claim).toEqual({sessionId:reserved,canCreate:true});
    expect((await db.query<{claim:{sessionId:string;canCreate:boolean}}>('select public.claim_interview_invitation_v2($1,$2) as claim',[token,crypto.randomUUID()])).rows[0].claim).toEqual({sessionId:reserved,canCreate:true});
    await user(b);
    await expect(db.query('select public.claim_interview_invitation_v2($1,$2)',[token,crypto.randomUUID()])).rejects.toThrow('Invitation already used');
    const invited=createSession('text');invited.id=reserved;invited.turns=[createTurn('agent','Czym się zajmujesz?',invited)];
    await expect(save(invited)).rejects.toThrow('Invited session owner mismatch');
    await user(a);await save(invited);
    expect((await db.query<{claim:{sessionId:string;canCreate:boolean}}>('select public.claim_interview_invitation_v2($1,$2) as claim',[token,crypto.randomUUID()])).rows[0].claim).toEqual({sessionId:reserved,canCreate:false});
    await db.exec('reset role');
    const link=(await db.query<{label:string,claimed_by:string}>('select label,claimed_by from interview_invitations where token_hash=$1',[tokenHash])).rows[0];
    expect(link).toMatchObject({label:'Karolina',claimed_by:a});
  });
  it('rejects an unused invitation after 30 days',async()=>{
    const token='B'.repeat(43),tokenHash=createHash('sha256').update(token).digest('hex');
    await db.exec('reset role');
    await db.query("insert into interview_invitations(label,token_hash,created_by,expires_at) values($1,$2,$3,now()-interval '1 second')",['Wygasłe',tokenHash,a]);
    await user(b);
    await expect(db.query('select public.claim_interview_invitation_v2($1,$2)',[token,crypto.randomUUID()])).rejects.toThrow('Invitation expired');
  });
});
