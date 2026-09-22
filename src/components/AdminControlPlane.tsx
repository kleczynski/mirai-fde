import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, LoaderCircle, LogOut, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import type { DiscoveryResult, InterviewSession, Turn } from '../domain/contract';
import { Captcha } from '../persistence/Captcha';
import { captchaRequired, getCaptchaToken, supabase } from '../persistence/repository';
import './admin.css';
import './admin-invitations.css';
import './admin-workspace.css';

type SessionRow = Pick<InterviewSession, 'id' | 'status' | 'startedAt' | 'completedAt' | 'expiresAt' | 'mode'> & { turnCount: number; focusSummary: string | null; hasConfirmedSummary: boolean; invitation: { id: string; label: string; industry: string | null } | null };
type InvitationRow = { id: string; label: string; industry: string | null; created_at: string; expires_at: string; claimed_at: string | null; claimed_session_id: string | null };
type AdminError = Error & { status?: number };
type Evaluation = { id: string; version: number; evaluatorVersion: string; inputTurnIds: string[]; status: 'completed' | 'failed'; signals: Array<{ code: string; severity: 'info' | 'attention'; turnIds: string[]; evidence: string[]; limitation: string | null }>; limitations: string[] };
type Run = { id: string; kind: 'voice' | 'extraction' | 'evaluation'; version: number; status: string; configuration: { promptVersion: string | null; model: string | null; configurationStatus: 'known' | 'unknown' }; telemetry: { firstResponseLatencyMs: number | null } | null; createdAt: string; completedAt: string | null; errorCode: string | null };
type VoiceTrace = { runId: string; conversationId: string; status: string; branchId: string | null; versionId: string | null; truncated: boolean; transcript: Array<{ role: string; message: string | null; timeInCallSecs: number | null; interrupted: boolean }>; spans: Array<{ traceId: string | null; spanId: string | null; parentSpanId: string | null; name: string; startTimeUnixNano: string | null; endTimeUnixNano: string | null; status: unknown; attributes: Record<string, string | number | boolean> }> };
type OperatorNote = { id?: string; turnId: string | null; label: 'repeated_question' | 'missed_fact' | 'good_follow_up' | 'voice_problem' | 'note'; note: string | null; createdAt?: string };
type Detail = { session: InterviewSession; runs?: Run[]; evaluations?: Evaluation[]; operatorNotes?: OperatorNote[] };

async function request(path: string, method = 'GET', body?: object) {
  const { data } = await supabase!.auth.getSession();
  if (!data.session) throw Object.assign(new Error('Sesja administratora wygasła. Zaloguj się ponownie.'), { status: 401 });
  const response = await fetch(path, { method, headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error ?? 'Nie udało się wykonać operacji administracyjnej.'), { status: response.status });
  return payload as Record<string, unknown>;
}
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString('pl-PL') : 'Brak danych';
const SESSION_STATUS_LABELS: Record<InterviewSession['status'], string> = { active: 'W toku', paused: 'Wstrzymana', review: 'Do potwierdzenia', completed: 'Zakończona' };
const SESSION_MODE_LABELS: Record<InterviewSession['mode'], string> = { voice: 'Głos', text: 'Tekst', demo: 'Demo' };
const findings = (report: DiscoveryResult | null) => report ? [...report.participantContext, ...report.painPoints, ...report.workflows, ...report.tools, ...report.constraints, ...report.automationOpportunities] : [];

function Report({ title, report }: { title: string; report: DiscoveryResult | null }) {
  if (!report) return <section className="admin-card"><h3>{title}</h3><p>Brak danych raportu dla tej rozmowy.</p></section>;
  const evidence = new Map(report.evidence.map(item => [item.id, item]));
  return <section className="admin-card admin-report"><h3>{title}</h3><p className="admin-muted">Zebrane ustalenia i potwierdzenia uczestnika.</p>{findings(report).length === 0 ? <p>Raport nie zawiera jeszcze ustaleń.</p> : <ul>{findings(report).map(item => <li key={item.id}><strong>{item.text}</strong>{item.review.originalText && <span className="admin-original">Oryginał: {item.review.originalText}</span>}<span className="admin-review">{item.review.status === 'corrected' ? 'Skorygowano przez uczestnika' : item.review.status === 'confirmed' ? 'Potwierdzono przez uczestnika' : 'Bez potwierdzenia uczestnika'}</span>{item.evidenceIds.some(id => evidence.has(id)) && <details className="admin-evidence"><summary>Pokaż cytaty z rozmowy</summary>{item.evidenceIds.map(id => evidence.get(id)).filter(Boolean).map(item => <blockquote key={item!.id}>{item!.quote}</blockquote>)}</details>}</li>)}</ul>}<details className="admin-technical"><summary>Dane raportu</summary><p>Wersja promptu: {report.promptVersion}<br/>Wygenerowano: {date(report.extraction.generatedAt)}</p></details></section>;
}

function Transcript({ turns, evaluation, notes, onNote }: { turns: Turn[]; evaluation?: Evaluation; notes: OperatorNote[]; onNote: (turnId: string, label: OperatorNote['label'], note: string) => void }) {
  const flags = new Map<string, Evaluation['signals']>();
  for (const flag of evaluation?.signals ?? []) for (const id of flag.turnIds) flags.set(id, [...(flags.get(id) ?? []), flag]);
  return <section className="admin-card"><h3>Transkrypcja</h3><p className="admin-muted">Oryginalne tury wraz z identyfikatorami i czasem.</p><div className="admin-turns">{turns.length ? turns.map(turn => <article key={turn.id} id={`turn-${turn.id}`}><header><strong>{turn.speaker === 'agent' ? 'Mirai' : 'Uczestnik'}</strong><time>{date(turn.timestamp)}</time></header><p>{turn.text}</p><details className="admin-turn-meta"><summary>Szczegóły wypowiedzi</summary><small>ID: {turn.id}</small></details>{(flags.get(turn.id) ?? []).map(flag => <p className="admin-flag" key={flag.code}>{flag.code}: {flag.evidence.join(' ') || 'Brak cytatu dowodowego'}</p>)}<TurnNotes turnId={turn.id} notes={notes.filter(note => note.turnId === turn.id)} onSave={onNote}/></article>) : <p>Brak zapisanych tur.</p>}</div></section>;
}
function TurnNotes({ turnId, notes, onSave }: { turnId: string; notes: OperatorNote[]; onSave: (turnId: string, label: OperatorNote['label'], note: string) => void }) {
  const [text, setText] = useState(''); const [label, setLabel] = useState<OperatorNote['label']>('note');
  return <details className="admin-notes"><summary>Notatki operatora{notes.length > 0 ? ` (${notes.length})` : ''}</summary>{notes.map(note => <p key={note.id ?? `${note.turnId}-${note.note}`}>Notatka operatora ({note.label}): {note.note ?? 'bez tekstu'}</p>)}<label>Oznaczenie<select value={label} onChange={event => setLabel(event.target.value as OperatorNote['label'])}><option value="note">Notatka</option><option value="repeated_question">Powtórzył pytanie</option><option value="missed_fact">Pominął fakt</option><option value="good_follow_up">Dobre dopytanie</option><option value="voice_problem">Problem z głosem</option></select></label><label>Dodaj notatkę operatora<textarea value={text} onChange={event => setText(event.target.value)} maxLength={2000}/></label><button className="small-button" disabled={!text.trim()} onClick={() => { onSave(turnId, label, text.trim()); setText(''); }}>Zapisz notatkę</button></details>;
}
function Runs({ runs, onTrace, busy }: { runs?: Run[]; onTrace: (runId: string) => void; busy: boolean }) { return <section className="admin-card"><h3>Uruchomienia</h3>{!runs ? <p>Brak danych o uruchomieniach i telemetrii.</p> : runs.length === 0 ? <p>Nie zarejestrowano uruchomień dla tej rozmowy.</p> : <div className="admin-runs">{runs.map(run => <article key={run.id}><strong>{run.kind} <span>{run.status}</span></strong><small>ID: {run.id}, wersja {run.version}</small><p>Prompt: {run.configuration.promptVersion ?? 'Brak danych'} · model: {run.configuration.model ?? 'Brak danych'} · konfiguracja: {run.configuration.configurationStatus}</p><p>Start: {date(run.createdAt)} · koniec: {date(run.completedAt)}</p><p>Opóźnienie pierwszej odpowiedzi: {run.telemetry?.firstResponseLatencyMs == null ? 'Brak danych' : `${run.telemetry.firstResponseLatencyMs} ms`}</p>{run.errorCode && <p className="admin-error-text">Błąd: {run.errorCode}</p>}{run.kind === 'voice' && <button className="small-button" disabled={busy} onClick={() => onTrace(run.id)}>Pobierz ślad ElevenLabs</button>}</article>)}</div>}</section>; }
function Trace({ trace }: { trace: VoiceTrace }) { return <section className="admin-card" aria-label="Ślad ElevenLabs"><h3>Ślad ElevenLabs</h3><p>Rozmowa: {trace.conversationId} · status: {trace.status}</p><p>Gałąź: {trace.branchId ?? 'Brak danych'} · wersja: {trace.versionId ?? 'Brak danych'}</p><p>{trace.transcript.length} tur u dostawcy · {trace.spans.length} spanów{trace.truncated ? ' · wynik skrócony' : ''}.</p>{trace.spans.length ? <details><summary>Spany i czasy</summary><ol>{trace.spans.map((span, index) => <li key={`${span.spanId ?? 'span'}-${index}`}><strong>{span.name}</strong><small> start {span.startTimeUnixNano ?? 'brak'} · koniec {span.endTimeUnixNano ?? 'brak'} · status {String(span.status ?? 'brak')}</small>{Object.keys(span.attributes).length > 0 && <pre>{JSON.stringify(span.attributes, null, 2)}</pre>}</li>)}</ol></details> : <p>Brak spanów OpenTelemetry w odpowiedzi dostawcy.</p>}</section>; }

type HostedDemoStatus = 'building' | 'live' | 'client_reviewing' | 'approved_exclusive' | 'declined' | 'paid';
type HostedDemo = { id: string; sessionId: string | null; clientLabel: string; industry: string | null; demoUrl: string | null; repoUrl: string | null; status: HostedDemoStatus; createdAt: string; updatedAt: string; feedbackCount: number; unhandledFeedbackCount: number };
type DemoFeedbackItem = { id: string; message: string; page: string | null; handled: boolean; createdAt: string };
const DEMO_STATUSES: HostedDemoStatus[] = ['building', 'live', 'client_reviewing', 'approved_exclusive', 'declined', 'paid'];

const DEMO_STATUS_LABELS: Record<HostedDemoStatus, string> = { building: 'W budowie', live: 'Dostępne', client_reviewing: 'U klienta', approved_exclusive: 'Zaakceptowane', declined: 'Odrzucone', paid: 'Opłacone' };
const safeLink = (value: string | null) => { try { const url = new URL(value ?? ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };

function DemosPanel() {
  const [demos, setDemos] = useState<HostedDemo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<DemoFeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);
  const [edit, setEdit] = useState<{ demoUrl: string; repoUrl: string; status: HostedDemoStatus } | null>(null);
  const [editing, setEditing] = useState(false);
  const [showHandled, setShowHandled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const selection = useRef(0);
  const selected = demos.find(demo => demo.id === selectedId) ?? null;

  const refresh = async () => {
    setLoading(true); setError('');
    try { const payload = await request('/api/admin/hosted-demos') as { demos: HostedDemo[] }; setDemos(payload.demos); }
    catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się wczytać demo.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); return () => { selection.current++; }; }, []);
  const open = async (demo: HostedDemo) => {
    const version = ++selection.current;
    setSelectedId(demo.id); setEdit({ demoUrl: demo.demoUrl ?? '', repoUrl: demo.repoUrl ?? '', status: demo.status });
    setFeedback([]); setFeedbackLoading(true); setFeedbackError(false); setEditing(false); setShowHandled(false); setError(''); setNotice('');
    try {
      const payload = await request('/api/admin/hosted-demo-detail', 'POST', { demoId: demo.id }) as { feedback: DemoFeedbackItem[] };
      if (version === selection.current) setFeedback(payload.feedback);
    } catch (e) { if (version === selection.current) { setFeedbackError(true); setError(e instanceof Error ? e.message : 'Nie udało się wczytać uwag klienta.'); } }
    finally { if (version === selection.current) setFeedbackLoading(false); }
  };
  const save = async () => {
    if (!selected || !edit) return; setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/admin/hosted-demo-update', 'POST', { demoId: selected.id, status: edit.status, demoUrl: edit.demoUrl.trim() || null, repoUrl: edit.repoUrl.trim() || null });
      await refresh(); setEditing(false); setNotice('Zmiany zapisane.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się zapisać zmian w demo.'); }
    finally { setBusy(false); }
  };
  const markHandled = async (feedbackId: string) => {
    setBusy(true); setError('');
    try { await request('/api/admin/hosted-demo-feedback-handled', 'POST', { feedbackId, handled: true }); setFeedback(items => items.map(item => item.id === feedbackId ? { ...item, handled: true } : item)); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się oznaczyć uwagi jako obsłużonej.'); }
    finally { setBusy(false); }
  };
  const visibleFeedback = feedback.filter(item => showHandled || !item.handled);
  const handledCount = feedback.filter(item => item.handled).length;
  const demoUrl = safeLink(selected?.demoUrl ?? null);
  const repoUrl = safeLink(selected?.repoUrl ?? null);
  return <section className="admin-demos" aria-labelledby="demos-title">
    <div className="admin-section-heading"><div><h2 id="demos-title">Demo dla klientów</h2><p>Wersje do obejrzenia i uwagi do kolejnej iteracji.</p></div><button className="text-button" onClick={() => { void refresh(); if (selected) void open(selected); }} disabled={loading || busy || feedbackLoading}><RefreshCw size={15}/> Odśwież</button></div>
    {error && <p className="admin-error" role="alert"><ShieldAlert/> {error}</p>}
    {notice && <p className="admin-notice" role="status"><CheckCircle2 size={16}/> {notice}</p>}
    <div className="admin-grid">
      <div className="admin-list" aria-label="Lista demo">
        {loading && demos.length === 0 ? <p>Wczytuję demo…</p> : demos.length === 0 ? <p>Nie ma jeszcze żadnego demo.</p> : demos.map(demo =>
          <button key={demo.id} disabled={busy} aria-current={selectedId === demo.id ? 'true' : undefined} className={selectedId === demo.id ? 'admin-row selected' : 'admin-row'} onClick={() => void open(demo)}>
            <span><strong>{demo.clientLabel}</strong><small>{demo.industry ?? 'Branża niepodana'}</small>{demo.unhandledFeedbackCount > 0 && <span className="admin-feedback-count">Nowe uwagi: {demo.unhandledFeedbackCount}</span>}</span>
            <span className={`admin-status ${demo.status}`}>{DEMO_STATUS_LABELS[demo.status]}</span>
          </button>
        )}
      </div>
      <div className="admin-detail">
        {!selected || !edit ? <div className="admin-empty"><h3>Wybierz demo</h3><p>Znajdziesz tu link do wersji dla klienta, status i jego uwagi.</p></div> : <>
          <div className="admin-detail-heading"><div><h2>{selected.clientLabel}</h2><p>{selected.industry ?? 'Demo klienta'}</p></div><span className={`admin-status ${selected.status}`}>{DEMO_STATUS_LABELS[selected.status]}</span></div>
          <div className="admin-demo-links">{demoUrl ? <a className="primary-button" href={demoUrl} target="_blank" rel="noreferrer">Otwórz demo <ExternalLink size={15}/></a> : <span className="admin-muted">Nie dodano jeszcze linku do demo.</span>}{repoUrl && <a className="text-button" href={repoUrl} target="_blank" rel="noreferrer">Repozytorium <ExternalLink size={14}/></a>}<button className="text-button" aria-expanded={editing} aria-controls="demo-settings" onClick={() => setEditing(!editing)} disabled={busy}>{editing ? 'Zamknij ustawienia' : 'Edytuj linki i status'}</button></div>
          {editing && <form id="demo-settings" className="admin-demo-settings" onSubmit={event => { event.preventDefault(); void save(); }}>
            <label>Status<select value={edit.status} disabled={busy} onChange={event => setEdit({ ...edit, status: event.target.value as HostedDemoStatus })}>{DEMO_STATUSES.map(status => <option key={status} value={status}>{DEMO_STATUS_LABELS[status]}</option>)}</select></label>
            <label>Adres demo<input type="url" value={edit.demoUrl} disabled={busy} onChange={event => setEdit({ ...edit, demoUrl: event.target.value })} placeholder="https://…"/></label>
            <label>Adres repozytorium<input type="url" value={edit.repoUrl} disabled={busy} onChange={event => setEdit({ ...edit, repoUrl: event.target.value })} placeholder="https://github.com/…"/></label>
            <button className="primary-button" disabled={busy} type="submit">{busy ? 'Zapisywanie…' : 'Zapisz zmiany'}</button>
          </form>}
          <section className="admin-card admin-feedback"><div className="admin-section-heading"><h3>Uwagi klienta <span className="admin-count">{feedback.filter(item => !item.handled).length}</span></h3>{handledCount > 0 && <button className="text-button" aria-pressed={showHandled} onClick={() => setShowHandled(!showHandled)}>{showHandled ? 'Ukryj obsłużone' : `Pokaż obsłużone (${handledCount})`}</button>}</div>
            {feedbackLoading ? <p role="status">Wczytuję uwagi…</p> : feedbackError ? <button className="text-button" onClick={() => void open(selected)}>Ponów wczytywanie uwag</button> : visibleFeedback.length === 0 ? <p>{feedback.length ? 'Wszystkie uwagi zostały obsłużone.' : 'Klient nie zostawił jeszcze uwag.'}</p> : <div className="admin-feedback-list">{visibleFeedback.map(item => <article key={item.id} className={item.handled ? 'handled' : ''}>
              <div className="admin-feedback-meta"><time>{date(item.createdAt)}</time>{item.handled && <span>Obsłużone</span>}</div><p>{item.message}</p>
              <footer>{safeLink(item.page) && <a className="text-button" href={safeLink(item.page)!} target="_blank" rel="noreferrer">Zobacz stronę <ExternalLink size={13}/></a>}{!item.handled && <button className="small-button" disabled={busy} onClick={() => void markHandled(item.id)}><CheckCircle2 size={13}/> Oznacz jako obsłużone</button>}</footer>
            </article>)}</div>}
          </section>
          <details key={selected.id} className="admin-technical"><summary>Szczegóły techniczne</summary><dl><dt>ID demo</dt><dd>{selected.id}</dd><dt>Sesja</dt><dd>{selected.sessionId ?? 'Brak powiązanej sesji'}</dd><dt>Utworzono</dt><dd>{date(selected.createdAt)}</dd></dl></details>
        </>}
      </div>
    </div>
  </section>;
}

export function AdminControlPlane() {
  const [section, setSection] = useState<'sessions' | 'demos' | 'invitations'>('demos');
  const [sessionView, setSessionView] = useState<'summary' | 'transcript' | 'diagnostics'>('summary');
  const [email, setEmail] = useState(''); const [captchaReady, setCaptchaReady] = useState(!captchaRequired); const [access, setAccess] = useState<'loading' | 'anonymous' | 'authorized' | 'expired' | 'forbidden'>('loading');
  const [rows, setRows] = useState<SessionRow[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([]); const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]); const [invitationCursor, setInvitationCursor] = useState<string | null>(null); const [nextInvitationCursor, setNextInvitationCursor] = useState<string | null>(null);
  const [invitationLabel, setInvitationLabel] = useState(''); const [invitationIndustry, setInvitationIndustry] = useState(''); const [createdLink, setCreatedLink] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null); const [trace, setTrace] = useState<VoiceTrace | null>(null); const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [deleteId, setDeleteId] = useState<string | null>(null); const returnFocus = useRef<HTMLButtonElement>(null);
  const accessError = (value: unknown) => { const e = value as AdminError; if (e.status === 401) { setAccess('expired'); return; } if (e.status === 403) { setAccess('forbidden'); return; } setError(e instanceof Error ? e.message : 'Nie udało się otworzyć panelu.'); };
  const refresh = async (target = cursor) => { setLoading(true); setError(''); try { const query = target ? `?limit=25&cursor=${encodeURIComponent(target)}` : '?limit=25'; const payload = await request(`/api/admin/sessions${query}`) as { items?: SessionRow[]; sessions?: SessionRow[]; nextCursor?: string | null }; setRows(payload.items ?? payload.sessions ?? []); setCursor(target); setNextCursor(payload.nextCursor ?? null); } catch (e) { accessError(e); } finally { setLoading(false); } };
  const refreshInvitations = async (target: string | null = null) => { try { const query = target ? `?limit=25&cursor=${encodeURIComponent(target)}` : '?limit=25'; const payload = await request(`/api/admin/invitations${query}`) as { invitations: InvitationRow[]; nextCursor: string | null }; setInvitations(payload.invitations); setInvitationCursor(target); setNextInvitationCursor(payload.nextCursor); } catch (e) { accessError(e); } };
  useEffect(() => { if (!supabase) { setError('Panel administracyjny wymaga skonfigurowanego Supabase.'); setAccess('anonymous'); return; } supabase.auth.getSession().then(async ({ data }) => { if (!data.session) { setAccess('anonymous'); return; } setAccess('authorized'); await Promise.all([refresh(null), refreshInvitations(null)]); }).catch(accessError); }, []);
  useEffect(() => { if (!deleteId) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setDeleteId(null); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [deleteId]);
  const login = async () => { if (!supabase) return; setBusy(true); setError(''); try { const { error: signInError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/admin`, ...(getCaptchaToken() ? { captchaToken: getCaptchaToken()! } : {}) } }); if (signInError) throw signInError; setNotice('Wysłaliśmy bezpieczny link logowania. Otwórz go w tej przeglądarce.'); } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się wysłać linku.'); } finally { setBusy(false); } };
  const open = async (id: string, trigger: HTMLButtonElement) => { returnFocus.current = trigger; setBusy(true); setError(''); setTrace(null); setSessionView('summary'); try { const payload = await request('/api/admin/session', 'POST', { sessionId: id }); setDetail(payload as unknown as Detail); } catch (e) { accessError(e); } finally { setBusy(false); } };
  const close = () => { setDetail(null); setTrace(null); queueMicrotask(() => returnFocus.current?.focus()); };
  const loadTrace = async (runId: string) => { if (!detail) return; setBusy(true); setError(''); setTrace(null); try { const payload = await request('/api/admin/session-trace', 'POST', { sessionId: detail.session.id, runId }); setTrace(payload as VoiceTrace); } catch (e) { accessError(e); } finally { setBusy(false); } };
  const checkVoice = async () => { setBusy(true); setError(''); setNotice(''); try { const payload = await request('/api/admin/voice-health', 'POST') as { available: boolean; agentId: string; environment: string }; if (payload.available) setNotice(`ElevenLabs odpowiada: ${payload.agentId}, środowisko ${payload.environment}. Nie sprawdzono jeszcze mikrofonu ani transmisji audio.`); } catch (e) { accessError(e); } finally { setBusy(false); } };
  const saveNote = async (turnId: string, label: OperatorNote['label'], note: string) => { if (!detail) return; setBusy(true); try { await request('/api/admin/session-note', 'POST', { sessionId: detail.session.id, turnId, label, note }); setDetail({ ...detail, operatorNotes: [...(detail.operatorNotes ?? []), { turnId, label, note }] }); } catch (e) { setError((e as AdminError).status === 404 ? 'Zapisywanie notatek nie jest jeszcze dostępne na serwerze.' : e instanceof Error ? e.message : 'Nie udało się zapisać notatki.'); } finally { setBusy(false); } };
  const exportPackage = async () => { if (!detail) return; setBusy(true); try { const payload = await request('/api/admin/session-export', 'POST', { sessionId: detail.session.id }); const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `mirai-agent-handoff-${detail.session.id}.json`; link.click(); URL.revokeObjectURL(url); } catch (e) { setError((e as AdminError).status === 404 ? 'Eksport paczki nie jest jeszcze dostępny na serwerze.' : e instanceof Error ? e.message : 'Nie udało się wyeksportować paczki.'); } finally { setBusy(false); } };
  const remove = async () => { if (!deleteId) return; setBusy(true); try { await request('/api/admin/delete-session', 'POST', { sessionId: deleteId }); if (detail?.session.id === deleteId) close(); setDeleteId(null); setNotice('Sesja i jej dane potomne zostały usunięte.'); await refresh(); } catch (e) { accessError(e); } finally { setBusy(false); } };
  const retryExtraction = async () => {
    if (!detail) return; setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/admin/session-retry-extraction', 'POST', { sessionId: detail.session.id });
      const payload = await request('/api/admin/session', 'POST', { sessionId: detail.session.id });
      setDetail(payload as unknown as Detail);
      setNotice('Ekstrakcja została uruchomiona i zapisana. Uczestnik może teraz ją potwierdzić.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Nie udało się uruchomić ekstrakcji.'); }
    finally { setBusy(false); }
  };
  const createInvitation = async () => { setBusy(true); setError(''); setCreatedLink(''); try { const payload = await request('/api/admin/invitations', 'POST', { label: invitationLabel.trim(), industry: invitationIndustry.trim() || null }) as { path: string }; setCreatedLink(`${window.location.origin}${payload.path}`); setInvitationLabel(''); setInvitationIndustry(''); setNotice('Zaproszenie gotowe. Skopiuj link teraz; później nie będzie można go odczytać z panelu.'); await refreshInvitations(null); } catch (e) { accessError(e); } finally { setBusy(false); } };
  if (access === 'loading') return <main className="admin-shell"><p><LoaderCircle className="spin"/> Otwieram control plane…</p></main>;
  if (access !== 'authorized') return <main className="admin-shell admin-login"><span className="section-label">Mirai control plane</span><h1>{access === 'forbidden' ? 'Brak uprawnień.' : access === 'expired' ? 'Sesja wygasła.' : 'Wejście administratora.'}</h1><p>{access === 'forbidden' ? 'To konto nie ma dostępu administracyjnego.' : access === 'expired' ? 'Zaloguj się ponownie przez bezpieczny link.' : 'Użyj adresu dodanego do serwerowej listy administratorów.'}</p>{access !== 'forbidden' && <><label>Adres e-mail<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>{captchaRequired && <Captcha onReady={setCaptchaReady}/>}<button className="primary-button" disabled={busy || !email.trim() || !captchaReady} onClick={() => void login()}>Wyślij link logowania</button></>}{notice && <p className="admin-notice"><CheckCircle2/> {notice}</p>}{error && <p className="admin-error"><ShieldAlert/> {error}</p>}<a className="text-button" href="/">Wróć do rozmowy</a></main>;
  const evaluation = detail?.evaluations?.[0];
  const invitedRows = rows.filter(row => row.invitation);
  const publicRows = rows.filter(row => !row.invitation);
  const renderRow = (row: SessionRow) => <button key={row.id} disabled={busy} ref={detail?.session.id === row.id ? returnFocus : undefined} className={detail?.session.id === row.id ? 'admin-row selected' : 'admin-row'} onClick={event => void open(row.id, event.currentTarget)}><span><strong>{row.invitation?.label ?? row.focusSummary ?? 'Brak nazwanego obszaru'}</strong><small>{row.invitation?.industry ? `${row.invitation.industry} · ` : ''}{date(row.startedAt)} · {SESSION_MODE_LABELS[row.mode]} · wypowiedzi: {row.turnCount}</small></span><span className={`admin-status ${row.status}`}>{SESSION_STATUS_LABELS[row.status]}</span></button>;
  return <main className="admin-shell">
    <header className="admin-header">
      <div><span className="section-label">Mirai control plane</span><h1>Panel Mirai</h1><p>Rozmowy, demo i kolejne kroki z klientami.</p></div>
      <div>{section !== 'demos' && <button className="text-button" onClick={() => { void refresh(); void refreshInvitations(null); }} disabled={busy || loading}><RefreshCw size={15}/> Odśwież</button>}<button className="text-button" onClick={() => void supabase?.auth.signOut().then(() => { setAccess('anonymous'); setRows([]); setInvitations([]); setCreatedLink(''); close(); })}><LogOut size={15}/> Wyloguj</button></div>
    </header>
    {notice && <p className="admin-notice" role="status"><CheckCircle2/> {notice}</p>}
    {error && <p className="admin-error" role="alert"><ShieldAlert/> {error}</p>}
    <nav className="admin-navigation" aria-label="Sekcje panelu">{([['demos', 'Demo klientów'], ['sessions', 'Rozmowy'], ['invitations', 'Zaproszenia']] as const).map(([id, label]) => <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>)}</nav>
    <div hidden={section !== 'invitations'}><section className="admin-invitations" aria-labelledby="invitations-title">
      <div className="admin-invitations-intro"><span className="section-label">Zaproszenia indywidualne</span><h2 id="invitations-title">Przypisz rozmowę przed wysłaniem linku.</h2><p>Wpisz własną etykietę, na przykład „Karolina”. Odbiorca jej nie zobaczy. Każdy link otwiera jedną rozmowę i wygasa po 30 dniach, jeśli nie zostanie użyty.</p></div>
      <form className="admin-invitation-form" onSubmit={event => { event.preventDefault(); void createInvitation(); }}>
        <label>Etykieta osoby lub testu<input value={invitationLabel} onChange={event => setInvitationLabel(event.target.value)} maxLength={120} required placeholder="Karolina"/></label>
        <label>Branża, opcjonalnie<input value={invitationIndustry} onChange={event => setInvitationIndustry(event.target.value)} maxLength={120} placeholder="Edukacja"/></label>
        <button className="primary-button" type="submit" disabled={busy || !invitationLabel.trim()}>Utwórz link <ChevronRight size={16}/></button>
      </form>
      {createdLink && <div className="admin-created-link" role="status"><strong>Link gotowy do wysłania</strong><p>Skopiuj go teraz. Ze względów bezpieczeństwa panel nie pokaże go ponownie.</p><div><input readOnly aria-label="Nowy link zaproszenia" value={createdLink} onFocus={event => event.target.select()}/><button className="outline-button" onClick={() => void navigator.clipboard.writeText(createdLink).then(() => setNotice('Link skopiowany do schowka.')).catch(() => setError('Nie udało się skopiować automatycznie. Zaznacz i skopiuj link z pola.'))}>Kopiuj link</button></div></div>}
      <div className="admin-invitation-list"><h3>Utworzone zaproszenia</h3>{invitations.length === 0 ? <p>Nie ma jeszcze zaproszeń.</p> : invitations.map(invitation => <article key={invitation.id}><div><strong>{invitation.label}</strong><small>{invitation.industry || 'Branża niepodana'} · utworzono {date(invitation.created_at)}</small></div><span className={invitation.claimed_at ? 'admin-invitation-state claimed' : 'admin-invitation-state'}>{invitation.claimed_at ? 'Rozmowa rozpoczęta' : new Date(invitation.expires_at).getTime() <= Date.now() ? 'Link wygasł' : 'Czeka na użycie'}</span></article>)}
        <nav className="admin-pagination" aria-label="Strony zaproszeń"><button className="text-button" disabled={!invitationCursor} onClick={() => void refreshInvitations(null)}><ChevronLeft size={15}/> Pierwsza strona</button><button className="text-button" disabled={!nextInvitationCursor} onClick={() => void refreshInvitations(nextInvitationCursor)}>Następna <ChevronRight size={15}/></button></nav>
      </div>
    </section>
    </div>
    <div hidden={section !== 'demos'}><DemosPanel/></div>
    <section className="admin-grid" hidden={section !== 'sessions'} aria-label="Rozmowy">
      <div className="admin-list"><h2>Rozmowy</h2>
        {loading ? <p>Odświeżam listę…</p> : rows.length === 0 ? <p>Nie ma jeszcze rozmów do pokazania.</p> : <>
          <section className="admin-session-group"><h3>Z zaproszenia <span>{invitedRows.length}</span></h3>{invitedRows.length ? invitedRows.map(renderRow) : <p>Na tej stronie nie ma rozmów z zaproszeń.</p>}</section>
          <section className="admin-session-group"><h3>Bez zaproszenia <span>{publicRows.length}</span></h3>{publicRows.length ? publicRows.map(renderRow) : <p>Na tej stronie nie ma rozmów bez zaproszenia.</p>}</section>
        </>}
        <nav className="admin-pagination" aria-label="Strony rozmów"><button className="text-button" disabled={!cursor || loading} onClick={() => { const previous = cursorHistory.at(-1) ?? null; setCursorHistory(history => history.slice(0, -1)); void refresh(previous); }}><ChevronLeft size={15}/> Poprzednia</button><button className="text-button" disabled={!nextCursor || loading} onClick={() => { setCursorHistory(history => [...history, cursor]); void refresh(nextCursor); }}>Następna <ChevronRight size={15}/></button></nav>
      </div>
      <div className="admin-detail">{detail ? <>
        <button className="text-button" onClick={close}><ChevronLeft size={15}/> Wszystkie rozmowy</button>
        <h2>{rows.find(row => row.id === detail.session.id)?.invitation?.label || rows.find(row => row.id === detail.session.id)?.focusSummary || 'Przebieg rozmowy'}</h2>
        <p className="admin-meta">{detail.session.mode === 'voice' ? 'Rozmowa głosowa' : detail.session.mode === 'demo' ? 'Rozmowa demonstracyjna' : 'Rozmowa tekstowa'} · {date(detail.session.startedAt)} · {detail.session.turns.length} wypowiedzi</p>
        <nav className="admin-session-navigation" aria-label="Widok rozmowy">{([['summary', 'Podsumowanie'], ['transcript', 'Transkrypcja'], ['diagnostics', 'Diagnostyka']] as const).map(([id, label]) => <button key={id} aria-current={sessionView === id ? 'page' : undefined} onClick={() => setSessionView(id)}>{label}</button>)}</nav>
        {sessionView === 'summary' && <><Report title="Podsumowanie rozmowy" report={detail.session.result}/><div className="admin-detail-actions"><button className="outline-button" disabled={busy} onClick={() => void exportPackage()}><Download size={16}/> Eksport paczki</button></div></>}
        <div hidden={sessionView !== 'transcript'}><Transcript key={detail.session.id} turns={detail.session.turns} evaluation={evaluation} notes={detail.operatorNotes ?? []} onNote={(turnId, label, note) => void saveNote(turnId, label, note)}/></div>
        {sessionView === 'diagnostics' && <>
          {detail.session.completedAt && !detail.session.result && <section className="admin-card"><h3>Ekstrakcja utknęła</h3><p>Rozmowa jest zakończona, ale nigdy nie powstał wynik ekstrakcji (np. przez zamknięte okno przeglądarki). Uruchom ją teraz — sesja zostanie w stanie „Do potwierdzenia”, tak aby uczestnik mógł ją później potwierdzić.</p><button className="primary-button" disabled={busy} onClick={() => void retryExtraction()}><RefreshCw size={16}/> {busy ? 'Uruchamiam ekstrakcję…' : 'Uruchom ekstrakcję'}</button></section>}
          <section className="admin-card"><h3>Ocena jakości</h3>{evaluation ? <><p>Wersja oceny: {evaluation.evaluatorVersion}, wynik {evaluation.status}, wejściowe tury: {evaluation.inputTurnIds.length}.</p>{evaluation.signals.length ? <ul>{evaluation.signals.map(signal => <li key={signal.code + signal.turnIds.join()}>{signal.code}: {signal.evidence.join(' ') || 'brak cytatu dowodowego'}{signal.limitation ? ' (' + signal.limitation + ')' : ''}</li>)}</ul> : <p>Ocena nie zawiera flag.</p>}</> : <p>Brak wersjonowanej oceny semantycznej.</p>}</section>
          <details className="admin-technical"><summary>Oryginalny wynik ekstrakcji</summary><Report title="Wynik modelu" report={detail.session.modelResult}/></details>
          <Runs runs={detail.runs} onTrace={runId => void loadTrace(runId)} busy={busy}/>{trace && <Trace trace={trace}/>}
          <details className="admin-technical"><summary>Dane sesji i zarządzanie</summary><p className="admin-meta">ID: {detail.session.id}<br/>Wygasa: {date(detail.session.expiresAt)}</p><div className="admin-detail-actions"><button className="text-button" onClick={() => void checkVoice()} disabled={busy || loading}>Sprawdź ElevenLabs</button><button className="danger-button" disabled={busy} onClick={() => setDeleteId(detail.session.id)}><Trash2 size={16}/> Usuń sesję</button></div></details>
        </>}
      </> : <p>Wybierz rozmowę, aby zobaczyć raport, transkrypcję i dane monitoringu.</p>}</div>
    </section>
    {deleteId && <div className="admin-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><div><h2 id="delete-title">Usunąć sesję?</h2><p>Usuniemy transkrypcję, podsumowania oraz artefakty potomne. Ta operacja jest nieodwracalna.</p><button className="outline-button" autoFocus disabled={busy} onClick={() => setDeleteId(null)}>Zachowaj</button><button className="danger-button" disabled={busy} onClick={() => void remove()}>Usuń trwale</button></div></div>}
  </main>;
}
