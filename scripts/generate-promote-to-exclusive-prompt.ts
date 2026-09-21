// Wypełnia docs/prompts/promote-demo-to-exclusive.md danymi konkretnego demo
// i wypisuje gotowy prompt do wklejenia w agenta budującego. Użyj, gdy
// klient potwierdzi, że chce mieć demo na stałe.
//
// Użycie:
//   npx tsx scripts/generate-promote-to-exclusive-prompt.ts --demo <hosted_demos.id>
//
// Wymaga SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY (z .env.local albo .env).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local', override: false, quiet: true });
config({ path: '.env', override: false, quiet: true });

const demoId = process.argv.includes('--demo') ? process.argv[process.argv.indexOf('--demo') + 1] : null;
if (!demoId) throw new Error('Użycie: npx tsx scripts/generate-promote-to-exclusive-prompt.ts --demo <hosted_demos.id>');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w .env.local.');

async function main() {
  const service = createClient(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: demo, error } = await service
    .from('hosted_demos')
    .select('id, client_label, demo_url, repo_url')
    .eq('id', demoId)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  if (!demo) throw new Error(`Nie znaleziono demo ${demoId}.`);
  if (!demo.demo_url || !demo.repo_url) throw new Error(`Demo ${demoId} nie ma jeszcze ustawionego adresu demo/repo — uzupełnij je w panelu admina po wdrożeniu, zanim wygenerujesz ten prompt.`);

  const slug = demo.client_label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'demo';

  const templatePath = path.join(process.cwd(), 'docs/prompts/promote-demo-to-exclusive.md');
  const template = await readFile(templatePath, 'utf8');

  const filled = template
    .replace(/\{\{CLIENT_LABEL\}\}/g, demo.client_label)
    .replace(/\{\{DEMO_URL\}\}/g, demo.demo_url)
    .replace(/\{\{REPO_URL\}\}/g, demo.repo_url)
    .replace(/\{\{DEMO_ID\}\}/g, demo.id);

  const outDir = path.join(process.cwd(), '.local/demo-prompts');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `promote-${slug}-${demoId!.slice(0, 8)}-${Date.now()}.md`);
  await writeFile(outPath, filled, 'utf8');

  console.log(filled);
  console.error(`\n---\nZapisano też do: ${outPath}`);
  console.error('Po przekazaniu sekretu klientowi zmień status demo w panelu admina na "approved_exclusive".');
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
