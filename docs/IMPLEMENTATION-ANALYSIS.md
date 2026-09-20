# Mirai: analiza wdrożenia control plane

Data: 2026-09-17. Status: propozycja do realizacji, nie opis wdrożonych funkcji.

## Zakres i źródła

Analizę wykonały trzy równoległe role: backend i cykl projektu, doświadczenie administratora i klienta, agenci i ewaluacja. Agent główny połączył zależności i sprawdził dokumentację oraz schemat lokalnego Mirai 1. To analiza kodu, nie audyt aktualnej konfiguracji usług ani test produkcji. Nie zmieniono aplikacji ani usług zewnętrznych.

Źródła Mirai 2: `src/domain/contract.ts`, `src/domain/interview.ts`, `src/components/AdminControlPlane.tsx`, `src/lib/useInterview.ts`, `src/voice/elevenlabs.ts`, `server/admin.ts`, `server/agent.ts`, migracje, testy, konfiguracja CI i sceny.

Inspiracja Mirai 1: `/Users/kacper.leczynski/Desktop/mirai/AGENTS.md`, `docs/MVP.md`, `db/schema.ts`. Dokumentacja opisuje brief, wersję dema, feedback, zatwierdzenie i handoff, a schemat zawiera członkostwa, wersje dowodów i audyt. Nie zweryfikowano tych funkcji w działającej produkcji. Dokumentacja wyraźnie odróżnia ręczne przekazanie pracy od autonomicznego wykonania. Mirai 1 pozostaje osobnym projektem.

## Wnioski z istniejącego kodu

1. Discovery ma przydatny kontrakt: oryginalne wypowiedzi, cytaty, hipotezy, poprawki klienta, checkpointy i kontrolę własności. Można go zachować jako wejście projektu.
2. Admin pokazuje sesje i transkrypcję, ale nie prezentuje istniejącego pełnego raportu `result` ani porównania z `modelResult`. Lista ogranicza się do 100 sesji i pobiera pełne checkpointy.
3. Wskaźniki jakości są heurystykami liczonymi w przeglądarce. Konkretność premiuje między innymi frazę „krok po kroku”, powtórzenia oznaczają identyczny tekst, a osadzenie w kontekście korzysta z dopasowania słów i gotowych fraz. Nie są dowodem jakości modelu.
4. Brakuje trwałych projektów, wykonania agentów, wersji artefaktów dema, feedbacku projektowego i pełnego pomiaru kosztów/opóźnień. `conversationId` nie ma samodzielnego trwałego powiązania z uruchomieniem.
5. Retencja usuwa po 30 dniach również raport i wyniki przez kaskadę. Service role admina omija RLS, a odczyty admina nie filtrują `expires_at`; przed wykonaniem crona wygasły rekord może pozostać widoczny.
6. Dotychczasowe E2E sprawdza tekstowe discovery na dwóch rozmiarach ekranu. Nie dowodzi poprawności zalogowanego panelu admina ani naturalności żywego głosu. Test adminowego SQL sprawdza tekst migracji, nie wykonanie transakcji.
7. Dokumentacja produkcji jest nieaktualna, między innymi zabrania klucza service role, którego wymaga obecny backend admina. W katalogu Mirai 2 nie ma `.git`; plik CI sam nie dowodzi działającego procesu CI.

## Docelowy podział

Projekt ma własny cykl życia, niezależny od krótkiej sesji discovery. Jeden operator Mirai i członkostwa poszczególnych klientów wystarczą na początek.

| Element | Rola |
| --- | --- |
| ProjectCase | Stan projektu, opiekun, rewizja i następna akcja |
| ProjectMember | Dostęp użytkownika do konkretnego projektu |
| ProjectArtifact | Wersjonowany raport, brief, preferencje, plan lub wynik pracy |
| ProjectDecision | Decyzja człowieka dotycząca dokładnej wersji artefaktu |
| AgentRun / RunStep | Cel, wejścia, wykonanie, wynik, koszt, wersje i zależności |
| Evaluation | Wersja rubryki, oceniany artefakt, dowody i wynik |
| DemoDeployment | Wersja kodu/builda, środowisko, adres i testy |
| Feedback | Projekt, wersja dema, wypowiedź i decyzja operatora |
| ProjectEvent | Minimalny audyt zmian, bez kopii transkrypcji |

Proponowana ścieżka: raport → przegląd operatora → brief i wybory klienta → budowa → sprawdzone demo → feedback → poprawiona wersja lub zatwierdzenie → plan wdrożenia → realizacja u klienta. Nowa wersja dema wymaga nowego zatwierdzenia. Zakończenie pracy agenta nie oznacza automatycznie odbioru wyniku.

## Zadania i zespoły wykonawcze

Każdy pakiet ma właściciela. Podzadania są etapami pracy, nie obowiązkowo osobnymi agentami. Maksymalnie trzy równoległe pakiety implementacyjne plus integrator; wspólne kontrakty i migracje mają jednego właściciela.

| ID | Pakiet i mniejsze zadania | Główne miejsca zmian | Zależność i dowód odbioru |
| --- | --- | --- | --- |
| P0 | Filtr wygaśnięcia, paginacja, odczyt raportu, rozróżnienie anonymous/admin/expired, aktualizacja dokumentacji | `server/admin.ts`, admin UI, testy admina, dokumentacja | Od razu. 101+ sesji dostępnych stronicowo; wygasłe dane niewidoczne; autoryzowany scenariusz przetestowany |
| P1 | Kontrakt projektu, przejścia serwerowe, rewizje, artefakty i decyzje, migracje i RLS | nowe `src/domain/project.ts`, `artifact.ts`, `server/projects.ts`, migracje | Po ustaleniu retencji i dostępu. Konflikt rewizji odrzucany; klient A nie widzi B |
| P2 | Utworzenie case z potwierdzonego raportu, dowody, rozmowa admina z AI, wersjonowany brief i kryteria sukcesu | nowe API projektów i admin UI | P1. Retry tworzy jeden case; propozycje AI oddzielone od zatwierdzonych ustaleń |
| P3 | Powrót klienta na innym urządzeniu, kilka preferencji, zapis wersji, spokojny ekran statusu | nowe `src/client/`, dostęp projektowy, adapter sceny | P1; integracja z P2. Klient widzi własny projekt i jedną następną akcję |
| P4 | Kontrakt wykonania, trwała kolejka/outbox, claim/lease, retry, timeout, anulowanie, budżet | nowe moduły runs/jobs, migracje, executor | P1. Restart nie gubi zadania; skutki uboczne mają klucze idempotencji; spóźniony wynik nie nadpisuje nowej wersji |
| P5 | Trwałe powiązanie konwersacji, zdarzenia telemetryczne, wersja promptu, rozdzielenie pomiaru od szacunku | voice provider, hook, backend telemetry, run events | Kontrakty P1/P4. Można prześledzić rozmowę do konfiguracji; brak pomiaru pozostaje brakiem danych |
| P6 | Zestaw syntetycznych scenariuszy, wersjonowane reguły, sędzia semantyczny, porównanie z oceną admina | nowe `evaluation.ts`, `server/evaluate.ts`, `tests/evals/` | P5 dla pomiarów; fixture można przygotować wcześniej. Ocena wskazuje konkretne tury i wersje |
| P7 | Minimalistyczne portfolio, kolejka decyzji, szczegóły projektu i wykonania | nowe `src/admin/`, API agregacji | P1/P4/P6. Każda liczba ma okres, próbkę i źródło; szczegóły dostępne po wejściu głębiej |
| P8 | Brief do izolowanego workspace, builder, niezależny reviewer, testy, artefakt, adapter publikacji dema | nowy executor buildów, manifest dema, adapter deploymentu | P2/P3/P4. Demo przechodzi scenariusz klienta; wersja odpowiada dokładnie testowanemu artefaktowi |
| P9 | Głosowy feedback z kontekstem projektu i wersji dema, raport różnic, decyzja admina i brief iteracji | kontekst projektu, endpoint głosowy, kontrakt feedbacku | P6/P8. Rozmowa przypięta do oglądanej wersji, także po publikacji nowszej |
| P10 | Paczka do pracy u klienta: źródła, konfiguracja, zależności, testy odbioru, rollback i wynik wdrożenia | artefakt delivery plan i panel projektu | P8/P9 i odbiór wersji. Zarejestrowany rzeczywisty wynik, nie status wywnioskowany z wygenerowanego planu |

Pierwszy pełny wycinek: P0 → P1 → P2 + P3 → klient potwierdza kierunek → operator ma zatwierdzony brief gotowy dla buildera. P4/P5 można rozwijać równolegle po uzgodnieniu kontraktów. P6 poprzedza użycie ocen w P7. Automatyczna budowa dochodzi po trwałym wykonaniu, nie w requestach obecnych endpointów.

## Role agentów i ich kontrakty

Interviewer prowadzi rozmowę. Analyst tworzy propozycję briefu z dowodów. Planner rozpisuje zaakceptowany brief. Builder wykonuje izolowany zakres. Reviewer sprawdza scenariusze i artefakt. Feedback interviewer zbiera uwagi do wersji. Delivery copilot pomaga operatorowi przy wdrożeniu. Ewaluator ocenia wynik osobno od autora.

Uruchomienie przyjmuje `projectId`, rolę, wersje wejściowych artefaktów, wersję promptu/modelu, dozwolone narzędzia, limit kosztu i czasu, klucz idempotencji oraz opcjonalny `parentRunId`. Zwraca wersjonowany artefakt, wyniki kontroli, użycie, błędy i otwarte decyzje. Widoczny postęp wynika ze zdarzeń wykonania.

Kontroler może utworzyć podzadania po zatwierdzeniu planu i w ramach budżetu. Na początek jedna warstwa podzadań, ograniczona współbieżność i bez rekursywnego tworzenia zespołów. Deterministyczny zapis, walidacja, metryki i retry pozostają zwykłym kodem.

## Panel bez szumu

Portfolio zaczyna się od „Wymaga Twojej decyzji”. Dalej projekty z etapem, ostatnim wynikiem i właścicielem następnej akcji. Na poziomie projektu raport, brief, demo i feedback. Dopiero w szczegółach wykonania log zdarzeń, testy, koszt i wersje. Błąd, oczekiwanie na klienta i praca w toku są odrębnymi stanami.

| Metryka | Źródło i ograniczenie |
| --- | --- |
| Jakość pytań | Wersjonowana ocena tur, cytaty i kalibracja przez operatora; nie same regexy |
| Opóźnienie głosu p50/p95 | Zdarzenia końca wypowiedzi i startu odpowiedzi z określoną granicą pomiaru; timestamp transkryptu nie wystarcza |
| Koszt rezultatu | Użycie dostawcy i stawka obowiązująca w danym czasie; szacunek jawnie oznaczony |
| Udane wykonania i retry | Run events, mianownik obejmujący zakończone próby; timeout i cancel oddzielnie |
| Akceptacja pierwszego dema | Decyzje dotyczące wersji; pokazać liczbę projektów i okres, bez traktowania braku odpowiedzi jako odrzucenia |
| Czas do dema | Od zatwierdzonego briefu do zweryfikowanego dema; oczekiwanie na klienta raportowane osobno |

Scena 3D i brzoskwiniowe światło mogą pozostać wspólnym językiem wizualnym. Tekst pokazuje rzeczywisty etap z serwera; animacja nie symuluje pracy ani nie jest jedynym nośnikiem statusu. Zachować reduced motion i fallback WebGL.

## Testy, które potwierdzą cel

Regresje rozmowy: opisano cały proces, więc agent pyta tylko o lukę; podano wyłącznie nazwę procesu, więc doprecyzowanie przebiegu jest zasadne; brak problemu jest poprawnym wynikiem; parafraza tego samego pytania liczy się jako powtórzenie; przerwanie i reconnect nie fałszują pokrycia. Najpierw syntetyczne dane, potem oddzielne testy dostawcy głosu i odsłuch człowieka. Tekstowa symulacja nie dowodzi jakości audio.

Backend: rzeczywiste wykonanie migracji i audytu, izolacja projektów, wygaśnięcie, idempotencja, konflikt rewizji, restart workera i spóźnione wyniki. UI: zalogowany admin, druga przeglądarka klienta, raport do briefu do preferencji, brak dostępu do obcego projektu. Demo: jeden uzgodniony scenariusz od początku do końca, testy negatywne i zgodność wersji publikacji z testami. Nowa wersja unieważnia wcześniejszy odbiór.

„Perfekcyjne pierwsze demo” traktować jako kierunek. Mierzalny cel: klient może przejść uzgodniony scenariusz bez pomocy, wynik odpowiada briefowi, nie ma błędów blokujących, liczba zmian po pierwszym pokazie maleje. Większą szansę daje wąski zakres i niezależna weryfikacja, nie sama liczba agentów.

## Otwarte decyzje przed implementacją odpowiednich etapów

1. Polityka przechowywania zatwierdzonego briefu projektu po wygaśnięciu 30 dni discovery. Kopie cytatów w artefaktach i logach również podlegają retencji.
2. Dostęp klienta do portalu: konto lub wygasające i odwoływalne zaproszenie. Nie przenosić bez decyzji mechanizmu Mirai 1 ani danych jego klientów.
3. Docelowy izolowany executor i konto publikacji demo. Cloudflare jest oczekiwanym kandydatem na hosting dema; możliwość budowania konkretnego typu aplikacji oraz integrację trzeba zweryfikować osobno. Obecny control plane jest na Vercel/Supabase.
4. Budżety runów, testów dostawcy i polityka automatycznych retry. Wartości nie wynikają z obecnej aplikacji.
5. Konfiguracja produkcyjnego agenta i jego wersji jako źródła prawdy. Lokalny literal `discovery-agent.v1` nie udowadnia wersji opublikowanej w ElevenLabs.

Nie wymagają decyzji na tym etapie: dokładny dostawca zewnętrznego dashboardu telemetrycznego, wieloorganizacyjny SaaS, zaawansowane rozliczenia klienta. Najpierw własne kontrakty i sprawdzony przepływ.
