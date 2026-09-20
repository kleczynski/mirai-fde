import { describe, expect, it } from 'vitest';
import { AGENT_PROMPT } from '../src/domain/interview';
import { FOCUS_EVAL_CASES, FOCUS_POLICY } from '../src/domain/voice-policy/focus';

describe('voice focus policy', () => {
  it('is part of the actual voice agent prompt', () => {
    expect(AGENT_PROMPT).toContain(FOCUS_POLICY);
  });

  it('contains regression cases for ambiguity, focus depth and explicit topic change', () => {
    const byId = Object.fromEntries(FOCUS_EVAL_CASES.map(testCase => [testCase.id, testCase]));
    expect(byId.correction_reply_no_everything.expectedMove).toBe('finish');
    expect(byId.process_named_without_steps.expectedMove).toBe('deepen_same_process');
    expect(byId.correction_of_same_process_scope.expectedMove).toBe('accept_correction');
    expect(byId.explicit_new_topic.expectedMove).toBe('switch_on_request');
    for (const testCase of FOCUS_EVAL_CASES) {
      expect(testCase.turns.length).toBeGreaterThan(0);
      expect(testCase.mustNot).not.toBe('');
    }
  });
});
