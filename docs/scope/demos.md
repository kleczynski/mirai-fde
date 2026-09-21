# Zbudowane demo — rejestr

Zwykły plik, nie tabela w produkcyjnym Supabase Node 1 (świadomie — patrz
`docs/prompts/close-the-loop-kickoff.md`). Wiersz dopisuje automatycznie
`scripts/generate-demo-prompt.ts` ze statusem `testing`; resztę statusu
operator zmienia ręcznie po rozmowie z klientem.

Statusy: `testing` → `client_reviewing` → `approved_exclusive` / `declined` → `paid`.

| Data | Sesja | Klient | Branża | Demo URL | Status | Notatka |
| --- | --- | --- | --- | --- | --- | --- |
