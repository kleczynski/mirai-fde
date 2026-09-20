import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SessionSchema } from '../../../src/domain/contract.js';
import { AgentContextSchema, contentHash, contextFromSession } from '../../../src/domain/agent-context.js';
import { BuildBriefSchema, type BuildBrief } from './domain/contract.js';
import { type Stage, type Outputs } from './domain/pipeline.js';
export class BriefError extends Error { constructor(public status: number, public code: string) { super(code); } }
export type Config = { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; SUPABASE_SERVICE_ROLE_KEY: string; MIRAI_ADMIN_EMAILS: string; OPENAI_API_KEY: string };
export function serviceClient(env: Config) {
 if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new BriefError(503, 'not_configured');
 return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authorize(request: Request, env: Config) {
 const bearer = request.headers.get('Authorization');
 if (!bearer?.startsWith('Bearer ')) throw new BriefError(401, 'authentication_required');
 if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.MIRAI_ADMIN_EMAILS) throw new BriefError(503, 'not_configured');
 const auth = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
 const { data, error } = await auth.auth.getUser(bearer.slice(7));
 if (error || !data.user?.email || data.user.is_anonymous) throw new BriefError(401, 'invalid_session');
 if (!env.MIRAI_ADMIN_EMAILS.split(',').map(x => x.trim().toLowerCase()).includes(data.user.email.toLowerCase())) throw new BriefError(403, 'admin_required');
 return { id: data.user.id, email: data.user.email };
}
export class BriefStore {
 constructor(readonly db: SupabaseClient) {}
 async source(sessionId: string) {
  const { data, error } = await this.db.from('interview_sessions').select('state').eq('id', sessionId).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw new BriefError(503, 'source_unavailable');
  if (!data) throw new BriefError(404, 'session_not_found');
  const session = SessionSchema.parse(data.state);
  try { return contextFromSession(session); } catch { throw new BriefError(422, 'approved_evidence_required'); }
 }
 async run(id: string, current = false) {
  const { data, error } = await this.db.from('brief_runs').select('*').eq('id', id).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw new BriefError(503, 'run_unavailable');
  if (!data) throw new BriefError(404, 'run_not_found');
  const source = await this.source(data.session_id);
  if (current && await contentHash(source) !== data.source_hash) throw new BriefError(409, 'source_changed');
  return { ...data, source_context: AgentContextSchema.parse(data.source_context) };
 }
 async steps(id: string): Promise<Array<{ name: Stage; status: string; input: unknown; output: unknown; usage: unknown }>> {
  const { data, error } = await this.db.from('brief_run_steps').select('*').eq('run_id', id).order('created_at');
  if (error) throw new BriefError(503, 'steps_unavailable');
  return data ?? [];
 }
 async outputs(id: string): Promise<Outputs> { return Object.fromEntries((await this.steps(id)).filter(s => s.status === 'completed').map(s => [s.name, s.output])); }
 async update(id: string, values: Record<string, unknown>, expected?: string) {
  let q = this.db.from('brief_runs').update(values).eq('id', id).gt('expires_at', new Date().toISOString());
  if (expected) q = q.eq('status', expected);
  const { data, error } = await q.select('id').maybeSingle();
  if (error) throw new BriefError(503, 'save_failed');
  if (!data) throw new BriefError(409, 'run_changed');
 }
 async transition(id: string, expectedStatus: string, sourceRevision: number, briefHash: string, values: Record<string, unknown>) {
  const { data, error } = await this.db.rpc('transition_brief', { p_run_id: id, p_expected_status: expectedStatus, p_source_revision: sourceRevision, p_brief_hash: briefHash, p_values: values });
  if (error) throw new BriefError(503, 'transition_failed');
  if (!data) throw new BriefError(409, 'source_or_brief_changed');
 }
 async reserve(id: string, stage: Stage, input: unknown) {
  const { data, error } = await this.db.rpc('reserve_brief_call', { p_run_id: id, p_name: stage, p_input: input });
  if (error) throw new BriefError(409, 'budget_or_run_unavailable');
  return data === true;
 }
 async completeStep(id: string, stage: Stage, output: unknown, usage: unknown) {
  await this.run(id, true);
  const { data, error } = await this.db.from('brief_run_steps').update({ output, usage, status: 'completed', completed_at: new Date().toISOString() }).eq('run_id', id).eq('name', stage).eq('status', 'reserved').select('name').maybeSingle();
  if (error || !data) throw new BriefError(503, 'step_save_failed');
 }
 async brief(id: string): Promise<BuildBrief> { const run = await this.run(id, true); return BuildBriefSchema.parse(run.brief); }
}
