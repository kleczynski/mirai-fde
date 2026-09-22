// Wypełnia docs/prompts/build-and-deploy-demo.md danymi z jednej, zakończonej
// rozmowy discovery, rejestruje demo w hosted_demos (widoczne od razu w panelu
// admina, sekcja "Demo dla klientów") i wypisuje gotowy prompt do wklejenia w
// agenta budującego (Astra/Codex).
//
// Ten sam wynik można też pobrać z panelu admina, przycisk "Wygeneruj prompt
// demo" — obie ścieżki wołają tę samą logikę (server/demo-prompt.ts), więc
// nie ma ryzyka, że rozjadą się z czasem.
//
// Użycie:
//   npx tsx scripts/generate-demo-prompt.ts --session <uuid>
//
// Wymaga SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY (z .env.local albo .env) —
// tych samych co reszta serwerowego kodu. Nie wystawia niczego przez HTTP,
// łączy się bezpośrednio z Supabase tym samym service role key co panel
// admina, bo to skrypt uruchamiany ręcznie przez operatora na jego maszynie.
//
// Rozmowa musi być zakończona (completedAt ustawiony) i mieć wynik
// ekstrakcji — NIE musi być jeszcze potwierdzona przez uczestnika
// (status='completed'). Jeśli nie jest, wygenerowany prompt zawiera jawne
// ostrzeżenie o tym, że dane są niezatwierdzone.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { buildDemoPrompt } from '../server/demo-prompt.js';

config({ path: '.env.local', override: false, quiet: true });
config({ path: '.env', override: false, quiet: true });

const sessionId = process.argv.includes('--session') ? process.argv[process.argv.indexOf('--session') + 1] : null;
if (!sessionId) throw new Error('Użycie: npx tsx scripts/generate-demo-prompt.ts --session <uuid>');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w .env.local.');

async function main() {
  const service = createClient<any>(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { demoId, filled, confirmed, reused } = await buildDemoPrompt(service, sessionId!);

  const outDir = path.join(process.cwd(), '.local/demo-prompts');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${sessionId!.slice(0, 8)}.md`);
  await writeFile(outPath, filled, 'utf8');

  console.log(filled);
  console.error(`\n---\nZapisano też do: ${outPath}`);
  console.error(`${reused ? 'Zaktualizowano' : 'Zarejestrowano'} w hosted_demos jako ${demoId} (status: building) — widoczne od razu w panelu admina, sekcja "Demo dla klientów".`);
  if (!confirmed) console.error('UWAGA: uczestnik jeszcze nie potwierdził tego wyniku (status sesji to nie "completed"). Prompt zawiera stosowne ostrzeżenie.');
  console.error('Po wdrożeniu przez agenta wklej adres demo i repo w panelu i zmień status na "live".');
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
