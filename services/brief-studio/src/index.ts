import type { BuildBrief } from './domain/contract.js';
import { BriefPipelineWorkflow, type JsonValue } from './workflows/brief-pipeline.js';

// Cloudflare requires the Workflow class to be exported from the Worker's
// main module (see wrangler.toml `main`), even though the fetch handler
// below never imports it directly by name beyond triggering it via the
// `BRIEF_PIPELINE` binding.
export { BriefPipelineWorkflow };

/**
 * Node 2 ("Brief Studio") HTTP entrypoint — build-plan.md step 2 skeleton.
 *
 * Accepts exactly one request shape: `POST /runs`. Kicks off one
 * BriefPipelineWorkflow instance and returns its `runId` immediately
 * (`202 Accepted`; the Workflow keeps running after the response is sent).
 *
 * `runId` here is the same field documented as `BuildBrief.runId` in
 * ../domain/contract.ts ("brief_runs.id ... assigned when the Workflow run
 * is created"): a UUID that identifies both the eventual mirai.build-brief.v1
 * document and the underlying Workflow instance. This handler is what
 * assigns it, by using it as the Workflow instance ID.
 *
 * No OpenAI calls, no Supabase, no admin JWT/`MIRAI_ADMIN_EMAILS` check yet
 * — those land in build-plan.md steps 3, 6, and 7. This Worker is not
 * reachable by end users today; the panel's `api/admin/*` proxy (step 7)
 * is where the real access boundary will sit, same as the rest of
 * `/api/admin/*` today.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== '/runs') {
      return new Response('Not Found', { status: 404 });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
    }

    let input: JsonValue;
    try {
      input = await request.json<JsonValue>();
    } catch {
      return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }

    const runId: BuildBrief['runId'] = crypto.randomUUID();

    try {
      await env.BRIEF_PIPELINE.create({ id: runId, params: { input } });
    } catch (error) {
      // Explicit try/catch with a structured error response rather than
      // letting the runtime's default error page leak internals (see
      // workers-best-practices skill). Not expected in practice — runId is
      // a fresh crypto.randomUUID(), so instance-id collisions are not the
      // realistic failure mode here — but a misconfigured/unavailable
      // Workflow binding is a real possibility this skeleton should surface
      // clearly instead of silently 500-ing.
      console.error('Failed to create BriefPipelineWorkflow instance', error);
      return Response.json({ error: 'Failed to start the build-brief pipeline' }, { status: 502 });
    }

    return Response.json({ runId, status: 'queued' } satisfies { runId: BuildBrief['runId']; status: 'queued' }, {
      status: 202,
    });
  },
} satisfies ExportedHandler<Env>;
