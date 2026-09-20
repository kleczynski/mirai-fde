-- Global, atomic rate limiting shared by every Vercel function instance.
create table public.interview_api_rate_limits (
  owner_id uuid not null references auth.users(id) on delete cascade,
  route text not null check (route in ('voice', 'extract')),
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (owner_id, route, window_start)
);

alter table public.interview_api_rate_limits enable row level security;
revoke all on public.interview_api_rate_limits from public, anon, authenticated;

create function public.consume_interview_rate_limit(p_route text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_window timestamptz := date_trunc('minute', statement_timestamp());
  current_count integer;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_route not in ('voice', 'extract') or p_limit not between 1 and 20 then
    raise exception 'Invalid rate limit';
  end if;

  insert into public.interview_api_rate_limits(owner_id, route, window_start, request_count)
  values (uid, p_route, current_window, 1)
  on conflict (owner_id, route, window_start)
  do update set request_count = public.interview_api_rate_limits.request_count + 1
  returning request_count into current_count;

  return current_count <= p_limit;
end
$$;

revoke all on function public.consume_interview_rate_limit(text, integer) from public, anon;
grant execute on function public.consume_interview_rate_limit(text, integer) to authenticated;

select cron.schedule(
  'mirai-discovery-rate-limit-retention',
  '23 * * * *',
  $$delete from public.interview_api_rate_limits where window_start < now() - interval '2 hours'$$
);
