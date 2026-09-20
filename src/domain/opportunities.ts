import { newReview, type DiscoveryResult, type Finding, type Turn } from './contract.js';
// Identify only explicit administrative friction. Manual craft is not a signal to automate it.
export function proposeOpportunities(answers: Turn[], painPoints: Finding[]): DiscoveryResult['automationOpportunities'] {
  if (!painPoints.length) return [];
  const candidates = [
    { matches: (s: string) => /szuk|gubi|przepis|kopiuj|pomyli/i.test(s) && /notatk|zdję|dokument|wymiar|informac|dan[ey]|kwot/i.test(s), text: 'Sprawdzić, czy zebranie powiązanych notatek, zdjęć lub informacji w jednym miejscu ułatwi tę czynność. Dalsza automatyzacja wymaga rozpoznania potrzeb.', validation: ['Ustalić, które informacje warto łączyć i jak są dziś zapisywane.', 'Sprawdzić prosty sposób na jednym rzeczywistym przypadku, bez zmieniania osądu eksperta.'] },
    { matches: (s: string) => /wizy|termin|spotka/i.test(s) && /zapomin|przypomin|przekład|nie przych|nie przyj/i.test(s), text: 'Sprawdzić, czy prostsze potwierdzanie terminów lub przypomnienia ograniczą wskazaną trudność.', validation: ['Sprawdzić, jak dziś uzgadniane są terminy i jakie zgody są potrzebne.', 'Pozostawić rozmówcy kontrolę nad kontaktami i zmianami terminów.'] },
    { matches: (s: string) => /towar|zapas|półk|dostaw/i.test(s) && /brak|zapomin|przeocz|ręczn/i.test(s), text: 'Sprawdzić, czy prosty zapis braków i przypomnienie o uzupełnieniu pomogą w codziennej pracy.', validation: ['Ustalić, kiedy wykrywany jest brak i kto podejmuje decyzję o zakupie.', 'Przetestować mały zakres bez automatycznego zamawiania towaru.'] },
    { matches: (s: string) => /raport/i.test(s) && /przepis|kopiuj|ręczn/i.test(s), text: 'Sprawdzić możliwość przygotowania szkicu zestawienia na podstawie wskazanych danych, z zatwierdzeniem przez człowieka.', validation: ['Zweryfikować dostępność i jakość konkretnych danych.', 'Ustalić, co zawsze wymaga sprawdzenia przez eksperta.'] },
  ];
  return candidates.flatMap(candidate => {
    const source = answers.find(t => candidate.matches(t.text));
    const linked = painPoints.filter(p => candidate.matches(p.text));
    if (!source || !linked.length) return [];
    return [{ id: crypto.randomUUID(), text: candidate.text, confidence: .5, evidenceIds: [...new Set([source.id,...linked.flatMap(p=>p.evidenceIds)])], review: newReview(), linkedPainPointIds: linked.map(p=>p.id), validationNeeded: candidate.validation, priority: 'explore' as const }];
  }).slice(0,2);
}
