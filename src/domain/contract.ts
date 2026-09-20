import { z } from 'zod';

export const ReviewSchema = z.object({ status: z.enum(['unreviewed', 'confirmed', 'corrected']), originalText: z.string().nullable(), reviewedAt: z.iso.datetime().nullable() });
export const FindingSchema = z.object({ id: z.uuid(), text: z.string().min(1).max(4000), confidence: z.number().min(0).max(1), evidenceIds: z.array(z.uuid()).min(1), review: ReviewSchema });
export const TranscriptSchema = z.object({ id: z.uuid(), speaker: z.enum(['agent', 'participant']), text: z.string().min(1).max(8000), timestamp: z.iso.datetime(), questionId: z.string().nullable(), source: z.enum(['text', 'demo', 'elevenlabs']), providerEventId: z.string().nullable() });
export const ConsentSchema = z.object({ version: z.literal('discovery-consent.v1'), aiDisclosure: z.literal(true), transcriptStorage: z.literal(true), analysis: z.literal(true), audioStorage: z.literal(false), acceptedAt: z.iso.datetime(), retentionDays: z.literal(30) });
export const CoverageKeySchema = z.enum(['role', 'focus', 'workflow', 'inputs', 'toolsPeople', 'pain', 'frequencyImpact', 'exceptions', 'humanBoundary', 'desiredOutcome']);
export type CoverageKey = z.infer<typeof CoverageKeySchema>;
export const CoverageStatusSchema = z.enum(['missing', 'partial', 'covered']);
export const InterviewProgressSchema = z.object({
  phase: z.enum(['orient', 'discover', 'deepen', 'validate', 'complete']),
  coverage: z.record(CoverageKeySchema, CoverageStatusSchema),
  evidenceByCoverage: z.record(CoverageKeySchema, z.array(z.uuid())),
  focusSummary: z.string().max(500).nullable(),
  readyToFinish: z.boolean(),
  participantTurns: z.number().int().min(0).max(150),
  maxParticipantTurns: z.number().int().min(8).max(30),
  updatedAt: z.iso.datetime(),
});
export const DiscoveryBaseSchema = z.object({
  schemaVersion: z.literal('mirai.discovery.v1'), sessionId: z.uuid(), locale: z.literal('pl-PL'),
  scenarioVersion: z.literal('discovery-interview.v1'), promptVersion: z.literal('discovery-agent.v1'),
  extraction: z.object({ method: z.enum(['evidence-rules', 'language-model']), model: z.string(), generatedAt: z.iso.datetime() }),
  participantContext: z.array(FindingSchema), painPoints: z.array(FindingSchema),
  workflows: z.array(FindingSchema.extend({ steps: z.array(z.string()) })), tools: z.array(FindingSchema), constraints: z.array(FindingSchema),
  automationOpportunities: z.array(FindingSchema.extend({ linkedPainPointIds: z.array(z.uuid()), validationNeeded: z.array(z.string()).min(1), priority: z.enum(['explore', 'next', 'later']) })),
  recommendedNextStep: z.object({ text: z.string().min(1), evidenceIds: z.array(z.uuid()), review: ReviewSchema }),
  unansweredQuestions: z.array(z.string()), evidence: z.array(z.object({ id: z.uuid(), segmentId: z.uuid(), quote: z.string().min(1) })),
  transcript: z.array(TranscriptSchema), consent: ConsentSchema, startedAt: z.iso.datetime(), completedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
});
export const DiscoverySchema = DiscoveryBaseSchema.superRefine((value, ctx) => {
  const segments = new Map(value.transcript.map(t => [t.id, t]));
  const evidence = new Set(value.evidence.map(e => e.id));
  const painIds = new Set(value.painPoints.map(p => p.id));
  if (segments.size !== value.transcript.length || evidence.size !== value.evidence.length) ctx.addIssue({ code: 'custom', message: 'Duplicate evidence or transcript IDs' });
  for (const e of value.evidence) {
    const segment = segments.get(e.segmentId);
    if (!segment || segment.speaker !== 'participant' || !segment.text.includes(e.quote)) ctx.addIssue({ code: 'custom', message: 'Evidence must quote an actual participant segment' });
  }
  for (const f of [...value.participantContext, ...value.painPoints, ...value.workflows, ...value.tools, ...value.constraints, ...value.automationOpportunities, value.recommendedNextStep]) {
    if (f.evidenceIds.some(id => !evidence.has(id))) ctx.addIssue({ code: 'custom', message: 'Unknown evidence reference' });
  }
  for (const opportunity of value.automationOpportunities) if (opportunity.linkedPainPointIds.some(id => !painIds.has(id))) ctx.addIssue({ code: 'custom', message: 'Unknown pain point reference' });
  for (const opportunity of value.automationOpportunities) if (opportunity.confidence > .6) ctx.addIssue({ code: 'custom', message: 'Automation opportunities must remain explicitly hypothetical' });
  if ([...segments.values()].some(t => t.speaker === 'participant') && value.recommendedNextStep.evidenceIds.length === 0) ctx.addIssue({ code: 'custom', message: 'Recommended next step must be grounded in participant evidence' });
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) ctx.addIssue({ code: 'custom', message: 'Completion precedes start' });
});
export type DiscoveryResult = z.infer<typeof DiscoverySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Turn = z.infer<typeof TranscriptSchema>;
export const SessionSchema = z.object({
  id: z.uuid(), status: z.enum(['active', 'paused', 'review', 'completed']), mode: z.enum(['demo', 'text', 'voice']),
  consent: ConsentSchema, startedAt: z.iso.datetime(), completedAt: z.iso.datetime().nullable(), expiresAt: z.iso.datetime(),
  // questionIndex remains for backwards-compatible UI progress only. Production
  // completion is driven by interviewProgress.readyToFinish, never this counter.
  questionIndex: z.number().int().min(0).max(30), turns: z.array(TranscriptSchema).max(300),
  interviewProgress: InterviewProgressSchema,
  result: DiscoverySchema.nullable(), modelResult: DiscoverySchema.nullable(), revision: z.number().int().min(1),
});
export type InterviewSession = z.infer<typeof SessionSchema>;
export type Mode = InterviewSession['mode'];
export const newReview = (): Finding['review'] => ({ status: 'unreviewed', originalText: null, reviewedAt: null });
export function reviewFinding<T extends { text: string; review: Finding['review'] }>(finding: T, text: string): T {
  const changed = text.trim() !== finding.text;
  return { ...finding, text: text.trim() || finding.text, review: { status: changed ? 'corrected' : finding.review.status === 'corrected' ? 'corrected' : 'confirmed', originalText: changed ? finding.review.originalText ?? finding.text : finding.review.originalText, reviewedAt: new Date().toISOString() } };
}
