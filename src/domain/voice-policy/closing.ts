/** Instructions shared with the voice agent. The interview prompt decides when to use them. */
export const CLOSING_POLICY_PROMPT = `DOMYKANIE ROZMOWY:
NAJWYŻSZY PRIORYTET: gdy rozmówca mówi, że to wszystko, dziękuje na zakończenie, musi kończyć, podaje gotowe rozwiązanie i mówi o zakończeniu wywiadu albo nie chce dalszych pytań, natychmiast zakończ krótkim, naturalnym zdaniem. Nie dopytuj o brakujące kroki, nawet jeśli opis procesu jest niepełny. Na przykład po „To wszystko, dzięki” lub „Rozwiązanie zostało podane, możemy zakończyć wywiad” odpowiedz tylko „Dzięki wielkie za rozmowę, mam pełen obraz. Miłego dnia!”. Ta reguła ma pierwszeństwo przed pogłębianiem procesu i pokrywaniem braków.

GDY ROZMÓWCA MÓWI O AUTOMATYZACJI LUB ROZWIĄZANIU: jeśli rozmówca sam mówi, że celem jest automatyzacja tego procesu albo sam podsumowuje rozwiązanie, nie cofaj rozmowy do drążenia kolejnych etapów ani nie pytaj „co w tym jest najtrudniejsze”. Potwierdź krótko: „Jasne, automatyzacja [procesu] to idealny kierunek. Dzięki za wyjaśnienie!”.

SYGNAŁ DO LĄDOWANIA: jeśli znasz już wejście, główne kroki, rezultat i jedną konkretną trudność (choćby to była po prostu nuda i ręczne przełączanie aplikacji) wraz z jej skutkiem, masz dość informacji. Zrób wtedy krótkie podsumowanie i poproś o jedną korektę, zamiast szukać kolejnych szczegółów. Gdy rozmówca wymienił aplikacje i mówi, że to monotonna praca i po prostu nie chce mu się tego robić ręcznie, Twoja NASTĘPNA odpowiedź ma być zwięzłym podsumowaniem (np. „Czyli sprawdzasz przelewy w banku i ręcznie zaznaczasz w kalendarzu, i chodzi po prostu o to, żeby nie klikać tego codziennie ręcznie. Zgadza się?”) i prośbą o potwierdzenie. Nie dopytuj wtedy o automaty, o czas, inne skutki ani o to, co jest głównym problemem. Nie musisz wypełnić wszystkich pól wywiadu.

Nie traktuj samego nazwania problemu ani potwierdzenia go przez rozmówcę jako gotowości do końca, jeśli nie znasz jeszcze żadnego kroku procesu. Jeśli nadal nie rozumiesz wybranego procesu, zadaj jedno krótkie pytanie o tę lukę w tym samym procesie. Nie rozpoczynaj wtedy podsumowania.

Gdy masz wystarczająco konkretny obraz, podsumuj go raz, krótko i własnymi słowami. Oddziel to, co rozmówca powiedział, od hipotezy. Nie nazywaj procesu czasochłonnym, kosztownym ani błędogennym, jeśli rozmówca tego nie stwierdził; samo „ręcznie” lub „nie chce mi się” nie dowodzi czasu ani błędu. Zapytaj tylko, czy coś źle zrozumiałeś lub pominąłeś. Nie obiecuj skuteczności rozwiązania. Jeśli rozmówca już chce skończyć, pomiń nawet to podsumowanie i pożegnaj się krótko.

Po potwierdzeniu podsumowania albo odpowiedzi, że nie ma poprawek, zakończ jednym naturalnym, krótkim zdaniem, na przykład „Dzięki, mam to”. Nie streszczaj ponownie, nie zadawaj kolejnego pytania i nie otwieraj nowego problemu. „Nie, wszystko” po pytaniu o poprawki znaczy brak poprawek, nie prośbę o poszerzenie zakresu.

Jeśli rozmówca poprawi podsumowanie, przyjmij konkretną poprawkę bez powtarzania całego podsumowania. Dopytaj tylko wtedy, gdy ta poprawka tworzy istotną lukę w zrozumieniu wybranego procesu. Jeśli „nie” jest odpowiedzią na pytanie „czy to się zgadza?”, ustal, co się nie zgadza, zamiast uznawać je za potwierdzenie.

Jeśli rozmówca wyraźnie chce zakończyć, uszanuj to nawet przy lukach. Nie wymuszaj kolejnych pytań dla kompletności wywiadu.`;

export type ClosingEvaluationCase = {
  id: string;
  checkpoint: string;
  expectedMove: 'deepen' | 'summarize_and_verify' | 'close' | 'accept_correction';
  success: string;
  failure: string;
};

/** Synthetic checkpoints for a future live voice agent evaluation, without private transcript text. */
export const CLOSING_EVALUATION_CASES: ClosingEvaluationCase[] = [
  {
    id: 'problem_named_process_unknown',
    checkpoint: 'Rozmówca mówi, że ręczne przygotowanie listy części bywa kłopotliwe i potwierdza, że to ważny temat. Nie opisał jeszcze ostatniego zlecenia ani kolejnych kroków.',
    expectedMove: 'deepen',
    success: 'Jedno pytanie o ostatni rzeczywisty przykład w tym samym procesie.',
    failure: 'Podsumowanie końcowe, propozycja automatyzacji albo pytanie o inny problem.',
  },
  {
    id: 'enough_detail_first_summary',
    checkpoint: 'Rozmówca podał konkretny przebieg jednej czynności, jej dane wejściowe, rezultat, trudność oraz swoją rolę w decyzji. Nie prosi o dalsze drążenie.',
    expectedMove: 'summarize_and_verify',
    success: 'Jedno zwięzłe, wierne faktom podsumowanie i jedna prośba o korektę. Hipoteza jest wyraźnie nazwana hipotezą.',
    failure: 'Długa lista ustaleń, obietnica eliminacji błędów albo seria pytań.',
  },
  {
    id: 'enough_detail_after_real_example',
    checkpoint: 'Rozmówca opisuje ostatnią wycenę: bierze wymiary z notatek, wpisuje elementy do arkusza, sam ustala cenę i wysyła gotowy arkusz. Przy poprawce musi ręcznie szukać wymiaru w kilku miejscach; raz przeoczył zmianę i klient wskazał błąd. Nie prosi o dalsze pytania.',
    expectedMove: 'summarize_and_verify',
    success: 'Krótkie podsumowanie tego procesu i jedna prośba o korektę, bez szukania innych trudności lub etapów.',
    failure: 'Pytanie o kolejne problemy, liczbę elementów, typ wyjątku lub następny szczegół po wystarczającym opisie.',
  },
  {
    id: 'incident_after_complete_process',
    checkpoint: 'Rozmówca podał już przebieg wyceny, ręczne poprawki oraz częstotliwość. Po pytaniu o konkretny skutek mówi, że raz przez przeoczoną pozycję wysłał klientowi błędną cenę.',
    expectedMove: 'summarize_and_verify',
    success: 'Następna odpowiedź zawiera krótkie, wierne faktom podsumowanie i jedno pytanie o korektę.',
    failure: 'Nie dopytuj już o czas, inne skutki, dodatkowe etapy ani o to, co jest głównym problemem. Nie nazywaj pracy czasochłonną bez takiego stwierdzenia rozmówcy.',
  },
  {
    id: 'routine_toil_is_enough_pain',
    checkpoint: 'Rozmówca opisał proces sprawdzania przelewów i zaznaczania w kalendarzu. Mówi: „Nic nie jest trudne, po prostu nie chce mi się tego klikać codziennie”.',
    expectedMove: 'summarize_and_verify',
    success: 'Zwięzłe podsumowanie procesu i uciążliwości manualnego klikania oraz jedno pytanie o zgodność obrazu.',
    failure: 'Wypytywanie o pomyłki, kłótnie z uczniami, szukanie nowego problemu lub zmuszanie do wskazywania trudności.',
  },
  {
    id: 'automation_desired_by_participant',
    checkpoint: 'Rozmówca podsumował rozwiązanie: „Dobra, tutaj już zostało podane rozwiązanie, chodzi o automatyzację tego przepisywania i możemy kończyć wywiad”.',
    expectedMove: 'close',
    success: 'Krótkie potwierdzenie automatyzacji i natychmiastowe zakończenie bez nowych pytań.',
    failure: 'Dalsze drążenie, dopytywanie o kolejne etapy lub ponawianie ankiety.',
  },
  {
    id: 'summary_confirmed',
    checkpoint: 'Po jednym podsumowaniu i pytaniu o poprawki rozmówca odpowiada: „Tak, zgadza się”.',
    expectedMove: 'close',
    success: 'Krótkie podziękowanie i koniec, bez pytania.',
    failure: 'Drugie podsumowanie, ponowna prośba o korektę albo nowy temat.',
  },
  {
    id: 'no_corrections',
    checkpoint: 'Po pytaniu „Czy coś pominąłem lub źle zrozumiałem?” rozmówca odpowiada: „Nie, wszystko”.',
    expectedMove: 'close',
    success: 'Krótkie domknięcie bez interpretowania „wszystko” jako całego procesu do usprawnienia.',
    failure: 'Powtórne wyliczanie ustaleń lub pytanie o inne etapy pracy.',
  },
  {
    id: 'summary_corrected',
    checkpoint: 'Rozmówca mówi: „Nie, błąd nie niszczy materiału, tylko opóźnia ofertę”.',
    expectedMove: 'accept_correction',
    success: 'Przyjęcie konkretnej poprawki bez powtórzenia całego podsumowania. Pytanie tylko gdy powstała ważna luka.',
    failure: 'Obrona poprzedniej tezy albo trzecie pełne podsumowanie.',
  },
  {
    id: 'accuracy_rejected',
    checkpoint: 'Po pytaniu „Czy taki obraz sytuacji jest zgodny?” rozmówca odpowiada tylko: „Nie”.',
    expectedMove: 'accept_correction',
    success: 'Jedno krótkie pytanie o to, co się nie zgadza.',
    failure: 'Uznanie „nie” za brak poprawek i zamknięcie rozmowy.',
  },
  {
    id: 'participant_wants_to_stop',
    checkpoint: 'Rozmówca mówi: „Muszę już kończyć”, choć nie zdążył opisać ważnego kroku procesu.',
    expectedMove: 'close',
    success: 'Uszanowanie końca rozmowy bez wymuszania brakujących odpowiedzi.',
    failure: 'Kolejne pytanie o proces lub rozbudowane podsumowanie oparte na domysłach.',
  },
];
