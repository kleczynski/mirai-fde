# Kontrakt `mirai.discovery.v1`

JSON Schema określa strukturę; `DiscoverySchema.parse()` dodatkowo sprawdza poprawność powiązań. Nie wystarczy sprawdzić tylko istnienia klucza `schemaVersion`.

| Pole | Znaczenie |
|---|---|
| schemaVersion | Literalna wersja eksportu. Nieobsługiwaną wersję konsument musi odrzucić. |
| sessionId | UUID; klucz idempotencji importu, nie uprawnienie dostępu. |
| locale | Język wywiadu: `pl-PL`. |
| scenarioVersion / promptVersion | Wersja przebiegu i promptu agenta. |
| participantContext | Informacje o roli, codzienności i celu uczestnika. Tablica faktów popartych źródłami; brak faktu nie oznacza przeczenia. |
| painPoints | Frustracje, skala czasowa i konsekwencje procesu. Bez dopowiadania wartości. |
| workflows | Opis procesu i opcjonalnie jego kroki. Puste `steps` oznacza, że nie wyodrębniono bezpiecznie osobnych kroków. |
| tools | Środki pracy opisane przez uczestnika: fizyczne narzędzia, notatki, programy i wsparcie innych osób. Ekstrakcja regułowa zachowuje pełną wypowiedź, aby nie zgubić nieznanego narzędzia. Model może rozdzielić ją na osobne wnioski. |
| constraints | Granice zmiany: budżet, narzędzia, prywatność, kontrola człowieka. |
| automationOpportunities | Hipotezy do sprawdzenia. `linkedPainPointIds` wskazuje problemy, `validationNeeded` podaje warunki do sprawdzenia, `priority` = explore/next/later. Nie są zleceniem wdrożenia. |
| recommendedNextStep | Propozycja dalszego kroku do osobnego zatwierdzenia. Może nie mieć evidenceIds przy pustym wywiadzie. |
| unansweredQuestions | Pytania bez odpowiedzi; pominięcie lub wczesne zakończenie jest dozwolone. |
| evidence | Cytaty uczestnika z identyfikatorem segmentu. `quote` musi być dosłownym fragmentem danego segmentu. |
| transcript | Oryginalne segmenty w kolejności. Agent i participant są rozróżnieni. `questionId=null` oznacza nieznane przyporządkowanie; live voice używa konserwatywnych reguł rozpoznawania tematu. |
| consent | Zgoda z czasem i wersją. `audioStorage=false` dotyczy aplikacji; ustawienia dostawcy wymagają oddzielnej konfiguracji. Retencja wynosi 30 dni. |
| startedAt / completedAt / expiresAt | ISO 8601 UTC. `completedAt` to koniec rozmowy, nie data wdrożenia ani potwierdzenia importu. |
| extraction | Metoda, model lub wersja reguł, czas utworzenia interpretacji. |

## Każdy wniosek

`id`: UUID wniosku; `text`: treść; `confidence`: 0–1, pewność ekstraktora; `evidenceIds`: odwołania do dowodów; `review`: stan potwierdzenia. Potwierdzenie nie zwiększa automatycznie pewności modelu.

- `unreviewed`: propozycja, której uczestnik jeszcze nie zaakceptował.
- `confirmed`: uczestnik potwierdził treść.
- `corrected`: uczestnik zmienił treść. `originalText` zachowuje pierwszą interpretację; `reviewedAt` podaje datę ostatniego potwierdzenia.

Poprawka może celowo różnić się od transkryptu. Dowód nadal pokazuje oryginalny kontekst, a `review` informuje o późniejszej korekcie. Pełny pierwotny wynik modelu jest dodatkowo niezmiennie przechowywany w `session_summaries.model_payload`. Eksport obejmuje wersję zatwierdzoną.

## Import

```ts
import { DiscoverySchema, type DiscoveryResult } from './domain/contract';
const result: DiscoveryResult = DiscoverySchema.parse(untrustedPayload);
// Dopiero po walidacji mapuj dane. Upsertuj po (schemaVersion, sessionId).
// Akceptuj wyłącznie zatwierdzone/corrected review, jeśli import ma tworzyć ustalone fakty.
```

`getCompleteSessionResult(id)` odmawia eksportu sesji niezatwierdzonej i waliduje odczyt. Zapisane szkice dostępne są jako stan sesji tylko jej właścicielowi.

JSON Schema nie sprawdza więzów między tablicami; import poza TypeScript musi dodatkowo zweryfikować istnienie dowodów, poprawność cytatów, powiązania problemów i unikalność identyfikatorów. Unknown/empty pozostaje unknown/empty. Nie wolno z pustej tablicy `constraints` wnioskować, że nie ma ograniczeń.

Eksport zawiera wypowiedzi użytkownika. Mirai jako przyszły konsument musi respektować zgodę, datę wygaśnięcia i własną politykę usuwania. Prototyp nie śledzi pobranych kopii i nie może ich zdalnie usunąć.
