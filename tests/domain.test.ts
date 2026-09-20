import { describe, expect, it } from 'vitest';
import { createSession, createTurn, demoAnswers, deriveInterviewProgress, nextAdaptiveQuestion, questionFor } from '../src/domain/interview';
import { extractWithRules, validateAgainstSession } from '../src/domain/extraction';
import { DiscoverySchema, reviewFinding } from '../src/domain/contract';
export function sampleSession() {
  const session = createSession('demo');
  for (let i=0; i<10; i++) { session.questionIndex=i; session.turns.push(createTurn('agent', questionFor(i,session.turns),session),createTurn('participant',demoAnswers[i],session)); }
  session.questionIndex=10; session.completedAt = new Date().toISOString(); session.status='review';
  session.result=extractWithRules(session); session.modelResult=structuredClone(session.result);
  return session;
}
describe('Discovery contract and extraction', () => {
  it('produces source-backed results without promising savings', () => { const s=sampleSession(); const r=DiscoverySchema.parse(s.result); expect(r.tools.map(t=>t.text)).toEqual([demoAnswers[3]]); expect(r.painPoints).toHaveLength(3); expect(r.evidence).toHaveLength(10); expect(r.automationOpportunities[0].confidence).toBeLessThanOrEqual(.6); expect(r.unansweredQuestions.every(q => q.startsWith('Doprecyzować:'))).toBe(true); });
  it('rejects fabricated evidence and broken references', () => { const r=sampleSession().result!; r.evidence[0].quote='This was never said'; expect(DiscoverySchema.safeParse(r).success).toBe(false); const other=sampleSession().result!; other.painPoints[0].evidenceIds=[crypto.randomUUID()]; expect(DiscoverySchema.safeParse(other).success).toBe(false); });
  it('rejects overconfident automation hypotheses and an ungrounded next step', () => { const r=sampleSession().result!; r.automationOpportunities[0].confidence=.9; expect(DiscoverySchema.safeParse(r).success).toBe(false); const other=sampleSession().result!; other.recommendedNextStep.evidenceIds=[]; expect(DiscoverySchema.safeParse(other).success).toBe(false); });
  it('rejects an altered original transcript even if evidence still validates', () => { const s=sampleSession(); const r=structuredClone(s.result!); r.transcript[0].text='Altered agent prompt'; expect(()=>validateAgainstSession(r,s)).toThrow(); });
  it('keeps original interpretation when a participant corrects twice', () => { const original=sampleSession().result!.painPoints[0]; const revised=reviewFinding(reviewFinding(original,'Pierwsza poprawka'),'Druga poprawka'); expect(revised.review.originalText).toBe(original.text); expect(revised.review.status).toBe('corrected'); });
  it('does not invent findings for an empty or interrupted interview', () => { const r=extractWithRules(createSession('text')); expect(r.painPoints).toEqual([]); expect(r.automationOpportunities).toEqual([]); expect(r.unansweredQuestions).toHaveLength(10); });
  it('adapts follow-up to previously mentioned tools', () => { const s=createSession('text'); s.turns=[createTurn('participant','Pracuję w Excelu',s), { ...createTurn('participant','Codziennie muszę poprawiać pomyłki.',s), questionId: 'pain' }]; expect(questionFor(3,s.turns)).toContain('arkuszach'); expect(questionFor(5,s.turns)).toContain('codziennie'); });
});

describe('Adaptive production interview', () => {
  it('deepens the participant-selected craft process instead of walking a fixed list', () => {
    const s = createSession('text');
    let next = nextAdaptiveQuestion([], s.interviewProgress)!;
    expect(next.id).toBe('context');
    const role = createTurn('participant', 'Jestem stolarzem.', s, next.id);
    next = nextAdaptiveQuestion([role], s.interviewProgress)!;
    expect(next.id).toBe('day');
    const focus = createTurn('participant', 'Najwięcej uwagi zabiera mi przygotowanie rozkroju płyt do mebli.', s, next.id);
    next = nextAdaptiveQuestion([role, focus], s.interviewProgress)!;
    expect(next.id).toBe('workflow');
    expect(next.text).toContain('krok po kroku');
  });
  it('finishes by coverage or the safety limit, never a hardcoded ten questions', () => {
    const s = createSession('text');
    const ids = ['context','day','workflow','inputs','tools','pain','frequency','exceptions','constraints','goal'] as const;
    const texts = ['Jestem właścicielem pracowni.', 'Przygotowuję rozkrój płyt do zamówienia.', 'Zbieram wymiary, dobieram płyty, układam elementy i sprawdzam wynik.', 'Na początku mam wymiary i format płyt, a na końcu listę elementów.', 'Korzystam z notatek, programu do rysowania i wiedzy pracownika warsztatu.', 'Najwięcej czasu tracę na ręczne poprawianie układu po zmianie wymiarów.', 'Dzieje się to kilka razy w tygodniu i opóźnia wycenę klienta.', 'Przy nietypowym kierunku słojów układ wygląda inaczej i wymaga ręcznej korekty.', 'Dobór materiału i akceptacja końcowego układu muszą należeć do mnie.', 'Poprawa oznacza przygotowanie poprawnej wyceny bez wieczornego przepisywania danych.'];
    const turns = ids.map((id, i) => createTurn('participant', texts[i], s, id));
    expect(deriveInterviewProgress(turns, s.interviewProgress).readyToFinish).toBe(true);
    const sparse = Array.from({ length: 18 }, (_, i) => createTurn('participant', `Odpowiedź próbna numer ${i} bez dodatkowego kontekstu.`, s, null));
    expect(deriveInterviewProgress(sparse, s.interviewProgress).readyToFinish).toBe(true);
  });
});


describe('General discovery for experts from different domains', () => {
  const examples = [
    { role: 'Stolarz', day: 'Robię meble na wymiar.', activity: 'Jadę na pomiar, notuję wymiary i przygotowuję wycenę.', tools: 'Notes i miarka.', pain: 'Szukam notatek i zdjęć z pomiarów.', goal: 'Chcę mieć pomiary w jednym miejscu.' },
    { role: 'Właściciel małego sklepu', day: 'Przyjmuję dostawy i obsługuję klientów.', activity: 'Sprawdzam półki i uzupełniam towar.', tools: 'Kasa fiskalna i zeszyt.', pain: 'Zapominam o brakach towaru na półkach.', goal: 'Chcę szybciej zauważać braki.' },
    { role: 'Dentysta', day: 'Przyjmuję pacjentów w gabinecie.', activity: 'Ustalam wizytę i przygotowuję gabinet.', tools: 'Kalendarz i telefon.', pain: 'Pacjent zapomina o wizycie i nie przychodzi.', goal: 'Chcę łatwiej potwierdzać terminy.' },
    { role: 'Rzeczoznawca majątkowy', day: 'Oglądam nieruchomości i analizuję dokumenty.', activity: 'Zbieram dokumenty, oglądam nieruchomość i przygotowuję wycenę.', tools: 'Telefon i papierowe notatki.', pain: 'Szukam dokumentów i przepisuję dane z wielu źródeł.', goal: 'Chcę łatwiej zebrać materiały do jednej sprawy.' },
  ];
  for (const example of examples) it(`understands ${example.role} without inventing office tools`, () => {
    const s=createSession('text');
    const answers=[example.role,example.day,example.activity,example.tools,example.pain,'Kilka razy w tygodniu.','Tracę czas i spokój.','Decyzje w mojej dziedzinie chcę podejmować sam.',example.goal,'To wszystko.'];
    answers.forEach((text,index)=>{s.questionIndex=index;s.turns.push(createTurn('agent',questionFor(index,s.turns),s),createTurn('participant',text,s));});
    const r=extractWithRules(s);
    expect(r.participantContext[0].text).toBe(example.role);
    expect(r.tools.some(t=>/Slack|Excel|CRM|Gmail/.test(t.text))).toBe(false);
    expect(r.automationOpportunities.length).toBeGreaterThan(0);
    expect(r.automationOpportunities.every(o=>o.priority==='explore'&&o.confidence<=.6)).toBe(true);
    expect(r.constraints[0].text).toContain('sam');
  });
  it('does not equate physical craft or no pain with an automation opportunity',()=>{
    const s=createSession('text');s.questionIndex=4;s.turns=[createTurn('participant','Ręcznie wycinam i składam drewniane meble. To lubię i nie mam problemów.',s)];
    const r=extractWithRules(s); expect(r.automationOpportunities).toEqual([]);expect(r.painPoints).toEqual([]);
  });
});
