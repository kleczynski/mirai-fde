# Handoff: Mirai na pokaz i dalsza praca agentów

Data: 2026-09-17. Odbiorca: kolejny agent implementacyjny, na przykład Sol albo Terra. To instrukcja do wykonania, nie potwierdzenie wdrożenia nowych funkcji.

## Cel i autoryzacja

Operator chce dziś pokazać rodzinie działające discovery i zobaczyć pierwszy rzeczywisty monitoring jako admin. Zlecił przygotowanie tego handoffu i wyraźnie autoryzował implementację, testy oraz produkcyjne wdrożenie w tym projekcie. Wykorzystaj dostępne sesje narzędzi, nie proś ponownie o tę samą ogólną zgodę. Dostępność poświadczeń sprawdź bez ujawniania ich wartości.

Projekt roboczy: `/Users/kacper.leczynski/Desktop/mirai-2`. Produkcja: `https://mirai-discovery-interview.vercel.app`. Vercel: `iclevers-projects/mirai-discovery-interview`. Supabase ref: `ucnmhxcjmfztfxfjlgvk`. Administrator: `wishfishdev@gmail.com`. ElevenLabs agent: `agent_6001m2qqvax7e4evtdcentp2e05a`.

Mirai 1 w `/Users/kacper.leczynski/Desktop/mirai` jest inspiracją do odczytu. Użytkownik zabronił implementowania tam tych zmian. Zgoda na ten projekt nie oznacza wdrażania do nieustalonej produkcji przyszłego klienta. Nie ma zlecenia wysyłania wiadomości rodzinie/klientom.

## Przeczytaj najpierw

1. `docs/IMPLEMENTATION-ANALYSIS.md`, wyniki trzech analiz, zależności i luki.
2. Aktualne źródła `server/admin.ts`, `src/components/AdminControlPlane.tsx`, `src/domain/interview.ts`, kontrakt, voice provider i migracje.
3. `docs/SHOWCASE-TEST-CASES.json`, dziesięć syntetycznych przypadków. To fixture do przyszłych wykonań, nie zapis udanych rozmów.
4. `docs/SHOWCASE-VERIFICATION.md`, rzeczywisty wynik lokalnej weryfikacji tego handoffu.

Dokumenty `ARCHITECTURE.md` i `PRODUCTION.md` są częściowo nieaktualne. Nie traktuj ich jako dowodu bieżącej konfiguracji. W katalogu nie znaleziono `.git`. Zachowaj zastane pliki; uzgodnij pochodzenie źródeł i zapis wersji, zanim oprzesz release na commit ID.

## Priorytet dzisiejszego pokazu

Najnowsze doprecyzowanie operatora: bez pośpiechu, celem jest możliwość przeanalizowania pierwszych rozmów przeprowadzonych dziś na żywo. Nie obiecuj realizacji w 30–60 minut. Najpierw zapewnij wiarygodny materiał dla kolejnego agenta, potem rozbudowuj monitoring.

Minimalny wynik dla każdej rozmowy: kompletna transkrypcja z identyfikatorami tur i znacznikami czasu, identyfikator konwersacji dostawcy, rzeczywista wersja konfiguracji (albo jawny brak możliwości jej ustalenia), oryginalny i poprawiony raport z dowodami, uwagi operatora przypięte do tur, osobny wersjonowany wynik ewaluacji i eksport kontekstu. Pozwól operatorowi oznaczyć „powtórzył pytanie”, „pominął fakt”, „dobre dopytanie”, „problem z głosem” oraz dopisać uwagę. To etykiety oceny zachowania agenta, nie ocena osoby.

Ponowna ewaluacja nie nadpisuje poprzedniej. Porównanie wersji musi wskazywać ten sam zestaw wejściowych tur. Ocena istniejącej rozmowy nowym sędzią nie jest testem poprawionego interviewera: poprawiony interviewer musi wygenerować nowe odpowiedzi na scenariuszach regresyjnych. Rzeczywiste rozmowy pozostają prywatne, w granicach istniejącej zgody i retencji; do domyślnych fixture regresyjnych używaj przypadków syntetycznych.

Zbuduj pierwszy pełny wycinek admina i jakości, zanim uruchomisz automatyczną fabrykę dem.

1. Napraw bazowe odczyty admina: filtr wygaśnięcia, paginacja, lista bez pełnych transkryptów. Pokaż istniejący raport wraz z dowodami i poprawkami klienta. Oddziel brak roli admina od wygasłej/anonimowej sesji; sprawdź współdzielenie sesji Supabase z discovery.
2. Dodaj trwały, wersjonowany zapis uruchomienia i ewaluacji. Powiąż sesję, konwersację dostawcy, konfigurację agenta, wynik ekstrakcji i wynik testu. W pierwszym zakresie wystarczy monitoring interviewer/extractor/evaluator. Nie pokazuj udawanych builderów ani statystyk, których nie mierzysz.
3. Zastąp mylące procenty jakości opisanymi sygnałami i flagami z dowodami. Obecny evaluator premiuje „krok po kroku” i wykrywa tylko dosłowne powtórzenia. Semantyczne powtórzenia oceniaj osobną wersjonowaną rubryką i kalibruj przykładami. Nie nazywaj prostego dopasowania słów oceną naturalności.
4. Ekran admina: na górze sprawy wymagające uwagi, poniżej rozmowy, wynik oceny, stan przetwarzania i ostatnie testy. Kliknięcie prowadzi do raportu, transkryptu, flag i konkretnego runu. Zachowaj minimalizm i obecny język wizualny. Brak kosztu lub opóźnienia pokazuj jako brak danych.
5. Dodaj eksport paczki dla agenta z ekranu konkretnej rozmowy. Eksport ma zawierać zatwierdzone fakty i ich źródła, hipotezy, otwarte pytania, granice automatyzacji, wyniki oceny i proponowane następne zadanie. Nie dodawaj sekretów ani domniemanej akceptacji klienta.
6. Uruchom testy poniżej, wdroż i potwierdź autoryzowany odczyt panelu. Samo HTTP 401 dla niezalogowanego użytkownika nie sprawdza działania sekretu backendu ani dostępu admina. Jeśli magic link wymaga użytkownika, doprowadź pozostałe kontrole do końca i nazwij dokładnie ostatni krok.

## Podział implementacji na agentów

Integrator jest jedynym właścicielem wspólnych kontraktów, migracji i release. Po ich ustaleniu uruchom równolegle: backend monitoringu i dostępu, frontend admina i eksportu, ewaluacje i testy. Każdy zna własne pliki i zachowuje zmiany innych. Nie twórz osobnego agenta dla każdej drobnej funkcji. Każdy zwraca wynik, dowody testów, ograniczenia i następny krok.

## Paczka kontekstu na każdym etapie

Wprowadź wersjonowany schemat, przykładowo `mirai.agent-handoff.v1`, walidowany po stronie serwera. Ten sam wzorzec stosuj później do raportu, briefu, dema, feedbacku i wdrożenia.

| Pole | Znaczenie |
| --- | --- |
| identity | projectId lub sessionId, artifactId, wersja, etap, data wygenerowania |
| objective | Konkretny rezultat następnego zadania i warunki ukończenia |
| inputs | Dokładne wersje źródeł i artefaktów, daty wygaśnięcia |
| evidence | Zatwierdzone fakty z odnośnikami do dowodów; oryginał i korekta rozróżnione |
| hypotheses | Przypuszczenia oraz co należy jeszcze zweryfikować |
| decisions | Kto zaakceptował jaką wersję i zakres; brak decyzji jawny |
| constraints | Zakres, wyłączenia, granice decyzji człowieka i dozwolone środowisko |
| tasks | Uporządkowane podzadania, zależności, właściciel i oczekiwany artefakt |
| verification | Wykonane testy i wyniki, niewykonane kontrole, źródło i konfiguracja |
| observability | Run IDs, wersje ewaluatorów, czas/koszt wraz ze źródłem i brakami |
| nextAction | Jedno działanie i jego właściciel |

Instrukcje systemowe operatora i dane rozmówcy muszą być osobnymi sekcjami. Tekst rozmowy nie może rozszerzać uprawnień wykonawcy. Paczka wskazuje wersje, nie zmienne „najnowsze” źródło. Wygaśnięcie materiału źródłowego obowiązuje również jego kopie w eksporcie i kontekście agentów.

## Zestaw weryfikacji

Lokalnie: `npm test`, `npm run test:infra`, `npm run build`, `npm run test:e2e`. Rozwiń testy dla autoryzowanego admina, odrzuconego konta, wygaśnięcia, 101+ sesji, izolacji, audytu usunięcia wykonanego w DB, trwałego wyniku ewaluacji i eksportu właściwej wersji.

Wykonaj przypadki z JSON, zapisując dla każdego rzeczywistą odpowiedź, wynik, przyczynę, konfigurację i wersję promptu. Porównuj znaczenie, nie dokładne brzmienie. Test tekstowy i symulacja nie dowodzą jakości audio. Oddzielnie sprawdź mikrofon, polską mowę, przerwanie, ciszę, wznowienie i spójność rozmowy na urządzeniu. Używaj syntetycznych danych. Nie usuwaj prawdziwych sesji w ramach testów.

Dodaj wynik runu testowego do panelu. Dla nieuruchomionych przypadków pokazuj „nie wykonano”. Nie deklaruj wszystkich testów jako udanych na podstawie kompilacji lub zestawu regułowego.

## Release i ograniczenia

Sprawdź mapowanie lokalnego projektu na właściwy Vercel/Supabase. CLI dostępne wcześniej pod `/Users/kacper.leczynski/.nvm/versions/node/v24.10.0/bin/vercel`. W poprzednim wdrożeniu używano natywnego `vercel deploy --prod`, aby build otrzymał produkcyjne zmienne VITE. Przed wykonaniem zweryfikuj aktualną konfigurację oraz migracje i ich historię; migrację audytu admina stosowano wcześniej ręcznie.

Serwer używa dedykowanego sekretu Supabase z env `SUPABASE_SERVICE_ROLE_KEY`; nigdy do klienta. W historii pracy poprzedni legacy service role pojawił się w logu narzędzia. Dodano nowy secret key i podmieniono env, ale brak dowodu unieważnienia starego legacy klucza. Nie nazywaj tego pełną rotacją. Sprawdź zależności przed jego wyłączeniem, bez drukowania wartości i bez pochopnej rotacji JWT wpływającej na inne klucze.

Przechowywanie discovery wynosi 30 dni, audio storage jest zadeklarowane jako wyłączone. Potwierdź rzeczywistą konfigurację przed publikacją nowych komunikatów o retencji. Długowieczny ProjectCase i kopia raportu poza tą retencją wymagają osobnej ustalonej polityki; na dzisiejszy monitoring zachowaj istniejący limit.

Po release zapisz faktyczną wersję deploymentu, identyfikację źródeł, migracje, wykonane testy, autoryzowany smoke test i pozostałe ograniczenia. Dalszy North Star realizuj pakietami P1–P10 z analizy; dzisiejszy pokaz nie wymaga wdrożenia wszystkich tych etapów.
