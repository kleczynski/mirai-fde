import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HttpError } from '../server/agent';
import { isAllowedAdminEmail, listAdminSessions, parseAdminEmails, retryAdminExtraction } from '../server/admin';

describe('admin identity allowlist', () => {
  it('normalizes the server-side magic-link email allowlist', () => {
    const allowed = parseAdminEmails(' WishFishDev@gmail.com, second@example.org,not-an-email ');
    expect([...allowed]).toEqual(['wishfishdev@gmail.com', 'second@example.org']);
    expect(isAllowedAdminEmail('WISHFISHDEV@GMAIL.COM', allowed)).toBe(true);
  });

  it('rejects a missing or unallowlisted identity', () => {
    const allowed = parseAdminEmails('admin@example.org');
    expect(isAllowedAdminEmail(undefined, allowed)).toBe(false);
    expect(isAllowedAdminEmail('participant@example.org', allowed)).toBe(false);
  });

  it('does not reach privileged persistence before authentication', async () => {
    await expect(listAdminSessions({ body: {} })).rejects.toEqual(new HttpError(401, 'Wymagane logowanie administratora.'));
    await expect(retryAdminExtraction({ body: { sessionId: '00000000-0000-4000-8000-000000000000' } })).rejects.toEqual(new HttpError(401, 'Wymagane logowanie administratora.'));
  });

  it('keeps administrative deletion atomic and unavailable to browser roles', () => {
    const migration = readFileSync('supabase/migrations/20260917090000_admin_audit.sql', 'utf8');
    expect(migration).toContain('create function public.admin_delete_interview_session');
    expect(migration).toContain('security definer');
    expect(migration).toContain("revoke all on function public.admin_delete_interview_session(uuid, uuid) from public, anon, authenticated");
    expect(migration).toContain('grant execute on function public.admin_delete_interview_session(uuid, uuid) to service_role');
  });
});

describe('admin extraction recovery for sessions stuck in status=review', () => {
  it('keeps admin_apply_extraction atomic and unavailable to browser roles', () => {
    const migration = readFileSync('supabase/migrations/20260922130000_admin_extraction_recovery.sql', 'utf8');
    expect(migration).toContain('create function public.admin_apply_extraction');
    expect(migration).toContain('security definer');
    expect(migration).toContain('revoke all on function public.admin_apply_extraction(uuid, uuid, jsonb) from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.admin_apply_extraction(uuid, uuid, jsonb) to service_role');
  });

  it('extends the audit action constraint instead of replacing the table', () => {
    const migration = readFileSync('supabase/migrations/20260922130000_admin_extraction_recovery.sql', 'utf8');
    expect(migration).toContain('alter table public.admin_session_actions drop constraint admin_session_actions_action_check');
    expect(migration).toContain("check (action in ('session.deleted', 'session.extraction_completed'))");
  });
});
