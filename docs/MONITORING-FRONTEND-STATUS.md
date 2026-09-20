# Status frontendu monitoringu

Data: 2026-09-17.

## Zrealizowane

Panel w `src/components/AdminControlPlane.tsx` korzysta z kontraktu `ADMIN-MONITORING-CONTRACT.md`.

- Lekka, kursorowa lista rozmów używa `GET /api/admin/sessions?limit=25&cursor=` i zachowuje zgodność ze starszym polem `sessions`.
- Szczegół pokazuje raport utrwalony i wynik oryginalnej ekstrakcji wraz z korektami i cytowanymi dowodami.
- Transkrypcja pokazuje identyfikatory tur, czas, wersjonowane sygnały oceny i trwałe notatki operatora z etykietami.
- Uruchomienia pokazują konfigurację, wersję, status i wyłącznie pomiar opóźnienia dostępny w kontrakcie.
- Eksport używa `POST /api/admin/session-export` i nie tworzy lokalnej, domniemanej paczki.
- Stany anonimowy, wygasłej sesji i konta bez uprawnień są odrębne. Modal usunięcia reaguje na Escape i przywraca focus po powrocie do listy.

## Pliki

- `src/components/AdminControlPlane.tsx`
- `src/components/admin.css`
- `tests/e2e/admin.spec.ts`

## Weryfikacja

- `npm test -- --run tests/admin.test.ts` przeszło, 43 testy.
- `npm run build` przeszło.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:e2e -- --grep "administrator without a session"` przeszło, desktop i mobile.

Pierwsze uruchomienie E2E korzystało ze starego procesu Vite na porcie 5173, więc nie odzwierciedlało bieżących źródeł. Powtórna weryfikacja użyła świeżego serwera Vite na porcie 4173.

## Ograniczenia przed release

Nie wykonano autoryzowanego testu API z prawdziwym administratorem ani produkcyjnego smoke testu. Te czynności należą do integratora backendu po wdrożeniu migracji i endpointów. Brak danych konfiguracji, telemetrii, runów, ocen lub notatek pozostaje w UI oznaczony jako brak danych.
