import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createSession, createTurn } from '../src/domain/interview';
import { extractWithRules } from '../src/domain/extraction';
import { SessionSchema } from '../src/domain/contract';

const adminId = '30000000-0000-4000-8000-000000000001';
const ownerId = '30000000-0000-4000-8000-000000000002';

let db: PGlite;

async function asOwner() { await db.exec(`reset role; select set_config('test.uid','${ownerId}',false); set role authenticated;`); }
async function asAnon() { await db.exec(`reset role; select set_config('test.uid','',false); set role anon;`); }
async function asService() { await db.exec(`reset role; select set_config('test.uid','',false); set role service_role;`); }
async function asSuperuser() { await db.exec('reset role'); }

async function save(session: unknown) { return db.query('select public.save_interview($1::jsonb)', [JSON.stringify(session)]); }
async function applyExtraction(actorId: string, sessionId: string, result: unknown) {
  return db.query('select public.admin_apply_extraction($1,$2,$3::jsonb)', [actorId, sessionId, JSON.stringify(result)]);
}

function stuckSession() {
  const session = createSession('text');
  session.turns = [
    createTurn('agent', 'Czym się zajmujesz?', session),
    createTurn('participant', 'Prowadzę kancelarię i sam przygotowuję wszystkie umowy dla klientów.', session),
  ];
  session.status = 'review';
  session.completedAt = new Date().toISOString();
  return session;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key);
    create role anon;
    create role authenticated;
    create role service_role;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    insert into auth.users values ('${adminId}'), ('${ownerId}');
  `);
  await db.exec(readFileSync('supabase/migrations/202609150001_discovery.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260917090000_admin_audit.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260917110000_monitoring.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260917120000_fix_save_interview_normalization.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260922130000_admin_extraction_recovery.sql', 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); });

describe.sequential('admin_apply_extraction — recovering a stuck review session', () => {
  it('populates every derived table and leaves status untouched for a completed-but-unextracted session', async () => {
    const session = stuckSession();
    await asOwner();
    await save(session);

    const result = extractWithRules(session);
    await asService();
    await applyExtraction(adminId, session.id, result);

    await asSuperuser();
    expect((await db.query('select * from extracted_insights where session_id=$1', [session.id])).rows).toHaveLength(1);
    expect((await db.query('select * from session_summaries where session_id=$1', [session.id])).rows).toHaveLength(1);
    const runs = await db.query<{ kind: string; status: string; version: number }>('select kind, status, version from agent_runs where session_id=$1', [session.id]);
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0]).toMatchObject({ kind: 'extraction', status: 'completed', version: 1 });
    const actions = await db.query<{ action: string; actor_id: string; target_session_id: string }>('select action, actor_id, target_session_id from admin_session_actions where target_session_id=$1', [session.id]);
    expect(actions.rows).toHaveLength(1);
    expect(actions.rows[0]).toMatchObject({ action: 'session.extraction_completed', actor_id: adminId, target_session_id: session.id });

    const row = (await db.query<{ state: unknown; status: string; revision: number }>('select state, status, revision from interview_sessions where id=$1', [session.id])).rows[0];
    expect(row.status).toBe('review');
    expect(row.revision).toBe(2);
    const parsed = SessionSchema.parse(row.state);
    expect(parsed.status).toBe('review');
    expect(parsed.result).not.toBeNull();
    expect(parsed.modelResult).not.toBeNull();
    expect(parsed.revision).toBe(2);
  });

  it('rejects a session that has not been completed yet', async () => {
    const session = createSession('text');
    session.turns = [createTurn('agent', 'Czym się zajmujesz?', session)];
    await asOwner();
    await save(session);
    const result = extractWithRules({ ...session, completedAt: new Date().toISOString() });
    await asService();
    await expect(applyExtraction(adminId, session.id, result)).rejects.toThrow('Interview not completed');
  });

  it('refuses to overwrite a result that already exists', async () => {
    const session = stuckSession();
    await asOwner();
    await save(session);
    const result = extractWithRules(session);
    await asService();
    await applyExtraction(adminId, session.id, result);
    await expect(applyExtraction(adminId, session.id, result)).rejects.toThrow('Result already exists');
  });

  it('raises for an unknown session', async () => {
    await asService();
    const result = extractWithRules(stuckSession());
    await expect(applyExtraction(adminId, crypto.randomUUID(), result)).rejects.toThrow('Session not found');
  });

  it('is unavailable to browser roles', async () => {
    const session = stuckSession();
    await asOwner();
    await save(session);
    const result = extractWithRules(session);
    await asOwner();
    await expect(applyExtraction(adminId, session.id, result)).rejects.toThrow('permission denied');
    await asAnon();
    await expect(applyExtraction(adminId, session.id, result)).rejects.toThrow('permission denied');
  });
});

describe('admin_session_actions.action constraint', () => {
  it('accepts the new extraction-recovery action alongside the existing deletion action', async () => {
    await asSuperuser();
    const migration = readFileSync('supabase/migrations/20260922130000_admin_extraction_recovery.sql', 'utf8');
    expect(migration).toContain("check (action in ('session.deleted', 'session.extraction_completed'))");
  });
});

describe('admin_apply_extraction migration — locked to service_role', () => {
  const migration = readFileSync('supabase/migrations/20260922130000_admin_extraction_recovery.sql', 'utf8');
  it('is security definer and unavailable to browser roles', () => {
    expect(migration).toContain('create function public.admin_apply_extraction');
    expect(migration).toContain('security definer');
    expect(migration).toContain('revoke all on function public.admin_apply_extraction(uuid, uuid, jsonb) from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.admin_apply_extraction(uuid, uuid, jsonb) to service_role');
  });
});
