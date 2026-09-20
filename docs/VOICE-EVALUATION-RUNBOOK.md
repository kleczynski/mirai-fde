# Iteracja jakości agenta głosowego

Stan na 2026-09-18. Zestaw `mirai.voice-quality.v1` używa wyłącznie syntetycznych rozmów. Prawdziwa transkrypcja uczestnika nie jest wysyłana do testów.

## Co mierzymy

Zestaw ma 29 przypadków `Next Reply` oraz 6 wieloturowych symulacji (w tym persony: stolarz senior, dentystka w biegu, korepetycje Revolut/Kalendarz, samodzielny wykonawca). Sprawdza utrzymanie jednego procesu, nieprzypisywanie rozmówcy niepotwierdzonych faktów, naturalne zakończenie, zakaz echa i parafraz („Rozumiem, że...”), akceptację monotonii jako wystarczającej trudności, swobodniejszy ton oraz brak założeń o zespole i oszczędnościach. Ocena dostawcy jest tylko sygnałem. Każdy wynik krytyczny wymaga obejrzenia rzeczywistej odpowiedzi agenta, zwłaszcza gdy ocena i tekst są sprzeczne.

To są testy tekstowe modelu konwersacyjnego. Nie sprawdzają rozpoznawania mowy, wymowy, opóźnienia audio ani przerwań. Te cechy wymagają osobnego odsłuchu.

## Uruchomienie

Na serwerze lub lokalnie ustaw `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` i `ELEVENLABS_EVAL_CANDIDATE_BRANCH_ID`. Klucz pozostaje po stronie serwera; nigdy nie dodawaj go do `VITE_*` ani do raportu. Identyfikator kandydata jest identyfikatorem gałęzi, nie agenta.

```sh
npm run eval:voice -- preview
npm run eval:voice -- sync
npm run eval:voice -- compare --repeat=3
npm run eval:voice -- simulate --repeat=1
```

`sync` dodaje brakujące definicje testów do biblioteki ElevenLabs, identyfikując je po nazwie i skrócie treści. `compare` uruchamia te same przypadki na Main i wskazanej gałęzi. `simulate` robi to dla wieloturowych scenariuszy. Opcjonalne `--cases=closing.participant_wants_to_stop,tone.natural_short_follow_up` ogranicza zestaw, a `--out=/bezpieczna/sciezka.json` wskazuje plik wyniku. Raport lokalny powstaje z uprawnieniami 0600 w `.local/voice-evals/`, który jest ignorowany przez Git.

Zachowuj wersje i identyfikatory wywołań zwrócone przez dostawcę. API uruchamiania testów pozwala wskazać gałąź, ale nie konkretny `version_id`; raport odrzuca wykonanie na szkicu. Przed porównaniem sprawdź, czy obie strony odzwierciedlają zamierzone opublikowane wersje. Nie publikuj Main tylko po to, by uzyskać zielony test.

## Odczyt śladu pojedynczej rozmowy

`POST /api/admin/session-trace` przyjmuje `{ "sessionId": "...", "runId": "..." }`. Wymaga administratora i niewygasłej sesji. Serwer ustala identyfikator rozmowy wyłącznie z przypisanego do sesji uruchomienia głosowego, pobiera format OpenTelemetry od ElevenLabs i zwraca transkrypt, wersję, gałąź oraz ograniczoną listę spanów. Nie zwraca adresów nagrań, parametrów narzędzi ani treści rozumowania. Nie zapisuje śladu ponownie w bazie. Gdy dostawca nie zwróci wersji, wynik pozostaje `unknown`.

W panelu administratora wybierz rozmowę, a w sekcji „Uruchomienia” użyj „Pobierz ślad ElevenLabs” przy wybranym uruchomieniu głosowym. Widok pokazuje wersję, gałąź, liczbę tur oraz spany i czasy. Przycisk „Sprawdź ElevenLabs” w nagłówku panelu wykonuje oddzielny test produkcyjnego klucza i podpisanego adresu; nie zwraca adresu ani klucza przeglądarce i nie sprawdza mikrofonu.

Wymagany jest działający klucz ElevenLabs z uprawnieniem `CONVAI_READ` do odczytu rozmów w formacie OpenTelemetry. Produkcyjne środowisko Vercel ma już zmienne `ELEVENLABS_API_KEY` i `ELEVENLABS_AGENT_ID`; samo istnienie zmiennych nie potwierdza zakresu uprawnień klucza. W lokalnym środowisku tych sekretów nie ma. Brak klucza daje 503, brak identyfikatora rozmowy w uruchomieniu daje 409. Dostęp podlega retencji sesji w Mirai; nie oznacza automatycznego usunięcia historii u dostawcy.

## Pilotaż w panelu ElevenLabs

Na gałęzi `Mirai conversation quality v2` o ruchu 0% uruchomiono cztery istniejące testy `Next Reply`: 3 zaliczone, 1 niezaliczony przez oceniającego. W niezaliczonym przypadku surowa odpowiedź agenta faktycznie kończyła rozmowę bez pytania. Jest to przykład fałszywego alarmu oceny automatycznej, a nie dowód porażki reguły. Sprawdzono wersję `agtvrsn_7101m2re85v0f4svecpp3ar6gsh5`.

Pierwsza symulacja procesu wyceny skończyła się limitem 8 tur. Kryteria utrzymania procesu i ostrożności z faktami przeszły, ale test nie doprowadził do pożegnania. Rzeczywiste odpowiedzi pokazały częste parafrazy i następne pytania o kolejne szczegóły tego samego procesu. Wariant z wymuszonym pożegnaniem po trzecim pytaniu zaliczył wszystkie trzy kryteria; po „To wszystko, dzięki, muszę kończyć” agent odpowiedział „Dzięki, mam to. Miłego dnia.”, bez pytania. Identyfikator przebiegu: `trun_7701m2smb5rnek58z0ee419rrgvk`. Wcześniejszy przebieg: `trun_6701m2sm02nnfypsj34ebc82maks`.

W panelu pojedynczy krok drugiego przebiegu pokazał model `Qwen3.5-397B-A17B`, 219 ms do pierwszego zdania, 244 ms do ostatniego, 2995 tokenów wejścia i 11 wyjścia. To ślad jednego kroku, nie pełny eksport OpenTelemetry. Nie uruchomiono jeszcze pełnego porównania Main kontra kandydat: w lokalnym środowisku nie ma `ELEVENLABS_API_KEY` ani `ELEVENLABS_AGENT_ID`.

Dodano syntetyczny test `Mirai Q1: samodzielna praca bez zespołu`. Rozmówca prowadzi wyceny sam, zapisuje wymiary w notesie i przepisuje je do arkusza. Pierwszy przebieg oceniający zaliczył mimo długiej parafrazy oraz dopisania niepodanych elementów, „miarki” i „klienta”. Po doprecyzowaniu reguły pytania na szkicu kandydata kolejny przebieg nie dopisał tych elementów, ale nadal powtórzył znane kroki przed pytaniem. Oznacza to częściową poprawę w ocenie ręcznej, nie gotowość do publikacji. Identyfikator późniejszego przebiegu: `trun_7201m2sn51y7e7jbfxg8k1ar3ha6`.

Po pilotażu test dołączony omyłkowo do nieopublikowanego szkicu Main został odłączony za zgodą operatora. Test pozostał w bibliotece; Main ponownie wyświetla „No tests attached”. Nie zmieniono udziału ruchu ani nie opublikowano nowej wersji Main.

## Wdrożenie i sprawdzenie produkcji 2026-09-18

Kod serwera z chronionym `POST /api/admin/session-trace` i `POST /api/admin/voice-health` jest na produkcyjnym wdrożeniu Vercel `dpl_42nwUHTD3UaL7ZVU9iYnwf7JKFnJ` pod `https://mirai-discovery-interview.vercel.app`. Po wdrożeniu `GET /api/config` zwrócił 200 i włączone funkcje `voice`, `extraction` oraz `adaptiveInterview`. Żądania do obu endpointów administracyjnych bez sesji zwróciły 401. Strona główna i panel administratora otworzyły się; panel pokazał sześć rozmów.

Za zgodą operatora utworzono ograniczony klucz ElevenLabs `mirai-prod-server-2026-09-18` z uprawnieniem ElevenAgents Write, podmieniono `ELEVENLABS_API_KEY` w produkcyjnym środowisku Vercel, ustawiono `ELEVENLABS_AGENT_ID` na agenta Mirai i wykonano nowy deployment. Wartości oznaczonych jako Sensitive zmiennych Vercel nie da się później odczytać przez `vercel env pull`; widoczne zastępniki **nie są dowodem** na nieprawidłowy klucz. Autoryzowany test z panelu `Sprawdź ElevenLabs` potwierdził, że produkcyjny serwer dostaje podpisany adres dla agenta Mirai w środowisku `production`; adres i klucz nie są zwracane do przeglądarki. Autoryzowany odczyt śladu rozmowy `3ccc90a1-533c-439d-95d7-6247c8c022d3` również zadziałał: dostawca zwrócił 37 tur, 38 spanów, gałąź Main i wersję `agtvrsn_4701m2qtd6prfnr94yhghhjh11h9`. Nie sprawdzono jeszcze mikrofonu, połączenia WebSocket ani jakości audio.

Gałąź `Mirai conversation quality v2` została opublikowana jako wersja `agtvrsn_7101m2sr0ncrf24s9qgqrxj1r0hh` i uruchomiona jako produkcyjny canary z **5% ruchu**; Main zachowuje **95%**. Do gałęzi dołączono osiem testów syntetycznych, w tym regresję `Mirai Q1: ląduj po konkretnym skutku`, odtworzoną z nieudanego przebiegu symulacji. Po doprecyzowaniu promptu dwa pełne przebiegi zaliczyły po 8/8 testów, łącznie z dwiema symulacjami. Surowa odpowiedź w regresji przechodzi do podsumowania po incydencie zamiast pytać o czas. Przed tą poprawką symulacja w jednym przebiegu skończyła się limitem tur bez pożegnania, a w innym zakończyła się poprawnie. W ostatnich przebiegach nadal zdarzają się zbędne parafrazy i pytania z alternatywą sugerującą czas jako problem. Zielone testy tekstowe nie wystarczają same do potwierdzenia jakości głosu na produkcji ani do automatycznej promocji na 100%.

## Kryterium decyzji

Nie promuj kandydata na podstawie jednego przebiegu. Wykonaj powtórzone `compare`, przejrzyj surowe odpowiedzi dla każdej krytycznej porażki, wykonaj co najmniej dwie symulacje przebiegu rozmowy i odsłuchaj kilka rzeczywistych sesji za zgodą uczestników. Szczególnie policz liczbę pytań po pierwszym pełnym opisie procesu i długość końcowej odpowiedzi. Zielona ocena pojedynczego pożegnania nie usuwa problemu rozwlekłości wcześniejszych tur.

Dokumentacja dostawcy: [testy agenta](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing), [uruchamianie testów przez API](https://elevenlabs.io/docs/api-reference/tests/run-tests), [ślady OpenTelemetry](https://elevenlabs.io/docs/eleven-agents/customization/opentelemetry-traces).
