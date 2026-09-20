import { describe, expect, it } from 'vitest';
import { AGENT_PROMPT } from '../src/domain/interview';
import { CLOSING_EVALUATION_CASES, CLOSING_POLICY_PROMPT } from '../src/domain/voice-policy/closing';

describe('Voice closing policy', () => {
  it('is included in the voice agent prompt', () => {
    expect(AGENT_PROMPT).toContain(CLOSING_POLICY_PROMPT);
  });
  it('keeps the early gap, one summary and final acknowledgement as distinct moves', () => {
    const moves = new Map(CLOSING_EVALUATION_CASES.map(({ id, expectedMove }) => [id, expectedMove]));
    expect(moves.get('problem_named_process_unknown')).toBe('deepen');
    expect(moves.get('enough_detail_first_summary')).toBe('summarize_and_verify');
    expect(moves.get('summary_confirmed')).toBe('close');
    expect(moves.get('no_corrections')).toBe('close');
  });

  it('separates the meanings of a negative answer by its preceding question', () => {
    const moves = new Map(CLOSING_EVALUATION_CASES.map(({ id, expectedMove }) => [id, expectedMove]));
    expect(moves.get('no_corrections')).toBe('close');
    expect(moves.get('accuracy_rejected')).toBe('accept_correction');
    expect(moves.get('summary_corrected')).toBe('accept_correction');
  });

  it('preserves the participant right to end even when coverage is incomplete', () => {
    expect(CLOSING_EVALUATION_CASES.find(({ id }) => id === 'participant_wants_to_stop')?.expectedMove).toBe('close');
    expect(CLOSING_POLICY_PROMPT).toContain('uszanuj to nawet przy lukach');
  });

  it('keeps evaluation checkpoints complete and distinct for a later live agent run', () => {
    const ids = CLOSING_EVALUATION_CASES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of CLOSING_EVALUATION_CASES) {
      expect(entry.checkpoint.length).toBeGreaterThan(30);
      expect(entry.success.length).toBeGreaterThan(20);
      expect(entry.failure.length).toBeGreaterThan(20);
    }
    expect(CLOSING_POLICY_PROMPT).toContain('Nie streszczaj ponownie');
    expect(CLOSING_POLICY_PROMPT).toContain('Nie rozpoczynaj wtedy podsumowania');
    expect(CLOSING_POLICY_PROMPT).toContain('NAJWYŻSZY PRIORYTET');
    expect(CLOSING_POLICY_PROMPT).toContain('Ta reguła ma pierwszeństwo przed pogłębianiem procesu');
  });
});
