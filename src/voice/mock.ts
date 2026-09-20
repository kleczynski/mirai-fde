import type { InterviewSession } from '../domain/contract';
import type { VoiceEvent, VoiceProvider } from './types';
// The mock never captures speech. Text entered by the participant remains the source of truth.
export class MockVoiceProvider implements VoiceProvider {
  private emit: (event: VoiceEvent) => void = () => {};
  private audio = false;
  constructor(audio = false) { this.audio = audio; }
  async start(_session: InterviewSession, emit: (event: VoiceEvent) => void) { this.emit = emit; emit({ type: 'status', status: 'listening' }); }
  async stop() { this.interrupt(); }
  setMuted(_muted: boolean) {}
  interrupt() { if ('speechSynthesis' in window) speechSynthesis.cancel(); this.emit({ type: 'status', status: 'listening' }); }
  sendText(text: string) { this.emit({ type: 'message', speaker: 'participant', text }); }
  speak(text: string) {
    if (!this.audio || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'pl-PL'; utterance.rate = .95;
    utterance.onstart = () => this.emit({ type: 'status', status: 'speaking' });
    utterance.onend = utterance.onerror = () => this.emit({ type: 'status', status: 'listening' });
    speechSynthesis.speak(utterance);
  }
}
