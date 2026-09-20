# 0001. Indywidualne zaproszenia do rozmów

**Date**: 2026-09-18
**Status**: Accepted

## Summary

Administrator nadaje prywatną etykietę i opcjonalną branżę, a aplikacja tworzy link dla jednej rozmowy. Link działa przez 30 dni, jeśli nie został użyty. Odbiorca nie wpisuje imienia i nie zakłada konta, a panel grupuje rozmowy według zaproszeń.

## Context

Obecne anonimowe sesje nie pozwalają administratorowi rozpoznać, komu wysłał test. Imię wpisane przez uczestnika nie byłoby potwierdzeniem tożsamości. Istniejący Supabase Auth pozostaje mechanizmem anonimowej sesji uczestnika i zweryfikowanego logowania administratora.

## Requirements

**User stories**:
- Administrator chce opisać odbiorcę przed wysłaniem linku i potem zobaczyć jego rozmowę.
- Uczestnik chce rozpocząć rozmowę z otrzymanego linku bez podawania danych.

**Acceptance criteria**:
- **AC-1**: Administrator tworzy zaproszenie z prywatną etykietą i opcjonalną branżą oraz kopiuje link.
- **AC-2**: Niewykorzystany link wygasa po 30 dniach i nie ujawnia etykiety uczestnikowi.
- **AC-3**: Link przypisuje dokładnie jedną rozmowę; ponowne otwarcie w tej samej anonimowej sesji wznawia ją, a inny użytkownik widzi informację o wykorzystaniu linku.
- **AC-4**: Panel pokazuje zaproszenia oraz przypisane rozmowy, z oddzielną grupą rozmów bez zaproszenia.
- **AC-5**: Publiczne wejście bez linku nadal działa. Administrator i uczestnik nie mogą przypisać cudzej rozmowy do zaproszenia.

## Options considered

### Option 1: Imię wpisane przez uczestnika

Najmniej kodu, ale nie daje kontroli administratorowi nad etykietą ani pewnego skojarzenia z wysłanym linkiem.

### Option 2: Zaproszenie z tajnym tokenem

Administrator opisuje odbiorcę, a token wiąże jedną anonimową sesję z zaproszeniem. Token nie potwierdza tożsamości osoby, tylko użycie linku.

## Decision

**Chosen option**: Option 2: Zaproszenie z tajnym tokenem.

Publiczne wejście zostaje. Osobna kula operatora i logowanie e-mail uczestnika są poza tym wdrożeniem.

## Rationale

Rozwiązanie wykorzystuje istniejący Supabase i obecny panel bez dodatkowego dostawcy logowania. Prywatne etykiety nie pojawiają się w stronie uczestnika ani w danych rozmowy.

## Feature design

**Data model sketch**: `interview_invitations`: UUID, label, nullable industry, unikalny SHA-256 tokenu, created_by (FK auth.users), created_at, expires_at, nullable claimed_by (FK auth.users), nullable claimed_session_id (unikalny UUID), nullable claimed_at i session_started_at. Tabela bez bezpośredniego dostępu przeglądarki. Znacznik rozpoczęcia zapobiega ponownemu utworzeniu usuniętej rozmowy.

**State transitions**: nowe → wykorzystane przez jednego użytkownika; nowe → wygasłe po 30 dniach. Wykorzystany link może wznowić jedynie ten sam użytkownik, dopóki rozmowa istnieje.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/admin/invitations` | GET | limit, cursor | strona zaproszeń | administrator | 401, 403, 503 |
| `/api/admin/invitations` | POST | label, industry | jednorazowo ścieżka linku, którą panel łączy z origin | administrator | 401, 403, 422 |
| `claim_interview_invitation_v2` RPC | POST | token linku, proponowany UUID rozmowy | UUID rozmowy, canCreate | anonimowy Supabase Auth | wykorzystany, wygasły, brak |

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Utworzenie | etykieta, branża | formularz administratora |
| Utworzenie | token, data wygaśnięcia | kryptograficzny generator serwera, zegar bazy plus 30 dni |
| Wykorzystanie | właściciel, ID rozmowy | zweryfikowany `auth.uid()` i UUID przekazany przez klienta |
| Panel | status, etykieta, branża | `interview_invitations` i połączenie z `interview_sessions` przez ID |

**Key invariants**: Jedno zaproszenie może mieć najwyżej jednego właściciela i jedną rozmowę. Ponowienie przez właściciela jest idempotentne. Zapis rozmowy z zarezerwowanym ID przez innego właściciela jest odrzucany.

**Security model**: Tworzenie i odczyt etykiet tylko przez API administratora po weryfikacji JWT i allowlisty. Funkcja claim przyjmuje wyłącznie użytkownika zalogowanego anonimowo, liczy skrót tokenu wewnątrz bazy i nie zwraca etykiety. Baza przechowuje tylko hash tokenu. Token w URL jest sekretem dostępu, lecz nie dowodem tożsamości odbiorcy.

**Configuration required**: Bez nowych sekretów. Wykorzystuje istniejący Supabase i allowlistę administratorów.

**Critical test scenarios**: Utworzenie i wykorzystanie linku (AC-1, AC-3); etykieta ukryta w UI uczestnika (AC-2); ponowne użycie przez drugiego użytkownika (AC-3); grupowanie i publiczna sesja (AC-4, AC-5); próba podszycia pod zarezerwowany UUID (AC-5).

## Build plan

- [x] Migracja i atomowe przypisanie w bazie (AC-2, AC-3, AC-5).
- [x] Endpointy administratora i mapowanie rozmów (AC-1, AC-4).
- [x] Wejście z linku i wznowienie w frontendzie (AC-2, AC-3, AC-5).
- [x] Panel tworzenia i grupowania wraz ze stanami błędów (AC-1, AC-4).
- [x] Testy, weryfikacja i wdrożenie produkcyjne (AC-1 do AC-5).

## Consequences

Administrator musi bezpiecznie przekazać link. Kto pierwszy użyje linku, przejmie zaproszenie; bez weryfikacji e-maila nie da się dowieść, że była to nazwana osoba. Utracony link należy zastąpić nowym zaproszeniem.

## Follow-up

Osobna kula testowa operatora i opcjonalne potwierdzenie e-maila uczestnika wymagają osobnych decyzji.
