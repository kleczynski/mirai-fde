import type { SupabaseClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DiscoverySchema, SessionSchema, type Finding } from '../src/domain/contract.js';
import { HttpError } from './agent.js';

const list = (items: Finding[]) => items.length ? items.map(f => `- ${f.text}`).join('\n') : '(brak — pomiń tę sekcję w prompcie albo zapytaj operatora, czy to na pewno wystarczy)';

/**
 * `automationOpportunities` jest puste w większości rozmów z założenia —
 * agent discovery ma prowadzić odkrywanie, nie wymyślać gotowe rozwiązanie
 * (patrz AGENTS.md §2/§9). Pusta lista tu to norma, nie sygnał "za mało
 * danych, może przerwij" — dlatego NIE używa generycznego fallbacku `list()`
 * powyżej, który dla tej jednej sekcji zachęcałby agenta budującego demo do
 * pominięcia zadania albo pytania operatora zamiast samodzielnego wyboru
 * okazji na podstawie painPoints/workflows (patrz punkt 1 w sekcji "Zadanie"
 * szablonu i sekcja o pustej automatyzacji w
 * docs/skills/mirai-demo-builder/SKILL.md).
 */
const automationOpportunitiesList = (items: Finding[]) => items.length
  ? items.map(f => `- ${f.text}`).join('\n')
  : '(puste — to normalne, agent discovery nie musi znaleźć gotowej okazji podczas samej rozmowy. NIE traktuj tego jako sygnału, że nie ma czego budować — wybierz i uzasadnij najwęższą okazję sam na podstawie pain pointów i workflow wyżej, patrz punkt 1 w sekcji "Zadanie" niżej.)';

const slugify = (label: string) => label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'demo';

/**
 * Shared by the operator's CLI tool (scripts/generate-demo-prompt.ts) and the
 * admin panel's "Wygeneruj prompt demo" action (server/admin.ts). Both run
 * with the service-role key on the operator's own machine/deployment — there
 * is no separate trust boundary between them, so they share one
 * implementation rather than risking the two drifting apart.
 *
 * Deliberately does NOT require session.status === 'completed'. The original
 * CLI-only version did, but that made the admin panel unable to ever offer
 * this without either (a) an admin-side "mark completed" button — which
 * would undermine the one deliberate product boundary that only the
 * participant can confirm every finding (see AGENTS.md §1/§9) — or (b) the
 * operator being stuck running a terminal script instead of using the panel
 * they already look at. Instead this accepts any session with a computed
 * result (state.result set) regardless of confirmation, and the generated
 * prompt itself is explicit about whether that result was participant-
 * confirmed, so nothing pretends unconfirmed findings are approved facts.
 */
export async function buildDemoPrompt(service: SupabaseClient<any>, sessionId: string): Promise<{ demoId: string; filled: string; confirmed: boolean; reused: boolean }> {
  const { data, error } = await service.from('interview_sessions').select('state, status, session_summaries(confirmed_at)').eq('id', sessionId).maybeSingle();
  if (error) throw new HttpError(503, 'Nie udało się odczytać sesji.');
  if (!data) throw new HttpError(404, 'Nie znaleziono sesji.');
  const session = SessionSchema.parse(data.state);
  if (!session.completedAt) throw new HttpError(409, 'Rozmowa nie jest jeszcze zakończona.');
  if (!session.result) throw new HttpError(409, 'Brak wyniku ekstrakcji dla tej sesji — najpierw uruchom ekstrakcję.');
  const result = DiscoverySchema.parse(session.result);
  const summary = Array.isArray(data.session_summaries) ? data.session_summaries[0] : data.session_summaries;
  const confirmed = data.status === 'completed' || Boolean(summary && typeof summary === 'object' && (summary as { confirmed_at?: unknown }).confirmed_at);

  const { data: invitation } = await service.from('interview_invitations').select('label,industry').eq('claimed_session_id', sessionId).maybeSingle();
  const clientLabel = invitation?.label ?? 'Klient';
  const industry = invitation?.industry ?? null;
  const slug = slugify(clientLabel);

  const { data: existing, error: existingError } = await service.from('hosted_demos').select('id').eq('session_id', sessionId).eq('status', 'building').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw new HttpError(503, 'Nie udało się sprawdzić istniejącego demo.');
  let demoId: string;
  let reused = false;
  if (existing) { demoId = existing.id as string; reused = true; }
  else {
    const { data: demo, error: demoError } = await service.from('hosted_demos').insert({ session_id: sessionId, client_label: clientLabel, industry, status: 'building' }).select('id').single();
    if (demoError || !demo) throw new HttpError(503, 'Nie udało się zarejestrować demo.');
    demoId = demo.id as string;
  }

  const templatePath = path.join(process.cwd(), 'docs/prompts/build-and-deploy-demo.md');
  const template = await readFile(templatePath, 'utf8');
  const confirmationNotice = confirmed
    ? ''
    : '\n> **UWAGA:** ten wynik nie został jeszcze potwierdzony przez uczestnika rozmowy (rozmowa jest zakończona, ale uczestnik nie przeszedł jeszcze ekranu potwierdzenia każdego wniosku). Traktuj poniższe dowody jako wiarygodną, ale niezatwierdzoną hipotezę robocze — jeśli budujesz demo na ich podstawie, jasno zaznacz w komunikacji z operatorem, że dane czekają na potwierdzenie.\n';

  const filled = template
    .replace(/\{\{CLIENT_LABEL\}\}/g, clientLabel)
    .replace(/\{\{CLIENT_SLUG\}\}/g, slug)
    .replace(/\{\{INDUSTRY\}\}/g, industry ?? 'nieznana branża')
    .replace(/\{\{DEMO_ID\}\}/g, demoId)
    .replace(/\{\{CONFIRMATION_NOTICE\}\}/g, confirmationNotice)
    .replace(/\{\{PARTICIPANT_CONTEXT\}\}/g, list(result.participantContext))
    .replace(/\{\{WORKFLOWS\}\}/g, list(result.workflows))
    .replace(/\{\{PAIN_POINTS\}\}/g, list(result.painPoints))
    .replace(/\{\{TOOLS\}\}/g, list(result.tools))
    .replace(/\{\{CONSTRAINTS\}\}/g, list(result.constraints))
    .replace(/\{\{AUTOMATION_OPPORTUNITIES\}\}/g, automationOpportunitiesList(result.automationOpportunities))
    .replace(/\{\{RECOMMENDED_NEXT_STEP\}\}/g, result.recommendedNextStep.text || '(brak)');

  return { demoId, filled, confirmed, reused };
}
