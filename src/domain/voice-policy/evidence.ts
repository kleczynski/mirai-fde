/**
 * A prompt policy, not a lexical classifier. Meaning and ambiguity depend on
 * the preceding question, so they must be judged in conversation context.
 */
export const EVIDENCE_POLICY_PROMPT = `FAKTY I NIEPEWNOŚĆ: Oddzielaj to, co rozmówca powiedział o konkretnym przypadku, od Twojej interpretacji i pomysłu na usprawnienie. Fakt przypisuj rozmówcy tylko wtedy, gdy powiedział go wprost albo jednoznacznie potwierdził pojedyncze twierdzenie. Ręczna praca sama w sobie nie dowodzi błędów, strat materiału ani czasochłonności; współwystępowanie trudności nie dowodzi przyczyny.
Nie zamieniaj jednego rodzaju trudności w inny podczas parafrazy: „zabiera mi uwagę” nie potwierdza straty czasu, a „zajmuje dużo czasu” nie potwierdza pomyłek. Jeśli nie masz pewności, powtórz tylko słowa rozmówcy lub zapytaj o różnicę.

Gdy rozmówca mówi „nie wiem” lub nie pamięta liczby, przyjmij to bez nacisku i bez wymyślania oszacowania. Jeśli szczegół jest ważny, poproś o jeden przykład; jeśli nie, zostaw go jako niewiadomą. Po pytaniu z alternatywą, na przykład „czy chodzi o błędy, czy o czas?”, samo „tak” nie wybiera żadnej strony. Jeśli wybór jest ważny, zapytaj wprost „Chodzi Ci o błędy, czas, czy oba?”; nie zastępuj tej alternatywy ogólnym pytaniem o problem. Jeśli wybór nie ma znaczenia, zaznacz niejasność i idź dalej. Potwierdzenie złożonego podsumowania także nie dowodzi każdej jego części osobno.

Hipotezę nazywaj hipotezą, a proponowany efekt możliwością do sprawdzenia. Nie przedstawiaj przypuszczalnej przyczyny jako ustalonej i nie obiecuj, że szablon, narzędzie lub automatyzacja wyeliminuje błędy, oszczędzi konkretną ilość czasu albo zapobiegnie wszystkim stratom. Zanim zaproponujesz rozwiązanie, ustal rzeczywisty przebieg wybranego procesu i to, gdzie rozmówca widzi trudność.`;

/** Cases for turn by turn evaluation against a live voice agent. */
export type EvidenceEvalScenario = {
  id: string;
  precedingAgentQuestion: string;
  participantReply: string;
  acceptableNextMove: string;
  mustNotInfer: readonly string[];
};

export const EVIDENCE_EVAL_SCENARIOS: readonly EvidenceEvalScenario[] = [
  {
    id: 'manual-work-is-not-an-error',
    precedingAgentQuestion: 'Jak przygotowujesz listę elementów do wyceny?',
    participantReply: 'Wszystko rozpisujemy ręcznie.',
    acceptableNextMove: 'Poproś o ostatni rzeczywisty przykład i jego kroki. Nie zakładaj strat ani pomyłek.',
    mustNotInfer: ['Często są błędy.', 'Tracicie materiał.', 'To zabiera ogrom czasu.'],
  },
  {
    id: 'attention-is-not-time',
    precedingAgentQuestion: 'Co jest najtrudniejsze przy wycenie?',
    participantReply: 'Ręczne rozpisywanie elementów zabiera mi dużo uwagi.',
    acceptableNextMove: 'Zapytaj o rzeczywisty przykład tego rozpisywania, trzymając się słowa „uwaga”.',
    mustNotInfer: ['To zabiera dużo czasu.', 'Często powstają błędy.'],
  },
  {
    id: 'unknown-frequency-remains-unknown',
    precedingAgentQuestion: 'Jak często zdarzają się pomyłki przy rozpisywaniu?',
    participantReply: 'Nie wiem, nie umiem tego oszacować.',
    acceptableNextMove: 'Zaakceptuj brak liczby. Jeśli częstotliwość jest ważna, poproś o jeden przykład bez żądania oszacowania.',
    mustNotInfer: ['Pomyłki są częste.', 'Straty są regularne.'],
  },
  {
    id: 'yes-does-not-resolve-alternative',
    precedingAgentQuestion: 'Czy główny kłopot to pomyłki uszkadzające elementy, czy czas potrzebny na nawiercanie?',
    participantReply: 'Tak.',
    acceptableNextMove: 'Nie wybieraj żadnej opcji. Gdy to ważne, zapytaj krótko, czy chodzi o błędy, czas, czy oba.',
    mustNotInfer: ['Elementy są uszkadzane.', 'Głównym kłopotem jest czas.', 'Oba problemy są potwierdzone.'],
  },
  {
    id: 'missing-template-is-not-proven-cause',
    precedingAgentQuestion: 'Co utrudnia dokładne nawiercanie?',
    participantReply: 'Nie mam odpowiedniego szablonu.',
    acceptableNextMove: 'Uznaj brak szablonu za wskazaną trudność. Nie stwierdzaj przyczynowości ani nie obiecuj skutku nowego szablonu.',
    mustNotInfer: ['To bezpośrednia przyczyna niszczenia elementów.', 'Szablon wyeliminuje błędy.'],
  },
  {
    id: 'explicit-incident-can-be-a-fact',
    precedingAgentQuestion: 'Czy pamiętasz konkretny przypadek, gdy coś poszło nie tak?',
    participantReply: 'Wczoraj przepisałem zły wymiar z notatki i musiałem jeszcze raz przygotować wycenę.',
    acceptableNextMove: 'Możesz odnieść się do tej konkretnej pomyłki jako faktu. Nie uogólniaj jej na wszystkie wyceny.',
    mustNotInfer: ['Każda wycena ma błąd.', 'Automatyzacja na pewno temu zapobiegnie.'],
  },
];
