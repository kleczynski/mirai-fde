-- Versioned, append-only monitoring for retained discovery sessions.
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  kind text not null check (kind in ('voice', 'extraction', 'evaluation')),
  version integer not null check (version > 0),
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  input_turn_ids uuid[] not null default '{}',
  configuration jsonb not null,
  telemetry jsonb,
  output jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status in ('queued', 'running') and completed_at is null) or status in ('completed', 'failed'))
);
create unique index agent_runs_session_kind_version on public.agent_runs(session_id, kind, version);
create index agent_runs_session_created on public.agent_runs(session_id, created_at desc);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  version integer not null check (version > 0),
  evaluator_version text not null,
  input_turn_ids uuid[] not null,
  status text not null check (status in ('completed', 'failed')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(session_id, version)
);
create index evaluations_session_created on public.evaluations(session_id, created_at desc);

create table public.operator_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  turn_id uuid,
  label text not null check (label in ('repeated_question', 'missed_fact', 'good_follow_up', 'voice_problem', 'note')),
  note text check (note is null or length(note) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index operator_notes_session_created on public.operator_notes(session_id, created_at desc);

alter table public.agent_runs enable row level security;
alter table public.evaluations enable row level security;
alter table public.operator_notes enable row level security;
revoke all on public.agent_runs, public.evaluations, public.operator_notes from public, anon, authenticated;

create function public.record_voice_monitoring_run(
  p_session_id uuid,
  p_configuration jsonb,
  p_telemetry jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare next_version integer; run_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.interview_sessions where id = p_session_id and owner_id = auth.uid() and expires_at > now()) then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  select coalesce(max(version), 0) + 1 into next_version from public.agent_runs where session_id = p_session_id and kind = 'voice';
  insert into public.agent_runs(session_id, kind, version, status, input_turn_ids, configuration, telemetry)
  values (p_session_id, 'voice', next_version, 'running', '{}', p_configuration, p_telemetry)
  returning id into run_id;
  return run_id;
end $$;

create function public.record_voice_monitoring_event(
  p_session_id uuid,
  p_run_id uuid,
  p_event text,
  p_provider_conversation_id text default null,
  p_first_response_latency_ms integer default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.interview_sessions where id = p_session_id and owner_id = auth.uid() and expires_at > now()) then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  update public.agent_runs
  set telemetry = jsonb_strip_nulls(coalesce(telemetry, '{}'::jsonb) || jsonb_build_object(
        'conversationId', coalesce(p_provider_conversation_id, telemetry->>'conversationId'),
        'providerConversationId', coalesce(p_provider_conversation_id, telemetry->>'providerConversationId'),
        'interruptionCount', coalesce((telemetry->>'interruptionCount')::integer, 0) + case when p_event = 'interruption' then 1 else 0 end,
        'reconnectCount', coalesce((telemetry->>'reconnectCount')::integer, 0) + case when p_event = 'reconnect' then 1 else 0 end,
        'firstResponseLatencyMs', coalesce(p_first_response_latency_ms, (telemetry->>'firstResponseLatencyMs')::integer),
        'source', 'browser'
      )),
      status = case when p_event = 'ended' then 'completed' else status end,
      completed_at = case when p_event = 'ended' then now() else completed_at end
  where id = p_run_id and session_id = p_session_id and kind = 'voice';
  if not found then raise exception 'Run not found' using errcode = 'P0002'; end if;
end $$;

create function public.record_extraction_monitoring_run(
  p_session_id uuid,
  p_configuration jsonb,
  p_input_turn_ids uuid[],
  p_output jsonb,
  p_error_code text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare next_version integer; run_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.interview_sessions where id = p_session_id and owner_id = auth.uid() and expires_at > now()) then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  select coalesce(max(version), 0) + 1 into next_version from public.agent_runs where session_id = p_session_id and kind = 'extraction';
  insert into public.agent_runs(session_id, kind, version, status, input_turn_ids, configuration, output, error_code, completed_at)
  values (p_session_id, 'extraction', next_version, case when p_error_code is null then 'completed' else 'failed' end, p_input_turn_ids, p_configuration, p_output, p_error_code, now())
  returning id into run_id;
  return run_id;
end $$;

revoke all on function public.record_voice_monitoring_run(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.record_voice_monitoring_event(uuid, uuid, text, text, integer) from public, anon;
revoke all on function public.record_extraction_monitoring_run(uuid, jsonb, uuid[], jsonb, text) from public, anon;
grant execute on function public.record_voice_monitoring_run(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.record_voice_monitoring_event(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.record_extraction_monitoring_run(uuid, jsonb, uuid[], jsonb, text) to authenticated;
