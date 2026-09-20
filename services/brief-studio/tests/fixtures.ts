import { AgentContextSchema } from '../../../src/domain/agent-context.js';
import { julkaBuildBriefExample as brief } from '../src/domain/fixtures.js';
import { type Outputs } from '../src/domain/pipeline.js';
const review = { status: 'confirmed', originalText: null, reviewedAt: '2026-09-18T12:00:00.000Z' };
const painId = '44444444-4444-4444-8444-444444444444';
export const julkaContext = AgentContextSchema.parse({
 contextPackageVersion: 'mirai.agent-context.v1', session: { id: brief.sourceSessionId, revision: 2, mode: 'demo', expiresAt: '2099-01-01T00:00:00.000Z' },
 approvedFacts: [{ id: '33333333-3333-4333-8333-333333333333', text: brief.evidenceExcerpts[0].quote, evidenceIds: [brief.evidenceExcerpts[0].id], confidence: 1, review }],
 painPoints: [{ id: painId, text: 'Monotonne ręczne sprawdzanie płatności.', evidenceIds: [brief.evidenceExcerpts[1].id], confidence: 1, review }],
 hypotheses: [{ id: brief.chosenOpportunity.hypothesisId, text: brief.chosenOpportunity.title }, ...brief.chosenOpportunity.rejectedAlternatives.map(h => ({ id: h.hypothesisId, text: h.title }))].map(h => ({ ...h, evidenceIds: brief.chosenOpportunity.evidenceIds, confidence: .5, review: { status: 'unreviewed', originalText: null, reviewedAt: null }, linkedPainPointIds: [painId], validationNeeded: ['Hipoteza, sprawdzić z uczestniczką.'], priority: 'explore' })),
 evidence: brief.evidenceExcerpts.map(e => ({ ...e, segmentId: e.id })),
 openQuestions: ['Nie ustalono reguł dopasowania płatności, częstotliwości pomyłek ani mierzalnego celu pilotu.'], humanBoundaries: [],
});
export const fixtureOutputs: Outputs = {
 audit: { evidenceIds: brief.evidenceExcerpts.map(e => e.id), gaps: julkaContext.openQuestions, contradictions: [] },
 opportunity: brief.chosenOpportunity,
 integration: { ...brief.technicalApproach, externalSystems: brief.technicalApproach.externalSystems.map(s => ({ ...s, dataMode: 'simulated', authorization: null })), hosting: { provider: 'cloudflare-workers', rationale: 'Osobny Worker.' } },
 author: { firstUseJourney: brief.firstUseJourney, acceptanceExamples: brief.acceptanceExamples, outOfScope: brief.outOfScope, fixtureDataPlan: { ...brief.fixtureDataPlan, sampleRecords: brief.fixtureDataPlan.sampleRecords.map(r => ({ ...r, fields: Object.entries(r.fields).map(([name, value]) => ({ name, value })) })) } },
 critic: { findings: [] },
};
