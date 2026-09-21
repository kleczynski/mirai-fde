import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError, type ApiInput } from './agent.js';
import { persistenceConfig, requireAdmin } from './admin.js';

const DEMO_STATUSES = ['building', 'live', 'client_reviewing', 'approved_exclusive', 'declined', 'paid'] as const;
export type HostedDemoStatus = typeof DEMO_STATUSES[number];

const FeedbackSchema = z.object({
  demoId: z.uuid(),
  message: z.string().trim().min(1).max(4000),
  page: z.string().trim().max(300).nullable().optional(),
});
const DetailSchema = z.object({ demoId: z.uuid() });
const UpdateSchema = z.object({
  demoId: z.uuid(),
  status: z.enum(DEMO_STATUSES).optional(),
  demoUrl: z.string().trim().url().max(2000).nullable().optional(),
  repoUrl: z.string().trim().url().max(2000).nullable().optional(),
});
const HandledSchema = z.object({ feedbackId: z.uuid(), handled: z.boolean().default(true) });

/** Anonymous demo visitors are never authenticated, so the rate-limit key is a
 * hash of their IP, not auth.uid() like consume_interview_rate_limit. The raw
 * IP never reaches the database. */
function ipHash(clientIp: string | undefined): string {
  return createHash('sha256').update(clientIp ?? 'unknown').digest('hex');
}

function serviceClient() {
  const { url, serviceRoleKey } = persistenceConfig();
  return createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type HostedDemo = {
  id: string;
  sessionId: string | null;
  clientLabel: string;
  industry: string | null;
  demoUrl: string | null;
  repoUrl: string | null;
  status: HostedDemoStatus;
  createdAt: string;
  updatedAt: string;
  feedbackCount: number;
  unhandledFeedbackCount: number;
};

export type DemoFeedbackItem = { id: string; message: string; page: string | null; handled: boolean; createdAt: string };

function toHostedDemo(row: Record<string, unknown>, counts: { total: number; unhandled: number }): HostedDemo {
  return {
    id: row.id as string,
    sessionId: (row.session_id as string | null) ?? null,
    clientLabel: row.client_label as string,
    industry: (row.industry as string | null) ?? null,
    demoUrl: (row.demo_url as string | null) ?? null,
    repoUrl: (row.repo_url as string | null) ?? null,
    status: row.status as HostedDemoStatus,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    feedbackCount: counts.total,
    unhandledFeedbackCount: counts.unhandled,
  };
}

/** Public — called by the feedback widget embedded in every client demo, on a
 * different domain (its own Cloudflare Worker). No Supabase auth: the demo
 * never gets any Mirai credentials, it only knows its own demoId. */
export async function submitDemoFeedback(input: ApiInput): Promise<{ recorded: true }> {
  const { demoId, message, page = null } = FeedbackSchema.parse(input.body);
  const service = serviceClient();

  const { data: demo, error: demoError } = await service.from('hosted_demos').select('id').eq('id', demoId).maybeSingle();
  if (demoError) throw new HttpError(503, 'Nie udało się odczytać demo.');
  if (!demo) throw new HttpError(404, 'Nie znaleziono demo.');

  const { data: allowed, error: rateError } = await service.rpc('consume_demo_feedback_rate_limit', {
    p_demo_id: demoId, p_ip_hash: ipHash(input.clientIp), p_limit: 10,
  });
  if (rateError) throw new HttpError(503, 'Ochrona przed nadużyciami jest chwilowo niedostępna.');
  if (!allowed) throw new HttpError(429, 'Zbyt wiele uwag z tego miejsca. Odczekaj minutę.');

  const { error } = await service.from('demo_feedback').insert({ demo_id: demoId, message, page });
  if (error) throw new HttpError(503, 'Nie udało się zapisać uwagi.');
  return { recorded: true };
}

export async function listHostedDemos(input: ApiInput): Promise<{ demos: HostedDemo[] }> {
  const { service } = await requireAdmin(input);
  const { data, error } = await service.from('hosted_demos').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw new HttpError(503, 'Nie udało się odczytać demo.');
  const rows = data ?? [];
  if (!rows.length) return { demos: [] };

  const { data: feedbackRows, error: feedbackError } = await service.from('demo_feedback')
    .select('demo_id, handled').in('demo_id', rows.map(row => row.id));
  if (feedbackError) throw new HttpError(503, 'Nie udało się odczytać feedbacku demo.');
  const counts = new Map<string, { total: number; unhandled: number }>();
  for (const row of feedbackRows ?? []) {
    const current = counts.get(row.demo_id) ?? { total: 0, unhandled: 0 };
    current.total += 1;
    if (!row.handled) current.unhandled += 1;
    counts.set(row.demo_id, current);
  }
  return { demos: rows.map(row => toHostedDemo(row, counts.get(row.id) ?? { total: 0, unhandled: 0 })) };
}

export async function getHostedDemoDetail(input: ApiInput): Promise<{ demo: HostedDemo; feedback: DemoFeedbackItem[] }> {
  const { service } = await requireAdmin(input);
  const { demoId } = DetailSchema.parse(input.body);
  const { data: demoRow, error: demoError } = await service.from('hosted_demos').select('*').eq('id', demoId).maybeSingle();
  if (demoError) throw new HttpError(503, 'Nie udało się odczytać demo.');
  if (!demoRow) throw new HttpError(404, 'Nie znaleziono demo.');
  const { data: feedbackRows, error: feedbackError } = await service.from('demo_feedback')
    .select('id, message, page, handled, created_at').eq('demo_id', demoId).order('created_at', { ascending: true });
  if (feedbackError) throw new HttpError(503, 'Nie udało się odczytać feedbacku demo.');
  const feedback = (feedbackRows ?? []).map(row => ({ id: row.id, message: row.message, page: row.page ?? null, handled: row.handled, createdAt: row.created_at }));
  const total = feedback.length;
  const unhandled = feedback.filter(item => !item.handled).length;
  return { demo: toHostedDemo(demoRow, { total, unhandled }), feedback };
}

export async function updateHostedDemo(input: ApiInput): Promise<{ demo: HostedDemo }> {
  const { service } = await requireAdmin(input);
  const { demoId, status, demoUrl, repoUrl } = UpdateSchema.parse(input.body);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status !== undefined) patch.status = status;
  if (demoUrl !== undefined) patch.demo_url = demoUrl;
  if (repoUrl !== undefined) patch.repo_url = repoUrl;
  const { data, error } = await service.from('hosted_demos').update(patch).eq('id', demoId).select('*').maybeSingle();
  if (error) throw new HttpError(503, 'Nie udało się zaktualizować demo.');
  if (!data) throw new HttpError(404, 'Nie znaleziono demo.');
  const { data: feedbackRows, error: feedbackError } = await service.from('demo_feedback').select('handled').eq('demo_id', demoId);
  if (feedbackError) throw new HttpError(503, 'Nie udało się odczytać feedbacku demo.');
  const total = (feedbackRows ?? []).length;
  const unhandled = (feedbackRows ?? []).filter(row => !row.handled).length;
  return { demo: toHostedDemo(data, { total, unhandled }) };
}

export async function markDemoFeedbackHandled(input: ApiInput): Promise<{ handled: true }> {
  const { service } = await requireAdmin(input);
  const { feedbackId, handled } = HandledSchema.parse(input.body);
  const { error, data } = await service.from('demo_feedback').update({ handled }).eq('id', feedbackId).select('id').maybeSingle();
  if (error) throw new HttpError(503, 'Nie udało się zaktualizować uwagi.');
  if (!data) throw new HttpError(404, 'Nie znaleziono uwagi.');
  return { handled: true };
}
