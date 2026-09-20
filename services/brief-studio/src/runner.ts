import { contentHash } from '../../../src/domain/agent-context.js';
import { assembleBrief, evaluateBrief, MAX_INPUT_BYTES, stageRequest, schemas, type Stage } from './domain/pipeline.js';
import { BriefError, type BriefStore } from './store.js';
import type { Provider } from './provider.js';
export async function performStage(store: BriefStore, provider: Provider, id: string, stage: Stage) {
 const run = await store.run(id, true);
 const prior = await store.outputs(id);
 if (prior[stage]) return;
 const input = stageRequest(stage, run.source_context, prior);
 if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_INPUT_BYTES) throw new BriefError(422, 'input_too_large');
 if (!await store.reserve(id, stage, input)) throw new BriefError(409, 'uncertain_paid_call');
 const { output, usage } = await provider(stage, run.source_context, prior);
 await store.completeStep(id, stage, schemas[stage].parse(output), usage);
}
export async function finalizeRun(store: BriefStore, id: string) {
 const run = await store.run(id, true);
 if (run.brief) return;
 const brief = assembleBrief(run.source_context, await store.outputs(id), id, new Date().toISOString());
 const quality = evaluateBrief(brief, run.source_context);
 await store.update(id, { brief, brief_hash: await contentHash(brief), quality, status: quality.passed ? 'waiting_admin_review' : 'failed', error_code: quality.passed ? null : 'quality_failed' }, 'running');
 if (!quality.passed) throw new BriefError(422, 'quality_failed');
}
