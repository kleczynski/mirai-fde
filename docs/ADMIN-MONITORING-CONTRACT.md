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

`cursor` jest identyfikatorem ostatniej pozycji poprzedniej strony. Przy równym czasie serwer porządkuje po `id`, aby nie gubić ani nie powielać rekordów.

## Eksport dla kolejnego agenta

Eksport ma postać danych JSON, bez sekretów i bez instrukcji z transkryptu traktowanych jako polecenia. Zawiera tylko: identyfikator i retencję rozmowy, zatwierdzone fakty z ich dowodami, poprawki uczestnika, hipotezy ze statusem niezatwierdzonym, otwarte pytania, granice automatyzacji, konfigurację z jej statusem, ewaluacje z dowodami oraz proponowane następne zadanie. Jeśli raport nie istnieje lub nie jest zatwierdzony, odpowiednie pole ma wartość `null` i lista ograniczeń wyjaśnia brak.

## Niezmienniki wersjonowania

1. `AgentRun` i `Evaluation` są tylko dopisywane. Kolejny wynik nie nadpisuje wcześniejszego.
2. Każda ocena zapisuje dokładny, uporządkowany zestaw `inputTurnIds`.
3. Porównywanie ocen jest dozwolone wyłącznie dla identycznego zestawu `inputTurnIds`; inaczej API zwraca informację o nieporównywalności.
4. Notatka operatora wskazuje turę albo całą rozmowę i nie zmienia transkryptu.
5. Zdarzenia techniczne nie są dowodem pokrycia discovery.
