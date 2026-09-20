import { z } from 'zod';
import { DiscoveryBaseSchema, FindingSchema, type InterviewSession } from './contract.js';

/** Redact strings recursively, including model output and JSON object keys. */
export function redactSecrets<T>(value: T): T {
  const redact = (s: string) => s
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED]')
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|sb_secret|ghp|github_pat)[-_][A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/((?:api[_ -]?key|password|secret|token)\s*[:=]\s*)[^\s,;"']+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s"<>]+/g, url => { try { const u = new URL(url); u.username = ''; u.password = ''; u.hash = ''; u.search = ''; if (/\/(invite|signin|reset)\//i.test(u.pathname)) u.pathname = '/[REDACTED]'; return u.toString(); } catch { return '[REDACTED URL]'; } });
  const visit = (v: unknown): unknown => typeof v === 'string' ? redact(v) : Array.isArray(v) ? v.map(visit) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [redact(k), /^(authorization|password|secret|api_?key|access_token|refresh_token)$/i.test(k) && typeof x === 'string' ? '[REDACTED]' : visit(x)])) : v;
  return visit(value) as T;
}

export const AgentContextSchema = z.object({
  contextPackageVersion: z.literal('mirai.agent-context.v1'),
  session: z.object({ id: z.uuid(), expiresAt: z.iso.datetime(), mode: z.enum(['demo', 'text', 'voice']), revision: z.number().int().positive() }),
  approvedFacts: z.array(FindingSchema).min(1).max(100),
  painPoints: z.array(FindingSchema).min(1).max(100),
  hypotheses: DiscoveryBaseSchema.shape.automationOpportunities.min(1).max(30),
  evidence: DiscoveryBaseSchema.shape.evidence.min(1).max(300),
  openQuestions: z.array(z.string().max(4000)).max(100),
  humanBoundaries: z.array(FindingSchema).max(100),
}).superRefine((v, ctx) => {
  const ids = new Set(v.evidence.map(e => e.id));
  const pains = new Set(v.painPoints.map(p => p.id));
  if (ids.size !== v.evidence.length || pains.size !== v.painPoints.length || new Set(v.hypotheses.map(h => h.id)).size !== v.hypotheses.length) ctx.addIssue({ code: 'custom', message: 'Duplicate source IDs' });
  if (v.approvedFacts.some(f => f.review.status === 'unreviewed')) ctx.addIssue({ code: 'custom', message: 'Unapproved fact' });
  for (const f of [...v.approvedFacts, ...v.painPoints, ...v.hypotheses, ...v.humanBoundaries]) if (f.evidenceIds.some(id => !ids.has(id))) ctx.addIssue({ code: 'custom', message: 'Missing evidence' });
  for (const h of v.hypotheses) if (!h.linkedPainPointIds.length || h.linkedPainPointIds.some(id => !pains.has(id))) ctx.addIssue({ code: 'custom', message: 'Missing pain point' });
});
export type AgentContext = z.infer<typeof AgentContextSchema>;

export function contextFromSession(session: InterviewSession): AgentContext {
  if (session.status !== 'completed' || !session.result || Date.parse(session.expiresAt) <= Date.now()) throw new Error('Approved, unexpired session required');
  const r = session.result;
  return AgentContextSchema.parse(redactSecrets({
    contextPackageVersion: 'mirai.agent-context.v1',
    session: { id: session.id, expiresAt: session.expiresAt, mode: session.mode, revision: session.revision },
    approvedFacts: [...r.participantContext, ...r.workflows, ...r.tools, ...r.constraints].filter(f => f.review.status !== 'unreviewed'),
    painPoints: r.painPoints, hypotheses: r.automationOpportunities, evidence: r.evidence,
    openQuestions: r.unansweredQuestions, humanBoundaries: r.constraints,
  }));
}

export async function contentHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
