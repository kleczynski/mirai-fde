import { z } from 'zod';
import type { VoiceEvalCase } from './voice-evaluation.js';

const ResponseSchema = z.object({ role: z.string(), message: z.string().nullable().optional() }).passthrough();
const TestRunSchema = z.object({
  test_run_id: z.string(),
  test_id: z.string(),
  status: z.enum(['pending', 'passed', 'failed']),
  version_id: z.string().nullable().optional(),
  branch_id: z.string().nullable().optional(),
  ran_against_draft: z.boolean().optional(),
  agent_responses: z.array(ResponseSchema).nullable().optional(),
  condition_result: z.unknown().nullable().optional(),
}).passthrough();
export const TestInvocationSchema = z.object({
  id: z.string(),
  agent_id: z.string().nullable().optional(),
  branch_id: z.string().nullable().optional(),
  version_id: z.string().nullable().optional(),
  ran_against_draft: z.boolean().optional(),
  repeat_count: z.number().int().optional(),
  test_runs: z.array(TestRunSchema),
}).passthrough();

export type TestInvocation = z.infer<typeof TestInvocationSchema>;

export function summarizeInvocation(invocation: TestInvocation, testIds: ReadonlyMap<string, string>) {
  const byTestId = new Map([...testIds].map(([caseId, testId]) => [testId, caseId]));
  return invocation.test_runs.map(run => ({
    caseId: byTestId.get(run.test_id) ?? null,
    testId: run.test_id,
    runId: run.test_run_id,
    status: run.status,
    branchId: run.branch_id ?? invocation.branch_id ?? null,
    versionId: run.version_id ?? invocation.version_id ?? null,
    agentResponses: (run.agent_responses ?? []).filter(item => item.role === 'agent').map(item => item.message ?? '').filter(Boolean),
    providerJudge: run.condition_result ?? null,
  }));
}

export function buildVoiceEvaluationReport(input: {
  agentId: string;
  suiteVersion: string;
  suiteFingerprint: string;
  repeatCount: number;
  cases: readonly VoiceEvalCase[];
  testIds: ReadonlyMap<string, string>;
  baseline: TestInvocation;
  candidate: TestInvocation;
}) {
  const invocations = [input.baseline, input.candidate];
  if (invocations.some(invocation => invocation.ran_against_draft || invocation.test_runs.some(run => run.ran_against_draft))) {
    throw new Error('Test uruchomił wersję roboczą. Porównanie nie jest odtwarzalne.');
  }
  for (const invocation of invocations) {
    if (!invocation.version_id || invocation.test_runs.some(run => run.version_id && run.version_id !== invocation.version_id)) {
      throw new Error('Nie można potwierdzić jednej wersji agenta dla wszystkich przebiegów.');
    }
    if (invocation.test_runs.some(run => run.branch_id && invocation.branch_id && run.branch_id !== invocation.branch_id)) {
      throw new Error('Przebiegi testów pochodzą z różnych gałęzi.');
    }
  }
  const baselineRuns = summarizeInvocation(input.baseline, input.testIds);
  const candidateRuns = summarizeInvocation(input.candidate, input.testIds);
  const runsFor = (runs: typeof baselineRuns, caseId: string) => runs.filter(run => run.caseId === caseId);
  return {
    schemaVersion: 'mirai.voice-eval-report.v1',
    generatedAt: new Date().toISOString(),
    agentId: input.agentId,
    suiteVersion: input.suiteVersion,
    suiteFingerprint: input.suiteFingerprint,
    repeatCount: input.repeatCount,
    limitations: [
      'Testy Next Reply są tekstowe i nie sprawdzają ASR, TTS ani przerywania wypowiedzi.',
      'Werdykt dostawcy może być błędny. Surowe odpowiedzi wymagają przeglądu człowieka.',
      'Gałąź jest przypinana do żądania, lecz API testów nie przyjmuje version_id. Zapisujemy wersję zwróconą w odpowiedzi.',
    ],
    baseline: { invocationId: input.baseline.id, branchId: input.baseline.branch_id ?? null, versionId: input.baseline.version_id ?? null },
    candidate: { invocationId: input.candidate.id, branchId: input.candidate.branch_id ?? null, versionId: input.candidate.version_id ?? null },
    cases: input.cases.map(testCase => {
      const baseline = runsFor(baselineRuns, testCase.id);
      const candidate = runsFor(candidateRuns, testCase.id);
      const tally = (runs: typeof baseline) => ({ passed: runs.filter(run => run.status === 'passed').length, failed: runs.filter(run => run.status === 'failed').length, pending: runs.filter(run => run.status === 'pending').length });
      return {
        id: testCase.id,
        category: testCase.category,
        expected: testCase.expected,
        forbidden: testCase.forbidden,
        critical: testCase.critical,
        providerTestId: input.testIds.get(testCase.id) ?? null,
        baseline: { tally: tally(baseline), runs: baseline },
        candidate: { tally: tally(candidate), runs: candidate },
        humanReview: null,
      };
    }),
  };
}
