# Audyt informacji o stanie aplikacji

Stan na 18 września 2026. Analiza dotyczy bieżącego interfejsu React, przepływu `App` i `useInterview` oraz panelu administratora. Komunikaty powinny opisywać faktyczny stan zapisu, a nie samą zmianę ekranu.

| Moment | Co użytkownik widzi obecnie | Luka i zalecany sygnał |
| --- | --- | --- |
| Otwarcie strony i przywracanie sesji | Przycisk „Chwileczkę…”; błąd w banerze | Brak wyjaśnienia, że aplikacja szuka poprzedniej rozmowy. Krótki status „Sprawdzam zapisaną rozmowę” pod przyciskiem. |
| Wybór trybu i zgoda | Wymagane zgoda, CAPTCHA i gotowy mikrofon; przycisk jest zablokowany | Brak zbiorczego powodu blokady. Pokazać konkretną wskazówkę przy przycisku, bez polegania na samym stanie `disabled`. |
| Wysyłanie odpowiedzi | Pytanie zmienia się szybko; osobny status zapisu na dole | Nie zawsze jasne, czy odpowiedź została przyjęta przed pojawieniem się następnego pytania. Krótki, nieblokujący sygnał „Odpowiedź przyjęta”, a trwałość komunikować dopiero po sukcesie zapisu. |
| Rozmowa głosowa | `connecting`, `listening`, `speaking`, `thinking`, przerwanie i błąd w etykiecie; reakcja kuli na energię | Dodano mały status zapisu również w trybie głosowym. Pozostaje rozdzielenie „łączę” od „opracowuję” w logice sceny. Nie kodować stanu wyłącznie animacją kuli. |
| Pauza i wznowienie | Status „Rozmowa wstrzymana” i przycisk wznowienia | W trybie głosowym brakuje wyraźnego potwierdzenia, że ostatnie tury są zachowane. Pokazać potwierdzenie dopiero po udanym checkpointcie. |
| Zakończenie rozmowy | Dialog potwierdzenia, potem przejście do podsumowania | Wdrożono osobny stan „Zapisuję odpowiedzi / Przygotowuję podsumowanie” i komunikat na ekranie weryfikacji. Przejście następuje po udanym zapisie, nie po samej zmianie stanu w pamięci. |
| Analiza AI niedostępna | Baner błędu i wynik regułowy | W treści podsumowania warto wyraźnie oznaczyć, że użyto wyniku zastępczego. Baner można zamknąć, więc ta informacja nie powinna żyć tylko tam. |
| Korekta i zatwierdzenie wniosków | Licznik niepotwierdzonych pozycji, stan przycisku „Zapisuję…” | Dodano status zapisu wersji roboczej powiązany z `sync`. Warto jeszcze połączyć błąd z bezpośrednią akcją ponowienia w tym samym miejscu. |
| Ostateczny zapis | Ekran podziękowania, potwierdzenie zapisu i termin dostępu | Stan jest dobrze nazwany. Delikatne wejście znacznika sukcesu wystarczy; nie zasłaniać informacji o retencji animacją. |
| Usunięcie sesji | Dialog ostrzegawczy, potem powrót na start | Po powrocie brak potwierdzenia usunięcia. Dodać komunikat o wykonaniu operacji; w razie błędu pozostać przy bieżącej sesji. |
| Panel administratora | Osobne stany ładowania, braku dostępu, wygaśnięcia, błędu, pustej listy i sukcesu notatki/usunięcia | Listy nie pokazują e-maila uczestnika. Tożsamość uczestnika musi pochodzić z uwierzytelnienia, a nie z pola wpisanego w przeglądarce. |

## Zasada wizualna

Jeden wzorzec informacji na przejście: niewielki panel z nagłówkiem, krótką przyczyną i ewentualną akcją. Czasowe operacje mogą mieć subtelną animację wejścia oraz ruch pierścienia, a sukces spokojne pojawienie się znaku potwierdzenia. Błąd wymaga trwałego tekstu i drogi ponowienia. Każdy stan ma być czytelny bez ruchu (`prefers-reduced-motion`) i ogłaszany przez `role="status"` albo `role="alert"` stosownie do pilności. Animacja kuli pozostaje dekoracją, a nie jedynym nośnikiem znaczenia.

## Architektura tożsamości

Obecnie uczestnik otrzymuje anonimową sesję Supabase Auth. `interview_sessions.owner_id` wskazuje użytkownika Auth, ale nie ma potwierdzonego adresu e-mail. Panel administratora korzysta już z linku e-mail Supabase Auth i serwerowej listy uprawnionych adresów. Samo wpisanie e-maila uczestnika bez potwierdzenia nie jest logowaniem i pozwala podszyć się pod inną osobę. Najprostszy spójny kierunek to logowanie uczestnika takim samym linkiem jednorazowym, przypisanie sesji do `auth.uid()` oraz pokazanie administratorowi e-maila po stronie serwera. Nie należy zapisywać adresu podanego z formularza jako dowodu tożsamości ani ujawniać listy adresów przez publiczne API.

Otwarte do decyzji: czy wejście do wywiadu ma wymagać potwierdzenia adresu, czy adres ma być tylko niezweryfikowaną etykietą kontaktową. Te modele dają różny poziom zaufania i wymagają innego tekstu w interfejsie.

## Najprostszy model identyfikacji i control plane

Można zapytać o imię lub nazwę przed zgodą i zapisać je jako `participant_label` przypisane do sesji. To pozwoli administratorowi rozpoznać rozmowę bez konta i bez opóźnienia startu, ale jest tylko deklaracją uczestnika. Dwie osoby mogą podać tę samą nazwę; pole nie powinno służyć do odzyskiwania dostępu ani autoryzacji. Jeśli celem jest pewne przypisanie lub powrót z innego urządzenia, potrzebny jest potwierdzony link e-mail Supabase Auth. Numer sesji pozostaje trwałym identyfikatorem rozmowy w obu wariantach.

W panelu administratora warto oddzielić trzy sekcje: `Rozmowy uczestników`, `Testy operatora`, `Ustawienia i monitoring`. Widoczna kula może być wejściem do nowej rozmowy testowej administratora. Jej sesja powinna mieć znacznik pochodzenia `operator_test`, a nie być rozpoznawana po nazwie lub e-mailu. Dzięki temu testy można filtrować i nie mieszają się z prawdziwymi rozmowami. Znacznik musi być ustawiany po sprawdzeniu uprawnień po stronie serwera, gdy ma decydować o dostępie albo wiarygodności danych. Samo pole wysłane z przeglądarki nie wystarcza.

Najszybszy bezpieczny etap wdrożenia: nazwa uczestnika jako etykieta sesji oraz oddzielny widok testów w panelu, bez nazywania tego logowaniem. Następny etap, jeśli ma być potwierdzona tożsamość, to link e-mail Supabase Auth bez hasła. Istniejący panel administratora już korzysta z tego mechanizmu.
