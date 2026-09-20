import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { BriefStore, serviceClient } from '../store.js';
import { openAIProvider } from '../provider.js';
import { performStage, finalizeRun } from '../runner.js';
export type BriefPipelineParams = { runId: string };
export class BriefPipelineWorkflow extends WorkflowEntrypoint<Env, BriefPipelineParams> {
 async run(event: WorkflowEvent<BriefPipelineParams>, step: WorkflowStep) {
  const id = event.payload.runId;
  const store = new BriefStore(serviceClient(this.env));
  try {
   for (const name of ['audit', 'opportunity', 'integration', 'author', 'critic'] as const) {
    await step.do(name, { retries: { limit: 0, delay: '1 second' }, timeout: '2 minutes' }, async () => {
     await performStage(store, openAIProvider(this.env.OPENAI_API_KEY), id, name);
    });
   }
   const needsRevision = await step.do('revision-needed', async () => {
    await store.run(id, true);
    return Boolean((await store.outputs(id)).critic?.findings.length);
   });
   if (needsRevision) await step.do('revision', { retries: { limit: 0, delay: '1 second' }, timeout: '2 minutes' }, async () => {
    await performStage(store, openAIProvider(this.env.OPENAI_API_KEY), id, 'revision');
   });
   await step.do('save-final-brief', async () => { await finalizeRun(store, id); });
   await step.waitForEvent('admin-review', { type: 'admin-review', timeout: '30 days' });
   await step.do('confirm-review', async () => {
    const run = await store.run(id, true);
    if (!run.decision) throw new NonRetryableError('review_not_recorded');
   });
   return { runId: id };
  } catch {
   await step.do('record-failure', async () => {
    const { error } = await store.db.from('brief_runs').update({ status: 'failed', error_code: 'pipeline_failed_or_expired' }).eq('id', id).in('status', ['queued', 'running', 'waiting_admin_review']);
    if (error) throw new Error('failure_save_failed');
   });
   throw new NonRetryableError('pipeline_failed_or_expired');
  }
 }
}
