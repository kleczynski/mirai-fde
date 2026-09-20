import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, ChevronDown, Download, Pencil, Quote } from 'lucide-react';
import { reviewFinding, type DiscoveryResult, type Finding } from '../domain/contract';
type GroupKey = 'participantContext' | 'painPoints' | 'workflows' | 'tools' | 'constraints' | 'automationOpportunities';
const groups: [GroupKey, string][] = [['participantContext', 'Twoja codzienność i cel'], ['painPoints', 'To, co warto uprościć'], ['workflows', 'Jak wykonujesz swoją pracę'], ['tools', 'Co pomaga Ci w pracy'], ['constraints', 'Granice i ograniczenia'], ['automationOpportunities', 'Pomysły do sprawdzenia']];
function ReviewItem({ item, evidence, onChange }: { item: Finding; evidence: DiscoveryResult['evidence']; onChange: (text: string) => void }) {
  const [editing, setEditing] = useState(false); const [text, setText] = useState(item.text);
  return <article className="finding">
    <div className="finding-body">{editing ? <label className="edit-label">Popraw wniosek<textarea aria-label="Popraw wniosek" value={text} maxLength={4000} onChange={e => setText(e.target.value)} autoFocus/><button className="small-button" disabled={!text.trim()} onClick={() => { onChange(text); setEditing(false); }}>Zapisz poprawkę</button></label> : <p>{item.text}</p>}
      <div className="finding-meta"><span>{item.review.status === 'unreviewed' ? 'Do Twojej weryfikacji' : item.review.status === 'corrected' ? 'Poprawione przez Ciebie' : 'Potwierdzone'}</span><span>Pewność: {Math.round(item.confidence * 100)}%</span></div>
      <details className="evidence"><summary><Quote size={13}/> Fragment rozmowy <ChevronDown size={13}/></summary>{item.evidenceIds.map(id => <blockquote key={id}>{evidence.find(e => e.id === id)?.quote}</blockquote>)}</details>
      {'validationNeeded' in item && <p className="validation-note">Hipoteza do sprawdzenia, nie obietnica wdrożenia.</p>}
    </div>
    <div className="finding-actions"><button className="icon-button" aria-label="Popraw wniosek" onClick={() => setEditing(!editing)}><Pencil size={16}/></button><button className={`icon-button ${item.review.status !== 'unreviewed' ? 'selected' : ''}`} aria-label="Potwierdź wniosek" onClick={() => onChange(item.text)}><Check size={18}/></button></div>
  </article>;
}
export function Review({ initial, onSave, onDraft, busy, sync, storage }: { initial: DiscoveryResult; onSave: (result: DiscoveryResult) => Promise<void>; onDraft: (result: DiscoveryResult) => void; busy: boolean; sync: 'saved' | 'saving' | 'error'; storage: 'local' | 'supabase' }) {
  const [result, setResult] = useState(initial); const [nextText, setNextText] = useState(initial.recommendedNextStep.text);
  const mounted = useRef(false);
  useEffect(() => { if (mounted.current) onDraft(result); else mounted.current = true; }, [result]);
  const count = groups.flatMap(([key]) => result[key]).filter(f => f.review.status === 'unreviewed').length + (result.recommendedNextStep.review.status === 'unreviewed' ? 1 : 0);
  const confirmAll = () => setResult(r => { const updated = { ...r }; for (const [key] of groups) (updated[key] as Finding[]) = r[key].map(item => reviewFinding(item, item.text)); updated.recommendedNextStep = reviewFinding(r.recommendedNextStep, nextText); return updated; });
  return <main className="review-page">
    <div className="review-heading"><span className="section-label">Ostatnie słowo należy do Ciebie</span><h1>Tak zrozumiałem<br/>Twoją codzienność.</h1><p>Sprawdź wnioski, popraw szczegóły i zdecyduj, co zabieramy dalej. Twoje oryginalne wypowiedzi pozostają bez zmian.</p></div>
    <div className="review-toolbar"><span>{count ? `Do potwierdzenia: ${count}` : 'Wszystko potwierdzone'}</span><button className="text-button" onClick={confirmAll}><CheckCheck size={17}/> Potwierdź wszystkie</button></div>
    <p className="review-save-status" role="status">{sync === 'saving' ? 'Zapisuję poprawki…' : sync === 'error' ? 'Nie udało się zapisać poprawek. Skorzystaj z przycisku ponowienia w komunikacie.' : storage === 'local' ? 'Poprawki zapisane w tej przeglądarce.' : 'Poprawki zapisane w Supabase.'}</p>
    {groups.map(([key, title]) => result[key].length > 0 && <section className="review-section" key={key}><h2>{title}<span>{result[key].length}</span></h2>{result[key].map(item => <ReviewItem key={item.id} item={item} evidence={result.evidence} onChange={text => setResult(r => ({ ...r, [key]: r[key].map(f => f.id === item.id ? reviewFinding(f, text) : f) }))}/>)}</section>)}
    <section className="next-step"><span className="section-label">Proponowany następny krok</span><label><span className="sr-only">Następny krok</span><textarea aria-label="Następny krok" value={nextText} onChange={e => { setNextText(e.target.value); setResult(r => ({ ...r, recommendedNextStep: { ...r.recommendedNextStep, review: { ...r.recommendedNextStep.review, status: 'unreviewed' } } })); }}/></label><button className="text-button" disabled={!nextText.trim()} onClick={() => setResult(r => ({ ...r, recommendedNextStep: reviewFinding(r.recommendedNextStep, nextText) }))}><Check size={16}/> {result.recommendedNextStep.review.status === 'unreviewed' ? 'Potwierdź następny krok' : 'Potwierdzono'}</button></section>
    {result.unansweredQuestions.length > 0 && <details className="unanswered"><summary>Tematy do uzupełnienia ({result.unansweredQuestions.length}) <ChevronDown size={16}/></summary><ul>{result.unansweredQuestions.map(q => <li key={q}>{q}</li>)}</ul></details>}
    <div className="review-bottom"><p>{result.extraction.method === 'evidence-rules' ? 'Wnioski zebrane na podstawie odpowiedzi. Hipotezy wymagają weryfikacji.' : 'Wnioski opracowane przez AI i powiązane z fragmentami rozmowy.'}</p><button className="primary-button" disabled={count > 0 || busy} onClick={() => void onSave(result)}>{busy ? 'Zapisuję…' : 'Zatwierdź i zapisz'}<Check size={18}/></button></div>
  </main>;
}
export function downloadResult(result: DiscoveryResult) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `mirai-discovery-${result.sessionId}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
