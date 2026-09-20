/**
 * Fragment instrukcji agenta głosowego. Sam tekst nie gwarantuje zachowania modelu.
 * Scenariusze poniżej służą do porównania odpowiedzi kolejnych wersji agenta.
 */
export const FOCUS_POLICY = `FOKUS ROZMOWY: Gdy rozmówca wskaże jeden proces, trzymaj się właśnie jego. Nie pytaj o kolejny problem ani inny obszar pracy, chyba że rozmówca sam wyraźnie poprosi o zmianę tematu. Jeżeli znamy nazwę trudności, ale nie wiemy, jak wybrany proces przebiega, poproś o ostatni rzeczywisty przykład i jego kroki. Nie zastępuj tego pytaniami o inne problemy ani propozycją rozwiązania.

KRÓTKIE ODPOWIEDZI: Interpretuj je w kontekście bezpośrednio poprzedniego pytania. Jeśli pytasz, czy coś pominąłeś lub źle zrozumiałeś, odpowiedź „nie, wszystko”, „nic więcej” albo „to wszystko” oznacza brak korekty lub koniec wypowiedzi. Nie wywodź z samego słowa „wszystko”, że rozmówca chce rozszerzyć zakres na całą pracę. Gdy intencja jest naprawdę niejasna i ma wpływ na dalszą rozmowę, poproś o krótkie doprecyzowanie. Zmiana fokusu wymaga wyraźnej inicjatywy rozmówcy.`;

export type FocusEvalCase = {
  id: string;
  turns: readonly { speaker: 'mirai' | 'participant'; text: string }[];
  expectedMove: 'establish_focus' | 'deepen_same_process' | 'accept_correction' | 'finish' | 'switch_on_request';
  mustNot: string;
};

/**
 * Przykłady do testu odpowiedzi modelu, nie etykiety wyliczane z transkryptu.
 * Należy oceniać wygenerowaną następną wypowiedź, nie samą obecność tych danych.
 */
export const FOCUS_EVAL_CASES: readonly FocusEvalCase[] = [
  {
    id: 'process_named_without_steps',
    turns: [
      { speaker: 'participant', text: 'Ręcznie rozpisujemy elementy i liczymy wycenę. To zabiera czas.' },
    ],
    expectedMove: 'deepen_same_process',
    mustNot: 'Nie pytaj o inny problem ani nie sugeruj od razu automatyzacji.',
  },
  {
    id: 'correction_reply_no_everything',
    turns: [
      { speaker: 'mirai', text: 'Czy coś pominąłem lub źle zrozumiałem?' },
      { speaker: 'participant', text: 'Nie, wszystko.' },
    ],
    expectedMove: 'finish',
    mustNot: 'Nie interpretuj tego jako prośby o usprawnienie całej pracy.',
  },
  {
    id: 'correction_reply_nothing_more',
    turns: [
      { speaker: 'mirai', text: 'Czy coś jeszcze warto dodać do tego obrazu?' },
      { speaker: 'participant', text: 'Nie, nic więcej.' },
    ],
    expectedMove: 'finish',
    mustNot: 'Nie szukaj kolejnego problemu.',
  },
  {
    id: 'correction_of_same_process_scope',
    turns: [
      { speaker: 'mirai', text: 'Czy dobrze rozumiem, że trudność jest przy liczeniu ceny materiału?' },
      { speaker: 'participant', text: 'Nie, chodzi o cały proces rozpisywania elementów, od pomiaru do wyceny.' },
    ],
    expectedMove: 'accept_correction',
    mustNot: 'Nie otwieraj innego problemu ani nie ignoruj korekty zakresu.',
  },
  {
    id: 'explicit_new_topic',
    turns: [
      { speaker: 'mirai', text: 'Dzięki, rozumiem już proces rozpisywania elementów.' },
      { speaker: 'participant', text: 'Chciałbym teraz porozmawiać o montażu u klienta.' },
    ],
    expectedMove: 'switch_on_request',
    mustNot: 'Nie utrzymuj starego fokusu wbrew wyraźnej prośbie rozmówcy.',
  },
  {
    id: 'role_without_selected_process',
    turns: [
      { speaker: 'participant', text: 'Prowadzę mały zakład stolarski.' },
    ],
    expectedMove: 'establish_focus',
    mustNot: 'Nie zakładaj, że chodzi o rozkrój płyt lub wycenę.',
  },
];
