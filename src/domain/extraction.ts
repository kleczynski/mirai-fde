import { DiscoverySchema, newReview, type DiscoveryResult, type Finding, type InterviewSession } from './contract.js';
import { coverageLabels, deriveInterviewProgress } from './interview.js';
import { proposeOpportunities } from './opportunities.js';
export function extractWithRules(session: InterviewSession): DiscoveryResult {
  const answers = session.turns.filter(t => t.speaker === 'participant');
  const evidence = answers.map(t => ({ id: t.id, segmentId: t.id, quote: t.text }));
  const finding = (text: string, evidenceIds: string[], confidence = .7): Finding => ({ id: crypto.randomUUID(), text, evidenceIds, confidence, review: newReview() });
  const byQuestion = (ids: string[]) => answers.filter(t => ids.includes(t.questionId ?? '')).map(t => finding(t.text, [t.id], .9));
  const painPoints = byQuestion(['pain', 'frequency', 'impact']).filter(f => !/nie mam (?:żadnych )?problem|nic mnie nie|nie tracę|wszystko działa|nie zdarza|bez trudności/i.test(f.text));
  // Keep the full description so unfamiliar trade tools and human support are not dropped.
  const tools = byQuestion(['tools']);
  const automationOpportunities = proposeOpportunities(answers, painPoints);
  const progress = deriveInterviewProgress(session.turns, session.interviewProgress);
  return DiscoverySchema.parse({ schemaVersion: 'mirai.discovery.v1', sessionId: session.id, locale: 'pl-PL', scenarioVersion: 'discovery-interview.v1', promptVersion: 'discovery-agent.v1', extraction: { method: 'evidence-rules', model: 'deterministic-v2', generatedAt: new Date().toISOString() }, participantContext: byQuestion(['context', 'day', 'goal']), painPoints, workflows: byQuestion(['workflow']).map(f => ({ ...f, steps: [] })), tools: [...tools, ...byQuestion(['inputs'])], constraints: byQuestion(['constraints', 'exceptions', 'next']), automationOpportunities, recommendedNextStep: { text: answers.length ? 'Sprawdź, czy dobrze rozumiemy Twoją sytuację. Jeśli chcesz coś zmienić, wybierz jeden mały krok, który warto wypróbować.' : 'Wróć do rozmowy i opowiedz o jednym przykładzie ze swojej pracy, zanim zaczniemy rozważać zmiany.', evidenceIds: answers.slice(-1).map(t => t.id), review: newReview() }, unansweredQuestions: Object.entries(progress.coverage).filter(([, status]) => status !== 'covered').map(([key]) => `Doprecyzować: ${coverageLabels[key as keyof typeof coverageLabels]}.`), evidence, transcript: session.turns, consent: session.consent, startedAt: session.startedAt, completedAt: session.completedAt ?? new Date().toISOString(), expiresAt: session.expiresAt });
}
export function validateAgainstSession(result: unknown, session: InterviewSession): DiscoveryResult {
  const parsed = DiscoverySchema.parse(result);
  if (parsed.sessionId !== session.id || JSON.stringify(parsed.transcript) !== JSON.stringify(session.turns) || JSON.stringify(parsed.consent) !== JSON.stringify(session.consent) || parsed.startedAt !== session.startedAt || parsed.expiresAt !== session.expiresAt) throw new Error('Wynik nie odpowiada zapisanej sesji.');
  return parsed;
}
