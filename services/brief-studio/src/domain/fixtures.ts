import { AGENT_BUILD_INSTRUCTIONS, type BuildBrief } from './contract.js';

/**
 * One synthetic mirai.build-brief.v1 example, built on the Julka/Revolut case
 * already used as the motivating example for this service (see
 * docs/specs/0002-discovery-build-brief-service/rationale.md and the voice
 * eval case `simulation.tutor_revolut_calendar` in
 * src/domain/voice-evaluation.ts of the sibling node). Not a real session:
 * the tutor, the students and every quote below are fictional, written to
 * match the shape of that scenario, not copied from a real transcript.
 *
 * Single source of truth for both the schema-export script
 * (scripts/export-build-brief-schema.ts) and the contract test
 * (tests/contract.test.ts), so the published example and the tested example
 * can never drift apart.
 */
export const julkaBuildBriefExample: BuildBrief = {
  schemaVersion: 'mirai.build-brief.v1',
  runId: '081d2029-9006-4ae1-9984-1cab7126932d',
  sourceSessionId: '817f9ef1-e30d-4e27-b29c-9be0031d0385',
  sourceContextPackageVersion: 'mirai.agent-context.v1',
  model: 'gpt-4.1-mini',
  generatedAt: '2026-09-18T12:00:00.000Z',
  evidenceExcerpts: [
    { id: 'd73f830c-7060-496a-8622-0f47fccc296f', quote: 'Po każdej lekcji sprawdzam w Revolucie, czy uczeń zapłacił, a potem ręcznie zmieniam kolor wpisu w Kalendarzu Google na zielony.' },
    { id: '5bda7486-8d26-4365-ba87-1162eb064549', quote: 'Nic w tym nie jest trudne ani skomplikowane, to po prostu monotonna robota i nie chce mi się tego robić codziennie ręcznie.' },
    { id: 'ec9befc0-23b4-4528-a0ea-7d20a0ed269d', quote: 'Zajmuje mi to kilkanaście minut dziennie, przy kilku uczniach pod rząd.' },
    { id: 'c95c295c-981d-4e9a-97f0-ea4acc5e5ed9', quote: 'Nie mam stresu, po prostu nie chce mi się tego klikać.' },
  ],
  chosenOpportunity: {
    hypothesisId: '6b7d09b9-b9ae-4f80-8439-9e2f5b16787e',
    title: 'Automatyczne oznaczanie opłaconych lekcji w Kalendarzu Google na podstawie przelewów z Revolut',
    rationale: 'Uczestniczka opisuje jeden, wąski i w pełni zdefiniowany proces: sprawdzenie przelewu w Revolucie i ręczna zmiana koloru odpowiadającego wydarzenia w Kalendarzu Google. Ma jasne wejście (nowy przelew), krok (sprawdzenie i dopasowanie do ucznia) i rezultat (kolor wydarzenia), więc nadaje się na pierwszą, najwęższą demonstrowalną automatyzację bez dodatkowych założeń.',
    evidenceIds: ['d73f830c-7060-496a-8622-0f47fccc296f', '5bda7486-8d26-4365-ba87-1162eb064549'],
    rejectedAlternatives: [
      { hypothesisId: '717df5b6-0e09-4b25-89de-330c4003754b', title: 'Automatyczne generowanie faktur za lekcje', reason: 'Uczestniczka nie wspomniała o fakturowaniu; rozszerzałoby zakres poza opisany proces sprawdzania płatności.' },
      { hypothesisId: 'eee39df2-9911-4a33-a0f7-82d9f5f3d1ab', title: 'Przypomnienia SMS dla uczniów o nadchodzącej płatności', reason: 'Brak w rozmowie dowodu na problem z przypominaniem uczniom o płatności — to wymyślony problem, nie dowód z transkryptu.' },
    ],
  },
  technicalApproach: {
    externalSystems: [
      { name: 'Revolut', role: 'Źródło zdarzeń: nowe zaksięgowane przelewy przychodzące na testowe konto demo.', dataMode: 'simulated', authorization: null },
      { name: 'Kalendarz Google', role: 'Cel zapisu: zmiana koloru wydarzenia lekcji na zielony po potwierdzeniu płatności.', dataMode: 'simulated', authorization: null },
    ],
    dataModel: 'Jedna encja "Lekcja": uczeń, data, oczekiwana kwota, id wydarzenia w kalendarzu, status płatności (oczekuje/opłacona). Jedna encja "Przelew symulowany": nadawca, kwota, data, dopasowany identyfikator lekcji (dopasowanie po kwocie i terminie w oknie +/- 2 dni).',
    hosting: { provider: 'cloudflare-workers', rationale: 'Zgodnie z domyślnym kierunkiem hostingu demo klienckich: pojedynczy Worker odpytujący symulowane API Revolut i wywołujący symulowane API Kalendarza Google.' },
  },
  firstUseJourney: {
    narrative: 'Julka kończy lekcję. Do demo wpływa symulowany przelew od ucznia. Demo dopasowuje przelew do zaplanowanej lekcji po kwocie i terminie, a następnie automatycznie zmienia kolor odpowiadającego wydarzenia w symulowanym Kalendarzu Google na zielony. Julka nie musi już ręcznie sprawdzać Revoluta ani ręcznie klikać w kalendarzu.',
    steps: [
      'Zaplanowana lekcja istnieje jako wydarzenie w symulowanym kalendarzu ze statusem "oczekuje na płatność".',
      'Wpływa symulowany przelew od ucznia na testowe konto Revolut.',
      'Demo dopasowuje przelew do lekcji po kwocie i terminie w oknie +/- 2 dni.',
      'Demo zmienia kolor wydarzenia w symulowanym kalendarzu na zielony i oznacza lekcję jako opłaconą.',
      'Julka widzi już oznaczone wydarzenie bez ręcznego sprawdzania czegokolwiek.',
    ],
  },
  acceptanceExamples: [
    { given: 'Zaplanowana lekcja o wartości 80 zł, wydarzenie w domyślnym kolorze.', when: 'Wpływa symulowany przelew 80 zł od tego samego ucznia w oknie +/- 2 dni od lekcji.', then: 'Wydarzenie zmienia kolor na zielony, a lekcja otrzymuje status "opłacona".' },
    { given: 'Zaplanowana lekcja o wartości 80 zł.', when: 'Wpływa symulowany przelew o innej kwocie lub od innego ucznia.', then: 'Wydarzenie pozostaje bez zmian, a niedopasowany przelew trafia na listę do ręcznego przeglądu.' },
  ],
  outOfScope: [
    'Fakturowanie lub rozliczenia podatkowe.',
    'Przypomnienia lub komunikacja z uczniami.',
    'Obsługa więcej niż jednego korepetytora lub współdzielonego kalendarza.',
    'Integracja z prawdziwym kontem Revolut lub prawdziwym Kalendarzem Google.',
  ],
  fixtureDataPlan: {
    isFictional: true,
    description: 'Wszystkie dane w demo są zmyślone: symulowane konto Revolut z przykładowymi przelewami i symulowany Kalendarz Google z przykładowymi lekcjami. Żadne prawdziwe dane ucznia ani prawdziwe środki nie są używane.',
    sampleRecords: [
      { system: 'Revolut', label: 'Przelew testowy — Ola K.', fields: { nadawca: 'Ola K.', kwota: 80, waluta: 'PLN', data: '2026-09-10' } },
      { system: 'Kalendarz Google', label: 'Lekcja testowa — Ola K.', fields: { uczen: 'Ola K.', data: '2026-09-10', status: 'oczekuje na płatność' } },
    ],
  },
  agentBuildInstructions: AGENT_BUILD_INSTRUCTIONS,
  criticNotes: {
    findings: [
      { id: '9a61ea8d-9555-4570-84da-0d32427c20f8', severity: 'advisory', category: 'scope_creep', note: 'technicalApproach.dataModel opisuje dopasowanie "po kwocie i terminie" bez podania okna. Autor briefu doprecyzował okno (+/- 2 dni) w firstUseJourney i acceptanceExamples po tej uwadze.', relatedField: 'technicalApproach.dataModel' },
    ],
    revisionRequested: true,
    revisionApplied: true,
  },
  review: {
    status: 'admin_reviewed',
    reviewedBy: 'admin@example.com',
    reviewedAt: '2026-09-18T12:20:00.000Z',
    exportedAt: null,
  },
};
