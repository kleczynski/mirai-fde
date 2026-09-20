import type { InterviewSession } from '../domain/contract';
export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'thinking' | 'interrupted' | 'error';
export type VoiceEvent = { type: 'status'; status: VoiceStatus } | { type: 'message'; speaker: 'agent' | 'participant'; text: string; eventId?: string; source?: 'text' | 'elevenlabs' } | { type: 'ended' } | { type: 'error'; message: string };
export type AudioChannel = 'input' | 'output';
/** A pull-only bridge to the provider's existing audio graph. It never opens media devices. */
export interface VoiceEnergySource {
  getAudioEnergy(channel: AudioChannel): number;
}
export interface VoiceProvider {
  start(session: InterviewSession, emit: (event: VoiceEvent) => void): Promise<void>;
  stop(): Promise<void>;
  setMuted(muted: boolean): void;
  interrupt(): void;
  sendText(text: string): void;
}
