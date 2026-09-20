# Transformacja sceny w agenta głosowego

2026-09-17. Analiza istniejącego kodu i proponowany zakres, jeszcze bez implementacji.

## Doświadczenie

Po zgodzie i rozpoczęciu wywiadu głosowego bryła płynnie przesuwa się na środek i zwija w miękką zieloną kulę. Nagłówki, formularz i wskaźniki tematów znikają. Pozostają spokojne tło i brzoskwiniowa poświata. Kula lekko unosi się i deformuje, reagując na faktyczny głos. To wizualna obecność agenta.

Proponowany czas wejścia 0,9–1,3 sekundy, do dostrojenia w przeglądarce. Samo połączenie biegnie niezależnie: animacja nie opóźnia audio i nie udaje udanego połączenia. Przed zgodą nie znika ekran zgody. Tekstowy tryb rozmowy nadal ma pole odpowiedzi.

Opcjonalna minimalna transkrypcja po lewej na desktopie: ostatnia wypowiedź Mirai i użytkownika, bez panelu pełnej historii. Na telefonie pod kulą, bez nachodzenia na nią. Domyślnie skupiony widok głosu; użytkownik może włączyć napisy. Pełną historię można otworzyć osobno.

Rekomendacja: mały stale dostępny pasek mikrofon/pauza/zakończ oraz przycisk napisów, bez nawigacji i formularza na pierwszym planie. Stan błędu, wyciszony mikrofon i niezapisane odpowiedzi muszą pozostać czytelne. Nie uzależniać możliwości zakończenia od hovera ani klikania kuli.

## Co już istnieje

`MiraiSignal.tsx` utrzymuje jedną scenę między ekranami. `createScene.ts` interpoluje położenie i tempo; `geometry.ts` generuje otwartą pofałdowaną membranę. Aktualny wywiad lokuje obiekt po prawej, nie w centrum. `types.ts` opisuje stany rozmowy; animacja ma dziś ustalone amplitudy, nie analizuje dźwięku.

Zainstalowany SDK ElevenLabs deklaruje `getInputVolume()` i `getOutputVolume()` w `node_modules/@elevenlabs/client/dist/BaseConversation.d.ts`. Provider aplikacji nie wystawia tych pomiarów. Metody i zachowanie trzeba potwierdzić na aktywnej rozmowie. Nie ma potrzeby otwierania drugiego mikrofonu ani nagrywania audio tylko dla wizualizacji.

`scene.css` ustawia intensywność poświaty z parametru hero, który zanika poza landingiem; nowy stan rozmowy wymaga osobnej intensywności. Fallback jest obecnie SVG w kształcie wstęgi i potrzebuje wariantu kuli. Dotychczasowe testy przejść sprawdzają ciągłość ruchu, ale oczekują starego położenia.

## Sposób implementacji

Rekomendowane wspólne parametry przejścia: `morphProgress`, pozycja, skala i intensywność tła. Zachować renderer i ciągłość sceny. Dodać zamkniętą powierzchnię kuli z subtelną deformacją oraz skoordynowane zwijanie membrany. Otwartej siatki wstęgi nie wystarczy przeskalować do kuli: będzie płaska albo widocznie rozerwana. Pierwszy prototyp powinien sprawdzić zwinięcie wstęgi z krótkim płynnym przenikaniem do zamkniętej geometrii. Jeśli szew lub podwójna bryła są widoczne, dopiero wtedy zastosować wspólną siatkę parametryczną do pełnego morphingu.

Rozdzielić energię wejściową i wyjściową. W listening kula reaguje na użytkownika, w speaking na odtwarzany głos agenta. W connecting tylko powolny ruch oczekiwania; pause/mute wygaszają odpowiednie reakcje. Nie utożsamiać listening z mówieniem użytkownika. Obecne `connecting → thinking` w App trzeba rozdzielić.

Pomiar przez adapter providera, lokalnie w pamięci. Wygładzanie attack/release i ograniczenie amplitudy; aktualizacje przez ref/subskrypcję, bez renderowania całej aplikacji w każdej klatce. Scena otrzymuje liczby, nie SDK, transkrypcję czy poświadczenia. Pauza, disconnect i unmount czyszczą pomiar. Nie używać amplitudy jako wskaźnika jakości transkrypcji.

## Podzadania

1. Wydzielić kontrakt prezentacji głosu i przejście normal/immersive; właściciel `App.tsx` uzgadnia integrację ze zmianami admina.
2. Dodać centralny layout oraz morph w `src/scene/geometry.ts`, `createScene.ts`, `types.ts`; dopasować materiały i światło.
3. Dodać lokalny pomiar energii w `src/voice/types.ts`, `elevenlabs.ts` i hooku. Uzgodnić z właścicielem telemetryki, bez konkurencyjnych edycji tych samych plików.
4. Dodać minimalne napisy i sterowanie rozmową; zachować pełną historię i tekstowy fallback.
5. Rozszerzyć fallback SVG, reduced motion i zachowanie przy utracie WebGL. W reduced motion centralna kula jest statyczna, zmienia się tylko czytelny stan.
6. Testy ciągłości przejścia, zmiany rozmiaru, pauzy, reconnect, wyciszenia i sprzątania zasobów; ręczna ocena na desktopie i telefonie z faktycznym głosem.

## Odbiór

Brak skoku kształtu, pozycji lub resetu canvas po starcie. Audio nie czeka na animację. Widoczne sterowanie i błąd są dostępne klawiaturą i dotykiem. Wyłączone napisy nie zatrzymują zapisu transkryptu. Kula reaguje na właściwą stronę rozmowy i uspokaja się w ciszy. Ekran tekstowy pozostaje używalny. Sprawdzić wydajność razem z aktywnym audio, nie tylko na nieruchomej stronie; zachować istniejące ograniczenia DPR i tryb mobilny 30 fps. To cele odbioru, nie zmierzone wyniki.
