import { z } from 'zod';
import { contentHash } from '../../../src/domain/agent-context.js';
import { BuildBriefSchema } from './domain/contract.js';
import { MODEL, renderBrief } from './domain/pipeline.js';
import { BriefError, BriefStore, authorize, serviceClient, type Config } from './store.js';

export type Bindings = Config & { BRIEF_PIPELINE: {
 create(options: { id: string; params: { runId: string } }): Promise<unknown>;
 get(id: string): Promise<{ status(): Promise<{ status: string }>; sendEvent(event: { type: string; payload: { decision: string } }): Promise<void> }>;
} };
const Start = z.object({ sessionId: z.uuid(), requestId: z.uuid() }).strict();
const Review = z.object({ briefHash: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(['approve', 'reject']) }).strict();
async function body(request: Request) {
 const reader = request.body?.getReader();
 if (!reader) throw new BriefError(422, 'body_required');
 const chunks: Uint8Array[] = []; let size = 0;
 for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4096) { await reader.cancel(); throw new BriefError(413, 'body_too_large'); } chunks.push(part.value); }
 const bytes = new Uint8Array(size); let offset = 0;
 for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }
 try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new BriefError(422, 'invalid_json'); }
}
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function handleRequest(request: Request, env: Bindings): Promise<Response> {
 try {
  const url = new URL(request.url);
  if (url.pathname === '/health' && request.method === 'GET') return json({ service: 'brief-studio', model: MODEL });
  const admin = await authorize(request, env);
  const store = new BriefStore(serviceClient(env));
  if (url.pathname === '/runs' && request.method === 'POST') {
   if (!env.OPENAI_API_KEY) throw new BriefError(503, 'provider_not_configured');
   const { sessionId, requestId } = Start.parse(await body(request));
   const source = await store.source(sessionId);
   const hash = await contentHash(source);
   const { error } = await store.db.from('brief_runs').insert({ id: requestId, session_id: sessionId, actor_id: admin.id, source_hash: hash, source_context: source, expires_at: source.session.expiresAt, model: MODEL });
   if (error && error.code !== '23505') throw new BriefError(503, 'run_save_failed');
   const run = await store.run(requestId);
   if (run.session_id !== sessionId || run.source_hash !== hash) throw new BriefError(409, 'idempotency_conflict');
   if (run.status === 'queued') {
    try { await env.BRIEF_PIPELINE.create({ id: requestId, params: { runId: requestId } }); }
    catch { // Creation may have succeeded before its response was lost.
     try { await (await env.BRIEF_PIPELINE.get(requestId)).status(); }
     catch { throw new BriefError(503, 'workflow_start_uncertain_retry_same_request'); }
    }
   }
   return json({ runId: requestId, status: run.status }, 202);
  }
  if (url.pathname === '/runs' && request.method === 'GET') {
   const sessionId = z.uuid().parse(url.searchParams.get('sessionId'));
   const limit = z.coerce.number().int().min(1).max(25).parse(url.searchParams.get('limit') ?? 10);
   await store.source(sessionId);
   let q = store.db.from('brief_runs').select('id,status,created_at,reserved_micros,error_code').eq('session_id', sessionId).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
   const cursor = url.searchParams.get('cursor');
   if (cursor) {
    const row = await store.run(z.uuid().parse(cursor));
    if (row.session_id !== sessionId) throw new BriefError(404, 'cursor_not_found');
    q = q.or(`created_at.lt.${row.created_at},and(created_at.eq.${row.created_at},id.lt.${row.id})`);
   }
   const { data, error } = await q;
   if (error) throw new BriefError(503, 'list_failed');
   const items = (data ?? []).slice(0, limit);
   return json({ items, nextCursor: (data ?? []).length > limit ? items.at(-1)?.id : null });
  }
  const route = /^\/runs\/([^/]+)(?:\/(review|export))?$/.exec(url.pathname);
  if (!route) throw new BriefError(404, 'not_found');
  const id = z.uuid().parse(route[1]);
  const run = await store.run(id, Boolean(route[2]));
  if (!route[2] && request.method === 'GET') return json({ run, steps: await store.steps(id) });
  if (route[2] === 'review' && request.method === 'POST') {
   const review = Review.parse(await body(request));
   if (run.brief_hash !== review.briefHash) throw new BriefError(409, 'brief_changed');
   if (run.decision && run.decision !== review.decision) throw new BriefError(409, 'already_reviewed');
   if (!run.decision) {
    if (run.status !== 'waiting_admin_review' || !run.quality?.passed) throw new BriefError(409, 'not_ready');
    const brief = BuildBriefSchema.parse(run.brief);
    if (review.decision === 'approve') brief.review = { status: 'admin_reviewed', reviewedBy: admin.email, reviewedAt: new Date().toISOString(), exportedAt: null };
    await store.transition(id, 'waiting_admin_review', run.source_context.session.revision, review.briefHash, { decision: review.decision, brief, status: review.decision === 'approve' ? 'completed' : 'failed', error_code: review.decision === 'reject' ? 'admin_rejected' : null, completed_at: new Date().toISOString() });
   }
   // DB decision is authoritative, a repeat can safely resend the wake-up.
   try { await (await env.BRIEF_PIPELINE.get(id)).sendEvent({ type: 'admin-review', payload: { decision: review.decision } }); }
   catch { return json({ recorded: true, workflowNotification: 'pending_retry' }); }
   return json({ recorded: true, workflowNotification: 'sent' });
  }
  if (route[2] === 'export' && request.method === 'POST') {
   const { format } = z.object({ format: z.enum(['json', 'markdown']) }).strict().parse(await body(request));
   if (run.status !== 'completed' || run.decision !== 'approve') throw new BriefError(409, 'review_required');
   const brief = BuildBriefSchema.parse(run.brief);
   brief.review = { ...brief.review, status: 'exported', exportedAt: brief.review.exportedAt ?? new Date().toISOString() };
   await store.transition(id, 'completed', run.source_context.session.revision, run.brief_hash, { brief });
   return json({ format, filename: `brief-${id}.${format === 'json' ? 'json' : 'md'}`, content: format === 'json' ? JSON.stringify(brief, null, 2) : renderBrief(brief) });
  }
  throw new BriefError(405, 'method_not_allowed');
 } catch (error) {
  return json({ error: error instanceof BriefError ? error.code : error instanceof z.ZodError ? 'validation_failed' : 'request_failed' }, error instanceof BriefError ? error.status : error instanceof z.ZodError ? 422 : 500);
 }
}
