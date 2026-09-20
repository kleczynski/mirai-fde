import { createSession } from '../../../src/domain/interview.js';
import { extractWithRules } from '../../../src/domain/extraction.js';
import { SessionSchema } from '../../../src/domain/contract.js';
import { julkaContext } from './fixtures.js';

/** Synthetic source only. No copied customer session or production identifiers. */
export function syntheticSession() {
 const session = createSession('demo');
 session.status = 'completed'; session.completedAt = new Date().toISOString(); session.revision = 2;
 session.turns = julkaContext.evidence.map(e => ({ id: e.segmentId, speaker: 'participant' as const, text: e.quote, timestamp: session.startedAt, questionId: null, source: 'demo' as const, providerEventId: null }));
 const result = extractWithRules(session);
 session.result = { ...result, participantContext: julkaContext.approvedFacts, painPoints: julkaContext.painPoints,
  workflows: [], tools: [], constraints: [], automationOpportunities: julkaContext.hypotheses,
  evidence: julkaContext.evidence, transcript: session.turns, unansweredQuestions: julkaContext.openQuestions,
  recommendedNextStep: { text: 'Sprawdź fikcyjne demo; hipoteza wymaga walidacji.', evidenceIds: [julkaContext.evidence[0].id], review: julkaContext.approvedFacts[0].review } };
 return SessionSchema.parse(session);
}
