# Architektura i granice

```text
React UI + scena z Figma Make
  └─ useInterview (stan i kolejka zapisów)
      ├─ domain/interview (scenariusz + adaptacja)
      ├─ voice/VoiceProvider
      │   ├─ MockVoiceProvider (tekst + opcjonalna synteza przeglądarki)
      │   └─ ElevenLabsProvider → podpisany URL → transport audio SDK
      ├─ domain/extraction → domain/contract
      └─ persistence/repository
          ├─ localStorage (jawny tryb demonstracyjny)
          └─ Supabase Auth anonymous + RPC save_interview + RLS
Express API
  ├─ POST /api/voice/token (auth + ownership + limit + signed URL)
  └─ POST /api/extract (auth + ownership + Structured Outputs + evidence validation)
```

Scena nie importuje SDK głosu, auth ani bazy. Ładuje się osobnym chunkiem; WebGL ma fallback. Tryb reduced motion oraz ukrycie karty ograniczają renderowanie. Pozostała aplikacja działa bez sceny. Obiekt zachowuje geometrię z Figma Make, bez globalnego wyciszania ostrzeżeń konsoli z pierwotnego prototypu.

## Stan sesji

`active → paused → active → review → completed`. W `review` użytkownik może korygować i ponownie zapisać wynik. Po odświeżeniu landing proponuje wznowienie. Utrata voice connection wyświetla ponowne połączenie lub przejście na tekst. Powrót do głosu zestawia nowe połączenie i przekazuje zapisany kontekst. Interfejs oznacza cztery tematy; nie ocenia uczestnika.

## Persistence

`interview_sessions.state` jest zwalidowanym checkpointem do wznowienia. Jedna transakcja RPC zapisuje także znormalizowane tury, segmenty i wyniki w dziewięciu wymaganych tabelach. `extracted_insights` przechowuje kontekst, narzędzia i ograniczenia; oddzielne tabele przechowują problemy, procesy i okazje. `session_summaries` zawiera eksport i pierwotną interpretację.

Supabase klient ma tylko uprawnienia SELECT/DELETE właściwych danych oraz EXECUTE konkretnego RPC. Nie może bezpośrednio wstawiać lub zmieniać tabel. RLS filtruje odczyty po `auth.uid()` i dacie wygaśnięcia. Funkcja `SECURITY DEFINER` ma pusty search_path i jawnie weryfikuje auth.uid oraz właściciela przed dowolnym zapisem. Blokada transakcyjna obejmuje również jednoczesne utworzenie tego samego UUID. Metadane zgody i pierwotne wypowiedzi są niezmienne.

Kolejka frontendu serializuje checkpointy; idempotencja opiera się na UUID i rewizji. Identyczny retry tej samej rewizji niczego nie dubluje; starsza lub różna zawartość tej samej rewizji jest odrzucana. Zapis błędny jest widoczny w UI; „Ponów zapis” używa tego samego checkpointu. Wnioski uznaje się za zapisane dopiero po sukcesie persistence.

## Retencja i dostęp

Dane Supabase są natychmiast niedostępne przez RLS po expires_at; cron usuwa je co godzinę wraz z rekordami potomnymi. Przycisk usunięcia usuwa sesję kaskadowo. Demo usuwa przeterminowany zapis przy otwarciu. Auth tokeny pozostają mechanizmem Supabase Auth i nie są częścią eksportu; anonimowe konta auth mają odrębny cykl życia.

Model demo nie jest narzędziem do poufnych badań: każda osoba z dostępem do tej samej przeglądarki może wznowić jej anonimową sesję. Usunięcie pamięci przeglądarki usuwa możliwość wznowienia. Nie zbudowano systemu kont, odzyskiwania dostępu ani publicznych linków do wyników.

## Świadome ograniczenia prototypu

- Live ElevenLabs, OpenAI i Supabase cloud wymagają konfiguracji oraz testu konta. Nie zostały uruchomione na cudzej/istniejącej bazie.
- Tekstowa adaptacja i ekstrakcja bez kluczy są regułowe. Free-form voice jest adaptowany przez dedykowanego agenta; indeks UI jest orientacyjny, a questionId może być null.
- Wyciszenie audio przez „Przerwij” nie jest anulowaniem rozumowania po stronie dostawcy. Naturalne barge-in zależy od ustawień VAD agenta.
- Zapis jest checkpointem po turach. Wypowiedź urwana przed otrzymaniem finalnego transkryptu od dostawcy nie może zostać odzyskana.
- Przy błędzie sieci niezapisane zmiany pozostają w pamięci bieżącej karty do ponowienia; nie dodano trwałej offline kolejki poufnych danych.
- Limity API działają w pojedynczym procesie serwera. Przy skalowaniu wymagają wspólnego magazynu; publiczne anonymous sign-ins wymagają właściwej ochrony przed botami.
- pg_cron i rzeczywiste uprawnienia projektu wymagają smoke testu po wdrożeniu. PGlite testuje właściwy SQL PostgreSQL i RLS, ale nie Supabase Auth, GoTrue ani harmonogramu.
- To źródło danych dla przyszłego Mirai, bez obecnej integracji, dashboardu, CRM czy wykonywania automatyzacji.
