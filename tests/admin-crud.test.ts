import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createSession, createTurn } from '../src/domain/interview';
import { extractWithRules } from '../src/domain/extraction';
import { reviewFinding, SessionSchema } from '../src/domain/contract';
import { HttpError } from '../server/agent';
import { confirmAdminSession, deleteAdminInvitation, updateAdminSessionStatus } from '../server/admin';

const adminId = '40000000-0000-4000-8000-000000000001';
const ownerId = '40000000-0000-4000-8000-000000000002';

let db: PGlite;

async function asOwner() { await db.exec(`reset role; select set_config('test.uid','${ownerId}',false); set role authenticated;`); }
async function asAnon() { await db.exec(`reset role; select set_config('test.uid','',false); set role anon;`); }
async function asService() { await db.exec(`reset role; select set_config('test.uid','',false); set role service_role;`); }
async function asSuperuser() { await db.exec('reset role'); }

async function save(session: unknown) { return db.query('select public.save_interview($1::jsonb)', [JSON.stringify(session)]); }

function completedReviewSession() {
  const session = createSession('text');
  session.turns = [
    createTurn('agent', 'Czym się zajmujesz?', session),
    createTurn('participant', 'Obsługuję przetargi publiczne i przygotowuję oferty handlowe.', session),
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
  await db.exec(readFileSync('supabase/migrations/20260918120000_interview_invitations.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260918130000_claim_invitation_by_raw_token.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260918140000_remove_hash_claim_rpc.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260922130000_admin_extraction_recovery.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260922140000_admin_extraction_allow_replace.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20260923100000_admin_crud_operations.sql', 'utf8'));
}, 30000);

afterAll(async () => { await db.close(); });

describe.sequential('admin crud operations: invitation deletion and session confirmation/status update', () => {
  it('protects new endpoints with requireAdmin', async () => {
    await expect(deleteAdminInvitation({ body: { invitationId: crypto.randomUUID() } })).rejects.toEqual(new HttpError(401, 'Wymagane logowanie administratora.'));
    await expect(confirmAdminSession({ body: { sessionId: crypto.randomUUID() } })).rejects.toEqual(new HttpError(401, 'Wymagane logowanie administratora.'));
    await expect(updateAdminSessionStatus({ body: { sessionId: crypto.randomUUID(), status: 'review' } })).rejects.toEqual(new HttpError(401, 'Wymagane logowanie administratora.'));
  });

  it('allows service_role to delete an invitation and records an audit log', async () => {
    await asSuperuser();
    const invId = crypto.randomUUID();
    const tokenHash = 'a'.repeat(64);
    await db.query('insert into interview_invitations(id, label, industry, token_hash, created_by) values($1, $2, $3, $4, $5)', [invId, 'Test Znajomy', 'IT', tokenHash, adminId]);

    await asAnon();
    await expect(db.query('select public.admin_delete_interview_invitation($1, $2)', [adminId, invId])).rejects.toThrow('permission denied');
    await asOwner();
    await expect(db.query('select public.admin_delete_interview_invitation($1, $2)', [adminId, invId])).rejects.toThrow('permission denied');

    await asService();
    const result = await db.query<{ deleted: boolean }>('select public.admin_delete_interview_invitation($1, $2) as deleted', [adminId, invId]);
    expect(result.rows[0].deleted).toBe(true);

    await asSuperuser();
    const remaining = await db.query('select * from interview_invitations where id = $1', [invId]);
    expect(remaining.rows).toHaveLength(0);

    const audit = await db.query<{ action: string; target_invitation_id: string; actor_id: string }>('select action, target_invitation_id, actor_id from admin_session_actions where target_invitation_id = $1', [invId]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ action: 'invitation.deleted', target_invitation_id: invId, actor_id: adminId });
  });

  it('allows service_role to confirm a session in status=review and updates status to completed', async () => {
    const session = completedReviewSession();
    const result = extractWithRules(session);
    session.result = result;
    session.modelResult = structuredClone(result);

    await asOwner();
    await save(session);

    // Prepare confirmed result with review findings confirmed
    const confirmedResult = structuredClone(result);
    confirmedResult.participantContext = confirmedResult.participantContext.map(f => reviewFinding(f, f.text));
    confirmedResult.recommendedNextStep = reviewFinding(confirmedResult.recommendedNextStep, confirmedResult.recommendedNextStep.text);

    await asAnon();
    await expect(db.query('select public.admin_confirm_interview_session($1, $2, $3::jsonb)', [adminId, session.id, JSON.stringify(confirmedResult)])).rejects.toThrow('permission denied');

    await asService();
    await db.query('select public.admin_confirm_interview_session($1, $2, $3::jsonb)', [adminId, session.id, JSON.stringify(confirmedResult)]);

    await asSuperuser();
    const sessionRow = (await db.query<{ status: string; revision: number; state: unknown }>('select status, revision, state from interview_sessions where id = $1', [session.id])).rows[0];
    expect(sessionRow.status).toBe('completed');
    const parsedState = SessionSchema.parse(sessionRow.state);
    expect(parsedState.status).toBe('completed');

    const summaryRow = (await db.query<{ confirmed_at: string | null }>('select confirmed_at from session_summaries where session_id = $1', [session.id])).rows[0];
    expect(summaryRow.confirmed_at).not.toBeNull();

    const auditRow = (await db.query<{ action: string }>('select action from admin_session_actions where target_session_id = $1 and action = $2', [session.id, 'session.confirmed'])).rows[0];
    expect(auditRow).toBeTruthy();
  });

  it('allows service_role to change session status back to review and clears confirmed_at', async () => {
    const session = completedReviewSession();
    const result = extractWithRules(session);
    session.result = result;
    session.modelResult = structuredClone(result);

    await asOwner();
    await save(session);

    const confirmedResult = structuredClone(result);
    confirmedResult.participantContext = confirmedResult.participantContext.map(f => reviewFinding(f, f.text));
    confirmedResult.recommendedNextStep = reviewFinding(confirmedResult.recommendedNextStep, confirmedResult.recommendedNextStep.text);

    await asService();
    await db.query('select public.admin_confirm_interview_session($1, $2, $3::jsonb)', [adminId, session.id, JSON.stringify(confirmedResult)]);

    // Now change status back to review
    await db.query('select public.admin_update_session_status($1, $2, $3)', [adminId, session.id, 'review']);

    await asSuperuser();
    const sessionRow = (await db.query<{ status: string; state: unknown }>('select status, state from interview_sessions where id = $1', [session.id])).rows[0];
    expect(sessionRow.status).toBe('review');
    const parsedState = SessionSchema.parse(sessionRow.state);
    expect(parsedState.status).toBe('review');

    const summaryRow = (await db.query<{ confirmed_at: string | null }>('select confirmed_at from session_summaries where session_id = $1', [session.id])).rows[0];
    expect(summaryRow.confirmed_at).toBeNull();

    const auditRow = (await db.query<{ action: string }>('select action from admin_session_actions where target_session_id = $1 and action = $2', [session.id, 'session.status_changed'])).rows[0];
    expect(auditRow).toBeTruthy();
  });
});
