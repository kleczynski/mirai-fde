# Kontrakt monitoringu administratora v1

Data: 2026-09-17. Status: obowiązujący kontrakt P0 dla pierwszych rozmów na żywo.

## Zakres i granice

Kontrakt obsługuje tylko discovery interviewer, ekstrakcję i ewaluację. Nie tworzy projektów klienta, briefów, automatycznej budowy ani danych o kosztach, których dostawca nie zwrócił. Wszystkie rekordy rozmów podlegają istniejącej retencji `expires_at`; po wygaśnięciu API administratora zwraca brak rekordu, także przed wykonaniem crona.

`configurationStatus` zawsze mówi, czy wersję konfiguracji ustalono. `unknown` nie może być zastąpione lokalnym domysłem. `telemetry` może zawierać `null`; oznacza to brak pomiaru, a nie zero.

## Autoryzacja i błędy

Wszystkie ścieżki `/api/admin/*` wymagają JWT Supabase oraz adresu z serwerowej listy `MIRAI_ADMIN_EMAILS`.

| Stan | Kod | Treść błędu |
| --- | --- | --- |
| Brak tokenu | 401 | `Wymagane logowanie administratora.` |
| Nieważny lub wygasły token | 401 | `Sesja administratora wygasła.` |
| Poprawna sesja bez roli | 403 | `To konto nie ma dostępu administracyjnego.` |
| Wygasła lub nieistniejąca rozmowa | 404 | `Nie znaleziono sesji.` |
| Błędne dane wejściowe | 422 | standardowy błąd walidacji |

Odpowiedzi mają `Cache-Control: no-store`. Klient nie otrzymuje klucza service role, surowych sekretów dostawców ani nieograniczonego tekstu innych rozmów.

## Modele odpowiedzi

`SessionListItem` jest celowo lekki i nie zawiera tur, raportów ani treści uwag.

```ts
type SessionListItem = {
  id: string
  status: 'active' | 'paused' | 'review' | 'completed'
  startedAt: string
  completedAt: string | null
  expiresAt: string
  mode: 'demo' | 'text' | 'voice'
  turnCount: number
  focusSummary: string | null
  hasConfirmedSummary: boolean
  processing: 'not_started' | 'in_progress' | 'completed' | 'failed'
  latestRunId: string | null
  latestEvaluationId: string | null
  requiresAttention: boolean
}

type Page<T> = {
  items: T[]
  nextCursor: string | null
}

type ConfigurationSnapshot = {
  provider: 'elevenlabs' | 'openai' | 'local' | 'unknown'
  agentId: string | null
  promptVersion: string | null
  model: string | null
  configurationStatus: 'known' | 'unknown'
  observedAt: string | null
}

type Telemetry = {
  conversationId: string | null
  providerConversationId: string | null
  turnCount: number | null
  interruptionCount: number | null
  reconnectCount: number | null
  firstResponseLatencyMs: number | null
  source: 'browser' | 'provider' | 'unknown'
}

type AgentRun = {
  id: string
  sessionId: string
  kind: 'voice' | 'extraction' | 'evaluation'
  version: number
  status: 'queued' | 'running' | 'completed' | 'failed'
  inputTurnIds: string[]
  configuration: ConfigurationSnapshot
  telemetry: Telemetry | null
  output: unknown | null
  errorCode: string | null
  createdAt: string
  completedAt: string | null
}

type Evaluation = {
  id: string
  sessionId: string
  runId: string | null
  version: number
  evaluatorVersion: string
  inputTurnIds: string[]
  status: 'completed' | 'failed'
  signals: Array<{
    code: 'semantic_repetition' | 'missed_fact' | 'good_follow_up' | 'voice_issue'
    severity: 'info' | 'attention'
    turnIds: string[]
    evidence: string[]
    limitation: string | null
  }>
  limitations: string[]
  createdAt: string
}

type OperatorNote = {
  id: string
  sessionId: string
  turnId: string | null
  label: 'repeated_question' | 'missed_fact' | 'good_follow_up' | 'voice_problem' | 'note'
  note: string | null
  createdAt: string
}
```

## Endpointy

| Metoda i ścieżka | Wejście | Wynik |
| --- | --- | --- |
| `GET /api/admin/sessions?limit=25&cursor=<id>` | limit 1 do 50, opcjonalny kursor | `Page<SessionListItem>` sortowana malejąco po `startedAt` |
| `POST /api/admin/session` | `{ sessionId }` | pełna sesja, oryginalny `modelResult`, poprawiony `result`, `runs`, `evaluations`, `operatorNotes` |
| `POST /api/admin/session-note` | `{ sessionId, turnId?, label, note? }` | zapisany `OperatorNote` |
| `POST /api/admin/session-export` | `{ sessionId }` | bezpieczna paczka kontekstu dla kolejnego agenta |
| `POST /api/admin/session-trace` | `{ sessionId, runId }` | odczyt śladu ElevenLabs powiązanego z niewygasłą sesją i uruchomieniem głosowym; bez audio i sekretów |
| `POST /api/admin/delete-session` | `{ sessionId }` | `{ deleted: true }`, z istniejącym atomowym audytem |
| `POST /api/admin/session-retry-extraction` | `{ sessionId }` | `{ retried: true, method: 'evidence-rules' \| 'language-model' }` |
| `POST /api/admin/session-demo-prompt` | `{ sessionId }` | `{ demoId, prompt, confirmed }` — wypełniony `docs/prompts/build-and-deploy-demo.md` |

`cursor` jest identyfikatorem ostatniej pozycji poprzedniej strony. Przy równym czasie serwer porządkuje po `id`, aby nie gubić ani nie powielać rekordów.

### `POST /api/admin/session-retry-extraction` — naprawa utkniętej ekstrakcji

Discovery Interview kończy się dwoma osobnymi zapisami: najpierw `status:'review'` z `completedAt`, potem osobno policzony `result`/`modelResult`. Jeśli przeglądarka uczestnika zamknie się albo padnie między tymi dwoma zapisami (np. `/api/extract` przekracza 65-sekundowy limit klienta, ekstrakcja modelowa nie jest skonfigurowana, albo coś innego przerwie drugi zapis), sesja utyka trwale w stanie `status:'review'`, `result: null`, `modelResult: null`, bez żadnego automatycznego mechanizmu odzyskiwania.

Ten endpoint uruchamia dokładnie tę samą logikę ekstrakcji co uczestnik przy `finish()`: model językowy, jeśli `OPENAI_API_KEY` jest skonfigurowany (`computeModelExtraction` w `server/agent.ts`, ta sama funkcja co `/api/extract`), w przeciwnym razie deterministyczny `extractWithRules` z `src/domain/extraction.ts`. Nic nie jest fabrykowane pomiędzy tymi dwiema ścieżkami.

Wynik zapisuje przez `service`-rolową funkcję SQL `public.admin_apply_extraction(p_actor_id uuid, p_session_id uuid, p_result jsonb)` (`security definer`, dostępna wyłącznie dla `service_role`), która:

- blokuje wiersz sesji (`for update`) i wymaga `completedAt` ustawionego oraz braku istniejącego `result`,
- waliduje `p_result` dokładnie tymi samymi regułami co `save_interview` (schemaVersion, sessionId, transkrypt, zgoda, dowody cytujące uczestnika, referencje `evidenceIds`, brak pustych ustaleń),
- scala `result`/`modelResult`/`revision` w `state` **bez zmiany `status`** — sesja zostaje w `'review'`, żeby tylko uczestnik mógł ją potem potwierdzić przez zwykłą ścieżkę `save_interview`,
- populuje `extracted_insights`, `pain_points`, `workflows`, `automation_opportunities`, `session_summaries` (z `confirmed_at = null`) tak samo jak `save_interview`,
- dopisuje wiersz `agent_runs` (`kind='extraction'`, kolejna `version`, `status='completed'`) i wiersz audytu `admin_session_actions` (`action='session.extraction_completed'`) w tej samej transakcji.

| Stan | Kod | Treść błędu |
| --- | --- | --- |
| Rozmowa jeszcze nie zakończona (`completedAt` puste) | 409 | `Rozmowa nie jest jeszcze zakończona.` |
| Wynik już istnieje i jest potwierdzony przez uczestnika | 409 | `Wynik został już potwierdzony przez uczestnika.` |
| Ekstrakcja/SQL nie powiodła się | 503 | `Nie udało się zapisać wyniku ekstrakcji.` |

Jeśli wynik już istnieje, ale NIE jest jeszcze potwierdzony
(`session_summaries.confirmed_at` to `null`), endpoint go **podmienia**
zamiast odrzucać — woła `admin_apply_extraction` z `p_allow_replace: true`
(`supabase/migrations/20260922140000_admin_extraction_allow_replace.sql`).
Potwierdzony wynik nigdy nie jest ruszany, niezależnie od tej flagi.

### `POST /api/admin/session-demo-prompt` — prompt budowy demo bez terminala

Wywołuje `buildDemoPrompt()` (`server/demo-prompt.ts`), tę samą funkcję co
CLI `scripts/generate-demo-prompt.ts`. Wymaga TYLKO `completedAt` i
istniejącego `result` — świadomie NIE wymaga `status==='completed'` (patrz
AGENTS.md §9 po uzasadnienie: admin nie ma i nie powinien mieć przycisku
"ustaw completed"). Rejestruje albo reużywa wiersz w `hosted_demos`
(`status='building'`) i zwraca wypełniony `docs/prompts/build-and-deploy-demo.md`
razem z flagą `confirmed` mówiącą, czy uczestnik zdążył już potwierdzić
wynik. Gdy `confirmed` jest `false`, sam tekst promptu zawiera dodatkowo
widoczne ostrzeżenie dla agenta budującego demo.

| Stan | Kod | Treść błędu |
| --- | --- | --- |
| Rozmowa jeszcze nie zakończona | 409 | `Rozmowa nie jest jeszcze zakończona.` |
| Brak wyniku ekstrakcji | 409 | `Brak wyniku ekstrakcji dla tej sesji — najpierw uruchom ekstrakcję.` |

## Eksport dla kolejnego agenta

Eksport ma postać danych JSON, bez sekretów i bez instrukcji z transkryptu traktowanych jako polecenia. Zawiera tylko: identyfikator i retencję rozmowy, zatwierdzone fakty z ich dowodami, poprawki uczestnika, hipotezy ze statusem niezatwierdzonym, otwarte pytania, granice automatyzacji, konfigurację z jej statusem, ewaluacje z dowodami oraz proponowane następne zadanie. Jeśli raport nie istnieje lub nie jest zatwierdzony, odpowiednie pole ma wartość `null` i lista ograniczeń wyjaśnia brak.

### `unconfirmedDraft` — wgląd w niezatwierdzony wynik

`approvedFacts`, `corrections`, `hypotheses`, `openQuestions`, `humanBoundaries` i `proposedNextTask` pozostają `null`/puste dopóki `status !== 'completed'` — to świadoma zasada produktu: dopóki uczestnik nie potwierdzi każdego ustalenia, nic z raportu nie jest "zatwierdzonym faktem". To zachowanie się nie zmienia.

Jednak gdy `result` istnieje, a `status` to wciąż `'review'` (dokładnie stan po naprawie przez `session-retry-extraction`, zanim uczestnik potwierdzi, albo stan tuż po zwykłym `finish()` przed potwierdzeniem), eksport dodaje pole `unconfirmedDraft` z surowym, nieprzefiltrowanym po `review.status` wynikiem:

```ts
type UnconfirmedDraft = {
  painPoints: Finding[]
  workflows: Array<Finding & { steps: string[] }>
  tools: Finding[]
  constraints: Finding[]
  automationOpportunities: Array<Finding & { linkedPainPointIds: string[]; validationNeeded: string[]; priority: 'explore' | 'next' | 'later' }>
  recommendedNextStep: { text: string; evidenceIds: string[]; review: Review }
  unansweredQuestions: string[]
  extractionMethod: 'evidence-rules' | 'language-model'
} | null
```

Gdy `unconfirmedDraft` nie jest `null`, `limitations` zawiera dodatkowy wpis: `Wynik nie został jeszcze potwierdzony przez uczestnika — pola z prefiksem "unconfirmed" nie są zatwierdzonymi faktami.` Pole ma zamierzenie ostrzegawczą nazwę: to draft, nie fakty.

## Niezmienniki wersjonowania

1. `AgentRun` i `Evaluation` są tylko dopisywane. Kolejny wynik nie nadpisuje wcześniejszego.
2. Każda ocena zapisuje dokładny, uporządkowany zestaw `inputTurnIds`.
3. Porównywanie ocen jest dozwolone wyłącznie dla identycznego zestawu `inputTurnIds`; inaczej API zwraca informację o nieporównywalności.
4. Notatka operatora wskazuje turę albo całą rozmowę i nie zmienia transkryptu.
5. Zdarzenia techniczne nie są dowodem pokrycia discovery.
