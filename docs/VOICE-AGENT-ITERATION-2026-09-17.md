# Mirai voice agent: iteracja jakości rozmowy (2026-09-17)

## Zakres i stan

Trzy reguły są w `src/domain/voice-policy/` i w składanym `AGENT_PROMPT` z `src/domain/interview.ts`: jeden wybrany proces, odróżnienie faktu od hipotezy oraz jednokrotne podsumowanie i naturalne zakończenie. Dodatkowo kolejność decyzji po odpowiedzi daje pierwszeństwo zakończeniu i rozstrzygnięciu niejednoznacznego „tak” przed kolejnym pytaniem o proces. Dołączono syntetyczne przypadki regresyjne i testy integracji promptu.

Kandydat jest opublikowany wyłącznie na gałęzi ElevenLabs `Mirai conversation quality v2` (`agtbrch_0601m2rdbwe8er5922d69yc304hv`), z 0% ruchu. Główna gałąź nadal ma 100% ruchu. Ostatnia wersja obserwowana w testach: `agtvrsn_7101m2re85v0f4svecpp3ar6gsh5`. Nie jest to wdrożenie produkcyjne.

## Testy i rzeczywiste odpowiedzi

Przypadki ElevenLabs są syntetyczne, bez prywatnego transkryptu rozmowy. Cztery testy „Next reply” są przypięte do gałęzi:

| Przypadek | Obserwacja na ostatniej wersji |
| --- | --- |
| Potwierdzenie podsumowania i „To wszystko, dzięki” | Krótkie zakończenie bez nowego pytania; oceniacz zaliczył. |
| Nazwany proces bez kroków | Pytanie o ostatnie zlecenie w tym procesie; oceniacz zaliczył. |
| Samo „tak” na alternatywę pomyłki/czas | Pytanie, czy chodzi o pomyłki, czas czy oba; oceniacz zaliczył. |
| „Nie, nic więcej” po pytaniu o poprawki | Widoczna odpowiedź agenta: „Dzięki, mam to. Miłego dnia.” Oceniacz nie zaliczył, twierdząc, że odpowiedzi brakuje. Trzy ponowienia otrzymały ten sam typ błędnej oceny; pierwsza z nich także pokazywała odpowiedź zamykającą. |

To jest mała próba, a generacja i ocena są niedeterministyczne. Wynik panelu 3/4 nie oznacza 75% jakości. Szczególnie ostatni przypadek pokazuje fałszywy negatyw oceniacza. Nie należy automatycznie promować wersji wyłącznie na podstawie jego etykiet. Wcześniejsze wersje rzeczywiście zawiodły: agent dopytał mimo wyraźnego końca, a potem uznał „tak” za potwierdzenie obu alternatyw. Zmiany były iterowane na tych ujawnionych błędach.

Lokalnie `npm test` przechodzi 52/52 testów, a `npm run build` przechodzi. Testy lokalne sprawdzają skład promptu i jakość zestawu przypadków; nie dowodzą semantycznego zachowania modelu w głosie.

## Dodatkowe ustalenia

- Produkcyjny agent ElevenLabs korzysta z promptu skonfigurowanego u dostawcy. Lokalny `AGENT_PROMPT` trafia jako nadpisanie tylko przy `ELEVENLABS_ENABLE_PROMPT_OVERRIDE=true`. Domyślnie jest to wyłączone, więc sama zmiana plików nie zmienia rozmów produkcyjnych.
- Eksport `mirai.agent-context.v1` zawiera identyfikatory, telemetrię i ograniczenia, ale bez zatwierdzonego raportu nie zawiera tur, faktów ani ocen. W badanym eksporcie `promptVersion` i `configurationStatus` były `unknown`. Sama paczka nie wystarcza do odtworzenia zachowania; potrzebna jest transkrypcja z identyfikatorami tur i powiązanie z wersją konfiguracji.
- Panel nie miał wcześniej przypiętych testów. Ustawienie modelu obserwowane w ElevenLabs: `Qwen3.5-397B-A17B`. Obserwowane 4 przerwania w rozmowie oraz ustawienia przejmowania tury mogą współtworzyć wrażenie urwanych wypowiedzi, ale sam transkrypt nie dowodzi związku przyczynowego.
- Testy „Next reply” pokazywały domyślną pierwszą wiadomość po angielsku („Hello, how can I help you today?”), mimo że konfiguracja agenta ma polskie powitanie. Jest to kolejny powód, by traktować je jako test odpowiedzi w sztucznym kontekście, nie pełną symulację realnego połączenia głosowego.
- W testach pierwszych wersji pojawiały się znaczniki `[happy]`, `[sad]`, `[slow]` i dopowiedziany „czas” z wypowiedzi o „uwadze”. Zmieniono instrukcje stylu i dowodów; ostatnia sprawdzona odpowiedź o procesie nie dopowiedziała czasu ani nie zawierała znaczników.

## Bramka przed ruchem produkcyjnym

Rozszerzyć zestaw o parafrazy i kontrprzykłady: wyraźną prośbę o nowy temat, odrzucenie podsumowania, „nie wiem”, brak problemu, zakończenie przed poznaniem kroków oraz rzeczywistą rozmowę głosową za zgodą uczestnika. Każdy przypadek uruchomić kilka razy i ocenić surowe odpowiedzi ręcznie, oddzielnie od etykiety automatycznego oceniacza. Zmierzyć także liczbę zbędnych pytań, powtórzeń, nieuprawnionych faktów i zachowanie TTS. Dopiero po tym rozważyć ograniczony ruch na gałąź lub połączenie z Main; wersję i wynik testów zapisać przy każdej rozmowie.
