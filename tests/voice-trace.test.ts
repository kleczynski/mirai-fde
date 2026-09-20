import { describe, expect, it } from 'vitest';
import { HttpError } from '../server/agent';
import { compactProviderTrace, getAdminVoiceTrace, resolveVoiceConversationId } from '../server/voice-trace';

const sessionId = 'bd3022d8-273c-42b6-80d3-63c60f03f1b7';
const runId = 'eb53896c-e98f-4a83-8baa-9ad38ff38e03';

describe('admin voice trace', () => {
  it('rejects unauthenticated requests before reading a provider conversation', async () => {
    await expect(getAdminVoiceTrace({ body: { sessionId, runId } })).rejects.toEqual(new HttpError(401, 'Wymagane logowanie administratora.'));
  });

  it('uses only a conversation ID already associated with this session and voice run', () => {
    const run = { id: runId, session_id: sessionId, kind: 'voice', configuration: { agentId: 'agent_test' }, telemetry: { providerConversationId: 'conv_test123' } };
    expect(resolveVoiceConversationId([run], sessionId, runId)).toEqual({ conversationId: 'conv_test123', expectedAgentId: 'agent_test' });
    expect(() => resolveVoiceConversationId([run], '2847ba38-de16-4f75-9d7d-e89e1c650c80', runId)).toThrow(/Nie znaleziono/);
    expect(() => resolveVoiceConversationId([{ ...run, telemetry: null }], sessionId, runId)).toThrow(/Brak identyfikatora/);
  });

  it('shows version, transcript and span timing without exposing audio or signed file URLs', () => {
    const trace = compactProviderTrace({
      conversation_id: 'conv_test123', agent_id: 'agent_test', status: 'done', branch_id: 'agtbrch_test', version_id: 'agtvrsn_test',
      transcript: [{ role: 'user', message: 'To wszystko, dzięki', time_in_call_secs: 5 }],
      otlp_traces: { resourceSpans: [{ scopeSpans: [{ spans: [{
        traceId: 'trace', spanId: 'span', name: 'elevenlabs.recv.agent_response', startTimeUnixNano: '10', endTimeUnixNano: '20',
        attributes: [
          { key: 'elevenlabs.agent.text', value: { stringValue: 'Dzięki, mam to.' } },
          { key: 'elevenlabs.audio.file_url', value: { stringValue: 'https://secret.example/audio' } },
          { key: 'elevenlabs.tool.parameters', value: { stringValue: 'sensitive' } },
          { key: 'elevenlabs.reasoning_content', value: { stringValue: 'private reasoning' } },
        ],
      }] }] }] },
    });
    expect(trace.versionId).toBe('agtvrsn_test');
    expect(trace.configurationStatus).toBe('known');
    expect(trace.spans[0].attributes).toEqual({ 'elevenlabs.agent.text': 'Dzięki, mam to.' });
    expect(JSON.stringify(trace)).not.toContain('https://secret.example');
    expect(JSON.stringify(trace)).not.toContain('private reasoning');
  });

  it('does not infer a version from a branch when provider details omit it', () => {
    const trace = compactProviderTrace({ conversation_id: 'conv_test123', agent_id: 'agent_test', status: 'done', branch_id: 'agtbrch_test', transcript: [] });
    expect(trace.versionId).toBeNull();
    expect(trace.configurationStatus).toBe('unknown');
  });
});
