# Status backendu monitoringu

Data: 2026-09-17.

## Zrealizowane

- Kontrakt P0 jest w `docs/ADMIN-MONITORING-CONTRACT.md`.
- `20260917110000_monitoring.sql` jest zastosowana na projekcie `ucnmhxcjmfztfxfjlgvk` i potwierdzona w historii migracji.
- API administratora filtruje wygasłe sesje, ogranicza stronę do 50 rekordów i zwraca lekką listę wraz z kompatybilnym polem `sessions`.
- Szczegół rozmowy zwraca raport oryginalny i poprawiony z wersjonowanymi runami, ocenami oraz uwagami operatora.
- Dodano zapisy runu głosowego i ekstrakcji bez ujawniania sekretów. Nieznana wersja konfiguracji ElevenLabs pozostaje oznaczona jako `unknown`.
- Dodano endpointy notatek i bezpiecznego eksportu kontekstu.

## Weryfikacja

- `npm test -- --run`: 43 testy przeszły.
- `npm run build`: wymaga końcowej integracji panelu, który jest równolegle edytowany.
- `supabase migration list --linked`: wszystkie lokalne migracje do `20260917110000` są zdalnie zastosowane.
- `20260917120000_fix_save_interview_normalization.sql` jest zastosowana. Regresja PGlite przeszła, a `supabase db lint --linked` nie zgłasza błędów schematu.
- Release produkcyjny `dpl_DfbtzQiJQ5XPdAavmuyjAnseXv5Z` jest `Ready`; alias `https://mirai-discovery-interview.vercel.app` wskazuje na ten artefakt.
- Świeży serwer lokalny: 46 testów jednostkowych i 4 scenariusze Playwright przeszły. Produkcyjne `GET /admin` zwraca 200.

## Uczciwe ograniczenia

- Autoryzowanego smoke testu zalogowanego administratora nie wykonano jeszcze.
- Test mikrofonu, przerwanie na realnym urządzeniu i dziesięć scenariuszy syntetycznych nie są wykonane przeciwko żywemu agentowi.
- Funkcja `save_interview` miała wcześniejszy błąd pętli normalizacji wyników. Naprawiono go migracją `20260917120000`; prawdziwa rozmowa produkcyjna nie była jednak używana jako fixture regresyjny.
- Historia Supabase była niespójna: pięć zdalnych wpisów bez lokalnych plików usunięto z historii, a istniejące lokalne migracje oznaczono jako zastosowane po sprawdzeniu schematu. Nowa migracja monitoringu została następnie zastosowana normalnie.
