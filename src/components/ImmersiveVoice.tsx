import { FileText, LockKeyhole, Mic, MicOff, Pause, RotateCcw, Square, Volume2 } from 'lucide-react';
import type { VoiceStatus } from '../voice/types';

type Turn = { id: string; speaker: 'agent' | 'participant'; text: string };
type Props = {
  status: VoiceStatus;
  muted: boolean;
  paused: boolean;
  busy: boolean;
  captions: boolean;
  turns: Turn[];
  error?: string;
  sync: 'saved' | 'saving' | 'error';
  storage: 'local' | 'supabase';
  onMute(): void;
  onPause(): void;
  onResume(): void;
  onInterrupt(): void;
  onEnd(): void;
  onCaptions(): void;
};

export function ImmersiveVoice({ status, muted, paused, busy, captions, turns, error, sync, storage, onMute, onPause, onResume, onInterrupt, onEnd, onCaptions }: Props) {
  const recent = turns.slice(-2);
  const message = paused ? 'Rozmowa wstrzymana' : error || ({ connecting: 'Łączę z Mirai', listening: muted ? 'Mikrofon wyciszony' : 'Słucham', speaking: 'Mirai mówi', thinking: 'Mirai zastanawia się', interrupted: 'Masz głos', error: 'Połączenie przerwane', idle: 'Gotowy' }[status]);
  return <main className="immersive-voice" aria-label="Rozmowa głosowa">
    <div className="voice-presence" aria-live="polite"><span className={`voice-status voice-status-${status}`}><i/>{message}</span></div>
    {captions && <section className="voice-captions" aria-label="Ostatnie wypowiedzi">
      {recent.map(turn => <p key={turn.id} className={turn.speaker === 'agent' ? 'from-mirai' : 'from-user'}><span>{turn.speaker === 'agent' ? 'Mirai' : 'Ty'}</span>{turn.text}</p>)}
    </section>}
    <div className="voice-controls" aria-label="Sterowanie rozmową">
      <button className={muted ? 'voice-control is-active' : 'voice-control'} aria-label={muted ? 'Włącz mikrofon' : 'Wycisz mikrofon'} aria-pressed={muted} onClick={onMute}>{muted ? <MicOff/> : <Mic/>}<span>Mikrofon</span></button>
      {status === 'speaking' && <button className="voice-control" onClick={onInterrupt}><Volume2/><span>Przerwij</span></button>}
      <button className={captions ? 'voice-control is-active' : 'voice-control'} aria-pressed={captions} onClick={onCaptions}><FileText/><span>Napisy</span></button>
      {paused || status === 'error' ? <button className="voice-control" disabled={busy} onClick={onResume}><RotateCcw/><span>Wznów</span></button> : <button className="voice-control" disabled={busy} onClick={onPause}><Pause/><span>Przerwa</span></button>}
      <button className="voice-control voice-end" disabled={busy} onClick={onEnd}><Square/><span>Zakończ</span></button>
    </div>
    <div className={`voice-save-status sync-${sync}`} role="status"><LockKeyhole size={12}/>{sync === 'saving' ? 'Zapisuję rozmowę w bazie…' : sync === 'error' ? 'Rozmowa czeka na zapis' : storage === 'local' ? 'Zapis lokalny w tej przeglądarce' : 'Rozmowa zapisana w Supabase'}</div>
  </main>;
}
