import { describe, expect, it, vi } from 'vitest';
import { VOICE_EVAL_CASES, VOICE_SIMULATION_CASES } from '../src/domain/voice-evaluation';
import { buildVoiceEvaluationReport, TestInvocationSchema } from '../src/domain/voice-evaluation-report';
import { ElevenLabsEvalClient, testDefinitions } from '../scripts/voice-evals';
import { AGENT_PROMPT } from '../src/domain/interview';
import { STYLE_POLICY_PROMPT } from '../src/domain/voice-policy/style';

describe('voice evaluation suite', () => {
  it('has twenty nine distinct synthetic next reply cases and six complete simulations', () => {
    expect(VOICE_EVAL_CASES).toHaveLength(29);
    expect(VOICE_SIMULATION_CASES).toHaveLength(6);
    expect(new Set([...VOICE_EVAL_CASES, ...VOICE_SIMULATION_CASES].map(item => item.id)).size).toBe(35);
    for (const testCase of VOICE_EVAL_CASES) {
      expect(testCase.history.at(-1)?.role).toBe('user');
      expect(testCase.expected.length).toBeGreaterThan(15);
      expect(testCase.forbidden.length).toBeGreaterThan(15);
    }
  });

  it('creates provider definitions with versioned names and actual chat history', () => {
    const definitions = testDefinitions();
    expect(definitions).toHaveLength(35);
    expect(definitions.every(item => /^MiraiQ1:.+:[a-f0-9]{10}$/.test(item.name))).toBe(true);
    expect(definitions.filter(item => item.type === 'llm')).toHaveLength(29);
    expect(definitions.filter(item => item.type === 'simulation')).toHaveLength(6);
    const closing = definitions.find(item => item.case.id === 'closing.no_corrections');
    expect(closing?.body.chat_history).toEqual([
      { role: 'agent', message: expect.any(String), time_in_call_secs: 0 },
      { role: 'user', message: 'Nie, wszystko.', time_in_call_secs: 8 },
    ]);
  });

  it('tests unknown team size, solo work and unproven savings', () => {
    const ids = new Set(VOICE_EVAL_CASES.map(item => item.id));
    expect(ids.has('tone.solo_operator_no_team')).toBe(true);
    expect(ids.has('tone.unknown_structure_no_management')).toBe(true);
    expect(ids.has('tone.manual_work_no_business_claim')).toBe(true);
    expect(ids.has('tone.no_echo_repetitive_paraphrase')).toBe(true);
    expect(ids.has('closing.routine_toil_is_enough_pain')).toBe(true);
    expect(ids.has('closing.automation_desired_by_participant')).toBe(true);
    expect(VOICE_SIMULATION_CASES.some(item => item.id === 'simulation.solo_operator_plain_tone')).toBe(true);
    expect(VOICE_SIMULATION_CASES.some(item => item.id === 'simulation.senior_artisan_solo')).toBe(true);
    expect(VOICE_SIMULATION_CASES.some(item => item.id === 'simulation.dentist_busy_clinic')).toBe(true);
    expect(VOICE_SIMULATION_CASES.some(item => item.id === 'simulation.tutor_revolut_calendar')).toBe(true);
    expect(AGENT_PROMPT).toContain(STYLE_POLICY_PROMPT);
    expect(AGENT_PROMPT).toContain('BEZWZGLĘDNY ZAKAZ SŁÓW „ROZUMIEM, ŻE” I ECHA');
    expect(AGENT_PROMPT).toContain('ZWYKŁA MONOTONIA JEST WYSTARCZAJĄCYM PROBLEMEM');
    expect(AGENT_PROMPT).toContain('Nie zakładaj, że rozmówca ma firmę, zespół');
    expect(AGENT_PROMPT).toContain('PYTANIE BEZ DOPISYWANIA');
  });

  it('keeps a visible agent answer even when the provider judge fails it', () => {
    const testCase = VOICE_EVAL_CASES.find(item => item.id === 'closing.no_corrections')!;
    const invocation = (id: string, status: 'passed' | 'failed') => TestInvocationSchema.parse({
      id, agent_id: 'agent_test', version_id: `${id}_version`, test_runs: [{
        test_run_id: `${id}_run`, test_id: 'test_close', status,
        agent_responses: [{ role: 'agent', message: 'Dzięki, mam to. Miłego dnia.' }],
        condition_result: { result: status === 'passed' ? 'success' : 'failure', rationale: 'mock judge' },
      }],
    });
    const report = buildVoiceEvaluationReport({
      agentId: 'agent_test', suiteVersion: 'test', suiteFingerprint: 'hash', repeatCount: 1,
      cases: [testCase], testIds: new Map([[testCase.id, 'test_close']]),
      baseline: invocation('baseline', 'failed'), candidate: invocation('candidate', 'passed'),
    });
    expect(report.cases[0].baseline.tally.failed).toBe(1);
    expect(report.cases[0].baseline.runs[0].agentResponses).toEqual(['Dzięki, mam to. Miłego dnia.']);
    expect(report.cases[0].humanReview).toBeNull();
  });

  it('rejects comparisons against an unpublished draft', () => {
    const invocation = TestInvocationSchema.parse({ id: 'draft', ran_against_draft: true, test_runs: [] });
    expect(() => buildVoiceEvaluationReport({
      agentId: 'agent_test', suiteVersion: 'test', suiteFingerprint: 'hash', repeatCount: 1,
      cases: [], testIds: new Map(), baseline: invocation, candidate: invocation,
    })).toThrow(/wersję roboczą/);
  });

  it('rejects individual draft runs and mixed versions', () => {
    const base = { id: 'inv', version_id: 'v1', test_runs: [{ test_run_id: 'run', test_id: 'test', status: 'passed' }] };
    const draft = TestInvocationSchema.parse({ ...base, test_runs: [{ ...base.test_runs[0], ran_against_draft: true }] });
    const mixed = TestInvocationSchema.parse({ ...base, test_runs: [{ ...base.test_runs[0], version_id: 'v2' }] });
    const options = { agentId: 'agent_test', suiteVersion: 'test', suiteFingerprint: 'hash', repeatCount: 1, cases: [], testIds: new Map() };
    expect(() => buildVoiceEvaluationReport({ ...options, baseline: draft, candidate: draft })).toThrow(/wersję roboczą/);
    expect(() => buildVoiceEvaluationReport({ ...options, baseline: mixed, candidate: mixed })).toThrow(/jednej wersji/);
  });

  it('sends the exact branch and repeat count to ElevenLabs', async () => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      expect(body).toEqual({ tests: [{ test_id: 'test_1' }], repeat_count: 2, branch_id: 'agtbrch_test' });
      return Response.json({ id: 'inv_1', agent_id: 'agent_test', branch_id: body.branch_id, version_id: 'version_1', test_runs: [
        { test_run_id: 'run_1', test_id: 'test_1', status: 'passed' },
        { test_run_id: 'run_2', test_id: 'test_1', status: 'passed' },
      ] });
    });
    const client = new ElevenLabsEvalClient('secret', 'agent_test', fetcher as unknown as typeof fetch);
    const result = await client.runTests(['test_1'], 2, 'agtbrch_test');
    expect(result.version_id).toBe('version_1');
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
