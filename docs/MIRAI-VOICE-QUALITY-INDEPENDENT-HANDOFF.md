# Handoff dla kolejnego agenta: dokończ testy i wdroż Mirai voice quality v2

Stan zapisany 18 września 2026 r. To jest gotowy prompt do nowej sesji. Pracuj samodzielnie: odczytaj kod i aktualny stan ElevenLabs/Vercel, nie zakładaj, że poniższy snapshot nadal jest prawdziwy. **Cel jest wykonawczy, nie badawczy:** dokończyć brakujące testy istniejącego kandydata Mirai, poprawić tylko wykryte regresje i — gdy przejdzie bramki — bezpiecznie wprowadzić go na pełen ruch produkcyjny. Nie buduj LangSmitha, Langfuse ani nowej infrastruktury observability. Korzystaj z tego, co już mamy w repo, panelu admina i ElevenLabs. Dokumentację dostawcy sprawdzaj tylko tam, gdzie potrzebna jest odpowiedź na konkretną wątpliwość.

## Co ma być lepsze

Mirai rozmawia po polsku o jednym konkretnym procesie. Po opisaniu procesu i rzeczywistego skutku ma powoli lądować: mniej ponownych pytań i parafraz, bez szukania następnego problemu. Po sygnale zakończenia ma powiedzieć krótko „dzięki” i skończyć. Ton ma być swobodny, nie jak prezentacja biznesowa. Agent nie może przypisać rozmówcy zespołu, roli kierownika, oszczędności czasu/pieniędzy lub „krytycznych zmian”, jeśli rozmówca tego nie potwierdził. Nie skracaj rozmowy kosztem zrozumienia lub poprawności faktów.

## Snapshot, który musisz zweryfikować

- Repo: `/Users/kacper.leczynski/Desktop/mirai-2`. W chwili pisania katalog nie był repozytorium Git. Bazowy opis: `docs/VOICE-EVALUATION-RUNBOOK.md`.
- Produkcyjna aplikacja: `https://mirai-discovery-interview.vercel.app`. Poprzednio działały chronione `POST /api/admin/voice-health` i `POST /api/admin/session-trace`; nie oznacza to jeszcze, że sprawdzono mikrofon i streaming.
- Agent ElevenLabs: `agent_6001m2qqvax7e4evtdcentp2e05a`. Poprzednio Main miał 95%, a `Mirai conversation quality v2`, gałąź `agtbrch_0601m2rdbwe8er5922d69yc304hv`, opublikowana wersja `agtvrsn_7101m2sr0ncrf24s9qgqrxj1r0hh`, miała 5% rzeczywistego ruchu. To już jest mały canary produkcyjny, nie nieopublikowany szkic.
- Na kandydacie osiem przypiętych syntetycznych testów dwukrotnie zaliczyło 8/8. W surowych odpowiedziach nadal widać było zbędne parafrazy i niekiedy pytanie sugerujące „czas” jako problem. Wcześniejsza symulacja raz osiągnęła limit tur. Automatyczny judge przynajmniej raz dał fałszywy alarm. Nie używaj samego 8/8 jako uzasadnienia rollout.
- Lokalna suite ma 26 przypadków Next Reply i 3 symulacje (`npm run eval:voice -- preview` zostało uruchomione przy przygotowaniu handoffu). Runner `scripts/voice-evals.ts` umie `sync`, `compare`, `simulate`, ale pełne powtarzane porównanie Main–kandydat **nie zostało wykonane**. W lokalnym środowisku nie było używalnego klucza ElevenLabs; serwer produkcyjny ma sekret Sensitive w Vercel. Nie ujawniaj sekretu i nie rotuj klucza tylko po to, by uruchomić testy.
- Pojedynczy ślad rozmowy z panelu admina pobrano skutecznie: rozmowa `conv_9901m2r082k4f51vbhk8fyd4fdes`, sesja `3ccc90a1-533c-439d-95d7-6247c8c022d3`, voice run `d563b777-c9da-464b-97fe-dcfc9b8f9880`. Dostawca zwrócił 37 tur i 38 spanów, ale nie pełny wewnętrzny tok modelu. Test mikrofonu, WebSocketu, ASR/TTS, przerwań i odsłuchu kandydata nie został potwierdzony.
- Eksport `mirai.agent-context.v1` z tej sesji miał `approvedFacts: null`, puste oceny i **nie zawierał transkryptu**. To paczka zatwierdzonych ustaleń, a nie materiał do oceny rozmowy. Oryginalny tekst użytkownik przekazał lokalnie w `/Users/kacper.leczynski/.codex/attachments/7c7bf0da-8622-4e8e-82e2-62502a8623e6/pasted-text.txt`. Możesz go analizować lokalnie, lecz nie wysyłaj do nowego SaaS ani nie kopiuj prawdziwej rozmowy do syntetycznej suite.

## Najpierw sprawdź konfigurację i przygotuj bezpieczne porównanie

1. Odczytaj `docs/VOICE-EVALUATION-RUNBOOK.md`, `src/domain/interview.ts`, `src/domain/voice-policy/`, `docs/elevenlabs-agent-prompt.txt`, `src/domain/voice-evaluation.ts`, `src/domain/voice-evaluation-report.ts`, `scripts/voice-evals.ts`, `server/agent.ts`, `server/voice-trace.ts` i panel w `src/components/AdminControlPlane.tsx`.
2. Sprawdź w ElevenLabs aktualny podział ruchu, opublikowane wersje Main/kandydata, treść promptu, model, głos i ustawienia rozmowy. Nie zakładaj, że lokalny `AGENT_PROMPT` jest identyczny z konfiguracją na żywo. Zapisz identyfikatory wersji i snapshot 95/5 lub jego aktualny odpowiednik, żeby możliwy był rollback.
3. Potwierdź, że porównanie testów obejmie dokładnie opublikowane wersje, a nie draft, i że ta sama suite oraz rubryka są stosowane po obu stronach. Jeśli konfiguracja nie jest porównywalna, napraw przyczynę przed interpretacją wyników.
4. Sprawdź dostęp do uruchamiania testów przez UI ElevenLabs lub bezpieczny, właściwie ograniczony klucz. Sekret w Vercel może być nieodczytywalny lokalnie z powodu oznaczenia Sensitive; **nie** traktuj redakcji jako awarii i nie wypisuj wartości do czatu/logów. Nie dołączaj testów do szkicu Main ani nie publikuj Main tylko dla testowania.

## Brakujące testy do wykonania

1. Lokalnie: `npm run check`, `npm run test:infra`, `npm run eval:voice -- preview`. Zapisz wynik i błędy. To test kodu, nie jakości głosu.
2. ElevenLabs Next Reply: uruchom wszystkie 26 przypadków na Main i kandydacie z powtórzeniami, najlepiej co najmniej 3 na przypadek, przez istniejący `compare` albo równoważnie w panelu. `sync` tworzy brakujące definicje w bibliotece; wykonuj go tylko świadomie. Zachowaj invocation IDs, branch/version IDs, odpowiedzi i warunki oceny. Jeśli API i klucz są niedostępne, użyj panelu bez obchodzenia kontroli; jeżeli nadal się nie da, to jest blocker pełnego rollout.
3. ElevenLabs Simulation: uruchom wszystkie 3 wieloturowe scenariusze na obu wersjach, z przynajmniej 2–3 przebiegami, w tym opuszczanie rozmowy, korektę po niejednoznacznym „tak” i rozmówcę pracującego samodzielnie. Sprawdź, czy agent nie dochodzi do limitu tur i czy nie pyta dalej po dostatecznym opisie lub po pożegnaniu.
4. Ręcznie przejrzyj **surowe odpowiedzi** z prób, nie tylko pass/fail. Policz przypadki: dodatkowe pytanie po pełnym opisie, pytanie o drugi problem, zbędna parafraza/powtórne podsumowanie, przypisanie zespołu/oszczędności, nieprzyjęcie korekty, zbyt formalna wypowiedź. Zanotuj również fałszywe alarmy oraz fałszywe zaliczenia judge. Dla każdego istotnego błędu dodaj syntetyczny test regresyjny i przetestuj ponownie przed promocją.
5. Test głosowy E2E na kandydacie: przeprowadź syntetyczną rozmowę z mikrofonem lub inną kontrolowaną ścieżką audio, potwierdź połączenie WebSocket, ASR, naturalność TTS, opóźnienie, przerwanie wypowiedzi i zakończenie. Upewnij się przez jawne wskazanie gałęzi lub późniejszy ślad, że rozmowa rzeczywiście trafiła do kandydata; losowa sesja przy 5% ruchu tego nie gwarantuje. Nie używaj rozmowy z tatą jako próbki wysyłanej do zewnętrznego narzędzia. Jeśli nie masz faktycznej możliwości uruchomienia/odsłuchu audio, poproś użytkownika o krótki pilot i **nie** nazywaj E2E zaliczonym.
6. Obejrzyj dostępne rozmowy canary i analitykę ElevenLabs według gałęzi, a nie tylko aggregate. Przy małej próbie 5% traktuj wyniki jako sygnał jakościowy i guardrail, nie dowód statystycznej przewagi. Sprawdź błędy, przerwania, czas odpowiedzi, długość rozmów i jakość zakończenia. Wykorzystaj notatki operatora w Mirai, jeżeli są.

Źródła do sprawdzenia tylko tam, gdzie potrzebne: [Agent Testing](https://elevenlabs.io/docs/eleven-agents/customization/agent-testing), [Experiments](https://elevenlabs.io/docs/eleven-agents/operate/experiments), [Analytics](https://elevenlabs.io/docs/eleven-agents/dashboard), [OpenTelemetry traces](https://elevenlabs.io/docs/eleven-agents/customization/opentelemetry-traces). ElevenLabs opisuje testy Next Reply i Simulation, przebiegi powtarzane oraz analizę według gałęzi; zweryfikuj aktualne limity i możliwości konta. Nie instaluj nowej platformy tylko dla tego zadania.

## Bramka pełnego wdrożenia i działanie

Możesz dokończyć rollout na produkcji bez ponownego pytania o zgodę, **jeśli** wszystkie poniższe warunki są spełnione i nie pojawiły się nowe ryzyka:

- Aktualna opublikowana wersja kandydata jest dokładnie tą, którą przetestowano; Main pozostaje odtwarzalnym baseline.
- Testy kodu i infrastruktury przechodzą; powtarzane porównanie 26 przypadków oraz 3 symulacji nie pokazuje krytycznej regresji względem Main. Każde krytyczne `failed` albo podejrzane `passed` zostało ręcznie ocenione na podstawie surowego dialogu; nierozstrzygalne przypadki trafiają do operatora, a nie są automatycznie zaliczane.
- Najważniejsze przypadki: zakończenie bez nowego pytania, brak niepotwierdzonych twierdzeń, utrzymanie jednego procesu i przyjęcie korekty działają stabilnie. Zbędne parafrazy/ton są na poziomie świadomie zaakceptowanym w raporcie, nie ukrytym przez zielonego judge.
- Zaliczone jest realne audio E2E i przynajmniej kilka kontrolowanych rozmów pilotażowych lub istnieje równoważny wiarygodny dowód jakości głosowej. Jeśli nie, zatrzymaj promocję i wskaż dokładnie brakujący test.
- Przed zmianą udziałów masz zapisany poprzedni split, wersje, metryki guardrail i prosty plan przywrócenia Main. Po promocji wykonasz smoke test nowej sesji i odczyt jej branch/version w śladzie.

Jeśli bramka przejdzie, zwiększaj ruch etapami (np. 5% → 25% → 100%, dostosowując do rzeczywistej liczby rozmów), obserwuj te same metryki i zatrzymaj lub wycofaj zmianę przy regresji. Nie czekaj bez końca na statystyczną istotność przy małym ruchu; użyj jawnych bramek jakościowych i opisz niepewność. Jeśli bramka nie przejdzie, **nie promuj**. Napraw ograniczony problem w kandydacie, utwórz nową wersję, ponów właściwe testy; jeśli brak dostępu albo audio blokuje pracę, oddaj użytkownikowi konkretny blocker zamiast deklarować gotowość.

## Co oddać użytkownikowi

Krótki raport po polsku: co sprawdziłeś, identyfikatory przetestowanych wersji i invocationów, wyniki Main kontra kandydat wraz z ręczną oceną surowych odpowiedzi, wynik pilota audio, decyzja „promowane / pozostaje 5% / wycofane”, aktualny podział ruchu i smoke test po zmianie. Jeśli nie promowano, podaj dokładny powód i najmniejszy następny krok. Nie obiecuj pełnej jakości na podstawie samych tekstowych 8/8.
