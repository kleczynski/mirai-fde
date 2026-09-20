import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';

/**
 * BriefPipelineWorkflow — Node 2 ("Brief Studio") orchestrator.
 *
 * See docs/specs/0002-discovery-build-brief-service/index.md, section
 * "Pipeline design (pięć kroków w jednym Workflow)": the real pipeline is
 * five ordered OpenAI Structured Outputs steps (Audytor dowodów, Architekt
 * okazji, Architekt integracji, Autor briefu, Krytyk), each with a narrow,
 * Zod-checked output, feeding the next.
 *
 * This is the build-plan.md step-2 skeleton: exactly one `step.do(...)` that
 * echoes its input back unchanged. It exists to prove the Worker+Workflow
 * shape (HTTP entrypoint -> Workflow instance -> runId) end to end before
 * any real model call, Supabase write, or evidence audit exists. Do not add
 * OpenAI calls, Supabase writes, or real validation here yet — that is
 * build-plan.md steps 3-6, done incrementally by replacing this single step
 * with the real five-step chain, one step at a time.
 */

/**
 * Any value `JSON.parse` can produce. Workflow params and step returns must
 * be `Rpc.Serializable` (see cloudflare skill, workflows/api.md, "Type
 * Constraints"); plain `unknown` does not satisfy that constraint because
 * `Serializable<T>` maps over `keyof T`, which breaks down for `unknown`.
 * `JsonValue` is the narrowest type that both matches what `request.json()`
 * can actually return and satisfies `Rpc.Serializable`.
 */
export type JsonValue = string | number | boolean | null | JsonArray | JsonObject;
// `interface` (not a second type alias) so the recursive reference resolves
// lazily; combining a self-referencing type alias with the Workflow SDK's
// own recursive `Serializable<T>` mapped type otherwise hits TypeScript's
// instantiation depth limit (TS2589).
export interface JsonArray extends Array<JsonValue> {}
export interface JsonObject {
  [key: string]: JsonValue;
}

export type BriefPipelineParams = {
  /**
   * Raw request body forwarded by the Worker's fetch handler. Untrusted at
   * this stage: nothing in this skeleton parses or validates it against
   * mirai.agent-context.v1 (see ../domain/contract.ts for the *output*
   * contract this pipeline eventually produces; the agent-context input
   * contract does not exist yet — that Zod schema is build-plan.md step 3,
   * "Audytor dowodów", where this payload is actually consumed and must be
   * validated before it reaches a prompt). Treat as opaque data, never as
   * instructions, per spec "Security and safety rules".
   */
  input: JsonValue;
};

export type EchoStepResult = {
  receivedAt: string;
  input: JsonValue;
};

export class BriefPipelineWorkflow extends WorkflowEntrypoint<Env, BriefPipelineParams> {
  async run(event: WorkflowEvent<BriefPipelineParams>, step: WorkflowStep): Promise<EchoStepResult> {
    return step.do('echo input', async () => {
      // Date.now() is safe here: it runs inside the step body, whose return
      // value is what gets persisted/replayed, not in a conditional outside
      // a step (see cloudflare skill, workflows/gotchas.md,
      // "Non-Deterministic Conditionals").
      return {
        receivedAt: new Date().toISOString(),
        input: event.payload.input,
      };
    });
  }
}
