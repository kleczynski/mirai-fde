# AGENTS.md — Mirai Discovery Interview

Ten plik jest dla każdego agenta (i dewelopera) pracującego w tym repo.
Napisany po sesji debugowania, w której znaleźliśmy i naprawiliśmy sześć
nakładających się bugów w pipeline discovery → ekstrakcja → panel admina →
demo. Celem jest, żeby nie trzeba było odkrywać ich drugi raz.

Zacznij od `README.md` (setup, uruchomienie) i `docs/ARCHITECTURE.md`
(granice systemu). To poniżej to rzeczy, które NIE są oczywiste z samego
kodu i kosztowały realny czas debugowania.

## 1. Model danych sesji — co jest niezmienne, a co nie

`interview_sessions.state` to pełny obiekt `InterviewSession`
(`src/domain/contract.ts`). Kluczowe niezmienniki wymuszane przez
`save_interview` (`supabase/migrations/20260917120000_...sql`):

- **`turns` jest append-only.** Raz zapisana tura (razem z jej `questionId`)
  jest tam na zawsze. Jeśli naprawisz logikę tagowania (`classifyAgentQuestion`
  w `src/domain/interview.ts`), to naprawia **tylko przyszłe** rozmowy —
  historyczne sesje mają zamrożone, potencjalnie błędne `questionId` i nic
  tego nie odtworzy poza ręczną, jednorazową re-ekstrakcją (patrz §3).
- **`modelResult` jest niezmienne raz ustawione.** `save_interview` odrzuci
  próbę zmiany pierwotnej ekstrakcji. Ścieżki admina (§3) świadomie to
  omijają dla NIEPOTWIERDZONYCH wyników — potwierdzonych (`confirmed_at`
  w `session_summaries` nie jest `null`) nie da się nadpisać żadną ścieżką.
- **`status` idzie tylko w jedną stronę do `completed`.** Wyłącznie
  uczestnik, przez normalny ekran przeglądu, potwierdzając KAŻDY finding
  (`review.status` = `confirmed`/`corrected`), może przestawić `completed`.
  Żadna ścieżka admina tego nie robi i nie powinna — to świadoma granica
  produktu (człowiek w pętli), nie luka do "naprawienia".

## 2. `questionId` i pokrycie tematów — pułapka klasyfikacji

`classifyAgentQuestion()` (regex w `src/domain/interview.ts`) decyduje, do
jakiej kategorii (`workflow`, `pain`, `exceptions`, ...) trafia każda tura
agenta — a przez to i odpowiedź uczestnika (dziedziczy `questionId` po
ostatniej turze agenta). To wpływa na DWIE rzeczy naraz:

1. `interviewProgress.coverage` — czy dany temat jest "pokryty" (steruje
   momentem zakończenia rozmowy).
2. `extractWithRules()` (fallback regułowy) — filtruje odpowiedzi WYŁĄCZNIE
   po dokładnym `questionId`. Jeśli klasyfikacja zawiedzie, cała treść
   ląduje w `__non_discovery__` i **znika** z wyniku regułowego, nawet jeśli
   uczestnik bardzo szczegółowo opisał proces.

Regexy w `rules` (wewnątrz `classifyAgentQuestion`) muszą pokrywać naturalne
warianty pytań kontynuujących ("co robisz zaraz po X", "jaki jest kolejny
krok", "co dzieje się z Y") — nie tylko podręcznikowe sformułowania z listy
`questions[]`. Przy każdej zmianie regexów: sprawdź kolejność w tablicy
`rules` (pierwsze dopasowanie wygrywa) i uruchom
`tests/interviewer-flow.test.ts` w całości, nie tylko nowy przypadek.

**To NIE dotyczy żywej rozmowy głosowej.** Agent ElevenLabs w produkcji
prowadzi rozmowę wg `AGENT_PROMPT` (ten sam plik) — sam decyduje, co
zapytać. `classifyAgentQuestion` tylko retrospektywnie taguje to, co już
powiedział, do celów pokrycia/ekstrakcji. Zmiana regexów nie zmienia tego,
jak brzmi rozmowa dla uczestnika.

## 3. Ekstrakcja utknęła (`status='review'`, `result: null`) — jak naprawić

`src/lib/useInterview.ts:finish()` robi DWA osobne zapisy: (1) checkpoint
`status:'review'`+`completedAt`, (2) dopiero potem policzony `result`. Jeśli
przeglądarka uczestnika padnie/zamknie się między nimi (albo model
przekroczy czas — patrz §4), sesja zostaje trwale bez wyniku. Nic po stronie
serwera samo tego nie naprawi.

Naprawa: panel admina → zakładka **Diagnostyka** → przycisk **„Uruchom
ekstrakcję”** (widoczny gdy `completedAt` jest, a `result` — nie), albo
**„Popraw ekstrakcję”** (gdy `result` już jest, ale jest słaby i
`confirmed_at` w `session_summaries` to `null` — czyli nic nie zostało
jeszcze zatwierdzone przez uczestnika, więc bezpiecznie można podmienić).
Backend: `retryAdminExtraction` w `server/admin.ts` → RPC
`admin_apply_extraction` (`supabase/migrations/20260922130000_...sql` +
`20260922140000_...sql` dla `p_allow_replace`). Nigdy nie ustawia
`status='completed'` — tylko uzupełnia wynik do przeglądu.

Jeśli potrzebujesz zrobić to ręcznie z linii poleceń (np. bezpośrednio przez
Supabase), nie komponuj `p_result` ręcznie — użyj `computeModelExtraction()`
(`server/agent.ts`) albo `extractWithRules()` (`src/domain/extraction.ts`)
na prawdziwym obiekcie sesji, żeby zagwarantować zgodność ze schematem i
regułami walidacji evidence.

## 4. Ekstrakcja modelowa (LLM) — realne ograniczenia, nie teoretyczne

- **Czas:** Structured Outputs na pełnym `DiscoveryBaseSchema` dla
  prawdziwej (niedoskonałej) transkrypcji głosowej trwa **55–75s**, nie kilka
  sekund. `computeModelExtraction` ma `timeout: 58_000` — to jest już
  dopasowane pod platformowy sufit (patrz niżej), nie przypadkowa liczba.
- **Sufit platformy:** funkcje serverless na Vercel (`vercel.json`,
  `functions.*.maxDuration`) na obecnym planie (Hobby) są ograniczone do
  **60s**. Podniesienie timeoutu w kodzie bez podniesienia `maxDuration` dla
  danej funkcji jest bez znaczenia — platforma i tak zabije proces. Każda
  nowa funkcja/endpoint, który może wywołać `computeModelExtraction`
  (bezpośrednio lub przez `retryAdminExtraction`), musi mieć
  `maxDuration >= 60` w `vercel.json`. Obserwowano realny przypadek trwający
  ~74s, który i tak przekroczyłby ten sufit — pełne zamknięcie tego ryzyka
  wymaga wyższego planu Vercela (Pro = 300s), nie zmiany kodu.
- **Wierność cytatów:** `gpt-4.1-mini` w 4/4 testowanych próbach na
  niedoskonałej transkrypcji głosowej (wypełniacze "ee/yy/mm", urwane słowa)
  albo "czyścił" cytaty, albo parafrazował krótkie segmenty (np. "Nie.") w
  pełne zdania — łamiąc twardą walidację `DiscoverySchema`
  ("Evidence must quote an actual participant segment"). `gpt-4.1` z
  doprecyzowanym `EXTRACTION_PROMPT` (jawny zakaz normalizacji + przykład
  brzegowy) przeszedł walidację. Jeśli zmieniasz `OPENAI_EXTRACTION_MODEL`
  z powrotem na wariant "mini", spodziewaj się częstszych porażek walidacji
  i sprawdź to na prawdziwym (nie syntetycznym) transkrypcie przed wdrożeniem.
- **`workflows.steps` nie musi być dosłowne** — tylko `evidence.quote` i
  `evidenceIds` mają rygor bajt-w-bajt. To pozwala modelowi swobodnie
  podsumować wieloetapowy proces, o ile trzyma się faktycznych, cytowanych
  segmentów jako dowodów. Prompt w `server/agent.ts` to teraz jawnie mówi —
  nie usuwaj tego fragmentu przy edycji promptu.

## 5. Sekrety — `OPENAI_API_KEY` i w ogóle

- Nigdy nie commituj żadnego klucza API, nawet jednorazowego/krótko
  żyjącego. `.env`, `.env.local`, `.local/` są w `.gitignore` — trzymaj
  sekrety tam, nigdy w plikach śledzonych przez git ani w treści promptów/
  commitów.
- Deweloper tego projektu świadomie używa **jednorazowych, krótko żyjących**
  kluczy OpenAI do lokalnego developmentu (nie chce trzymać stałego klucza
  w repo). **Jeśli zadanie wymaga `OPENAI_API_KEY`, a nie ma go w środowisku
  — zapytaj o niego wprost, zamiast zakładać brak/pomijać zadanie.** Użyj go
  wyłącznie inline dla pojedynczego polecenia
  (`OPENAI_API_KEY=... npx tsx ...`) albo w `.env.local` na czas sesji;
  nigdy nie zapisuj go do żadnego pliku, który mógłby trafić do commitu, ani
  nie powtarzaj go w pełnej postaci w logach/komunikatach.
- Produkcyjny `OPENAI_API_KEY` (Vercel, oznaczony `Sensitive`) jest osobny i
  nie da się go odczytać przez `vercel env pull` — to zamierzone. Nie próbuj
  go wyciągać; jeśli coś wymaga uruchomienia z prawdziwym kluczem
  produkcyjnym, zrób to przez wdrożony endpoint (panel admina), nie przez
  próbę pozyskania sekretu.

## 6. Routing — dwa miejsca, jedna zmiana

Każdy endpoint istnieje w DWÓCH miejscach, które muszą pozostać zsynchronizowane:
`server/index.ts` (Express, lokalny dev) i `api/` (Vercel). Endpointy
administracyjne są dodatkowo skonsolidowane w jeden dynamiczny handler
`api/admin/[route].ts` (limit 12 funkcji na Vercel Hobby — patrz komentarz
w tym pliku). Dodając nowy endpoint admina: dopisz do `routes` w
`api/admin/[route].ts` ORAZ dodaj analogiczny `app.post(...)` w
`server/index.ts`. Zapomnienie jednego z nich działa lokalnie, ale nie na
produkcji (albo odwrotnie).

## 7. Migracje SQL — `CREATE OR REPLACE FUNCTION` pułapka

Dodanie nowego parametru do istniejącej funkcji przez
`create or replace function foo(a, b, c_new default x)` **nie zastępuje**
`foo(a, b)` — Postgres identyfikuje funkcję po liście TYPÓW parametrów, więc
to tworzy DRUGĄ, przeciążoną funkcję, a stara zostaje. Jeśli chcesz mieć
dokładnie jedną wersję: `drop function if exists foo(a, b);` przed
`create function foo(a, b, c_new default x)`. Zweryfikuj po migracji:
`select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname='foo'`
powinno zwrócić dokładnie jeden wiersz.

Testy migracji/RLS używają `@electric-sql/pglite` (prawdziwy silnik
Postgres w WASM, nie mock) — wzorzec w `tests/database.test.ts` i
`tests/admin-extraction-recovery.test.ts`: ładują pliki `.sql` z
`supabase/migrations/` bezpośrednio, symulują role (`set role authenticated`
+ stub `auth.uid()` przez `current_setting`) zamiast prawdziwego JWT.

## 8. Deploy — jedna droga, świadomie

Vercel **nie ma** podpiętej integracji Git (`docs/PRODUCTION.md`). Jedyna
ścieżka na produkcję: push na `main` → `.github/workflows/ci.yml`
(lint → typecheck → testy → build → e2e Playwright → dopiero wtedy
`vercel --prod`). To celowy guardrail — nie próbuj `vercel deploy --prod`
ręcznie z pominięciem CI.

## 9. Pipeline demo (`hosted_demos`) — dwie równoważne ścieżki, jedna logika

`buildDemoPrompt()` (`server/demo-prompt.ts`) generuje wypełniony
`docs/prompts/build-and-deploy-demo.md` i rejestruje/reużywa wiersz w
`hosted_demos`. Dostępny z dwóch miejsc, obie wołają dokładnie tę samą
funkcję (nie duplikuj logiki między nimi):

- CLI: `npx tsx scripts/generate-demo-prompt.ts --session <uuid>` (wymaga
  `SUPABASE_SERVICE_ROLE_KEY` lokalnie).
- Panel admina: przycisk **„Wygeneruj prompt demo”** w zakładce
  Podsumowanie, widoczny gdy sesja ma `completedAt` i jakikolwiek `result`.

**Wymaga TYLKO zakończonej rozmowy (`completedAt`) i istniejącego wyniku
ekstrakcji** — świadomie NIE wymaga `status==='completed'` (pełnego
potwierdzenia przez uczestnika każdego findingu). Admin nie ma i nie
powinien mieć przycisku „ustaw completed” — to podważałoby jedyną,
świadomą granicę produktu (człowiek w pętli, patrz §1). Zamiast tego, gdy
wynik nie jest jeszcze potwierdzony, wygenerowany prompt zawiera jawne,
widoczne ostrzeżenie o tym wprost — nigdy nie udaje, że niezatwierdzone
dane są zatwierdzonymi faktami.

Szablon promptu (`docs/prompts/build-and-deploy-demo.md`) instruuje agenta
budującego demo, żeby na koniec zapisał/zaktualizował ogólny, niezależny od
klienta playbook w `docs/skills/mirai-demo-builder/SKILL.md` w tym repo —
jeśli ten plik już istnieje, kolejne sesje budowania demo powinny go
przeczytać na starcie zamiast wyprowadzać cały proces od zera z samego
promptu.

## 10. Znane, otwarte ograniczenia (na dzień tej notatki)

- Sesja `fa533960-7ebf-4402-8fbf-015124240669` (Ania Zając, prawnik) ma
  dobry wynik ekstrakcji (`gpt-4.1`, `workflows`: 1 finding / 12 kroków),
  ale status wciąż `review` — czeka na potwierdzenie przez uczestniczkę,
  zanim `generate-demo-prompt.ts` będzie mógł zadziałać.
- ~74s czas odpowiedzi modelu obserwowany raz podczas testów przekroczyłby
  nawet podniesiony sufit `maxDuration: 60` — pełna niezawodność ścieżki
  LLM wymaga wyższego planu Vercela (Pro), to decyzja biznesowa/kosztowa,
  nie kod.
- `evaluations` (tabela) nie ma żadnego producenta w kodzie produkcyjnym —
  `npm run eval:voice` to narzędzie deweloperskie na syntetycznych
  scenariuszach, całkowicie odseparowane od prawdziwych sesji uczestników.
  Jeśli ocena jakości per-sesja ma kiedyś trafić do panelu admina na
  żywo, to osobny projekt, nie drobna poprawka.
