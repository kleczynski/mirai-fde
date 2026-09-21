-- Zamknięcie pętli demo->feedback->wyłączność (patrz docs/prompts/close-the-loop-kickoff.md
-- i docs/scope/demos.md dla historii). Świadoma, wąska decyzja o dodaniu dwóch małych
-- tabel do produkcyjnej bazy Node 1 — w przeciwieństwie do incydentu Brief Studio, nie ma
-- tu żadnej autonomicznej rozbudowy: schemat jest z góry ograniczony do tego, co pokazuje
-- panel admina, a wszystkie zapisy idą przez service-role z serwerowych endpointów, nigdy
-- bezpośrednio z przeglądarki.

create table public.hosted_demos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.interview_sessions(id) on delete set null,
  client_label text not null check (char_length(client_label) between 1 and 120),
  industry text check (industry is null or char_length(industry) between 1 and 120),
  demo_url text,
  repo_url text,
  status text not null default 'building' check (status in ('building', 'live', 'client_reviewing', 'approved_exclusive', 'declined', 'paid')),
  access_token_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hosted_demos_session_id_idx on public.hosted_demos (session_id);
create index hosted_demos_status_idx on public.hosted_demos (status);

alter table public.hosted_demos enable row level security;
revoke all on public.hosted_demos from public, anon, authenticated;
-- Brak policy dla anon/authenticated: panel admina i generatory promptów czytają/piszą
-- wyłącznie przez klienta z SUPABASE_SERVICE_ROLE_KEY, który omija RLS.

create table public.demo_feedback (
  id uuid primary key default gen_random_uuid(),
  demo_id uuid not null references public.hosted_demos(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 4000),
  page text check (page is null or char_length(page) <= 300),
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
create index demo_feedback_demo_id_idx on public.demo_feedback (demo_id, handled);

alter table public.demo_feedback enable row level security;
revoke all on public.demo_feedback from public, anon, authenticated;
-- Zapis też wyłącznie przez service-role z api/demo-feedback.ts (publiczny endpoint
-- Vercel, nie bezpośredni zapis z przeglądarki demo do Supabase).

-- Rate limit dla publicznego /api/demo-feedback. Klucz to (demo_id, hash adresu IP),
-- nie auth.uid() jak w consume_interview_rate_limit — osoba testująca demo nie jest
-- zalogowana. Adres IP jest hashowany przed zapisem, surowy IP nigdy nie trafia do bazy.
create table public.demo_feedback_rate_limits (
  demo_id uuid not null,
  ip_hash text not null,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (demo_id, ip_hash, window_start)
);
alter table public.demo_feedback_rate_limits enable row level security;
revoke all on public.demo_feedback_rate_limits from public, anon, authenticated;

create function public.consume_demo_feedback_rate_limit(p_demo_id uuid, p_ip_hash text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz := date_trunc('minute', statement_timestamp());
  current_count integer;
begin
  if p_limit not between 1 and 20 then
    raise exception 'Invalid rate limit';
  end if;

  insert into public.demo_feedback_rate_limits(demo_id, ip_hash, window_start, request_count)
  values (p_demo_id, p_ip_hash, current_window, 1)
  on conflict (demo_id, ip_hash, window_start)
  do update set request_count = public.demo_feedback_rate_limits.request_count + 1
  returning request_count into current_count;

  return current_count <= p_limit;
end
$$;

revoke all on function public.consume_demo_feedback_rate_limit(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_demo_feedback_rate_limit(uuid, text, integer) to service_role;

select cron.schedule(
  'mirai-demo-feedback-rate-limit-retention',
  '29 * * * *',
  $$delete from public.demo_feedback_rate_limits where window_start < now() - interval '2 hours'$$
);
