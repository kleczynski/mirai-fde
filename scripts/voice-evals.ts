import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';
import { VOICE_EVAL_CASES, VOICE_EVAL_SUITE_VERSION, VOICE_SIMULATION_CASES, type VoiceEvalCase } from '../src/domain/voice-evaluation.js';
import { buildVoiceEvaluationReport, TestInvocationSchema, type TestInvocation } from '../src/domain/voice-evaluation-report.js';

config({ path: '.env.local', override: false, quiet: true });
config({ path: '.env', override: false, quiet: true });

const API = 'https://api.elevenlabs.io/v1/convai';
const TestListSchema = z.object({
  tests: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })),
  has_more: z.boolean(),
  next_cursor: z.string().nullable().optional(),
});
const CreatedTestSchema = z.object({ id: z.string() });
type TestDefinition = { name: string; type: 'llm' | 'simulation'; body: Record<string, unknown>; case: VoiceEvalCase };

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 10);
}

export function testDefinitions(): TestDefinition[] {
  const nextReply = VOICE_EVAL_CASES.map(testCase => {
    const body = {
      type: 'llm',
      chat_history: testCase.history.map((turn, index) => ({ role: turn.role, message: turn.text, time_in_call_secs: index * 8 })),
      success_condition: `Oceń wyłącznie następną wypowiedź agenta w kontekście historii. Sukces: ${testCase.expected} Porażka: ${testCase.forbidden} Zwróć True tylko gdy odpowiedź spełnia warunek sukcesu i nie ma zachowania zakazanego.`,
    };
    return { name: `MiraiQ1:${testCase.id}:${digest(body)}`, type: 'llm' as const, body, case: testCase };
  });
  const simulations = VOICE_SIMULATION_CASES.map(simulation => {
    const body = {
      type: 'simulation',
      simulation_scenario: simulation.scenario,
      simulation_max_turns: simulation.maxTurns,
      success_conditions: simulation.successConditions,
    };
    const testCase: VoiceEvalCase = {
      id: simulation.id,
      category: 'simulation',
      history: [],
      expected: simulation.successConditions.join(' '),
      forbidden: 'Nie przypisuj agentowi sukcesu wyłącznie na podstawie oceny dostawcy. Przejrzyj cały dialog.',
      critical: true,
    };
    return { name: `MiraiQ1:${simulation.id}:${digest(body)}`, type: 'simulation' as const, body, case: testCase };
  });
  return [...nextReply, ...simulations];
}

export class ElevenLabsEvalClient {
  constructor(private apiKey: string, private agentId: string, private fetcher: typeof fetch = fetch) {}

  private async json(endpoint: string, options: { method?: 'GET' | 'POST'; body?: unknown } = {}) {
    const response = await this.fetcher(`${API}${endpoint}`, {
      method: options.method ?? 'GET',
      headers: { 'xi-api-key': this.apiKey, ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 400)}`);
    return response.json() as Promise<unknown>;
  }

  async listTests() {
    const result: z.infer<typeof TestListSchema>['tests'] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 30; page++) {
      const url = new URL(`${API}/agent-testing`);
      url.searchParams.set('page_size', '100');
      if (cursor) url.searchParams.set('cursor', cursor);
      const data = TestListSchema.parse(await this.json(url.pathname.replace('/v1/convai', '') + url.search));
      result.push(...data.tests);
      if (!data.has_more) return result;
      if (!data.next_cursor || data.next_cursor === cursor) throw new Error('Niepoprawna paginacja listy testów ElevenLabs.');
      cursor = data.next_cursor;
    }
    throw new Error('Przekroczono limit stron listy testów ElevenLabs.');
  }

  async createTest(definition: TestDefinition) {
    return CreatedTestSchema.parse(await this.json('/agent-testing/create', { method: 'POST', body: { ...definition.body, name: definition.name } })).id;
  }

  async runTests(testIds: string[], repeatCount: number, branchId?: string) {
    const body = { tests: testIds.map(test_id => ({ test_id })), repeat_count: repeatCount, ...(branchId ? { branch_id: branchId } : {}) };
    const invocation = TestInvocationSchema.parse(await this.json(`/agents/${encodeURIComponent(this.agentId)}/run-tests`, { method: 'POST', body }));
    return this.waitForInvocation(invocation, testIds.length * repeatCount);
  }

  private async waitForInvocation(first: TestInvocation, expectedRuns: number) {
    let invocation = first;
    const deadline = Date.now() + 8 * 60_000;
    let lastProgress = '';
    while (Date.now() < deadline) {
      const finished = invocation.test_runs.filter(run => run.status !== 'pending').length;
      const progress = `${finished}/${Math.max(expectedRuns, invocation.test_runs.length)}`;
      if (progress !== lastProgress) { process.stderr.write(`Testy ElevenLabs ${invocation.id}: ${progress}\n`); lastProgress = progress; }
      if (invocation.test_runs.length >= expectedRuns && invocation.test_runs.every(run => run.status !== 'pending')) return invocation;
      await new Promise(resolve => setTimeout(resolve, 3_000));
      invocation = TestInvocationSchema.parse(await this.json(`/test-invocations/${encodeURIComponent(invocation.id)}`));
    }
    throw new Error(`Testy ElevenLabs ${invocation.id} nie zakończyły się w ciągu 8 minut. Id można sprawdzić w panelu.`);
  }
}

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const command = process.argv[2] ?? 'preview';
  const definitions = testDefinitions();
  const selectedIds = argument('cases')?.split(',').filter(Boolean);
  const selected = selectedIds ? definitions.filter(item => selectedIds.includes(item.case.id)) : definitions.filter(item => command === 'simulate' ? item.type === 'simulation' : item.type === 'llm');
  if (selectedIds?.some(id => !definitions.some(item => item.case.id === id))) throw new Error('Nieznany identyfikator przypadku w --cases.');
  if (!selected.length) throw new Error('Nie wybrano żadnych przypadków.');
  if (command === 'preview') {
    console.log(JSON.stringify({ suiteVersion: VOICE_EVAL_SUITE_VERSION, nextReply: definitions.filter(item => item.type === 'llm').length, simulations: definitions.filter(item => item.type === 'simulation').length, cases: selected.map(item => ({ id: item.case.id, type: item.type, name: item.name })) }, null, 2));
    return;
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) throw new Error('Brak ELEVENLABS_API_KEY lub ELEVENLABS_AGENT_ID.');
  const client = new ElevenLabsEvalClient(apiKey, agentId);
  const existing = await client.listTests();
  const testIds = new Map<string, string>();
  let created = 0;
  for (const definition of command === 'sync' ? definitions : selected) {
    const matches = existing.filter(item => item.name === definition.name && item.type === definition.type);
    if (matches.length > 1) throw new Error(`Wiele testów ma tę samą nazwę: ${definition.name}`);
    if (matches.length === 1) { testIds.set(definition.case.id, matches[0].id); continue; }
    if (command !== 'sync') throw new Error(`Brakuje testu ${definition.case.id}. Najpierw uruchom: npm run eval:voice -- sync`);
    testIds.set(definition.case.id, await client.createTest(definition));
    created += 1;
  }
  if (command === 'sync') { console.log(`Gotowe: ${testIds.size} testów, w tym ${created} nowych.`); return; }
  if (command !== 'compare' && command !== 'simulate') throw new Error('Użyj preview, sync, compare lub simulate.');
  const candidateBranch = argument('candidate-branch') ?? process.env.ELEVENLABS_EVAL_CANDIDATE_BRANCH_ID;
  if (!candidateBranch || !/^agtbrch_[A-Za-z0-9]+$/.test(candidateBranch)) throw new Error('Podaj --candidate-branch=agtbrch_... lub ELEVENLABS_EVAL_CANDIDATE_BRANCH_ID.');
  const repeatCount = Number(argument('repeat') ?? (command === 'simulate' ? '1' : '3'));
  if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 5) throw new Error('--repeat musi być liczbą od 1 do 5.');
  const ids = selected.map(item => testIds.get(item.case.id)!);
  const [baseline, candidate] = await Promise.all([client.runTests(ids, repeatCount), client.runTests(ids, repeatCount, candidateBranch)]);
  if (baseline.agent_id && baseline.agent_id !== agentId || candidate.agent_id && candidate.agent_id !== agentId) throw new Error('ElevenLabs zwrócił wyniki innego agenta.');
  if (candidate.branch_id !== candidateBranch) throw new Error('Wynik kandydata nie potwierdza żądanej gałęzi.');
  const report = buildVoiceEvaluationReport({
    agentId, suiteVersion: VOICE_EVAL_SUITE_VERSION, suiteFingerprint: digest(selected.map(item => item.name)), repeatCount,
    cases: selected.map(item => item.case), testIds, baseline, candidate,
  });
  const output = path.resolve(argument('out') ?? path.join('.local', 'voice-evals', `${command}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ report: output, baselineVersion: report.baseline.versionId, candidateVersion: report.candidate.versionId, cases: report.cases.map(item => ({ id: item.id, baseline: item.baseline.tally, candidate: item.candidate.tally })) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
