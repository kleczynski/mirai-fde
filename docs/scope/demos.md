# Zbudowane demo — rejestr (zarchiwizowany)

**Zastąpione przez panel admina** (sekcja „Demo dla klientów”, tabela
`hosted_demos` w Supabase) od 2026-09-21. Operator wcześniej celowo unikał
tabeli w produkcyjnej bazie Node 1 — po weryfikacji to była zbyt wąska
decyzja: bez widoku w panelu operator nie widział statusu demo ani
feedbacku bez ręcznego grzebania w plikach/D1 per demo. `hosted_demos` i
`demo_feedback` to teraz jeden, wspólny punkt prawdy, czytany przez
`scripts/generate-demo-prompt.ts`, `generate-iteration-prompt.ts`,
`generate-promote-to-exclusive-prompt.ts` i panel admina.

Ten plik zostaje jako historia (wiersz Marysi 2 poniżej), ale
`generate-demo-prompt.ts` już do niego nie dopisuje.

Statusy: `building` → `live` → `client_reviewing` → `approved_exclusive` / `declined` → `paid`.

| Data | Sesja | Klient | Branża | Demo URL | Status | Notatka |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-21 | 00006412-42fa-4e77-9c30-6cfc5627c6ec | Marysia 2 | Dentysta | (uzupełnij po wdrożeniu) | testing | |
