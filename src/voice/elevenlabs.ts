import { Conversation } from '@elevenlabs/client';
import rawAudioProcessorUrl from '../../node_modules/@elevenlabs/client/worklets/rawAudioProcessor.js?url';
import audioConcatProcessorUrl from '../../node_modules/@elevenlabs/client/worklets/audioConcatProcessor.js?url';
import type { InterviewSession } from '../domain/contract';
import { authHeaders } from '../persistence/repository';
import type { AudioChannel, VoiceEnergySource, VoiceEvent, VoiceProvider } from './types';
export class ElevenLabsProvider implements VoiceProvider, VoiceEnergySource {
  private conversation: Awaited<ReturnType<typeof Conversation.startSession>> | null = null;
  private intentionalStop = false;
  private conversationId = '';
  private monitoringRunId: string | null = null;
  private emit: (event: VoiceEvent) => void = () => {};
  private typedEchoes: string[] = [];
  async start(session: InterviewSession, emit: (event: VoiceEvent) => void) {
    this.intentionalStop = false; this.emit = emit; this.typedEchoes = [];
    emit({ type: 'status', status: 'connecting' });
    const response = await fetch('/api/voice/token', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ sessionId: session.id }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Nie udało się połączyć z agentem. Spróbuj ponownie lub przejdź na tekst.');
    const payload = await response.json() as { signedUrl: string; runId?: string | null; dynamicVariables: Record<string, string | number | boolean>; promptOverride?: string | null };
    this.monitoringRunId = payload.runId ?? null;
    const telemetry = (event: 'connected' | 'reconnect' | 'interruption' | 'ended', conversationId?: string) => {
      if (!this.monitoringRunId) return;
      void authHeaders().then(headers => fetch('/api/voice/telemetry', { method: 'POST', headers, body: JSON.stringify({ sessionId: session.id, runId: this.monitoringRunId, event, providerConversationId: conversationId ?? (this.conversationId || null) }) })).catch(() => {});
    };
    this.conversation = await Conversation.startSession({
      signedUrl: payload.signedUrl, connectionType: 'websocket', dynamicVariables: payload.dynamicVariables,
      // Self-host ElevenLabs worklets through Vite so audio playback works with
      // the production CSP and does not depend on a remote or blob worklet URL.
      workletPaths: { rawAudioProcessor: rawAudioProcessorUrl, audioConcatProcessor: audioConcatProcessorUrl },
      // Prompt override is only a bootstrap option. Production keeps the reviewed
      // base prompt on the private agent and injects bounded dynamic variables.
      ...(payload.promptOverride ? { overrides: { agent: { prompt: { prompt: payload.promptOverride }, language: 'pl' as const } } } : {}),
      onConnect: ({ conversationId }) => { this.conversationId = conversationId; telemetry('connected', conversationId); emit({ type: 'status', status: 'listening' }); },
      onDisconnect: details => { telemetry('ended'); if (!this.intentionalStop && details.reason === 'agent') { emit({ type: 'ended' }); return; } if (!this.intentionalStop) emit({ type: 'error', message: 'Połączenie przerwane. Zapisane odpowiedzi są bezpieczne. Połącz ponownie, aby kontynuować.' }); },
      onError: () => emit({ type: 'error', message: 'Wystąpił problem z rozmową głosową. Połącz ponownie lub kontynuuj tekstowo.' }),
      onModeChange: ({ mode }) => { if (mode === 'listening') this.conversation?.setVolume({ volume: 1 }); emit({ type: 'status', status: mode === 'speaking' ? 'speaking' : 'listening' }); },
      onInterruption: () => { telemetry('interruption'); emit({ type: 'status', status: 'interrupted' }); },
      onMessage: ({ message, role, event_id }) => {
        if (role === 'user' && this.typedEchoes[0] === message) { this.typedEchoes.shift(); return; }
        if (role === 'agent') this.typedEchoes = [];
        emit({ type: 'message', speaker: role === 'user' ? 'participant' : 'agent', text: message, source: 'elevenlabs', eventId: event_id === undefined ? undefined : `${this.conversationId}:${role}:${event_id}` });
      },
    });
  }
  async stop() { this.intentionalStop = true; await this.conversation?.endSession(); this.conversation = null; }
  getAudioEnergy(channel: AudioChannel) {
    // These calls read the SDK's existing input/output analysers. They do not
    // request another microphone stream and do not retain or transmit audio.
    if (!this.conversation?.isOpen()) return 0;
    const value = channel === 'input' ? this.conversation.getInputVolume() : this.conversation.getOutputVolume();
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }
  setMuted(muted: boolean) { this.conversation?.setMicMuted(muted); }
  interrupt() {
    this.conversation?.sendUserActivity();
    this.conversation?.setVolume({ volume: 0 });
    setTimeout(() => { if (this.conversation?.isOpen()) this.conversation.setVolume({ volume: 1 }); }, 200);
  }
  sendText(text: string) {
    if (!this.conversation?.isOpen()) throw new Error('Połączenie nie jest aktywne. Połącz ponownie.');
    this.conversation.setVolume({ volume: 1 }); this.conversation.sendUserMessage(text);
    this.typedEchoes.push(text); this.emit({ type: 'message', speaker: 'participant', text, source: 'text', eventId: crypto.randomUUID() });
  }
  restoreVolume() { this.conversation?.setVolume({ volume: 1 }); }
}
