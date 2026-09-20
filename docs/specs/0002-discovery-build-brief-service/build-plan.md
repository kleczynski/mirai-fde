# Sugerowany plan budowy dla 0002 (nie część decyzji, do potwierdzenia przy starcie budowy)

To nie jest formalna sekcja spec. `index.md` to decyzja architektoniczna i celowo nie zawiera planu wykonania (tak działa skill `architect` w trybie ARCHITECTURE: decyzja tak, kolejność budowy nie, żeby nie specyfikować tego samego dwa razy). Ten plik to praktyczna, sugerowana kolejność dla kogokolwiek zacznie budować, żeby nie zaczynał od zera. Jeśli w trakcie budowy któryś punkt okaże się w praktyce load bearing decision, a `index.md` go nie rozstrzyga wprost, wróć po decyzję zamiast zgadywać.

## Cel, w jednym zdaniu

Zbuduj Node 2 (roboczo "Brief Studio"): osobny Cloudflare Worker z Workflow, który bierze zatwierdzony eksport rozmowy z węzła 1 (`mirai.agent-context.v1`) i pięcioma krokami AI zamienia go w gotowy do budowy brief (`mirai.build-brief.v1`) dla agenta kodującego, widoczny w istniejącym panelu admina.

## Co już istnieje, nie duplikuj tego

- **Decyzja architektoniczna, w pełni spisana**: `docs/specs/0002-discovery-build-brief-service/index.md` (proponowany stack, projekt pipeline'u, kontrakt wyjścia, reguły bezpieczeństwa, integracja z adminem) oraz `rationale.md` (dlaczego, rozważone opcje, przykład Julki). Status: **Accepted**. Przeczytaj `index.md` w całości przed napisaniem jakiegokolwiek kodu, to jest źródło prawdy.
- **Węzeł 1 (już działa, nie ruszaj bez wyraźnego powodu)**: ten sam repozytorium ma gotowy serwis "agent i wywiad" (ElevenLabs, scena 3D, kontrakt `mirai.discovery.v1` w `src/domain/contract.ts`, panel admina w `src/components/AdminControlPlane.tsx`, API w `server/admin.ts` i `api/admin/*`). Eksport `mirai.agent-context.v1` (funkcja `exportAdminSession` w `server/admin.ts`) to gotowe wejście dla Node 2, już istnieje i działa.
- **Wzorzec do naśladowania, nie kopiowania**: sąsiednie repozytorium Mirai1 (`~/Desktop/mirai`) ma prostszą, szablonową wersję tego pomysłu (`lib/agent-brief.ts`, `lib/documents.ts`, `buildDocument()`). Warto zerknąć na granicę zaufane instrukcje / niezaufane dowody klienta (`agentBuildInstructions`, `redactDocumentSecrets`) i skopiować tę zasadę bezpieczeństwa, ale nie kopiować sztywnego, szablonowego podejścia, bo właśnie to Node 2 ma zastąpić rozumowaniem opartym na dowodach.
- **Przykład testowy już w repo**: `.local/voice-evals/*.json`, przypadek `simulation.tutor_revolut_calendar`. Prawdziwy, motywujący tę decyzję case: korepetytorka po lekcji ręcznie sprawdza przelew w Revolut i ręcznie zmienia kolor wydarzenia w Kalendarzu Google. Użyj tego jako danych testowych/fixture przy budowie pipeline'u, zamiast wymyślać nowy przykład.

## Twarde ograniczenia ze spec (nie do renegocjacji bez powrotu do `architect`)

- Nowy serwis żyje jako nowy folder w tym repo (np. `services/brief-studio/`), własny `wrangler.toml`, własny deploy. To NIE jest rozbudowa istniejącego `api/*.ts` na Vercel.
- Orchestrator to Cloudflare Workflow (nie Durable Object, nie zwykła funkcja serverless). Powód: musi umieć bezpiecznie czekać na decyzję admina między szkicem briefu a jego zatwierdzeniem.
- Baza danych: ten sam projekt Supabase co węzeł 1, nowe tabele (nie nowa baza, nie D1).
- Model: OpenAI, Structured Outputs, ten sam poziom co `domain/extraction.ts` w węźle 1.
- Pipeline to dokładnie pięć kroków, każdy z osobnym, wąskim, Zod-owanym wyjściem: Audytor dowodów, potem Architekt okazji (wybiera JEDNĄ okazję, resztę odrzuca z powodem), potem Architekt integracji, potem Autor briefu, potem Krytyk (jedna szansa poprawki dla Autora, potem i tak trafia do admina razem z notatką krytyka).
- Wyjście: `mirai.build-brief.v1`, JSON sprawdzany Zod-em plus wyrenderowany Markdown, tym samym wzorcem co `mirai.discovery.v1`.
- Bezpieczeństwo: dowody klienta to dane, nigdy instrukcje (ta sama granica co w Mirai1). Domyślnie dane w demo są symulowane/fikcyjne, prawdziwe konto klienta (prawdziwy Revolut, prawdziwy Kalendarz Google) to osobny, jawnie autoryzowany krok, nie założenie domyślne.
- Uruchomienie: wyłącznie ręczne, przez admina klikającego w panelu. Nie automatyzuj tego triggera.
- Dostęp: tylko administrator, ten sam JWT Supabase i lista `MIRAI_ADMIN_EMAILS` co reszta `/api/admin/*`.

## Sugerowana kolejność budowy

1. **Kontrakt `mirai.build-brief.v1` najpierw.** Schemat Zod (analogicznie do `src/domain/contract.ts`), eksport JSON Schema (analogicznie do `docs/mirai.discovery.v1.schema.json`), jeden syntetyczny przykład zbudowany na przypadku Julki/Revolut. Sprawdzenie: przykład przechodzi walidację. To fundament, od którego zależą wszystkie pięć kroków pipeline'u.
2. **Szkielet `services/brief-studio`.** `wrangler.toml`, minimalny Worker, jeden Workflow z jednym krokiem, który na razie tylko odbija wejście. Sprawdzenie: `wrangler dev` lokalnie przyjmuje żądanie i zwraca `runId`.
3. **Krok 1 pipeline'u naprawdę (Audytor dowodów).** Pierwsze prawdziwe wywołanie OpenAI Structured Outputs wewnątrz kroku Workflow, walidacja wyjścia. Sprawdzenie: na fixture Julki nie wywala się i zwraca sensowną strukturę.
4. **Kroki 2 do 4 (Architekt okazji, Architekt integracji, Autor briefu).** Spięte w łańcuch, każdy z własnym wąskim schematem wyjścia. Sprawdzenie end to end na fixture Julki: powstaje kompletny szkic briefu.
5. **Krok 5 (Krytyk) plus pętla jednej poprawki, finalny montaż `mirai.build-brief.v1`.**
6. **Trwałość.** Nowe tabele Supabase (uruchomienia, kroki, gotowe briefy) plus RLS na wzór istniejącego `ADMIN-MONITORING-CONTRACT.md`.
7. **Integracja z panelem.** Nowy endpoint proxy w `api/admin/`, przycisk i widok postępu w `AdminControlPlane.tsx`, pobieranie JSON/Markdown analogiczne do istniejącego `exportPackage`.
8. **Sprawdzenie end to end** na prawdziwej (lub fixture'owej) sesji Julki z węzła 1, weryfikacja że granica zaufania trzyma i nic nie wycieka.

## Sugerowane skille do wczytania przy budowie

- `cloudflare`: ogólne konwencje Workers, bindings, wdrożeń. Wczytaj przed pisaniem `wrangler.toml` i pierwszego Workera.
- `wrangler`: dokładna składnia CLI i configu przy deployu nowego serwisu.
- `workers-best-practices`: recenzja kodu Workers pod kątem produkcyjnych antywzorców (streaming, floating promises, sekrety, bindings). Wczytaj przed uznaniem kodu za gotowy.
- `durable-objects`: raczej NIE potrzebne teraz (spec wybrał Workflows, nie Durable Objects), zerknij tylko jeśli Workflow okaże się niewystarczający dla stanu pojedynczego uruchomienia.
- `agents-sdk`: świadomie odłożone w spec na później, nie wczytuj teraz. Dotyczy dopiero jeśli pipeline urośnie w prawdziwego, wieloturowego agenta.
- Ogólne skille inżynierskie tego workspace, jeśli dostępne: `test` (napisanie testów dla nowego kodu), `check` (weryfikacja że implementacja zgadza się ze spec).

## Znane luki, o których admin już wie (patrz też sekcja Follow-up w `index.md`)

- Brak `AGENTS.md` w tym repo. Warto założyć i zapisać tam skille `cloudflare`/`wrangler` jako właściwe dla nowego folderu.
- Prawdziwa integracja z API Revolut (nie symulacją) wymaga osobnego rozpoznania, Revolut nie ma prostego publicznego API do odczytu prywatnych przelewów. Nie wdrażaj tego naprawdę, trzymaj się danych symulowanych.
- Brak `docs/scope/` w tym repo, ta praca nie jest dziś nigdzie śledzona poza samym spec i tym plikiem.
