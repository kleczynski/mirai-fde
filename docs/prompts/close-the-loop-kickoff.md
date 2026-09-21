# Kickoff prompt — Astra, domknięcie pętli demo→feedback→wyłączność

> Wklej jako pierwszą wiadomość do Astry. Napisane 2026-09-21, po incydencie
> z "Brief Studio" (patrz historia: Astra zbudowała i wdrożyła cały Node 2
> jako osobny serwis, trzeba było to w całości cofnąć — Worker, tabele
> Supabase, sekrety, CI). Ten prompt istnieje właśnie po to, żeby się to nie
> powtórzyło. Zakres jest celowo mały. Jeśli w trakcie pracy wyjdzie, że
> "właściwie to trzeba by zbudować nowy serwis/Workflow/bazę" — STOP, zapytaj
> operatora, nie buduj.

Masz pełny dostęp do tego komputera. Pracujesz wyłącznie w
`~/Desktop/mirai-2` (Node 1) i w nowych, jednorazowych katalogach dla
konkretnych demo (`~/Desktop/mirai-demos/<klient>/`, już ustalony wzorzec).
**Nie dotykasz** `~/Desktop/mirai` (Mirai 1) ani `services/brief-studio/`
(martwy szkielet, zostaw jak jest).

## Co już istnieje — przeczytaj, nie duplikuj

- `docs/prompts/build-and-deploy-demo.md` — szablon promptu do budowy i
  wdrożenia jednego demo z jednej rozmowy. Działa, nie zmieniaj filozofii
  (jedna okazja, dane fikcyjne domyślnie, Cloudflare Workers, tanio, bez
  ceremonii).
- `scripts/generate-demo-prompt.ts` — wypełnia powyższy szablon danymi z
  Supabase dla `--session <uuid>`. Działa, nie przepisuj go od zera.
- `src/domain/contract.ts` (`DiscoverySchema`) — kształt danych rozmowy.
- `docs/specs/0002-discovery-build-brief-service/` — ADR "Brief Studio".
  **Status Accepted, ale nie buduj tego.** To osobna, odłożona decyzja o
  generycznym pipeline AI do briefów. To, o co prosi teraz operator, jest
  dużo węższe: rejestr + prosty gate dostępu, nie pięcioetapowy pipeline.

## Zakres pracy (dwa małe dodatki, nie nowy serwis)

### 1. Rejestr zbudowanych demo (widoczność, zero nowej infrastruktury)

Dodaj `docs/scope/demos.md` — zwykły, ręcznie albo skryptowo aktualizowany
plik Markdown (tabela: sesja, klient, branża, URL demo, data wdrożenia,
status: `testing` / `client_reviewing` / `approved_exclusive` / `paid` /
`declined`). To ma być **plik w repo, nie tabela w produkcyjnym Supabase
Node 1** — nie chcemy znowu sprzęgać jednorazowych demo ze wspólną bazą
danych klientów wywiadu. Rozszerz `scripts/generate-demo-prompt.ts` tak,
żeby przy generowaniu promptu dopisywał wiersz do tego rejestru ze statusem
`testing` (albo dodaj mały, osobny skrypt `scripts/log-demo.ts`, jeśli tak
będzie czyściej). Operator ręcznie zmienia status w pliku, kiedy klient da
feedback.

### 2. Prompt "zrób to wyłącznie dla niego" (`docs/prompts/promote-demo-to-exclusive.md`)

Nowy, krótki szablon promptu (wzorem `build-and-deploy-demo.md`, podobna
długość, nie dłuższy), do użycia gdy klient powie "chcę to mieć u siebie".
Wypełniany ręcznie (URL demo, nazwa klienta) — nie musi ciągnąć danych z
Supabase jak pierwszy szablon. Ma prowadzić agenta przez:

1. **Dostęp**: jeśli demo miało tylko niejawny URL, dodaj prosty gate
   (współdzielony sekret w query param/nagłówku, albo hasło) — jedna
   funkcja w Workerze, bez nowego systemu tożsamości, bez OAuth, bez
   Clerk/Supabase Auth. To ma zająć kilka linii, nie nowy serwis.
2. **Dane**: jeśli klient chce faktycznie używać tego na co dzień, to
   moment żeby przejść z danych fikcyjnych na jego prawdziwe (prawdziwy
   Kalendarz, prawdziwy arkusz, cokolwiek) — ale to jawny, osobno
   autoryzowany krok, nigdy domyślny. Jeśli wymaga prawdziwych poświadczeń
   klienta, zatrzymaj się i zapytaj operatora.
3. **Własność hostingu — przedstaw operatorowi opcje, nie wybieraj sam**:
   (a) zostaje pod kontem Cloudflare operatora, operator może w każdej
   chwili wyłączyć dostęp (prostsze, wspiera model płatności
   subskrypcyjnej/dostępowej), albo (b) transfer Workera/D1 na konto
   klienta (pełna własność, zgodnie z North Star Mirai 1 "customer-owned
   accounts", ale operator traci łatwą kontrolę). Napisz to jako dwa
   zdania w rejestrze (`docs/scope/demos.md`, kolumna notatka) i zapytaj
   operatora, którą wybiera dla tego konkretnego klienta — to decyzja
   biznesowa, nie techniczna.
4. **Płatność**: nic nie implementuj. Operator ogarnia to sam poza tym
   systemem. Twoje zadanie kończy się na działającym, odgrodzonym dostępem
   demo i jasnej notatce co do własności hostingu.

## Twarde ograniczenia (nie do przekroczenia bez zapytania operatora)

- Zero nowych tabel/funkcji w produkcyjnym Supabase `ucnmhxcjmfztfxfjlgvk`
  (tym, którego używa Node 1 do prawdziwych rozmów).
- Zero nowych jobów/sekretów w `.github/workflows/ci.yml` tego repo.
- Zero nowych, współdzielonych Cloudflare Workers poza pojedynczymi,
  jednorazowymi demo per klient (te już są objęte istniejącym szablonem).
- Jeśli feedback od klienta wymaga czegoś więcej niż prostego gate'a dostępu
  (np. realnej integracji z jego kontem, wielu użytkowników, fakturowania)
  — to nowa decyzja architektoniczna, wraca do operatora, nie zgaduj.
- Nie kontaktuj żadnego prawdziwego klienta. Operator sam rozmawia z ludźmi.

## Na koniec zgłoś

- Diff/nowe pliki (rejestr + nowy szablon promptu), krótkie demo działania
  na jednej prawdziwej, zakończonej sesji.
- Czy coś z listy ograniczeń wyżej okazało się za ciasne w praktyce — jeśli
  tak, opisz dlaczego zamiast to obejść.
