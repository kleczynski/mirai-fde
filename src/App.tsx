import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Check, ChevronRight, Clock3, Download, FileText, Headphones, Keyboard, LockKeyhole, Mic, MicOff, Pause, Play, RotateCcw, ShieldCheck, Square, Subtitles, Trash2, Volume2, X } from 'lucide-react';
import { Scene } from './components/Scene';
import { ImmersiveVoice } from './components/ImmersiveVoice';
import { Review, downloadResult } from './components/Review';
import { useInterview } from './lib/useInterview';
import { checkMicrophone } from './voice/audio';
import { demoAnswers, questions, topics } from './domain/interview';
import type { Mode } from './domain/contract';
import { Captcha } from './persistence/Captcha';
import { authenticate, captchaRequired, claimInvitation, getCompleteSessionResult, storageKind } from './persistence/repository';
import { AdminControlPlane } from './components/AdminControlPlane';
type Screen = 'landing' | 'consent' | 'interview' | 'review' | 'thanks';
type Info = 'how' | 'privacy' | 'delete' | 'end' | null;
const statusLabels = { idle: 'Gotowy, kiedy Ty jesteś', connecting: 'Łączę z Mirai', listening: 'Słucham', speaking: 'Mówię', thinking: 'Zastanawiam się', interrupted: 'Masz głos', error: 'Połączenie przerwane' };
export default function App() {
  if (typeof window !== 'undefined' && window.location.pathname === '/admin') return <AdminControlPlane/>;
  const inviteToken = typeof window !== 'undefined' && window.location.pathname.startsWith('/invite/') ? window.location.pathname.slice('/invite/'.length) : null;
  const invalidInviteToken = inviteToken !== null && !/^[A-Za-z0-9_-]{43}$/.test(inviteToken);
  const interview = useInterview(); const { session, voiceStatus, voiceEnergy, sync, error } = interview;
  const [screen, setScreen] = useState<Screen>('landing');
  const [info, setInfo] = useState<Info>(null);
  const [mode, setMode] = useState<Mode>('voice');
  const [consent, setConsent] = useState(false);
  const [captchaReady, setCaptchaReady] = useState(!captchaRequired);
  const [startProgress, setStartProgress] = useState<string | null>(null);
  const [micModal, setMicModal] = useState(false);
  const [captions, setCaptions] = useState(true); const [transcript, setTranscript] = useState(false);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closingReason, setClosingReason] = useState<'user' | 'agent'>('user');
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0); const dialog = useRef<HTMLDialogElement>(null);
  const headingFocus = useRef<HTMLDivElement>(null);
  const previousPain = useRef<string | null>(null); const [insight, setInsight] = useState(false);
  const active = screen === 'interview' && session?.status === 'active';
  useEffect(() => { if (info) dialog.current?.showModal(); else dialog.current?.close(); }, [info]);
  useEffect(() => { headingFocus.current?.focus(); }, [screen]);
  useEffect(() => {
    if (sync === 'saved' && active) {
      setStatusToast('Zapisano w bazie');
      const timer = setTimeout(() => setStatusToast(null), 2400);
      return () => clearTimeout(timer);
    }
  }, [sync, active]);
  useEffect(() => {
    if (interview.agentCompleted && screen === 'interview' && !busy && !closing) {
      void run(async () => {
        setClosingReason('agent');
        await end();
      });
    }
  }, [interview.agentCompleted, screen, busy, closing]);
  useEffect(() => { if (screen !== 'interview' || session?.status !== 'active') return; setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000))); const timer = setInterval(() => setElapsed(v => v + 1), 1000); return () => clearInterval(timer); }, [screen, session?.status]);
  useEffect(() => {
    const pain = session?.interviewProgress.coverage.pain;
    if (!pain) return;
    if (previousPain.current === null) { previousPain.current = pain; return; }
    previousPain.current = pain;
    if (pain !== 'covered') return;
    setInsight(true); const timer = window.setTimeout(() => setInsight(false), 2200);
    return () => window.clearTimeout(timer);
  }, [session?.interviewProgress.coverage.pain]);
  const lastCaption = session?.turns.filter(t => t.speaker === 'agent').at(-1)?.text ?? 'Za chwilę rozpoczniemy rozmowę.';
  const questionPulse = session?.turns.filter(t => t.speaker === 'agent').at(-1)?.id ?? 'landing';
  const phase = session?.interviewProgress.phase ?? 'orient';
  const phaseIndex = { orient: 0, discover: 1, deepen: 2, validate: 3, complete: 3 }[phase];
  const demoTopicIndex = questions[Math.min(session?.questionIndex ?? 0, 9)].topic;
  const topicIndex = session?.mode === 'demo' ? demoTopicIndex : phaseIndex;
  const interviewReady = session ? (session.mode === 'demo' ? session.questionIndex >= 10 : session.interviewProgress.readyToFinish) : false;
  const sceneState = insight ? 'insight' : screen === 'review' || screen === 'thanks' ? 'complete' : screen === 'interview' ? voiceStatus === 'connecting' ? 'thinking' : voiceStatus : 'idle';
  const go = (next: Screen) => { setScreen(next); window.scrollTo(0, 0); };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { interview.setError(e instanceof Error ? e.message : 'Nie udało się wykonać tej operacji. Spróbuj ponownie.'); } finally { setBusy(false); } };
  function prepare(nextMode?: Mode) { setMode(nextMode ?? (interview.config.voice ? 'voice' : 'text')); setConsent(false); setCaptchaReady(!captchaRequired); go('consent'); }
  async function begin() {
    setStartProgress('Inicjalizuję bezpieczną sesję…');
    try {
      const [_, invitation] = await Promise.all([
        authenticate(),
        inviteToken ? claimInvitation(inviteToken) : Promise.resolve(null),
      ]);
      if (mode === 'voice') {
        setStartProgress('Sprawdzam dostęp do mikrofonu…');
        try {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('Brak wsparcia dla mikrofonu');
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
        } catch {
          setStartProgress(null);
          setMicModal(true);
          return;
        }
      }
      setStartProgress('Łączę z Mirai…');
      const started = await interview.start(mode, invitation?.sessionId, invitation?.canCreate);
      if (started) go(started.status === 'completed' ? 'thanks' : started.status === 'review' ? 'review' : 'interview');
    } finally {
      setStartProgress(null);
    }
  }
  async function end() {
    setInfo(null); setClosing(true);
    try { if (await interview.finish()) go('review'); }
    finally { setClosing(false); }
  }
  function submit() { if (!text.trim() || !active || busy || interviewReady) return; interview.send(text.trim()); setText(''); }
  async function resume() {
    if (session?.status === 'completed') { go('thanks'); return; }
    if (session?.status === 'review') { if (!session.result) await interview.finish(); go('review'); return; }
    go('interview'); await interview.resume();
  }
  const immersiveVoice = screen === 'interview' && session?.mode === 'voice';
  const sceneScreen = screen === 'review' || screen === 'thanks' ? 'thanks' : immersiveVoice ? 'voice' : screen;
  return <div className={`app screen-${screen}${immersiveVoice ? ' voice-active' : ''}`} data-phase={phase} data-signal={sceneState} data-question-pulse={questionPulse}>
    <a className="skip-link" href="#main">Przejdź do treści</a>
    <header className="header">
      <button className="wordmark" onClick={() => { if (active) void run(async () => { await interview.pause(); go('landing'); }); else go('landing'); }} aria-label="Mirai — strona główna">mir<span className="wordmark-ai">ai</span></button>
      <nav aria-label="Nawigacja">{screen === 'landing' || screen === 'thanks' ? <><button onClick={() => setInfo('how')}>Jak to działa</button><button onClick={() => setInfo('privacy')}>Prywatność</button></> : <span className="header-context">Discovery Interview</span>}</nav>
    </header>
    <Scene state={sceneState} screen={sceneScreen} questionPulse={questionPulse} energy={voiceEnergy}/>
    <div className="ground-line" aria-hidden="true"/>
    <div id="main" ref={headingFocus} tabIndex={-1} className="page-focus">
      {screen === 'landing' && <main className="landing">
        <div className="landing-content"><span className="section-label">Wywiad głosowy</span><h1>Rozmowa,<br/>która prowadzi<br/>dalej.</h1><p className="landing-description">Opowiedz o swojej pracy. Odkryjmy razem,<br className="desktop-break"/> co można uprościć.</p>
          {invalidInviteToken && <p className="invite-error" role="alert">Ten link zaproszenia jest niepoprawny. Poproś o nowy link.</p>}
          <button className="outline-button start-button" disabled={interview.loading || invalidInviteToken} onClick={() => inviteToken ? prepare() : session ? void run(resume) : prepare()}>{interview.loading ? 'Chwileczkę…' : inviteToken ? 'Otwórz zaproszenie' : session ? session.status === 'completed' ? 'Zobacz zapisany wynik' : 'Wróć do swojej rozmowy' : 'Rozpocznij rozmowę'}<ChevronRight size={16}/></button>
          <div className="landing-trust"><span>Rozmawiasz z AI. Ty decydujesz, co zostaje zapisane.</span><button onClick={() => setInfo('privacy')}>Jak dbamy o Twoje odpowiedzi</button></div>
          {session && !inviteToken && <button className="text-button restart-link" onClick={() => setInfo('delete')}>Usuń tę sesję i zacznij od nowa</button>}
        </div>
        <div className="landing-foot"><span><Clock3 size={13}/> Około 10–15 minut</span><span>Bez przygotowań. W Twoim tempie.</span><span className="edition">Discovery Interview / 01</span></div>
      </main>}
      {screen === 'consent' && <main className="consent-page">
        <button className="back-button" onClick={() => go('landing')}><ArrowLeft size={15}/> Wróć</button>
        <span className="section-label">Rozmowa o Twojej pracy</span><h1>Zanim zaczniemy.</h1><p className="page-intro">Kilka spokojnych minut o Twojej codzienności.<br/>Wystarczy jedno kliknięcie, aby rozpocząć.</p>
        <fieldset className="mode-picker"><legend>Wybierz tryb rozmowy</legend><div><button type="button" className={mode === 'voice' ? 'chosen' : ''} disabled={!interview.config.voice} aria-pressed={mode === 'voice'} onClick={() => setMode('voice')}><Mic size={17}/> Głosowo {!interview.config.voice && <span>Wymaga konfiguracji</span>}</button><button type="button" className={mode === 'text' ? 'chosen' : ''} aria-pressed={mode === 'text'} onClick={() => setMode('text')}><Keyboard size={17}/> Tekstowo</button></div></fieldset>
        <label className="consent-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>Wiem, że rozmawiam z AI. Zgadzam się na zapis transkrypcji i analizę odpowiedzi przez wskazane usługi. Mogę później usunąć sesję. <button type="button" onClick={() => setInfo('privacy')}>Szczegóły prywatności</button></span></label>
        <Captcha onReady={setCaptchaReady}/>
        <button className="primary-button" disabled={!consent || !captchaReady || busy} onClick={() => void run(begin)}>Rozpocznij wywiad<ChevronRight size={17}/></button>
      </main>}
      {screen === 'interview' && immersiveVoice && <ImmersiveVoice status={voiceStatus} muted={interview.muted} paused={session?.status === 'paused'} busy={busy} captions={captions} turns={session?.turns ?? []} error={error || undefined} sync={sync} storage={storageKind} onMute={interview.toggleMute} onPause={() => void run(interview.pause)} onResume={() => void run(() => interview.resume())} onInterrupt={interview.interrupt} onEnd={() => setInfo('end')} onCaptions={() => setCaptions(value => !value)}/>} 
      {screen === 'interview' && !immersiveVoice && <main className="interview-page">
        <div className="interview-top"><span className="section-label">{topics[topicIndex]}</span><span className="session-time">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span></div>
        <div className="conversation-content"><div className={`status-line status-${voiceStatus}`} role="status"><i/>{session?.status === 'paused' ? 'Rozmowa wstrzymana' : interviewReady ? 'Mamy przestrzeń na kolejny krok' : session?.mode === 'text' && voiceStatus === 'listening' ? 'Czekam na Twoją odpowiedź' : statusLabels[voiceStatus]}</div>
          {captions && <h1 key={questionPulse} data-arrival={questionPulse} className="live-caption" aria-live="polite">{interviewReady ? 'Dziękuję. Przyjrzyjmy się temu, co jest dla Ciebie najważniejsze.' : lastCaption}</h1>}
          <p className="conversation-hint">{session?.mode === 'voice' ? interview.muted ? 'Mikrofon wyciszony. Włącz go, gdy zechcesz wrócić.' : 'Mów po swojemu. Możesz mi przerwać.' : session?.mode === 'demo' ? 'Tryb demonstracyjny · mikrofon wyłączony' : 'Tryb tekstowy · Twoje tempo'}</p>
          {session?.status === 'paused' || voiceStatus === 'error' ? <div className="reconnect"><button className="primary-button" disabled={busy} onClick={() => void run(() => interview.resume())}><RotateCcw size={17}/> {session?.status === 'paused' ? 'Wznów rozmowę' : 'Połącz ponownie'}</button>{session?.mode === 'voice' && <button className="text-button" onClick={() => void run(() => interview.resume('text'))}>Kontynuuj tekstowo</button>}</div> : session && !interviewReady ? <div className="answer-area"><form onSubmit={e => { e.preventDefault(); submit(); }}><label className="sr-only" htmlFor="answer">Twoja odpowiedź</label><textarea id="answer" placeholder={session.mode === 'voice' ? 'Możesz też napisać…' : 'Napisz swoją odpowiedź…'} maxLength={8000} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} disabled={!active || busy}/><button type="submit" aria-label="Wyślij odpowiedź" disabled={!text.trim() || !active || busy}><ArrowUp size={20}/></button></form><div className="answer-helper"><span>Enter, aby wysłać · Shift + Enter, aby dodać wiersz</span>{session.mode !== 'voice' && <button className="text-button" onClick={interview.skip}>Pomiń pytanie</button>}{session.mode === 'demo' && <button className="text-button" onClick={() => setText(demoAnswers[Math.min(session.questionIndex, demoAnswers.length - 1)])}>Przykład: stolarz</button>}</div></div> : <button className="primary-button" disabled={busy} onClick={() => void run(end)}>{busy ? 'Przygotowuję podsumowanie…' : 'Zobacz podsumowanie'}<ChevronRight size={17}/></button>}
        </div>
        <div className="interview-bottom"><div className="topic-progress" aria-label={`Temat ${topicIndex + 1} z 4`}>{topics.map((topic, i) => <span key={topic} className={i <= topicIndex ? 'reached' : ''}/>) }<small>Temat {topicIndex + 1} z 4</small></div>
          <div className="conversation-controls">{session?.mode === 'voice' && <button className={interview.muted ? 'control is-active' : 'control'} aria-label={interview.muted ? 'Włącz mikrofon' : 'Wycisz mikrofon'} aria-pressed={interview.muted} onClick={interview.toggleMute}>{interview.muted ? <MicOff/> : <Mic/>}<span>Mikrofon</span></button>}
            {(voiceStatus === 'speaking' || voiceStatus === 'interrupted') && <button className="control" onClick={interview.interrupt}><Volume2/><span>Przerwij</span></button>}
            <button className={`control ${captions ? 'is-active' : ''}`} aria-pressed={captions} onClick={() => setCaptions(!captions)}><Subtitles/><span>Napisy</span></button><button className={`control ${transcript ? 'is-active' : ''}`} aria-pressed={transcript} onClick={() => setTranscript(!transcript)}><FileText/><span>Transkrypcja</span></button><span className="control-divider"/><button className="control" disabled={busy || !active} onClick={() => void run(interview.pause)}><Pause/><span>Przerwa</span></button><button className="control end-control" disabled={busy} onClick={() => setInfo('end')}><Square size={16}/><span>Zakończ</span></button></div>
          <div className="save-status" role="status"><LockKeyhole size={12}/>{sync === 'saving' ? 'Zapisuję odpowiedzi…' : sync === 'error' ? 'Odpowiedzi czekają na zapis' : storageKind === 'local' ? 'Zapis lokalny w tej przeglądarce' : 'Odpowiedzi zapisane w Supabase'}</div>
        </div>
      </main>}
      {screen === 'review' && session?.result && <><div className="completion-notice" role="status"><span className="completion-icon"><Check size={18}/></span><div><strong>Rozmowa zakończona.</strong><span>Transkrypcja została zapisana {storageKind === 'local' ? 'w tej przeglądarce' : 'w Supabase'}. Sprawdź i zatwierdź wnioski, aby zapisać ostateczny wynik.</span></div></div><Review initial={session.result} busy={busy} sync={sync} storage={storageKind} onDraft={result => { void interview.update({ result, status: 'review' }); }} onSave={async result => { await run(async () => { if (await interview.saveResult(result)) go('thanks'); }); }}/ ></>}
      {screen === 'thanks' && session && <main className="thanks-page"><div className="success-mark"><Check size={24}/></div><span className="section-label">Rozmowa zamienia się w następny krok</span><h1>Dziękuję<br/>za Twoją perspektywę.</h1><p>Twoje odpowiedzi i potwierdzone wnioski zostały zapisane {storageKind === 'local' ? 'lokalnie w tej przeglądarce.' : 'w Supabase.'} Możesz pobrać pełny wynik i wrócić do niego później.</p><div className="save-receipt"><span><Check size={15}/>{storageKind === 'local' ? 'Zapis lokalny zakończony' : 'Zapis w Supabase zakończony'}</span><small>Dostęp do {new Date(session.expiresAt).toLocaleDateString('pl-PL')}</small></div><div className="thanks-actions"><button className="primary-button" onClick={() => void run(async () => downloadResult(await getCompleteSessionResult(session.id)))}><Download size={17}/> Pobierz wynik</button><button className="text-button" onClick={() => go('review')}>Zobacz podsumowanie</button></div><button className="delete-link" onClick={() => setInfo('delete')}><Trash2 size={13}/> Usuń sesję i wszystkie odpowiedzi</button><span className="session-id">Sesja {session.id.slice(0, 8)}</span></main>}
    </div>
    {startProgress && <div className="completion-overlay" role="status" aria-live="polite"><div className="completion-progress"><span className="completion-spinner" aria-hidden="true"/><span className="section-label">Rozpoczynamy rozmowę</span><h2>{startProgress}</h2><p>Sprawdzam połączenie audio i przygotowuję sesję.</p></div></div>}
    {closing && <div className="completion-overlay" role="status" aria-live="polite"><div className="completion-progress"><span className="completion-spinner" aria-hidden="true"/><span className="section-label">{closingReason === 'agent' ? 'Rozmowa zakończona przez Mirai' : 'Kończymy rozmowę'}</span><h2>{sync === 'saving' ? 'Zapisuję rozmowę w bazie…' : 'Opracowuję wnioski i podsumowanie…'}</h2><p>Zabezpieczam transkrypcję i przygotowuję podsumowanie do Twojej weryfikacji.</p></div></div>}
    {statusToast && <div className="status-toast" role="status" aria-live="polite"><Check size={14}/><span>{statusToast}</span></div>}
    {micModal && <dialog open className="info-dialog mic-error-dialog"><div className="dialog-symbol"><MicOff size={32}/></div><h2>Brak dostępu do mikrofonu</h2><p>Przeglądarka zablokowała dostęp do mikrofonu lub urządzenie nie jest podłączone. Możesz zezwolić na dostęp w przeglądarce i spróbować ponownie, albo rozmawiać tekstowo.</p><div className="dialog-actions"><button className="outline-button" onClick={() => { setMicModal(false); setMode('text'); void run(begin); }}>Rozmawiaj tekstowo</button><button className="primary-button" onClick={() => { setMicModal(false); void run(begin); }}>Spróbuj ponownie</button></div></dialog>}
    {error && <div className="error-banner" role="alert"><span>{error}</span>{sync === 'error' && captchaRequired && screen !== 'consent' && /weryfikacj|bezpiecznej sesji/i.test(error) && <Captcha onReady={setCaptchaReady}/ >}{sync === 'error' && <button onClick={() => void run(async () => { await interview.retry(); })}>Ponów zapis</button>}<button aria-label="Zamknij komunikat" onClick={() => interview.setError('')}><X size={15}/></button></div>}
    {transcript && <aside className="transcript-drawer" aria-label="Transkrypcja rozmowy"><div className="drawer-heading"><h2>Nasza rozmowa</h2><button className="icon-button" aria-label="Zamknij transkrypcję" onClick={() => setTranscript(false)}><X size={19}/></button></div><p>Oryginalne wypowiedzi, bez interpretacji.</p><div className="transcript-turns">{session?.turns.map(t => <article key={t.id}><header>{t.speaker === 'agent' ? 'Mirai' : 'Ty'}<time>{new Date(t.timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</time></header><p>{t.text}</p></article>)}</div></aside>}
    <dialog ref={dialog} onCancel={() => setInfo(null)} className="info-dialog"><button className="dialog-close icon-button" aria-label="Zamknij" onClick={() => setInfo(null)}><X size={20}/></button>
      {info === 'how' && <><span className="section-label">Od rozmowy do zrozumienia</span><h2>Nic nie musisz<br/>przygotowywać.</h2><div className="how-steps"><section><span>01</span><div><h3>Opowiedz o swojej pracy</h3><p>Mirai zapyta o to, czym się zajmujesz, jak pracujesz i co bywa trudne. Bez założeń o Twoim zawodzie.</p></div></section><section><span>02</span><div><h3>Spójrz na nią z dystansu</h3><p>Zbierzemy to, co dla Ciebie ważne: trudności, sposoby pracy i granice zmian. Każdy wniosek ma źródło w rozmowie.</p></div></section><section><span>03</span><div><h3>Ty decydujesz, co dalej</h3><p>Popraw lub potwierdź podsumowanie, a potem pobierz zapis. Żadna automatyzacja nie uruchomi się sama.</p></div></section></div><button className="primary-button" onClick={() => { setInfo(null); session ? void run(resume) : prepare(); }}>Przejdź do rozmowy<ChevronRight size={17}/></button></>}
      {info === 'privacy' && <><ShieldCheck className="dialog-symbol"/><h2>Twoja rozmowa.<br/>Pod Twoją kontrolą.</h2><div className="privacy-copy"><h3>Co zapisujemy</h3><p>Tekst wypowiedzi z rozróżnieniem rozmówców, zgodę, daty sesji, wnioski i Twoje poprawki. Nie podawaj haseł ani poufnych danych klientów.</p><h3>Gdzie trafiają odpowiedzi</h3><p>{storageKind === 'local' ? 'Ten prototyp działa lokalnie. Odpowiedzi pozostają w pamięci tej przeglądarki. Nie są wysyłane do Supabase ani istniejącego Mirai.' : 'Dane przechowuje Supabase w sesji dostępnej dla Ciebie przez anonimowe uwierzytelnienie oraz dla uprawnionego administratora projektu. Jeśli korzystasz z indywidualnego linku, administrator widzi przypisaną do rozmowy etykietę, której Ty nie musisz podawać.'} Tryb głosowy korzysta z ElevenLabs, a opcjonalna analiza modelowa z OpenAI. Aktywnych dostawców pokazujemy przed zgodą. Demo korzysta z głosu przeglądarki.</p><h3>Audio i retencja</h3><p>Aplikacja nie zapisuje plików audio. Przed uruchomieniem głosu operator musi wyłączyć zapis audio u dostawcy. Dane sesji wygasają po 30 dniach; w demo są usuwane przy kolejnym otwarciu aplikacji. Możesz usunąć je wcześniej.</p><h3>Powrót i usunięcie</h3><p>Wrócisz do rozmowy w tej samej przeglądarce. Wyczyszczenie jej danych może uniemożliwić ponowny dostęp. Pobierz wynik lub usuń sesję przed ich wyczyszczeniem. Pobrane eksporty pozostają pod Twoją kontrolą.</p></div>{session && <button className="delete-link" onClick={() => setInfo('delete')}><Trash2 size={15}/> Usuń moją sesję</button>}</>}
      {info === 'delete' && <><Trash2 className="dialog-symbol"/><h2>Usunąć tę rozmowę?</h2><p>Usuniemy sesję, transkrypcję i wnioski {storageKind === 'local' ? 'z tej przeglądarki' : 'z Supabase'}. Tej operacji nie można cofnąć. Pobrane pliki nie zostaną usunięte.</p><div className="dialog-actions"><button className="outline-button" onClick={() => setInfo(null)}>Zachowaj rozmowę</button><button className="danger-button" disabled={busy} onClick={() => void run(async () => { await interview.remove(); setInfo(null); setTranscript(false); go('landing'); })}>Usuń sesję</button></div></>}
      {info === 'end' && <><span className="section-label">W Twoim tempie</span><h2>Zakończyć rozmowę?</h2><p>Przygotujemy podsumowanie tego, co już udało się zebrać. Brakujące tematy oznaczymy jako pytania do uzupełnienia.</p><div className="dialog-actions"><button className="outline-button" onClick={() => setInfo(null)}>Jeszcze rozmawiajmy</button><button className="primary-button" disabled={busy} onClick={() => void run(end)}>Zakończ i podsumuj</button></div></>}
    </dialog>
  </div>;
}
