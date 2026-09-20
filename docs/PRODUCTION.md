# MIRAI Discovery — produkcja

## Aktualny deployment

- Produkcja: <https://mirai-discovery-interview.vercel.app>
- Supabase: dedykowany projekt `mirai-discovery-interview` w `eu-central-1`; migracje zastosowane, anonimowe logowanie aktywne.
- Aktywne: adaptacyjny wywiad, trwałe checkpointy, wznowienie, review, eksport, usunięcie, panel administratora i indywidualne zaproszenia.
- Produkcyjne zmienne ElevenLabs, OpenAI, Turnstile oraz panelu administratora są skonfigurowane w Vercel. Ich wartości nie należą do repozytorium.

## Architektura

- Vercel hostuje statyczny frontend Vite oraz funkcje Node dla konfiguracji, głosu, ekstrakcji i panelu administratora.
- Dedykowany projekt Supabase w regionie EU przechowuje anonimową sesję, transkrypt i zatwierdzone wnioski. Przeglądarka używa wyłącznie publishable key i RLS.
- ElevenLabs pozostaje prywatnym agentem. Klucz API nigdy nie trafia do przeglądarki; funkcja głosowa wydaje tylko krótkotrwały podpisany URL po sprawdzeniu użytkownika i własności sesji.
- OpenAI jest opcjonalne i służy wyłącznie do ekstrakcji ustrukturyzowanego wyniku po rozmowie.

Frontend i funkcje są wdrażane w `fra1`. Projekt Supabase należy utworzyć w `Central EU (Frankfurt)`, aby nie przenosić transkryptów między odległymi regionami bez potrzeby.

## Środowiska

Nie wolno łączyć Preview z produkcyjną bazą. Użyj osobnych projektów Supabase dla Preview i Production oraz osobnych agentów/kluczy ElevenLabs.

| Zmienna | Klient | Serwer | Wymagana w produkcji |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | tak | nie | tak |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | tak | nie | tak |
| `VITE_TURNSTILE_SITE_KEY` | tak | nie | tak przed publicznym startem |
| `SUPABASE_URL` | nie | tak | tak |
| `SUPABASE_PUBLISHABLE_KEY` | nie | tak | tak |
| `ELEVENLABS_API_KEY` | nie | tak | tak dla głosu |
| `ELEVENLABS_AGENT_ID` | nie | tak | tak dla głosu |
| `OPENAI_API_KEY` | nie | tak | opcjonalna |
| `OPENAI_EXTRACTION_MODEL` | nie | tak | opcjonalna |
| `SUPABASE_SERVICE_ROLE_KEY` | nie | tak | tak dla panelu administratora |
| `MIRAI_ADMIN_EMAILS` | nie | tak | tak dla panelu administratora |

`SUPABASE_SERVICE_ROLE_KEY` jest wykorzystywany wyłącznie po serwerowej weryfikacji JWT administratora i adresu z `MIRAI_ADMIN_EMAILS`. Nigdy nie wolno wystawić go jako zmiennej `VITE_*` ani zwrócić w odpowiedzi API. Pozostałe endpointy uczestnika używają publishable key i JWT użytkownika.

## Supabase

1. Utwórz dedykowany projekt i połącz katalog przez `npx supabase link --project-ref <ref>`.
2. Zastosuj wersjonowane migracje poleceniem `npx supabase db push`.
3. Włącz Anonymous Sign-Ins oraz CAPTCHA/Turnstile. Ten sam sekret Turnstile ustaw po stronie Supabase Auth, a publiczny site key jako `VITE_TURNSTILE_SITE_KEY`. Ustaw dozwolone adresy produkcyjne i preview w Auth URL Configuration. Token CAPTCHA jest jednorazowy; aplikacja odświeża go po próbie logowania.
4. Sprawdź, czy `public` jest wystawiony w Data API. Migracje nadają jawne granty oraz włączają RLS; oba mechanizmy są wymagane.
5. Uruchom Database i Security Advisors. Każde ostrzeżenie dotyczące RLS, funkcji `security definer` lub indeksów rozwiąż przed otwarciem publicznego ruchu.
6. Zweryfikuj retencję: job `mirai-discovery-retention` ma działać co godzinę, a wygasła sesja ma być natychmiast niewidoczna przez RLS.
7. Zaproszenia tworzy administrator w `/admin`. Niewykorzystany link działa przez 30 dni. Panel pokazuje etykietę i branżę tylko administratorowi; link można skopiować tylko po utworzeniu. Posiadanie linku nie jest potwierdzeniem tożsamości odbiorcy.

## ElevenLabs

Agent musi być prywatny. Wyłącz przechowywanie audio i ustaw najkrótszą dostępną retencję konwersacji zgodną z komunikatem zgody. Klucz ogranicz do wydawania signed URL dla konkretnego agenta. Po wdrożeniu sprawdź na prawdziwym urządzeniu: zgodę mikrofonu, rozpoznawanie polskiej mowy, barge-in, przerwanie, pauzę, wznowienie i utratę sieci.

## Vercel

Projekt jest skonfigurowany przez `vercel.json`; Node jest przypięty do obsługiwanej linii 22–24. Sekrety dodaj osobno do Preview i Production. Przykład bez umieszczania wartości w historii powłoki:

```sh
vercel env add SUPABASE_URL production --sensitive
vercel env add SUPABASE_PUBLISHABLE_KEY production --sensitive
vercel env add ELEVENLABS_API_KEY production --sensitive
vercel env add ELEVENLABS_AGENT_ID production
```

Przed promocją:

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
vercel build
vercel deploy --prebuilt
```

Po sprawdzeniu Preview promuj dokładnie ten sam artefakt poleceniem `vercel promote <preview-url>`. Migracje produkcyjne wykonaj przed promocją, gdy aplikacja nadal jest kompatybilna ze starym i nowym schematem.

## Deploy (CI/CD — jedyna droga na produkcję)

Projekt Vercel **celowo nie ma podpiętego Git integration** (`vercel project ls` /
Vercel API pokazuje `link: null`). Jedyną drogą na produkcję jest workflow
`.github/workflows/ci.yml` w GitHub Actions:

1. Push/PR uruchamia równolegle cztery joby: `lint` (oxlint), `typecheck`
   (`tsc --noEmit`), `unit-test` (vitest, pełny zestaw z `npm test`) i `build`
   (`vite build`).
2. `e2e` (Playwright, desktop + mobile) startuje dopiero gdy wszystkie cztery
   powyższe przejdą (`needs:`).
3. `deploy` startuje dopiero po `deploy-brief` (opis poniżej), i **tylko** na `push` do
   `main` (nigdy na PR). Kroki: `vercel pull` → `vercel build --prod` →
   `vercel deploy --prebuilt --prod`.

Efekt: kod, który nie przejdzie lintu, typów, testów jednostkowych, builda albo
e2e, nigdy nie dotrze do `deploy` — nawet przy bezpośrednim pushu na `main` bez
PR-a. To jedyny guardrail; **nie włączaj** Git integration w dashboardzie
Vercela, bo stworzyłoby to drugą, niekontrolowaną ścieżkę deployu, która
ominie te checki.

Wymagane sekrety w GitHub (Settings → Secrets and variables → Actions):

| Sekret | Wartość | Uwagi |
| --- | --- | --- |
| `VERCEL_TOKEN` | token wygenerowany na <https://vercel.com/account/tokens>, scope: zespół `iclevers-projects` | jedyny prawdziwy sekret; nigdy nie commituj go, nie wklejaj do kodu |
| `VERCEL_ORG_ID` | `team_UL1UmYHSeHsoCoKVuTIDcODj` | z `.vercel/project.json`, nie jest tajne, ale trzymane jako secret dla spójności |
| `VERCEL_PROJECT_ID` | `prj_LpPaWf0xFR11VNuvA0GG8y43weQq` | jw. |

Manualny deploy z lokalnej maszyny (`vercel --prod` z sekcji wyżej) zostaje
wyłącznie jako awaryjna ścieżka break-glass, gdy CI jest niedostępne — nie
używaj go w normalnym cyklu pracy, bo omija wszystkie checki.

## Kryteria odbioru

### Brief Studio (Node 2)

Worker: `https://mirai-brief-studio.kleczynski11312.workers.dev`. Workflow: `mirai-brief-studio-pipeline`. Ten sam dedykowany Supabase co Node 1, nowe tabele `brief_*`; żadnych integracji z kontami klienta.

CI rozszerza typecheck/unit/build o Worker. `brief-quality` odtwarza autentyczny wynik OpenAI z `services/brief-studio/tests/evals/julka.live.json`, porównuje hashe źródeł oraz sprawdza ocenę końcowego briefu i kontrolę negatywną. Nie wykonuje płatnych wywołań. `brief-e2e` uruchamia lokalny Supabase, testuje HTTP/Auth/RLS/wersje oraz panel z zapisanymi odpowiedziami modelu. Zrzuty panelu są artefaktem Actions.

`deploy-brief` ma `needs: [e2e, brief-e2e, brief-quality]`, działa tylko na push main i najpierw stosuje migracje, potem wdraża Workera z sekretami wersji, następnie sprawdza `/health`. `deploy` Vercela zależy od niego i konfiguruje proxy admina. Błąd migracji/deployu blokuje dalszy rollout. Migracje są addytywne; nie cofaj ich przez kasowanie tabel. Cofnięcie kodu również przeprowadź przez CI.

Sekrety Actions: `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `CLOUDFLARE_API_TOKEN`, `MIRAI_ADMIN_EMAILS` oraz istniejące sekrety Vercel. Zmienne Actions: `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `CLOUDFLARE_ACCOUNT_ID`, `BRIEF_STUDIO_URL`. Token Cloudflare wymaga dostępu do Workers i Workflows na wskazanym koncie. Wartości sekretów trafiają wyłącznie do tymczasowego pliku CI i bindingów Workera.

Lokalnie: `npm run test:brief-studio`, `npm run eval:brief`, `npm run build:brief-studio`. Dla integracji uruchom lokalny Supabase, zapisz `supabase status -o json` prywatnie do `.local/brief-studio/local-supabase.json`, następnie `npm run test:brief-integration` i `npm run test:brief-e2e`. Używają lokalnej bazy, tworzą fikcyjne konta i usuwają je po teście. Lokalny reset bazy wolno wykonywać wyłącznie dla tego środowiska testowego. Raportów status z kluczami nie publikuj.

Przy awarii/nieznanym wyniku OpenAI koszt pozostaje zarezerwowany. Ponawiaj start z tym samym requestId, nie twórz kolejnego płatnego uruchomienia w ciemno. Decyzja review zapisana w DB jest wiążąca; przy błędzie powiadomienia Workflow panel umożliwia ponowienie samego powiadomienia. Zmiana/wygaśnięcie/usunięcie źródła blokuje dalszy eksport. Nie wznawiaj płatnego kroku przez reset jego rezerwacji.

- dwa anonimowe konta nie mogą czytać, zmieniać ani usuwać swoich danych nawzajem;
- bez JWT endpointy głosu i ekstrakcji zwracają `401`, a obca/nieistniejąca sesja nie ujawnia treści;
- nieaktywny wywiad nie otrzymuje signed URL, a niezakończony nie uruchamia ekstrakcji;
- logi nie zawierają JWT, signed URL, audio ani transkryptu;
- CSP i Permissions Policy pozwalają na mikrofon oraz wyłącznie wymagane połączenia;
- desktop i mobile przechodzą pełny scenariusz: zgoda, rozmowa, przeładowanie, podsumowanie, korekta, zapis, eksport i usunięcie;
- po wdrożeniu `/api/config` pokazuje aktywny głos i ekstrakcję zgodnie z rzeczywiście ustawionymi zmiennymi.
