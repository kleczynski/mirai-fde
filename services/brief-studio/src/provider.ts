import OpenAI from 'openai';
import { z } from 'zod';
import { redactSecrets, type AgentContext } from '../../../src/domain/agent-context.js';
import { MAX_INPUT_BYTES, MAX_OUTPUT_TOKENS, MODEL, schemas, stageRequest, type Stage, type Outputs } from './domain/pipeline.js';
export type Provider = (stage: Stage, source: AgentContext, prior: Outputs) => Promise<{ output: unknown; usage: { inputTokens: number; outputTokens: number; actualMicros: number } }>;
export function openAIProvider(apiKey: string, fetcher?: typeof fetch): Provider {
 const client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 0, ...(fetcher ? { fetch: fetcher } : {}) });
 return async (stage, source, prior) => {
  const request = stageRequest(stage, source, prior);
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_INPUT_BYTES) throw new Error('input_too_large');
  const response = await client.responses.create({ model: MODEL, store: false, max_output_tokens: MAX_OUTPUT_TOKENS,
   input: [{ role: 'system', content: request.system }, { role: 'user', content: JSON.stringify(request.data) }],
   text: { format: { type: 'json_schema', name: `brief_${stage}`, strict: true, schema: request.schema } },
  });
  if (response.status !== 'completed' || !response.output_text || !response.usage) throw new Error('provider_incomplete');
  const output = schemas[stage].parse(redactSecrets(JSON.parse(response.output_text)));
  const inputTokens = z.number().int().nonnegative().parse(response.usage.input_tokens);
  const outputTokens = z.number().int().nonnegative().parse(response.usage.output_tokens);
  const actualMicros = Math.ceil(inputTokens * .4 + outputTokens * 1.6);
  if (actualMicros > 40000) throw new Error('provider_cost_exceeded');
  return { output, usage: { inputTokens, outputTokens, actualMicros } };
 };
}
