# Zbudowane demo — rejestr

Zwykły plik, nie tabela w produkcyjnym Supabase Node 1 (świadomie — patrz
`docs/prompts/close-the-loop-kickoff.md`). Wiersz dopisuje automatycznie
`scripts/generate-demo-prompt.ts` ze statusem `testing`; resztę statusu
operator zmienia ręcznie po rozmowie z klientem.

Statusy: `testing` → `client_reviewing` → `approved_exclusive` / `declined` → `paid`.

| Data | Sesja | Klient | Branża | Demo URL | Status | Notatka |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-21 | 00006412-42fa-4e77-9c30-6cfc5627c6ec | Marysia 2 | Dentysta | (uzupełnij po wdrożeniu) | testing | |
