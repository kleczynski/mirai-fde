// Wypełnia docs/prompts/build-and-deploy-demo.md danymi z jednej, zakończonej
// rozmowy discovery i wypisuje gotowy prompt do wklejenia w Codex.
//
// Użycie:
//   npx tsx scripts/generate-demo-prompt.ts --session <uuid>
//
// Wymaga SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY (z .env.local albo .env) —
// tych samych co reszta serwerowego kodu. Nie wystawia niczego przez HTTP,
// łączy się bezpośrednio z Supabase tym samym service role key co panel
// admina, bo to skrypt uruchamiany ręcznie przez operatora na jego maszynie.

import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { DiscoverySchema, type Finding } from '../src/domain/contract.js';

config({ path: '.env.local', override: false, quiet: true });
config({ path: '.env', override: false, quiet: true });

const sessionId = process.argv.includes('--session') ? process.argv[process.argv.indexOf('--session') + 1] : null;
if (!sessionId) throw new Error('Użycie: npx tsx scripts/generate-demo-prompt.ts --session <uuid>');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w .env.local.');

const list = (items: Finding[]) => items.length ? items.map(f => `- ${f.text}`).join('\n') : '(brak — pomiń tę sekcję w prompcie albo zapytaj operatora, czy to na pewno wystarczy)';

async function main() {
  const service = createClient(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await service
    .from('interview_sessions')
    .select('state, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(`Supabase: ${error.message}`);
  if (!data) throw new Error(`Nie znaleziono sesji ${sessionId}.`);
  if (data.status !== 'completed') throw new Error(`Sesja ${sessionId} ma status "${data.status}", nie "completed" — dokończ rozmowę przed generowaniem promptu.`);

  const { data: invitation } = await service
    .from('interview_invitations')
    .select('label, industry')
    .eq('claimed_session_id', sessionId)
    .maybeSingle();

  const state = data.state as { result: unknown };
  const result = DiscoverySchema.parse(state.result);

  const clientLabel = invitation?.label ?? 'Klient';
  const industry = invitation?.industry ?? 'nieznana branża';
  const slug = clientLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'demo';

  const templatePath = path.join(process.cwd(), 'docs/prompts/build-and-deploy-demo.md');
  const template = await readFile(templatePath, 'utf8');

  const filled = template
    .replace(/\{\{CLIENT_LABEL\}\}/g, clientLabel)
    .replace(/\{\{CLIENT_SLUG\}\}/g, slug)
    .replace(/\{\{INDUSTRY\}\}/g, industry)
    .replace(/\{\{PARTICIPANT_CONTEXT\}\}/g, list(result.participantContext))
    .replace(/\{\{WORKFLOWS\}\}/g, list(result.workflows))
    .replace(/\{\{PAIN_POINTS\}\}/g, list(result.painPoints))
    .replace(/\{\{TOOLS\}\}/g, list(result.tools))
    .replace(/\{\{CONSTRAINTS\}\}/g, list(result.constraints))
    .replace(/\{\{AUTOMATION_OPPORTUNITIES\}\}/g, list(result.automationOpportunities))
    .replace(/\{\{RECOMMENDED_NEXT_STEP\}\}/g, result.recommendedNextStep.text || '(brak)');

  const outDir = path.join(process.cwd(), '.local/demo-prompts');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slug}-${sessionId!.slice(0, 8)}.md`);
  await writeFile(outPath, filled, 'utf8');

  const registryPath = path.join(process.cwd(), 'docs/scope/demos.md');
  const today = new Date().toISOString().slice(0, 10);
  const row = `| ${today} | ${sessionId} | ${clientLabel} | ${industry} | (uzupełnij po wdrożeniu) | testing | |\n`;
  await appendFile(registryPath, row, 'utf8');

  console.log(filled);
  console.error(`\n---\nZapisano też do: ${outPath}`);
  console.error(`Dopisano wiersz do ${registryPath} — uzupełnij kolumnę Demo URL ręcznie po wdrożeniu.`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
