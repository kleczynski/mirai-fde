# 0002. Discovery to build brief service, rationale

## Context

Węzeł 1 (ten repozytorium, "agent i wywiad") jest już dopracowany: rozmowa głosowa przez ElevenLabs, scena 3D z Figma Make, kontrakt `mirai.discovery.v1` sprawdzany Zod-em, panel admina z listą sesji, uruchomień i ewaluacji. Panel ma już przycisk, który pobiera `mirai.agent-context.v1`, czyli zatwierdzone fakty z rozmowy jako plik JSON gotowy dla "jakiegoś agenta" (`server/admin.ts`, `exportAdminSession`). `ADMIN-MONITORING-CONTRACT.md` wprost mówi, że dzisiejszy kontrakt "nie tworzy projektów klienta, briefów ani automatycznej budowy". Innymi słowy: węzeł 1 kończy się dokładnie tam, gdzie zaczyna się to, o co pytasz.

W osobnym projekcie ("Mirai1", folder `mirai`) istnieje już pierwsza, prostsza wersja tego pomysłu: `lib/agent-brief.ts` i `lib/documents.ts` sklejają jeden dokument Markdown ("Codex build brief") ze sztywnego szablonu dobranego po branży klienta (stolarz, sklep, dentysta). To działa i jest używane, ale nie rozumuje nad dowodami: szablon `t.opportunity` jest z góry napisanym tekstem na branżę, a nie wnioskiem wyciągniętym z konkretnej rozmowy. Ten mechanizm jest punktem odniesienia co do kształtu końcowego dokumentu (rozdzielenie zaufanych instrukcji od niezaufanych dowodów klienta, jawne oznaczanie danych fikcyjnych, jeden dokument na jedną decyzję do zbudowania), a nie wzorcem do skopiowania, bo brakuje mu właśnie tego, czego chcesz: rozumowania nad konkretnym, dowodowym przypadkiem.

### Przykład zasilający tę decyzję: Julka, korepetytorka

W testach jakości głosu tego repozytorium (`.local/voice-evals/*.json`, przypadek `simulation.tutor_revolut_calendar`) zapisany jest dokładnie ten rzeczywisty przypadek: korepetytorka po każdej lekcji ręcznie sprawdza w aplikacji Revolut, czy uczeń zapłacił, a potem ręcznie zmienia kolor wydarzenia w Kalendarzu Google na zielony, żeby oznaczyć lekcję jako opłaconą. Problem nie jest dramatyczny (żadnego stresu ani awantur), tylko monotonny i powtarzalny. To dokładnie ten rodzaj wejścia, jaki węzeł 1 dziś już potrafi wydobyć i zapisać jako `mirai.agent-context.v1`, ale sam w sobie ten eksport to jeszcze nie brief gotowy do budowy demo, to surowe dowody. Ta decyzja opisuje serwis, który z takiego eksportu zrobi konkretny, jeden, wąski i możliwy do zbudowania plan (np. "sprawdzaj nowe transakcje na koncie testowym i koloruj wydarzenia w testowym kalendarzu"), zamiast zostawiać Tobie ręczne przepisywanie transkryptu w dokument dla agenta kodującego.

## Options considered

### Option 1: Rozbudowa istniejącego API admina bez osobnego serwisu

Pipeline pięciu kroków działałby jako kolejna funkcja w `api/admin/*`, wywoływana bezpośrednio z panelu, hostowana tak jak dziś (Vercel/Express).

**Pros**:
- Zero nowego środowiska do wdrażania, jeden deploy, jedna baza kodu.
- Najszybszy start, bo kopiuje istniejący styl `api/*.ts`.

**Cons**:
- Funkcje serverless mają twardy limit czasu wykonania. Pięć wywołań modelu plus realne czekanie na Twoją decyzję (może to być godziny, nie sekundy) nie mieści się w takim modelu bez ręcznego wymyślania własnej maszyny stanów w Supabase.
- Ponowienia po błędzie, zapisywanie postępu między krokami i bezpieczne "zaśnięcie" do czasu Twojej decyzji trzeba by zbudować samemu od zera.

### Option 2: Cloudflare Workflow jako osobny serwis, wspólna baza Supabase z węzłem 1 (wybrana)

Nowy Cloudflare Worker z Workflow, osobno wdrażany, ale czytający i piszący do tego samego projektu Supabase co węzeł 1. Panel admina woła go przez cienkie proxy w istniejącym `api/admin/*`.

**Pros**:
- Workflow z definicji przetrwa restart, ma wbudowane ponowienia i potrafi naprawdę czekać (nawet długo) na zewnętrzne zdarzenie, czyli dokładnie na Twoją decyzję "zatwierdzam brief".
- Ta sama rodzina hostingu (Cloudflare Workers), którą sam wskazałeś jako docelową dla samych demo, więc zespół uczy się jednego środowiska, nie dwóch.
- Wspólna baza Supabase oznacza jeden model uwierzytelniania administratora (`MIRAI_ADMIN_EMAILS`, JWT), zero nowego dostawcy tożsamości.

**Cons**:
- To jednak drugi serwis do wdrażania, monitorowania i utrzymania, nie rozbudowa istniejącego.
- Cloudflare Workflows to stosunkowo młody produkt w portfolio Cloudflare, jego limity i cennik przy realnym obciążeniu trzeba będzie sprawdzić przy wdrożeniu, nie tylko na podstawie dokumentacji.
- Trzeba zbudować most autoryzacji: Worker musi umieć zweryfikować ten sam JWT Supabase, który dziś sprawdza wyłącznie kod w `server/admin.ts`.

### Option 3: Durable Object jako własna maszyna stanów

Jeden Durable Object na jedno uruchomienie pipeline'u, ręcznie zapisujący stan każdego kroku.

**Pros**:
- Pełna kontrola nad każdym detalem stanu, jeden prymityw Cloudflare do zrozumienia.
- Dobrze komponuje się z ewentualnym przyszłym hostingiem wielu demo pod jednym kontem (Workers for Platforms).

**Cons**:
- Trzeba ręcznie napisać dokładnie to, co Workflows daje gotowe: ponowienia, zapisywanie postępu, wznawianie po awarii. Więcej kodu do utrzymania i więcej własnych trybów awarii do przetestowania.
- Dla sztywnej, pięcioetapowej sekwencji (nie dla stanu długo żyjącej, interaktywnej sesji) nie daje wyraźnej przewagi nad gotowym Workflow z opcji 2.

## Rationale

Kluczowa siła rozstrzygająca to konieczność bezpiecznego czekania na Twoją decyzję jako administratora między krokiem 4 (szkic briefu) a jego finalnym zatwierdzeniem: to może trwać minuty albo dni, i żadna zwykła funkcja serverless (opcja 1) nie robi tego bezpiecznie bez własnej maszyny stanów napisanej ręcznie. Cloudflare Workflows (opcja 2) daje to jako gotowy mechanizm (`step.waitForEvent`), więc nie trzeba tego wynajdywać samemu, tak jak trzeba by w opcji 3. Drugi argument to spójność kierunku: skoro docelowy hosting samych demo dla klientów to Cloudflare Workers, sensowne jest, żeby narzędzie, które te demo opisuje, żyło w tej samej rodzinie technologii, a nie w trzeciej.

Koszt tej decyzji jest jawny i realny: to naprawdę drugi serwis, nie rozbudowa istniejącego, i Workflows jako produkt jest młodszy niż np. same Workers czy Durable Objects, więc jego rzeczywiste limity trzeba będzie sprawdzić w praktyce, nie tylko wierzyć dokumentacji. To ryzyko jest akceptowalne, bo pipeline pięciu kroków z jednym punktem oczekiwania na człowieka to dokładnie przypadek użycia, do którego Workflows zostały zaprojektowane, więc szansa na trafienie w nieudokumentowane ograniczenie jest niska.
