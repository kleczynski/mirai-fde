import { useEffect, useRef, useState } from 'react';
import { type InterviewSession, type Mode, type DiscoveryResult, DiscoverySchema } from '../domain/contract';
import { createSession, createTurn, questionFor, deriveInterviewProgress, nextAdaptiveQuestion, resolveTurnQuestionId } from '../domain/interview';
import { extractWithRules } from '../domain/extraction';
import { saveSession, loadSession, loadSessionById, deleteSession, authHeaders } from '../persistence/repository';
import { MockVoiceProvider } from '../voice/mock';
import { useVoiceEnergy } from '../voice/useVoiceEnergy';
import type { VoiceEnergySource, VoiceEvent, VoiceProvider, VoiceStatus } from '../voice/types';
export function useInterview() {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const current = useRef<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<'saved' | 'saving' | 'error'>('saved');
  const [error, setError] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [muted, setMuted] = useState(false);
  const [agentCompleted, setAgentCompleted] = useState(false);
  const provider = useRef<VoiceProvider | null>(null);
  const [energySource, setEnergySource] = useState<VoiceEnergySource | null>(null);
  const queue = useRef(Promise.resolve(true));
  const [config, setConfig] = useState({ voice: false, extraction: false });
  useEffect(() => {
    let alive = true;
    loadSession().then(s => { if (alive) { current.current = s; setSession(s); } }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    fetch('/api/config').then(r => r.ok ? r.json() : null).then(c => { if (c && alive) setConfig(c); }).catch(() => {});
    return () => { alive = false; setEnergySource(null); void provider.current?.stop(); };
  }, []);
  const persist = (value: InterviewSession): Promise<boolean> => {
    const snapshot = structuredClone(value); setSync('saving');
    const task = queue.current.then(async () => { try { await saveSession(snapshot); if (current.current?.revision === snapshot.revision) { setSync('saved'); setError(''); } return true; } catch (e) { setSync('error'); setError(e instanceof Error ? e.message : 'Zapis nie powiódł się.'); return false; } });
    queue.current = task; return task;
  };
  const update = (patch: Partial<InterviewSession>) => {
    if (!current.current) throw new Error('Brak sesji.');
    const value = { ...current.current, ...patch, revision: current.current.revision + 1 };
    current.current = value; setSession(value); return persist(value);
  };
  const onEvent = (event: VoiceEvent) => {
    if (event.type === 'status') { setVoiceStatus(event.status); return; }
    if (event.type === 'ended') {
      setEnergySource(null);
      if (current.current?.status === 'active') {
        setVoiceStatus('idle');
        setAgentCompleted(true);
        const interviewProgress = deriveInterviewProgress(current.current.turns, current.current.interviewProgress);
        void update({ interviewProgress: { ...interviewProgress, readyToFinish: true, phase: 'complete' } });
      }
      return;
    }
    if (event.type === 'error') { setEnergySource(null); setVoiceStatus('error'); setError(event.message); return; }
    const s = current.current;
    if (!s || s.status !== 'active' || !event.text.trim()) return;
    if (event.eventId && s.turns.some(t => t.providerEventId === event.eventId)) return;
    const turn = { ...createTurn(event.speaker, event.text.trim(), s), providerEventId: event.eventId ?? null };
    if (event.source) turn.source = event.source;
    turn.questionId = resolveTurnQuestionId(event.speaker, event.text, s.turns, s.interviewProgress);
    const turns = [...s.turns, turn];
    if (event.speaker === 'agent' && /(?:dzięki wielkie za rozmowę|dzięki, mam to|dziękuję za rozmowę.*mam pełen obraz|miłego dnia|mam już pełen obraz)/i.test(event.text)) {
      setTimeout(() => {
        if (current.current?.status === 'active') {
          setAgentCompleted(true);
        }
      }, 3500);
    }
    if (s.mode !== 'voice' && event.speaker === 'participant') {
      const index = Math.min(30, s.questionIndex + 1);
      if (s.mode === 'demo') {
        if (index < 10) turns.push(createTurn('agent', questionFor(index, turns), { ...s, questionIndex: index }));
        const interviewProgress = deriveInterviewProgress(turns, s.interviewProgress);
        void update({ turns, questionIndex: index, interviewProgress: index >= 10 ? { ...interviewProgress, readyToFinish: true, phase: 'complete' } : interviewProgress }).then(() => {
          if (index < 10 && provider.current instanceof MockVoiceProvider) provider.current.speak(questionFor(index, turns));
        });
      } else {
        const next = nextAdaptiveQuestion(turns, s.interviewProgress);
        if (next) turns.push(createTurn('agent', next.text, { ...s, questionIndex: index }, next.id));
        const interviewProgress = next?.progress ?? deriveInterviewProgress(turns, s.interviewProgress);
        void update({ turns, questionIndex: index, interviewProgress });
      }
    } else {
      const interviewProgress = event.speaker === 'participant' ? deriveInterviewProgress(turns, s.interviewProgress) : s.interviewProgress;
      void update({ turns, questionIndex: event.speaker === 'participant' ? Math.min(30, s.questionIndex + 1) : s.questionIndex, interviewProgress });
    }
  };
  async function connect(value: InterviewSession) {
    await provider.current?.stop(); setEnergySource(null); setError(''); setMuted(false);
    try {
      if (value.mode === 'voice') { const { ElevenLabsProvider } = await import('../voice/elevenlabs'); const nextProvider = new ElevenLabsProvider(); provider.current = nextProvider; setEnergySource(nextProvider); }
      else provider.current = new MockVoiceProvider(value.mode === 'demo');
      await provider.current.start(value, onEvent);
      if (provider.current instanceof MockVoiceProvider) { const last = value.turns.at(-1); if (last?.speaker === 'agent') provider.current.speak(last.text); }
    } catch (e) { setEnergySource(null); setVoiceStatus('error'); setError(e instanceof Error ? e.message : 'Nie udało się połączyć.'); }
  }
  async function start(mode: Mode, invitedId?: string, allowInvitedCreate = false): Promise<InterviewSession | null> {
    if (invitedId) {
      const existing = await loadSessionById(invitedId);
      if (existing) {
        current.current = existing; setSession(existing);
        if (existing.status === 'active') await connect(existing);
        return existing;
      }
      if (!allowInvitedCreate) throw new Error('Ta rozmowa nie jest już dostępna. Poproś o nowe zaproszenie.');
    }
    const s = createSession(mode);
    if (invitedId) s.id = invitedId;
    if (mode === 'demo') s.turns = [createTurn('agent', questionFor(0, []), s)];
    else if (mode === 'text') { const next = nextAdaptiveQuestion([], s.interviewProgress)!; s.turns = [createTurn('agent', next.text, s, next.id)]; }
    current.current = s; setSession(s);
    if (await persist(s)) { await connect(s); return s; }
    return null;
  }
  async function resume(mode?: Mode) {
    if (!current.current) return;
    if (!await update({ status: 'active', ...(mode ? { mode } : {}) })) return;
    if (current.current.mode !== 'voice' && current.current.turns.at(-1)?.speaker !== 'agent' && !current.current.interviewProgress.readyToFinish) {
      const next = current.current.mode === 'demo' ? { id: undefined, text: questionFor(current.current.questionIndex, current.current.turns) } : nextAdaptiveQuestion(current.current.turns, current.current.interviewProgress);
      if (next) await update({ turns: [...current.current.turns, createTurn('agent', next.text, current.current, next.id)] });
    }
    await connect(current.current);
  }
  async function pause() { await provider.current?.stop(); setEnergySource(null); setVoiceStatus('idle'); await update({ status: 'paused' }); }
  async function finish() {
    await provider.current?.stop(); provider.current = null; setEnergySource(null); setVoiceStatus('thinking');
    const checkpointSaved = await update({ status: 'review', completedAt: current.current?.completedAt ?? new Date().toISOString() });
    const s = current.current!;
    let result = s.result ?? extractWithRules(s);
    let extractionError = '';
    if (config.extraction && checkpointSaved && !s.result) {
      try {
        // Server-side this can take up to ~58s (see server/agent.ts computeModelExtraction)
        // and the hosting function itself is capped at maxDuration:60 (vercel.json) — this
        // client timeout must stay above that ceiling so the browser never gives up before
        // the server's own limit would have, but there is no point pushing it much further:
        // anything past 60s server-side has already been killed by the platform.
        const response = await fetch('/api/extract', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ sessionId: s.id }), signal: AbortSignal.timeout(65000) });
        if (!response.ok) throw new Error('Nie udało się wykonać analizy AI. Pokazujemy wnioski oparte na dosłownych odpowiedziach.');
        result = DiscoverySchema.parse(await response.json());
      } catch (e) { extractionError = e instanceof Error ? e.message : 'Analiza AI niedostępna. Użyto ekstrakcji regułowej.'; }
    }
    const saved = await update({ result, modelResult: s.modelResult ?? structuredClone(result) });
    if (extractionError && saved) setError(extractionError);
    setVoiceStatus('idle');
    return saved;
  }
  async function saveResult(result: DiscoveryResult) { return update({ result: DiscoverySchema.parse(result), status: 'completed' }); }
  function send(text: string) { try { if (!provider.current) throw new Error('Wznów połączenie przed wysłaniem odpowiedzi.'); provider.current.sendText(text); } catch (e) { setVoiceStatus('error'); setError(e instanceof Error ? e.message : 'Nie udało się wysłać odpowiedzi.'); } }
  function skip() {
    const s = current.current; if (!s || s.mode === 'voice' || s.interviewProgress.readyToFinish) return;
    const index = Math.min(30, s.questionIndex + 1); const turns = [...s.turns];
    if (s.mode === 'demo') {
      if (index < 10) turns.push(createTurn('agent', questionFor(index, turns), { ...s, questionIndex: index }));
      void update({ questionIndex: index, turns }); if (index < 10 && provider.current instanceof MockVoiceProvider) provider.current.speak(questionFor(index, turns));
    } else {
      const next = nextAdaptiveQuestion(turns, s.interviewProgress, [...turns].reverse().find(t => t.speaker === 'agent')?.questionId);
      if (next) turns.push(createTurn('agent', next.text, { ...s, questionIndex: index }, next.id));
      void update({ questionIndex: index, turns, interviewProgress: next?.progress ?? s.interviewProgress });
    }
  }
  function toggleMute() { provider.current?.setMuted(!muted); setMuted(!muted); }
  function interrupt() { provider.current?.interrupt(); setVoiceStatus('interrupted'); }
  async function remove() { await provider.current?.stop(); setEnergySource(null); await queue.current; if (current.current) await deleteSession(current.current.id); current.current = null; setSession(null); setError(''); setVoiceStatus('idle'); }
  async function retry() {
    if (!current.current) return false;
    const saved = await persist(current.current);
    if (saved && current.current.status === 'active' && !provider.current) await connect(current.current);
    return saved;
  }
  const voiceEnergy = useVoiceEnergy(energySource, voiceStatus, muted);
  return { session, loading, sync, error, setError, voiceStatus, voiceEnergy, muted, config, start, resume, pause, finish, saveResult, send, skip, toggleMute, interrupt, remove, retry, update, agentCompleted, setAgentCompleted };
}
