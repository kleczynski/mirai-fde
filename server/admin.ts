import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { SessionSchema, type InterviewSession } from '../src/domain/contract.js';
import { redactSecrets } from '../src/domain/agent-context.js';
import { HttpError, type ApiInput } from './agent.js';

const SessionIdSchema = z.object({ sessionId: z.uuid() });
const ListSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(25), cursor: z.uuid().optional() });
const NoteSchema = z.object({
  sessionId: z.uuid(), turnId: z.uuid().nullable().optional(),
  label: z.enum(['repeated_question', 'missed_fact', 'good_follow_up', 'voice_problem', 'note']),
  note: z.string().trim().min(1).max(4000).nullable().optional(),
}).superRefine((value, ctx) => { if (value.label === 'note' && !value.note) ctx.addIssue({ code: 'custom', message: 'Treść uwagi jest wymagana.' }); });
const ADMIN_EMAILS_ENV = 'MIRAI_ADMIN_EMAILS';
const InvitationSchema = z.object({ label: z.string().trim().min(1).max(120), industry: z.string().trim().min(1).max(120).nullable().optional() });

export type AdminIdentity = Pick<User, 'id' | 'email'>;

export function parseAdminEmails(value = process.env[ADMIN_EMAILS_ENV]): ReadonlySet<string> {
  return new Set((value ?? '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)));
}

export function isAllowedAdminEmail(email: string | undefined, allowed = parseAdminEmails()): boolean {
  return Boolean(email && allowed.has(email.trim().toLowerCase()));
}

function persistenceConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) throw new HttpError(503, 'Panel administracyjny nie jest jeszcze skonfigurowany.');
  return { url, publishableKey, serviceRoleKey };
}

/**
 * The browser JWT is verified by Supabase Auth, then its canonical email is
 * checked against a server-only allowlist.  The service-role client is created
 * only after that check; it is never shipped to the browser.
 */
export async function requireAdmin(input: ApiInput): Promise<{ admin: AdminIdentity; service: SupabaseClient<any> }> {
  if (!input.authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Wymagane logowanie administratora.');
  const { url, publishableKey, serviceRoleKey } = persistenceConfig();
  const token = input.authorization.slice('Bearer '.length);
  const authClient = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user?.email) throw new HttpError(401, 'Sesja administratora wygasła.');
  if (!isAllowedAdminEmail(data.user.email)) throw new HttpError(403, 'To konto nie ma dostępu administracyjnego.');
  return {
    admin: { id: data.user.id, email: data.user.email },
    service: createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

export type AdminSessionListItem = {
  id: string;
  status: InterviewSession['status'];
  startedAt: string;
  completedAt: string | null;
  expiresAt: string;
  mode: InterviewSession['mode'];
  turnCount: number;
  focusSummary: string | null;
  hasConfirmedSummary: boolean;
  processing: 'not_started' | 'in_progress' | 'completed' | 'failed';
  latestRunId: string | null;
  latestEvaluationId: string | null;
  requiresAttention: boolean;
  invitation: { id: string; label: string; industry: string | null } | null;
};

function listItem(row: Record<string, unknown>): AdminSessionListItem {
  const state = SessionSchema.parse(row.state);
  const summary = Array.isArray(row.session_summaries) ? row.session_summaries[0] : row.session_summaries;
  const latestRun = Array.isArray(row.agent_runs) ? row.agent_runs[0] : null;
  const latestEvaluation = Array.isArray(row.evaluations) ? row.evaluations[0] : null;
  const notes = Array.isArray(row.operator_notes) ? row.operator_notes : [];
  const processing = latestRun?.status === 'failed' ? 'failed' : latestRun?.status === 'completed' ? 'completed' : latestRun ? 'in_progress' : 'not_started';
  return {
    id: state.id,
    status: state.status,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    expiresAt: state.expiresAt,
    mode: state.mode,
    turnCount: state.turns.length,
    focusSummary: state.interviewProgress.focusSummary,
    hasConfirmedSummary: Boolean(summary && typeof summary === 'object' && (summary as { confirmed_at?: unknown }).confirmed_at),
    processing,
    latestRunId: typeof latestRun?.id === 'string' ? latestRun.id : null,
    latestEvaluationId: typeof latestEvaluation?.id === 'string' ? latestEvaluation.id : null,
    requiresAttention: processing === 'failed' || notes.some(note => ['repeated_question', 'missed_fact', 'voice_problem'].includes(String(note.label))),
    invitation: null,
  };
}

export async function listAdminSessions(input: ApiInput): Promise<{ sessions: AdminSessionListItem[]; items: AdminSessionListItem[]; nextCursor: string | null }> {
  const { service } = await requireAdmin(input);
  const { limit, cursor } = ListSchema.parse(input.query ?? input.body ?? {});
  let query = service
    .from('interview_sessions')
    .select('id, state, session_summaries(confirmed_at), agent_runs(id,status,created_at), evaluations(id,created_at), operator_notes(label)')
    .gt('expires_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (cursor) {
    const { data: cursorRow, error: cursorError } = await service.from('interview_sessions').select('started_at,id').eq('id', cursor).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (cursorError) throw new HttpError(503, 'Nie udało się odczytać sesji.');
    if (!cursorRow) throw new HttpError(404, 'Nie znaleziono sesji.');
    query = query.or(`started_at.lt.${cursorRow.started_at},and(started_at.eq.${cursorRow.started_at},id.lt.${cursorRow.id})`);
  }
  const { data, error } = await query;
  if (error) throw new HttpError(503, 'Nie udało się odczytać sesji.');
  const page = (data ?? []).map(row => listItem(row as Record<string, unknown>));
  const items = page.slice(0, limit);
  if (items.length) {
    const { data: invitations, error: invitationError } = await service.from('interview_invitations')
      .select('id,claimed_session_id,label,industry').in('claimed_session_id', items.map(item => item.id));
    if (invitationError) throw new HttpError(503, 'Nie udało się odczytać przypisania zaproszeń.');
    const bySession = new Map((invitations ?? []).map(row => [row.claimed_session_id, { id: row.id, label: row.label, industry: row.industry }]));
    for (const item of items) item.invitation = bySession.get(item.id) ?? null;
  }
  return { sessions: items, items, nextCursor: page.length > limit ? items.at(-1)?.id ?? null : null };
}

export async function listAdminInvitations(input: ApiInput) {
  const { service } = await requireAdmin(input);
  const { limit, cursor } = ListSchema.parse(input.query ?? {});
  let query = service.from('interview_invitations')
    .select('id,label,industry,created_at,expires_at,claimed_at,claimed_session_id')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
  if (cursor) {
    const { data: cursorRow, error: cursorError } = await service.from('interview_invitations').select('created_at,id').eq('id', cursor).maybeSingle();
    if (cursorError) throw new HttpError(503, 'Nie udało się odczytać zaproszeń.');
    if (!cursorRow) throw new HttpError(404, 'Nie znaleziono zaproszenia.');
    query = query.or(`created_at.lt.${cursorRow.created_at},and(created_at.eq.${cursorRow.created_at},id.lt.${cursorRow.id})`);
  }
  const { data, error } = await query;
  if (error) throw new HttpError(503, 'Nie udało się odczytać zaproszeń.');
  const invitations = (data ?? []).slice(0, limit);
  return { invitations, nextCursor: (data ?? []).length > limit ? invitations.at(-1)?.id ?? null : null };
}

export async function createAdminInvitation(input: ApiInput) {
  const { admin, service } = await requireAdmin(input);
  const { label, industry = null } = InvitationSchema.parse(input.body);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await service.from('interview_invitations')
    .insert({ label, industry, token_hash: tokenHash, created_by: admin.id })
    .select('id,label,industry,created_at,expires_at').single();
  if (error || !data) throw new HttpError(503, 'Nie udało się utworzyć zaproszenia.');
  return { invitation: data, path: `/invite/${token}` };
}

export async function getAdminSession(input: ApiInput): Promise<{ session: InterviewSession; runs: unknown[]; evaluations: unknown[]; operatorNotes: unknown[] }> {
  const { service } = await requireAdmin(input);
  const { sessionId } = SessionIdSchema.parse(input.body);
  const { data, error } = await service.from('interview_sessions').select('state, agent_runs(*), evaluations(*), operator_notes(*)').eq('id', sessionId).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw new HttpError(503, 'Nie udało się odczytać sesji.');
  if (!data) throw new HttpError(404, 'Nie znaleziono sesji.');
  return { session: SessionSchema.parse(data.state), runs: data.agent_runs ?? [], evaluations: data.evaluations ?? [], operatorNotes: data.operator_notes ?? [] };
}

export async function createAdminNote(input: ApiInput) {
  const { service } = await requireAdmin(input);
  const { sessionId, turnId = null, label, note = null } = NoteSchema.parse(input.body);
  const { data: session, error: sessionError } = await service.from('interview_sessions').select('id,state').eq('id', sessionId).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (sessionError) throw new HttpError(503, 'Nie udało się odczytać sesji.');
  if (!session) throw new HttpError(404, 'Nie znaleziono sesji.');
  if (turnId && !SessionSchema.parse(session.state).turns.some(turn => turn.id === turnId)) throw new HttpError(422, 'Wskazana tura nie należy do rozmowy.');
  const { data, error } = await service.from('operator_notes').insert({ session_id: sessionId, turn_id: turnId, label, note }).select().single();
  if (error) throw new HttpError(503, 'Nie udało się zapisać uwagi.');
  return { operatorNote: data };
}

export async function exportAdminSession(input: ApiInput) {
  const detail = await getAdminSession(input);
  const confirmed = detail.session.status === 'completed' ? detail.session.result : null;
  const limitations: string[] = [];
  if (!confirmed) limitations.push('Brak zatwierdzonego raportu, więc zatwierdzone fakty nie są dostępne.');
  if (!detail.runs.length) limitations.push('Brak zarejestrowanego uruchomienia telemetrycznego.');
  return redactSecrets({
    contextPackageVersion: 'mirai.agent-context.v1',
    session: { id: detail.session.id, expiresAt: detail.session.expiresAt, mode: detail.session.mode, revision: detail.session.revision },
    evidence: confirmed?.evidence ?? [],
    painPoints: confirmed?.painPoints ?? [],
    approvedFacts: confirmed ? [...confirmed.participantContext, ...confirmed.workflows, ...confirmed.tools, ...confirmed.constraints].filter(item => item.review.status !== 'unreviewed') : null,
    corrections: confirmed ? [...confirmed.participantContext, ...confirmed.painPoints, ...confirmed.workflows, ...confirmed.tools, ...confirmed.constraints].filter(item => item.review.status === 'corrected') : [],
    hypotheses: confirmed?.automationOpportunities ?? null,
    openQuestions: confirmed?.unansweredQuestions ?? [],
    humanBoundaries: confirmed?.constraints ?? [],
    runs: detail.runs,
    evaluations: detail.evaluations,
    operatorNotes: detail.operatorNotes,
    proposedNextTask: confirmed?.recommendedNextStep ?? null,
    limitations,
  });
}

export async function deleteAdminSession(input: ApiInput): Promise<{ deleted: true }> {
  const { admin, service } = await requireAdmin(input);
  const { sessionId } = SessionIdSchema.parse(input.body);
  const { data: deleted, error } = await service.rpc('admin_delete_interview_session', {
    p_actor_id: admin.id,
    p_session_id: sessionId,
  });
  if (error) throw new HttpError(503, 'Nie udało się usunąć sesji.');
  if (!deleted) throw new HttpError(404, 'Nie znaleziono sesji.');
  return { deleted: true };
}
