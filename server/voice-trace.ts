import { z } from 'zod';
import { HttpError, type ApiInput } from './agent.js';
import { getAdminSession } from './admin.js';

const RequestSchema = z.object({ sessionId: z.uuid(), runId: z.uuid() });
const VoiceRunSchema = z.object({
  id: z.uuid(), session_id: z.uuid(), kind: z.literal('voice'),
  configuration: z.object({ agentId: z.string().nullable().optional() }).passthrough(),
  telemetry: z.object({ providerConversationId: z.string().nullable().optional(), conversationId: z.string().nullable().optional() }).nullable(),
}).passthrough();
const ProviderSchema = z.object({
  conversation_id: z.string(), agent_id: z.string(), status: z.string(),
  branch_id: z.string().nullable().optional(), version_id: z.string().nullable().optional(),
  transcript: z.array(z.object({ role: z.string(), message: z.string().nullable().optional(), time_in_call_secs: z.number().nullable().optional(), interrupted: z.boolean().optional() }).passthrough()).default([]),
  otlp_traces: z.object({ resourceSpans: z.array(z.unknown()).default([]) }).passthrough().nullable().optional(),
}).passthrough();

const visibleAttributes = new Set([
  'elevenlabs.conversation_id', 'elevenlabs.source', 'elevenlabs.user.text',
  'elevenlabs.agent.text', 'elevenlabs.tool.name',
  'elevenlabs.tool.status', 'elevenlabs.turn.index',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function attributeValue(value: unknown): string | number | boolean | null {
  const entry = record(value);
  if (!entry) return null;
  for (const key of ['stringValue', 'intValue', 'doubleValue', 'boolValue']) {
    const scalar = entry[key];
    if (typeof scalar === 'string' || typeof scalar === 'number' || typeof scalar === 'boolean') return typeof scalar === 'string' ? scalar.slice(0, 4_000) : scalar;
  }
  return null;
}

/** Only text and timing needed for QA. Signed file URLs, audio and tool payloads never leave this endpoint. */
export function compactProviderTrace(payload: unknown) {
  const data = ProviderSchema.parse(payload);
  const spans: Array<Record<string, unknown>> = [];
  let totalSpans = 0;
  for (const resource of data.otlp_traces?.resourceSpans ?? []) {
    for (const scope of Array.isArray(record(resource)?.scopeSpans) ? record(resource)!.scopeSpans as unknown[] : []) {
      for (const raw of Array.isArray(record(scope)?.spans) ? record(scope)!.spans as unknown[] : []) {
        const span = record(raw);
        if (!span) continue;
        totalSpans += 1;
        if (spans.length >= 500) continue;
        const attributes: Record<string, string | number | boolean> = {};
        for (const rawAttribute of Array.isArray(span.attributes) ? span.attributes : []) {
          const attribute = record(rawAttribute);
          if (!attribute || typeof attribute.key !== 'string' || !visibleAttributes.has(attribute.key)) continue;
          const value = attributeValue(attribute.value);
          if (value !== null) attributes[attribute.key] = value;
        }
        spans.push({
          traceId: typeof span.traceId === 'string' ? span.traceId : null,
          spanId: typeof span.spanId === 'string' ? span.spanId : null,
          parentSpanId: typeof span.parentSpanId === 'string' ? span.parentSpanId : null,
          name: typeof span.name === 'string' ? span.name : 'unknown',
          startTimeUnixNano: typeof span.startTimeUnixNano === 'string' ? span.startTimeUnixNano : null,
          endTimeUnixNano: typeof span.endTimeUnixNano === 'string' ? span.endTimeUnixNano : null,
          status: record(span.status)?.code ?? null,
          attributes,
        });
      }
    }
  }
  return {
    conversationId: data.conversation_id,
    agentId: data.agent_id,
    status: data.status,
    branchId: data.branch_id ?? null,
    versionId: data.version_id ?? null,
    configurationStatus: data.version_id ? 'known' as const : 'unknown' as const,
    transcript: data.transcript.slice(0, 200).map(turn => ({
      role: turn.role, message: turn.message?.slice(0, 8_000) ?? null,
      timeInCallSecs: turn.time_in_call_secs ?? null, interrupted: turn.interrupted ?? false,
    })),
    spans,
    truncated: data.transcript.length > 200 || totalSpans > 500,
    source: 'elevenlabs-conversation-api' as const,
  };
}

export function resolveVoiceConversationId(runs: unknown[], sessionId: string, runId: string) {
  const raw = runs.find(item => record(item)?.id === runId);
  if (!raw) throw new HttpError(404, 'Nie znaleziono uruchomienia głosowego.');
  const parsed = VoiceRunSchema.safeParse(raw);
  if (!parsed.success || parsed.data.session_id !== sessionId) throw new HttpError(404, 'Nie znaleziono uruchomienia głosowego.');
  const conversationId = parsed.data.telemetry?.providerConversationId ?? parsed.data.telemetry?.conversationId;
  if (!conversationId || !/^conv_[A-Za-z0-9]+$/.test(conversationId)) throw new HttpError(409, 'Brak identyfikatora rozmowy u dostawcy.');
  return { conversationId, expectedAgentId: parsed.data.configuration.agentId ?? null };
}

export async function getAdminVoiceTrace(input: ApiInput) {
  const { sessionId, runId } = RequestSchema.parse(input.body);
  const detail = await getAdminSession({ ...input, body: { sessionId } });
  const { conversationId, expectedAgentId } = resolveVoiceConversationId(detail.runs, sessionId, runId);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new HttpError(503, 'Odczyt śladu ElevenLabs nie jest skonfigurowany.');
  const url = new URL(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`);
  url.searchParams.set('format', 'opentelemetry');
  const response = await fetch(url, { headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new HttpError(502, 'Nie udało się pobrać śladu rozmowy od dostawcy.');
  const trace = compactProviderTrace(await response.json());
  if (trace.conversationId !== conversationId || expectedAgentId && trace.agentId !== expectedAgentId) throw new HttpError(502, 'Dostawca zwrócił dane innej rozmowy.');
  return { sessionId, runId, ...trace };
}
