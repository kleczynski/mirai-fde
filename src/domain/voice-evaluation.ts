import { CLOSING_EVALUATION_CASES } from './voice-policy/closing.js';
import { EVIDENCE_EVAL_SCENARIOS } from './voice-policy/evidence.js';
import { FOCUS_EVAL_CASES } from './voice-policy/focus.js';
import { STYLE_EVAL_CASES } from './voice-policy/style.js';

export type VoiceEvalTurn = { role: 'agent' | 'user'; text: string };
export type VoiceEvalCase = {
  id: string;
  category: 'focus' | 'evidence' | 'closing' | 'tone' | 'simulation';
  history: readonly VoiceEvalTurn[];
  expected: string;
  forbidden: string;
  critical: boolean;
};

const focusMoves: Record<(typeof FOCUS_EVAL_CASES)[number]['expectedMove'], string> = {
  establish_focus: 'Zapytaj o jeden konkretny proces lub ostatni przypadek, nie zakładając branżowego problemu.',
  deepen_same_process: 'Zadaj jedno krótkie pytanie o ostatni rzeczywisty przykład w już wybranym procesie.',
  accept_correction: 'Przyjmij korektę zakresu i pozostań przy tym samym procesie.',
  finish: 'Podziękuj krótko i zakończ bez pytania.',
  switch_on_request: 'Uszanuj wyraźną prośbę rozmówcy o zmianę tematu.',
};

const closingHistory: Record<(typeof CLOSING_EVALUATION_CASES)[number]['id'], readonly VoiceEvalTurn[]> = {
  problem_named_process_unknown: [
    { role: 'agent', text: 'Co dziś jest dla Ciebie kłopotliwe w pracy?' },
    { role: 'user', text: 'Ręczne przygotowanie listy części do wyceny bywa kłopotliwe. Chcę o tym pogadać.' },
  ],
  enough_detail_first_summary: [
    { role: 'agent', text: 'Jak to wygląda na ostatnim zleceniu?' },
    { role: 'user', text: 'Biorę wymiary z notatek, rozpisuję elementy w arkuszu, sprawdzam je i dopiero wtedy przygotowuję wycenę. Najtrudniej mi pilnować poprawek wymiarów. Ostateczną cenę ustalam sam.' },
    { role: 'agent', text: 'Czy jest coś ważnego w tym procesie, czego jeszcze nie dotknęliśmy?' },
    { role: 'user', text: 'Nie, to chyba cały obraz.' },
  ],
  enough_detail_after_real_example: [
    { role: 'agent', text: 'Co dokładnie stało się przy ostatniej poprawce?' },
    { role: 'user', text: 'W notatkach miałem nowy wymiar półki. W arkuszu musiałem znaleźć go w kilku miejscach i ręcznie zmienić. Jedno miejsce przeoczyłem, potem klient wskazał błąd. Po sprawdzeniu sam ustaliłem cenę i wysłałem gotowy arkusz jako plik.' },
  ],
  incident_after_complete_process: [
    { role: 'agent', text: 'Jak wyglądała ostatnia wycena?' },
    { role: 'user', text: 'Biorę wymiary z notatek, wpisuję elementy do arkusza, sprawdzam wszystko i sam ustalam cenę.' },
    { role: 'agent', text: 'Co jest przy tym najtrudniejsze?' },
    { role: 'user', text: 'Poprawki po zmianach klienta. Muszę ręcznie zmieniać powiązane pozycje. To zdarza się dość często.' },
    { role: 'agent', text: 'Jaki był konkretny skutek ostatnim razem?' },
    { role: 'user', text: 'Raz przeoczyłem jedną pozycję przy poprawce i wysłałem klientowi błędną cenę.' },
  ],
  routine_toil_is_enough_pain: [
    { role: 'agent', text: 'Co robisz przy sprawdzaniu wpłat od uczniów?' },
    { role: 'user', text: 'Sprawdzam przelewy w aplikacji banku i zmieniam kolory zajęć w Kalendarzu Google. Nic nie jest w tym trudne, po prostu nie chce mi się tego klikać codziennie.' },
  ],
  automation_desired_by_participant: [
    { role: 'agent', text: 'Co w tym przepisywaniu zajmuje najwięcej uwagi?' },
    { role: 'user', text: 'Dobra, tutaj już wszystko wyjaśniłam, chodzi po prostu o automatyzację tego przepisywania z banku do kalendarza i możemy kończyć wywiad.' },
  ],
  summary_confirmed: [
    { role: 'agent', text: 'Czy dobrze rozumiem: z notatek przenosisz wymiary do arkusza, sprawdzasz poprawki i sam ustalasz cenę? Czy coś pomyliłem?' },
    { role: 'user', text: 'Tak, zgadza się.' },
  ],
  no_corrections: [
    { role: 'agent', text: 'Podsumowując: rozpisujesz elementy na podstawie wymiarów i sprawdzasz poprawki przed wyceną. Czy coś pominąłem lub źle zrozumiałem?' },
    { role: 'user', text: 'Nie, wszystko.' },
  ],
  summary_corrected: [
    { role: 'agent', text: 'Czy dobrze rozumiem, że błędny wymiar niszczy materiał?' },
    { role: 'user', text: 'Nie, błąd nie niszczy materiału, tylko opóźnia ofertę.' },
  ],
  accuracy_rejected: [
    { role: 'agent', text: 'Czy taki obraz sytuacji jest zgodny?' },
    { role: 'user', text: 'Nie.' },
  ],
  participant_wants_to_stop: [
    { role: 'agent', text: 'Co dzieje się po sprawdzeniu wymiarów?' },
    { role: 'user', text: 'Muszę już kończyć, dzięki.' },
  ],
};

export const VOICE_EVAL_SUITE_VERSION = 'mirai.voice-quality.v1';

/** Synthetic examples only. Never copy a participant transcript into this source file. */
export const VOICE_EVAL_CASES: readonly VoiceEvalCase[] = [
  ...FOCUS_EVAL_CASES.map(entry => ({
    id: `focus.${entry.id}`,
    category: 'focus' as const,
    history: entry.turns.map(turn => ({ role: turn.speaker === 'mirai' ? 'agent' as const : 'user' as const, text: turn.text })),
    expected: focusMoves[entry.expectedMove],
    forbidden: entry.mustNot,
    critical: entry.expectedMove === 'finish',
  })),
  ...EVIDENCE_EVAL_SCENARIOS.map(entry => ({
    id: `evidence.${entry.id}`,
    category: 'evidence' as const,
    history: [
      { role: 'agent' as const, text: entry.precedingAgentQuestion },
      { role: 'user' as const, text: entry.participantReply },
    ],
    expected: entry.acceptableNextMove,
    forbidden: `Nie przedstawiaj jako faktu: ${entry.mustNotInfer.join(' | ')}`,
    critical: true,
  })),
  ...CLOSING_EVALUATION_CASES.map(entry => ({
    id: `closing.${entry.id}`,
    category: 'closing' as const,
    history: closingHistory[entry.id],
    expected: entry.success,
    forbidden: entry.failure,
    critical: entry.expectedMove === 'close' || entry.expectedMove === 'summarize_and_verify',
  })),
  ...STYLE_EVAL_CASES.map(entry => ({
    id: `tone.${entry.id}`,
    category: 'tone' as const,
    history: entry.history,
    expected: entry.expected,
    forbidden: entry.forbidden,
    critical: entry.id !== 'natural_short_follow_up',
  })),
];

export type VoiceSimulationCase = {
  id: string;
  scenario: string;
  maxTurns: number;
  successConditions: readonly string[];
};

/** Text simulations exercise the conversation flow, not microphone or speech quality. */
export const VOICE_SIMULATION_CASES: readonly VoiceSimulationCase[] = [
  {
    id: 'simulation.one_process_then_finish',
    scenario: 'Jesteś właścicielem małego zakładu stolarskiego. Rozmawiasz po polsku i naturalnie. Jedyny temat, który chcesz omówić, to ręczne rozpisywanie elementów do wyceny. Na prośbę agenta opisz ostatnią wycenę: bierzesz wymiary z notatek, wpisujesz elementy do arkusza, sprawdzasz poprawki i sam ustalasz cenę. Trudność to pilnowanie poprawek. Nie mów o błędach, stratach materiału ani oszczędnościach czasu, jeśli agent sam je zasugeruje. Po najwyżej trzecim pytaniu agenta, niezależnie od tego, czy agent podsumował rozmowę, powiedz: „To wszystko, dzięki, muszę kończyć”. Nie odpowiadaj już na dalsze pytania i nie inicjuj innego tematu.',
    maxTurns: 7,
    successConditions: [
      'Agent trzyma się wybranego procesu i pyta o rzeczywisty przykład, zamiast szukać kolejnego problemu.',
      'Agent nie przedstawia błędów, strat materiału ani oszczędności czasu jako potwierdzonych faktów.',
      'Po „To wszystko, dzięki, muszę kończyć” agent kończy krótko, bez ponownego podsumowania i bez pytania.',
    ],
  },
  {
    id: 'simulation.correction_and_ambiguity',
    scenario: 'Jesteś osobą przygotowującą wyceny w warsztacie. Rozmawiasz po polsku. Twoim tematem jest przepisywanie wymiarów z notatek do arkusza. Gdy agent zapyta, czy problemem są błędy czy czas, odpowiedz najpierw tylko „Tak”. Dopiero po doprecyzowaniu powiedz, że chodzi o błędy w przepisywaniu, nie o czas. Gdy agent podsumuje, popraw go raz: błędy nie niszczą materiału, ale opóźniają ofertę. Po przyjęciu poprawki powiedz, że nie masz nic więcej do dodania. Nie wymyślaj liczb ani innych procesów.',
    maxTurns: 10,
    successConditions: [
      'Agent nie uznaje samego „Tak” za potwierdzenie obu alternatyw i w razie potrzeby doprecyzowuje.',
      'Agent przyjmuje korektę dotyczącą skutku błędu bez obrony poprzedniej tezy.',
      'Agent kończy naturalnie po informacji, że nie ma nic więcej, bez kolejnego długiego podsumowania.',
    ],
  },
  {
    id: 'simulation.solo_operator_plain_tone',
    scenario: 'Jesteś osobą, która samodzielnie robi wyceny w małym warsztacie. Rozmawiasz po polsku, zwyczajnie. Powiedz, że ręcznie przenosisz wymiary z notatek do arkusza i poprawiasz je, gdy klient coś zmieni. Nie masz zespołu ani podwładnych. Nie podawaj liczby godzin, pieniędzy ani oszczędności, bo ich nie znasz. Jeśli agent użyje słów „Twój zespół” lub przypisze Ci zarządzanie ludźmi, popraw go wprost: „Robię to sam”. Po kilku pytaniach powiedz: „Dobra, muszę kończyć, dzięki”.',
    maxTurns: 7,
    successConditions: [
      'Agent mówi naturalnie i krótko, bez tonu prezentacji biznesowej, oraz zadaje najwyżej jedno pytanie na turę.',
      'Agent nie przypisuje rozmówcy zespołu, podwładnych ani zarządzania nimi i przyjmuje ewentualną korektę.',
      'Agent nie prognozuje oszczędności, wydajności ani wpływu na firmę bez danych od rozmówcy.',
      'Po „muszę kończyć” agent kończy krótko i bez kolejnego pytania.',
    ],
  },
  {
    id: 'simulation.senior_artisan_solo',
    scenario: 'Jesteś 54-letnim rzemieślnikiem prowadzącym jednoosobowy zakład stolarski. Rozmawiasz po polsku, potocznie i prosto. Nie znasz się na technologii. Mówisz, że robisz meble kuchenne i szafy. Jedyny proces, o którym chcesz mówić, to ręczne rozpisywanie wymiarów i kalkulacja ceny. Na pytanie o programy mówisz: „Wszystko robię na kartce”. Gdy agent pyta o statystyki, procenty lub ile razy w miesiącu, mówisz krótko: „Nie wiem, nie liczę tego”. Na pytanie o konkretny skutek podajesz fakt: „Raz przez zły wymiar wysłałem klientowi złą cenę i musiałem poprawiać”. Gdy agent podsumuje i zapyta, czy coś pominął, odpowiadasz: „Nie, wszystko”. Po tym nie chcesz już żadnych pytań o inne etapy czy szuflady.',
    maxTurns: 8,
    successConditions: [
      'Agent nie używa korporacyjnego żargonu ani nie przypisuje rozmówcy zespołu lub zarządzania pracownikami.',
      'Agent akceptuje brak wiedzy o statystykach bez naciskania na liczby.',
      'Po opisaniu błędu z ceną agent przechodzi do podsumowania zamiast szukać kolejnego problemu.',
      'Po „Nie, wszystko” na pytanie o poprawki agent kończy rozmowę i nie pyta o inne etapy ani procesy.',
    ],
  },
  {
    id: 'simulation.dentist_busy_clinic',
    scenario: 'Jesteś lekarką dentystką prowadzącą mały gabinet stomatologiczny. Rozmawiasz konkretnie, rzeczowo, w biegu między pacjentami. Skupiasz się na jednym procesie: zamawianiu specjalistycznych materiałów i wypełnień stomatologicznych. Asystentka sprawdza braki w szafce i pisze listę na kartce, a Ty wieczorem zamawiasz to w hurtowni przez telefon lub sklep internetowy. Trudność: asystentka zapomni dopisać brakującej pozycji, a Ty orientujesz się dopiero przy fotelu z pacjentem. Skutek: trzeba przekładać zabieg na inny termin. Jeśli agent zacznie pytać o inne obszary gabinetu, procedury medyczne lub obrót kliniki, powiedz: „Zostańmy przy zamawianiu materiałów, to jest teraz kłopot”. Po podsumowaniu mówisz: „Tak, dokładnie o to chodzi, muszę wracać do gabinetu, dziękuję”.',
    maxTurns: 7,
    successConditions: [
      'Agent trzyma się procesu zamawiania materiałów i nie próbuje analizować procedur medycznych ani diagnozy.',
      'Agent nie przypisuje gabinetowi niepotwierdzonych korzyści biznesowych ani automatyzacji decyzji lekarskich.',
      'Po pożegnaniu i informacji o powrocie do gabinetu agent kończy krótko bez kolejnego pytania.',
    ],
  },
  {
    id: 'simulation.tutor_revolut_calendar',
    scenario: 'Jesteś korepetytorką. Rozmawiasz bezpośrednio, bez stresu. Twój jedyny proces: po zajęciach sprawdzasz w Revolucie przelewy od uczniów i ręcznie zmieniasz kolory wpisów w Kalendarzu Google, żeby widzieć, kto zapłacił. Trudność: nic w tym nie jest trudne ani skomplikowane, to po prostu monotonna robota i nie chce Ci się tego robić codziennie ręcznie (zajmuje to kilkanaście minut). Chcesz zautomatyzować to powiązanie. Jeśli agent wmawia Ci stres, kłótnie z uczniami albo próbuje doszukiwać się wielkich problemów, powiedz: „Nie mam stresu, po prostu nie chce mi się tego klikać”. Gdy agent zrozumie proces i potwierdzi automatyzację, powiedz: „Dokładnie, rozwiązanie zostało podane, możemy kończyć wywiad, dziękuję”.',
    maxTurns: 7,
    successConditions: [
      'Agent nie powtarza za każdym razem „Rozumiem, że...” ani nie parafrazuje dosłownie słów rozmówcy.',
      'Agent akceptuje zwykłą monotonię i niechęć do ręcznego klikania jako wystarczającą trudność, bez wmawiania stresu czy awantur.',
      'Gdy rozmówca wskazuje gotowość do zakończenia po podaniu automatyzacji, agent natychmiast zamyka rozmowę i nie zadaje kolejnych pytań.',
    ],
  },
];
