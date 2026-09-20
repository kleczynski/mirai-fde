import { useEffect, useRef, useState } from 'react';
import type { BuildBrief } from '../../services/brief-studio/src/domain/contract';
type RequestFn = (path: string, method?: string, body?: object) => Promise<Record<string, unknown>>;
type Row = { id: string; status: string; reserved_micros: number; error_code: string | null; created_at: string };
type Detail = { run: Row & { decision: 'approve' | 'reject' | null; brief: BuildBrief | null; brief_hash: string | null; quality: { passed: boolean; failures: string[]; limitations: string[] } | null }; steps: { name: string; status: string; input: unknown; output: unknown; usage: unknown }[] };
const labels: Record<string, string> = { queued: 'W kolejce', running: 'Generuję', waiting_admin_review: 'Do Twojego przeglądu', completed: 'Zatwierdzony', failed: 'Zatrzymany' };
export function BriefStudioPanel({ sessionId, eligible, request }: { sessionId: string; eligible: boolean; request: RequestFn }) {
 const [rows, setRows] = useState<Row[]>([]); const [detail, setDetail] = useState<Detail | null>(null);
 const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
 const [nextCursor, setNextCursor] = useState<string | null>(null);
 const requestId = useRef<string | null>(null);
 const selectedRun = useRef<string | null>(null);
 const [pendingNotification, setPendingNotification] = useState<string | null>(null);
 const active = useRef(true);
 const call = (body: object) => request('/api/admin/brief-runs', 'POST', body);
 async function refresh(cursor?: string) {
  const data = await call({ action: 'list', sessionId, ...(cursor ? { cursor } : {}) });
  if (!active.current) return;
  setRows(data.items as Row[]); setNextCursor(data.nextCursor as string | null);
 }
 async function open(runId: string, select = true) {
  if (select) selectedRun.current = runId;
  const data = await call({ action: 'get', runId });
  if (active.current && selectedRun.current === runId) setDetail(data as Detail);
 }
 async function act(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Nie udało się wykonać operacji.'); } finally { if (active.current) setBusy(false); } }
 useEffect(() => { active.current = true; if (eligible) void refresh().catch(e => { if (active.current) setError(e.message); }); return () => { active.current = false; }; }, [sessionId, eligible]);
 useEffect(() => {
  if (!detail || !['queued','running'].includes(detail.run.status)) return;
  const timer = setInterval(() => { void open(detail.run.id, false).catch(e => { if (active.current) setError(e.message); }); }, 4000);
  return () => clearInterval(timer);
 }, [detail?.run.id, detail?.run.status]);
 async function start() {
  requestId.current ??= crypto.randomUUID();
  const data = await call({ action: 'start', sessionId, requestId: requestId.current });
  requestId.current = null;
  await refresh(); await open(data.runId as string);
 }
 async function review(decision: 'approve' | 'reject') {
  if (!detail) return;
  const data = await call({ action: 'review', runId: detail.run.id, briefHash: detail.run.brief_hash, decision });
  setPendingNotification(data.workflowNotification === 'pending_retry' ? detail.run.id : null);
  setNotice(data.workflowNotification === 'pending_retry' ? 'Decyzja zapisana. Powiadomienie Workflow wymaga ponowienia.' : 'Decyzja zapisana dla tej wersji.');
  await open(detail.run.id); await refresh();
 }
 async function download(format: 'json' | 'markdown') {
  if (!detail) return;
  const data = await call({ action: 'export', runId: detail.run.id, format });
  const url = URL.createObjectURL(new Blob([data.content as string], { type: format === 'json' ? 'application/json' : 'text/markdown' }));
  const link = document.createElement('a'); link.href = url; link.download = data.filename as string; link.click(); URL.revokeObjectURL(url);
  await open(detail.run.id);
 }
 return <section className="admin-card brief-studio"><h3>Brief Studio</h3>
  <p>Jedna propozycja demo na fikcyjnych danych. Maksymalnie 0,24 USD za uruchomienie. Zatwierdzenie briefu nie udostępnia demo klientowi.</p>
  {!eligible ? <p>Najpierw zakończ rozmowę i zatwierdź jej wynik.</p> : <>
   <button className="outline-button" disabled={busy || ['queued','running'].includes(detail?.run.status ?? '')} onClick={() => void act(start)}>Wygeneruj propozycję demo</button>
   <button className="text-button" disabled={busy} onClick={() => void act(() => refresh())}>Odśwież briefy</button>
   {rows.map(row => <button className="outline-button" key={row.id} disabled={busy} onClick={() => void act(() => open(row.id))}>{labels[row.status] ?? row.status} · {new Date(row.created_at).toLocaleString('pl-PL')}</button>)}
   {nextCursor && <button className="text-button" disabled={busy} onClick={() => void act(() => refresh(nextCursor))}>Starsze briefy</button>}
  </>}
  {busy && <p role="status">Zapisuję…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  {detail && <div><h4>{labels[detail.run.status] ?? detail.run.status}</h4><p>Rezerwacja kosztu: {(detail.run.reserved_micros / 1_000_000).toFixed(2)} USD. Nieznany koszt pozostaje zarezerwowany.</p>
   {pendingNotification === detail.run.id && detail.run.decision && <button className="outline-button" disabled={busy} onClick={() => void act(() => review(detail.run.decision!))}>Ponów powiadomienie o decyzji</button>}
   {detail.run.error_code && <p role="alert">{detail.run.error_code}. Sprawdź etapy poniżej przed nowym płatnym uruchomieniem.</p>}
   {detail.steps.map(s => <details key={s.name}><summary>{s.name}: {s.status}</summary><h5>Wejście, niezaufane dane</h5><pre>{JSON.stringify(s.input, null, 2)}</pre><h5>Wyjście modelu</h5><pre>{JSON.stringify(s.output, null, 2)}</pre><p>Użycie: {JSON.stringify(s.usage)}</p></details>)}
   {detail.run.brief && <><h4>{detail.run.brief.chosenOpportunity.title}</h4><p>{detail.run.brief.firstUseJourney.narrative}</p><ol>{detail.run.brief.firstUseJourney.steps.map((s,i) => <li key={i}>{s}</li>)}</ol><h4>Krytyka i ograniczenia</h4><p>Poprawka: {detail.run.brief.criticNotes.revisionApplied ? 'wykonana raz; uwagi nie zostały ponownie ocenione' : 'nie była wykonywana'}.</p>{detail.run.brief.criticNotes.findings.map(f => <p key={f.id}><strong>{f.severity}</strong>: {f.note}</p>)}{detail.run.quality?.limitations.map(l => <p key={l}>{l}</p>)}<details><summary>Pełny brief do przeglądu</summary><pre>{JSON.stringify(detail.run.brief, null, 2)}</pre></details>
    {detail.run.status === 'waiting_admin_review' && <><button className="primary-button" disabled={busy} onClick={() => void act(() => review('approve'))}>Zatwierdź tę wersję briefu</button><button className="outline-button" disabled={busy} onClick={() => void act(() => review('reject'))}>Odrzuć brief</button></>}
    {detail.run.status === 'completed' && <><button className="outline-button" disabled={busy} onClick={() => void act(() => download('json'))}>Pobierz brief JSON</button><button className="outline-button" disabled={busy} onClick={() => void act(() => download('markdown'))}>Pobierz brief Markdown</button></>}
   </>}
  </div>}
 </section>;
}
