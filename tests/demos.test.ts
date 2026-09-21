import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HttpError } from '../server/agent';
import { getHostedDemoDetail, listHostedDemos, markDemoFeedbackHandled, submitDemoFeedback, updateHostedDemo } from '../server/demos';

describe('hosted demos — admin surface requires authentication', () => {
  it('does not reach privileged persistence before authentication', async () => {
    await expect(listHostedDemos({ body: {} })).rejects.toEqual(new HttpError(401, 'Wymagane logowanie administratora.'));
    await expect(getHostedDemoDetail({ body: { demoId: '00000000-0000-4000-8000-000000000000' } })).rejects.toEqual(new HttpError(401, 'Wymagane logowanie administratora.'));
    await expect(updateHostedDemo({ body: { demoId: '00000000-0000-4000-8000-000000000000', status: 'live' } })).rejects.toEqual(new HttpError(401, 'Wymagane logowanie administratora.'));
    await expect(markDemoFeedbackHandled({ body: { feedbackId: '00000000-0000-4000-8000-000000000000' } })).rejects.toEqual(new HttpError(401, 'Wymagane logowanie administratora.'));
  });
});

describe('public demo feedback endpoint', () => {
  it('validates input before touching persistence, even without Supabase configured', async () => {
    await expect(submitDemoFeedback({ body: { demoId: 'not-a-uuid', message: 'hello' } })).rejects.toThrow();
    await expect(submitDemoFeedback({ body: { demoId: '00000000-0000-4000-8000-000000000000', message: '' } })).rejects.toThrow();
  });
});

describe('hosted_demos / demo_feedback migration', () => {
  const migration = readFileSync('supabase/migrations/20260921090000_hosted_demos.sql', 'utf8');

  it('locks both tables down to service-role-only access', () => {
    expect(migration).toContain('revoke all on public.hosted_demos from public, anon, authenticated');
    expect(migration).toContain('revoke all on public.demo_feedback from public, anon, authenticated');
    expect(migration).toContain('alter table public.hosted_demos enable row level security');
    expect(migration).toContain('alter table public.demo_feedback enable row level security');
  });

  it('rate-limits the public feedback endpoint by hashed IP, not auth.uid()', () => {
    expect(migration).toContain('create function public.consume_demo_feedback_rate_limit(p_demo_id uuid, p_ip_hash text, p_limit integer)');
    expect(migration).toContain('security definer');
    expect(migration).toContain('revoke all on function public.consume_demo_feedback_rate_limit(uuid, text, integer) from public, anon, authenticated');
    expect(migration).toContain('grant execute on function public.consume_demo_feedback_rate_limit(uuid, text, integer) to service_role');
  });

  it('constrains status to the known demo lifecycle', () => {
    expect(migration).toContain("check (status in ('building', 'live', 'client_reviewing', 'approved_exclusive', 'declined', 'paid'))");
  });
});
