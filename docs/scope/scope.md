# Mirai: od discovery do własności klienta

Jeden operator prowadzi udokumentowany problem przez demo, pomiar i przekazanie produktu. Budowa odbywa się węzeł po węźle, z osobnym wdrożeniem każdego serwisu.

**Build approach:** Journey, pełny przebieg jednego węzła przed budową kolejnego.
**Workflow:** wymagania operatora: lint, typecheck, unit, build, e2e, jakość AI, wdrożenie przez CI.

## Stan

| Węzeł | Cel | Status |
| --- | --- | --- |
| 1 | Wywiad i zatwierdzone dowody | existing |
| 2 | Brief Studio | in-progress |
| 3+ | Demo z provenance, pomiar pilotu i handoff, kolejność do rozstrzygnięcia w ADR | planned |

## 2. Brief Studio

Admin uruchamia pipeline dla zatwierdzonej rozmowy, ogląda pięć etapów oraz krytykę, zatwierdza konkretny brief i eksportuje go.
Done when: fixture Julki przechodzi rzeczywisty pipeline AI, panel, testy granic, quality gate i wdrożenie CI z zapisanym dowodem.

- [x] Decyzja: [ADR 0002](../specs/0002-discovery-build-brief-service/index.md).
- [x] Kontrakt i szkielet Workera.
- [x] Pipeline AI, rezerwacje kosztów i trwałość (lokalnie).
- [x] Panel, zatwierdzenie i eksport (implementacja, weryfikacja trwa).
- [x] Testy, eval jakości i fixture end to end lokalnie (zapisany wynik OpenAI + realny Auth/Postgres + panel).
- [ ] Migracja i wdrożenie przez zielone CI, obserwacja wdrożonego wyniku.

## 3+. Domknięcie usługi

Done when: osobne ADR i serwisy obsługują powtarzalną budowę izolowanego demo, wersjonowaną zgodę operatora, dwutygodniowy pomiar i udokumentowane przekazanie własności. Zgoda klienta oraz zmierzona poprawa pozostają oddzielnymi faktami.

- [ ] Pełna propozycja ADR, raport do operatora przed budową.
- [ ] Każdy węzeł zbudowany i wdrożony kolejno, z osobnym raportem.

## Checkpoint kampanii

Stages: [x] Scope → [ ] Implement Node 2 → [ ] Verify Node 2 → [ ] Release Node 2 → [ ] ADR 3+ → [ ] Kolejne węzły

Current stage: Node 2, testy integracji i jakości przed wdrożeniem.
Base source: `b24cba1da4d017e86cbe6c4d7bbe76cc7081eb1e`, `kleczynski/mirai-fde`, branch `main`, bez lokalnych zmian na wejściu.
Last verified checkpoint: 74 istniejące testy Node 1, testy Node 2 oraz 8 scenariuszy przeglądarkowych Node 1 przechodzą. Lokalny test integracji korzysta z prawdziwego Auth/Postgres; panel generuje, zatwierdza i eksportuje oba formaty. Lint, oba typechecki i buildy przechodzą. Dostęp OpenAI/Cloudflare/Supabase potwierdzony bez ujawnienia wartości. Quality gate zielony: prawdziwy pipeline mini, niezależny sędzia gpt-4.1 akceptuje końcowy brief i odrzuca niebezpieczny kontrprzykład. Historia błędnych ocen mini pozostaje w raporcie. Operator zatwierdził zwiększenie alokacji testów z 0,48 do 0,96 USD; runtime nadal 0,52 USD i 0,24 USD/run. Lokalny ledger osiągnął limit rezerwacji, dalszych lokalnych płatnych testów nie uruchamiać.
Open blockers: Cloudflare token naprawiony przez operatora, ponowiony CI wdrożył Worker i potwierdził health. Vercel odrzucił 13 funkcji przy limicie Hobby 12. Korekta ADR: wspólny adapter admina, zachowane URL-e i autoryzacja, build tworzy 5 funkcji. Lokalnie 97 testów oraz quality gate przechodzą.
Next action: wdrożyć korektę adaptera przez pełne CI i sprawdzić rzeczywisty Workflow na syntetycznej sesji w ramach budżetu runtime.
Recovery: migracja Node 2 i Worker wdrożone przez zielone bramki CI; nie usuwać tabel ani nie resetować budżetu. Vercel nadal na poprzednim release. Zachować izolację repo `Desktop/mirai`, jego API, danych i sekretów.
