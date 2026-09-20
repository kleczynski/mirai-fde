import { describe, expect, it } from 'vitest';
import { AGENT_PROMPT } from '../src/domain/interview';
import { EVIDENCE_EVAL_SCENARIOS, EVIDENCE_POLICY_PROMPT } from '../src/domain/voice-policy/evidence';

describe('voice evidence policy', () => {
  it('is included in the production prompt without losing the existing interview goal', () => {
    expect(AGENT_PROMPT).toContain(EVIDENCE_POLICY_PROMPT);
    expect(AGENT_PROMPT).toContain('rzeczywisty przebieg');
    expect(AGENT_PROMPT).toContain('KOLEJNOŚĆ DECYZJI PO KAŻDEJ ODPOWIEDZI');
  });

  it('provides distinct, runnable checkpoints for live agent evaluation', () => {
    expect(EVIDENCE_EVAL_SCENARIOS).toHaveLength(6);
    expect(EVIDENCE_POLICY_PROMPT).toContain('„zabiera mi uwagę” nie potwierdza straty czasu');
    expect(new Set(EVIDENCE_EVAL_SCENARIOS.map(scenario => scenario.id)).size).toBe(EVIDENCE_EVAL_SCENARIOS.length);
    for (const scenario of EVIDENCE_EVAL_SCENARIOS) {
      expect(scenario.precedingAgentQuestion.length).toBeGreaterThan(10);
      expect(scenario.participantReply.length).toBeGreaterThan(2);
      expect(scenario.acceptableNextMove.length).toBeGreaterThan(20);
      expect(scenario.mustNotInfer.length).toBeGreaterThan(0);
    }
  });
});
