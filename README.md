# Mirai Discovery Interview

Samodzielny vertical slice Discovery Interview. **Nie jest modułem wewnątrz istniejącego Mirai.** Nie modyfikuje ani nie wywołuje API istniejącego produktu.

Interfejs i `MiraiSignal` pochodzą z [Figma Make, wersja 7](https://www.figma.com/make/7IxYXWvWCnYgdzmNseoe9z/Responsive-Prototype-for-MIRAI). Źródło zachowano w `docs/figma-reference`. Oryginalna symulacja została zastąpiona przebiegiem wywiadu, trwałym checkpointem, ekstrakcją i potwierdzaniem wyników.

## Dla dowolnego eksperta

Pytania zaczynają się od codzienności i przykładów z pracy. Nie zakładają biura, zespołu, aplikacji ani potrzeby automatyzacji. Notatki na papierze i fizyczne narzędzia są równie istotne jak oprogramowanie. Produkcyjny wywiad wybiera kolejne pytanie według brakującego pokrycia wiedzy (rola, konkretny proces, przebieg, wejścia, narzędzia/ludzie, trudność, skutek, wyjątki, granice człowieka i rezultat), a nie stałego licznika. Kończy się po zebraniu rdzenia dowodów lub przy limicie bezpieczeństwa 18 odpowiedzi. Przykład demo dotyczący stolarza pozostaje osobnym, jawnie oznaczonym scenariuszem testowym.

## Uruchomienie

Node.js 22.12+ (sprawdzono na Node 24).

```sh
npm install
npm run dev
```

Otwórz http://localhost:5173. Vite uruchamia frontend, serwer API działa na 3001. Bez `.env` działają **demo i tekst** oraz jawnie oznaczony **zapis lokalny**. Demo czyta pytania przy użyciu syntezy mowy przeglądarki; dostępność polskiego głosu zależy od systemu. Demo nie rozpoznaje mowy. Użyj „Przykład: stolarz” lub wpisz własną odpowiedź.

```sh
npm run build
npm start
```

Wariant produkcyjny serwuje frontend i API z http://localhost:3001. Głos na zdalnym hoście wymaga HTTPS. Nie używaj `vite preview` jako serwera API.

## Supabase — osobny projekt

1. Utwórz **dedykowany projekt Discovery**. Nie używaj bazy istniejącego Mirai.
2. Uruchom obie migracje z `supabase/migrations` po kolei (SQL Editor lub Supabase CLI). Druga dodaje godzinowe usuwanie wygasłych sesji przez pg_cron.
3. W Auth → Providers włącz Anonymous Sign-Ins. Włącz ochronę przed nadużyciami/rate limits; przy publicznym udostępnieniu skonfiguruj CAPTCHA zgodnie z konfiguracją własnego hostingu.
4. Skopiuj `.env.example` do `.env`; ustaw URL i publishable key projektu w obu parach zmiennych frontend/server. Publishable key jest publiczny. **Nie używamy service role — ani w przeglądarce, ani na serwerze aplikacji.**
5. Uruchom ponownie aplikację. Zgoda i status zapisu będą pokazywać Supabase. Błąd połączenia nie przełącza potajemnie zapisu na lokalny.

Wznowienie działa w tej samej przeglądarce z anonimową sesją Supabase Auth; sam UUID sesji nie daje dostępu. Dla Supabase local: `supabase start`, `supabase db reset`; konfiguracja auth znajduje się w `supabase/config.toml`.

## Głos: ElevenLabs

1. Utwórz jednego prywatnego agenta w ElevenLabs. Wklej `docs/elevenlabs-agent-prompt.txt`; ustaw język i głos polski oraz krótką pierwszą wiadomość: „Cześć, jestem MIRAI, agent AI. Czym się zajmujesz? Opowiedz o swojej pracy własnymi słowami.” Nie twórz osobnych agentów dla zawodów — specjalizacja powstaje w rozmowie.
2. Zdefiniuj dynamic variables: `interview_context`, `coverage_gaps`, `focus_summary` i `mirai_session_id`. Backend przesyła tylko ostatnie 12 skróconych tur, aktualne braki oraz fokus. To nowe połączenie z kontekstem, nie kontynuacja strumienia audio. Awaryjne `ELEVENLABS_ENABLE_PROMPT_OVERRIDE=true` służy tylko do bootstrapu; na produkcji pozostaw `false`, ponieważ payload inicjowany przez przeglądarkę może zostać zmodyfikowany przez klienta.
3. Włącz zdarzenia klienta `user_transcript`, `agent_response`, `interruption` i tryb pozwalający użytkownikowi przerywać. Opcjonalny system tool **Update state** może aktualizować fokus i braki wewnątrz rozmowy, ale źródłem trwałego zapisu pozostaje zwalidowany checkpoint Supabase. Nie podłączaj narzędzi wykonujących działania w imieniu rozmówcy.
4. Wyłącz przechowywanie nagrań audio u dostawcy i ustaw retencję historii na zero / najkrótszą dostępną w swoim planie. To oddzielna konfiguracja od retencji Supabase. Prototyp sam nie usuwa historii z konta ElevenLabs. Nie udostępniaj go uczestnikom przed uzgodnieniem tych ustawień z treścią zgody.
5. Ustaw serwerowe `ELEVENLABS_API_KEY` i `ELEVENLABS_AGENT_ID`. Ogranicz klucz do potrzebnych operacji i agenta. Frontend otrzymuje jedynie krótkotrwały podpisany URL po weryfikacji tożsamości i własności aktywnej sesji.
   Po ustawieniu zmiennych uruchom `npm run elevenlabs:configure`, aby zsynchronizować prompt, dynamic variables, pierwszą wiadomość i wymagane zdarzenia. Polecenie wersjonuje zmianę istniejącego prywatnego agenta; nie tworzy nowego agenta.
6. Zweryfikuj na własnym koncie mikrofon, transkrypcję, barge-in, wyciszenie, rozłączenie i wznowienie. Integracji live nie testowano bez kluczy.

Adapter `VoiceProvider` izoluje SDK. `MockVoiceProvider` i `ElevenLabsProvider` implementują ten sam interfejs. Scena zna tylko stany wizualne. Ręczne „Przerwij” natychmiast ucisza aktualne audio; automatyczne przerwanie rozmówcy obsługuje VAD dostawcy. Głośność wraca przy kolejnej turze.

Iterację jakości agenta, testy `Next Reply`, symulacje oraz odczyt śladu pojedynczej rozmowy opisuje [VOICE-EVALUATION-RUNBOOK.md](docs/VOICE-EVALUATION-RUNBOOK.md). Zacznij od `npm run eval:voice -- preview`; porównanie wersji wymaga serwerowego klucza ElevenLabs.

## Ekstrakcja

Bez klucza: jawna, deterministyczna ekstrakcja `evidence-rules` — grupuje rzeczywiste odpowiedzi, zachowuje pełny opis środków pracy (również nietypowych narzędzi i pomocy innych osób) i proponuje ostrożną hipotezę automatyzacji. Pewność jest heurystyką, nie statystycznie skalibrowanym prawdopodobieństwem. Tekstowy scenariusz adaptuje wybrane pytania regułowo.

Opcjonalnie ustaw `OPENAI_API_KEY` oraz `OPENAI_EXTRACTION_MODEL` (domyślnie `gpt-4.1-mini`). Serwer używa Structured Outputs i pobiera transkrypt wyłącznie z sesji dostępnej dla zweryfikowanego użytkownika. Odpowiedź jest walidowana przez Zod i sprawdzana względem źródeł; odmowa lub błąd uruchamia ekstrakcję regułową z komunikatem. `store: false` wyłącza zapis odpowiedzi API, ale nie jest obietnicą zerowej retencji dostawcy. Aktywny dostawca analizy jest ujawniany przed zgodą.

## Kontrakt dla Mirai

- `src/domain/contract.ts`: typy TypeScript i walidacja Zod, łącznie z referencjami cytatów.
- `docs/mirai.discovery.v1.schema.json`: JSON Schema dla walidacji struktury.
- `docs/mirai.discovery.v1.example.json`: zwalidowany, syntetyczny eksport.
- `docs/CONTRACT.md`: semantyka pól, interpretacja pewności, korekty i import.
- `getCompleteSessionResult(sessionId)` w `src/persistence/repository.ts`: pobiera kompletny, zatwierdzony rezultat z kontrolą dostępu.
- `npm run schema`: odtwarza artefakty schematu i promptu.

Nie ma automatycznego importu do Mirai. Eksport JSON jest świadomą akcją użytkownika.

## Sprawdzenie

```sh
npm test          # testy domeny oraz migracji i RLS na PostgreSQL WASM (PGlite)
npm run build    # TypeScript i bundlowanie
npm run test:e2e # opcjonalny zestaw Playwright dla desktop/mobile; wymaga przeglądarek Playwright
```

Testy SQL obejmują izolację właścicieli, blokowanie bezpośrednich zapisów, idempotencję, niezmienność transkryptu, konflikt rewizji, potwierdzenie wyniku i kaskadowe usunięcie. Konfigurację cron, dostawców i rzeczywisty projekt Supabase należy sprawdzić po podłączeniu. Dokumentacja architektury i ograniczeń: `docs/ARCHITECTURE.md`.
