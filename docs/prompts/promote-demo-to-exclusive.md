<!--
Szablon promptu do wklejenia w agenta (Astra/Codex), uruchamianego w KATALOGU
KONKRETNEGO demo (świeży `git clone` repo tego klienta do katalogu
tymczasowego). Wypełniany automatycznie przez:

  npx tsx scripts/generate-promote-to-exclusive-prompt.ts --demo <hosted_demos.id>

Użyj, gdy klient powie "chcę to mieć u siebie". Po tym, jak agent zgłosi
wygenerowany sekret dostępu, operator ustawia status demo w panelu admina na
"approved_exclusive" — nic nie trzeba ręcznie edytować w repo mirai-2.
-->

Masz pełny dostęp do tego komputera. Sklonuj repo **{{REPO_URL}}** do
katalogu tymczasowego — demo **{{CLIENT_LABEL}}**, dziś pod {{DEMO_URL}}.
Klient potwierdził, że chce je mieć na stałe. Zadanie: zamknąć dostęp
wyłącznie dla niego i przygotować dla operatora (mnie) decyzję o hostingu.
Nie implementuj żadnej płatności — tym zajmuję się poza tym systemem.

## Krok 1 — dostęp tylko dla niego

Jeśli demo miało tylko niejawny URL (nikt inny go nie zna, ale technicznie
publiczny) — dodaj prosty gate: współdzielony sekret w query param albo
nagłówku, sprawdzany na wejściu do Workera, redirect/403 bez niego. Kilka
linii kodu, żadnego nowego systemu logowania, żadnego OAuth, żadnego
Clerk/Supabase Auth. Wygeneruj losowy sekret, wypisz go w raporcie na
końcu — ja go przekażę klientowi.

## Krok 2 — dane: fikcyjne czy prawdziwe?

Jeśli demo do tej pory działało na fikcyjnych danych, a klient chce go
faktycznie używać na co dzień, to moment żeby przejść na jego prawdziwe
dane/konta (Kalendarz, arkusz, cokolwiek było symulowane). To wymaga jego
poświadczeń albo dostępu do jego konta — **zatrzymaj się i zapytaj mnie**,
zanim cokolwiek założysz albo poprosisz klienta o dane. Jeśli demo już
działa na danych, które i tak są jego prawdziwymi (bo tak wyszło z
rozmowy), pomiń ten krok.

## Krok 3 — decyzja o hostingu (przedstaw mi opcje, nie wybieraj sam)

Napisz w raporcie na końcu dwa zdania o każdej opcji, ja zdecyduję który
wariant dla tego klienta:

- **(a) Zostaje pod moim kontem Cloudflare/GitHub.** Prostsze, mogę w
  każdej chwili odciąć dostęp (np. brak płatności), pasuje do modelu
  subskrypcyjnego/dostępowego.
- **(b) Transfer repo GitHub + Workera na konto klienta.** Pełna własność
  po jego stronie, zgodnie z kierunkiem "customer-owned accounts" — ale
  tracę łatwą kontrolę nad dostępem. Jeśli warto to przygotować technicznie
  (żeby transfer był możliwy jednym poleceniem, gdy zdecyduję), napisz
  dokładnie jaka komenda/kroki (`gh repo transfer`, przeniesienie Workera),
  ale **nie wykonuj transferu teraz** — to osobna decyzja.

## Krok 4 — wdróż i zgłoś

`npx wrangler deploy` z tego katalogu, potem `git push` do
**{{REPO_URL}}**, potem skasuj katalog tymczasowy. W raporcie na końcu
podaj: URL, wygenerowany sekret dostępu, czy dane są fikcyjne czy prawdziwe
(i jeśli prawdziwe — co dokładnie), obie opcje hostingu z jednozdaniowym
uzasadnieniem każda, realny koszt miesięczny przy tej jednej osobie
korzystającej.

Nie zapisuj sekretu dostępu nigdzie w repo mirai-2 ani w panelu admina —
tylko w raporcie dla mnie. Po przekazaniu sekretu klientowi ja sam zmienię
status demo `{{DEMO_ID}}` na "approved_exclusive" w panelu.
