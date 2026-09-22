-- Recovery path for interview sessions stuck in status='review' with a
-- completedAt but no result/modelResult: the participant's finish() does two
-- separate writes (checkpoint, then extraction result). If the browser
-- closes/crashes between them — /api/extract exceeding its 65s client
-- timeout, extraction not configured (no OPENAI_API_KEY) and something still
-- interrupts the second update() — the session is left with a real,
-- completed transcript but no extraction, and nothing before this migration
-- could recover it. This never changes `status`; only the participant can
-- move a session to 'completed', by confirming every finding through the
-- existing save_interview path.

-- Allow the new audit action alongside the existing 'session.deleted'. The
-- default name for an unnamed column-level check constraint is
-- `<table>_<column>_check`; this is verified against a real Postgres engine
-- in tests/admin-extraction-recovery.test.ts.
alter table public.admin_session_actions drop constraint admin_session_actions_action_check;
alter table public.admin_session_actions add constraint admin_session_actions_action_check
  check (action in ('session.deleted', 'session.extraction_completed'));

-- The validation block below intentionally duplicates the result-validation
-- rules from save_interview (supabase/migrations/20260917120000_...sql)
-- rather than extracting a shared helper. save_interview is the single most
-- heavily tested and load-bearing write path in this schema (every live
-- participant conversation goes through it) and any refactor that changes
-- its control flow — even to call out to a shared function — risks subtly
-- changing one of its exception messages or evaluation order, which several
-- tests assert on verbatim. This admin-only recovery path is new and much
-- smaller in scope, so the safer trade-off is to mirror the rules exactly
-- here, with this comment as the tripwire: if the evidence/finding
-- validation in save_interview ever changes, update this function to match.
create function public.admin_apply_extraction(p_actor_id uuid, p_session_id uuid, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.interview_sessions%rowtype;
  finding jsonb; ev jsonb; ref text; merged jsonb; turn_ids uuid[]; next_version integer;
begin
  select * into existing from public.interview_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if existing.state->>'completedAt' is null then raise exception 'Interview not completed'; end if;
  if existing.state->'result' is not null and existing.state->'result' <> 'null'::jsonb then
    raise exception 'Result already exists';
  end if;

  -- Same shape and rules as save_interview's result-validation block.
  if p_result->>'schemaVersion' <> 'mirai.discovery.v1'
    or p_result->>'sessionId' <> p_session_id::text
    or p_result->'transcript' <> existing.state->'turns'
    or p_result->'consent' <> existing.state->'consent'
  then raise exception 'Invalid export metadata'; end if;

  for ev in select value from jsonb_array_elements(p_result->'evidence') loop
    if not exists (
      select 1 from jsonb_array_elements(existing.state->'turns') seg
      where seg->>'id' = ev->>'segmentId' and seg->>'speaker' = 'participant'
        and length(ev->>'quote') > 0 and position(ev->>'quote' in seg->>'text') > 0
    ) then raise exception 'Invalid evidence'; end if;
  end loop;

  merged := coalesce(p_result->'participantContext','[]') || coalesce(p_result->'painPoints','[]')
    || coalesce(p_result->'workflows','[]') || coalesce(p_result->'tools','[]')
    || coalesce(p_result->'constraints','[]') || coalesce(p_result->'automationOpportunities','[]')
    || jsonb_build_array(p_result->'recommendedNextStep');
  for finding in select value from jsonb_array_elements(merged) loop
    if length(finding->>'text') < 1 then raise exception 'Empty finding'; end if;
    if finding ? 'confidence' and ((finding->>'confidence')::numeric not between 0 and 1 or jsonb_array_length(finding->'evidenceIds') < 1) then
      raise exception 'Invalid confidence or evidence';
    end if;
    for ref in select jsonb_array_elements_text(finding->'evidenceIds') loop
      if not exists (select 1 from jsonb_array_elements(p_result->'evidence') e where e->>'id' = ref) then
        raise exception 'Unknown evidence reference';
      end if;
    end loop;
  end loop;

  select array_agg((value->>'id')::uuid) into turn_ids from jsonb_array_elements(existing.state->'turns');

  -- Status is deliberately left untouched: only the participant's
  -- save_interview can move a session to 'completed', and only after every
  -- finding is confirmed/corrected. This just gives the participant/admin
  -- something real to review instead of a permanently empty result.
  update public.interview_sessions
    set state = existing.state || jsonb_build_object('result', p_result, 'modelResult', p_result, 'revision', existing.revision + 1),
        revision = existing.revision + 1
    where id = p_session_id;

  delete from public.extracted_insights where session_id = p_session_id;
  delete from public.pain_points where session_id = p_session_id;
  delete from public.workflows where session_id = p_session_id;
  delete from public.automation_opportunities where session_id = p_session_id;
  for finding in select value from jsonb_array_elements((p_result->'participantContext') || (p_result->'tools') || (p_result->'constraints')) loop
    insert into public.extracted_insights values ((finding->>'id')::uuid, p_session_id, finding);
  end loop;
  for finding in select value from jsonb_array_elements(p_result->'painPoints') loop
    insert into public.pain_points values ((finding->>'id')::uuid, p_session_id, finding);
  end loop;
  for finding in select value from jsonb_array_elements(p_result->'workflows') loop
    insert into public.workflows values ((finding->>'id')::uuid, p_session_id, finding);
  end loop;
  for finding in select value from jsonb_array_elements(p_result->'automationOpportunities') loop
    insert into public.automation_opportunities values ((finding->>'id')::uuid, p_session_id, finding);
  end loop;
  insert into public.session_summaries(session_id, schema_version, payload, model_payload, confirmed_at)
    values (p_session_id, 'mirai.discovery.v1', p_result, p_result, null)
    on conflict (session_id) do update set payload = excluded.payload, model_payload = excluded.model_payload, confirmed_at = excluded.confirmed_at;

  select coalesce(max(version), 0) + 1 into next_version from public.agent_runs where session_id = p_session_id and kind = 'extraction';
  insert into public.agent_runs(session_id, kind, version, status, input_turn_ids, configuration, output, completed_at)
  values (
    p_session_id, 'extraction', next_version, 'completed', coalesce(turn_ids, '{}'),
    jsonb_build_object(
      'provider', case when p_result->'extraction'->>'method' = 'language-model' then 'openai' else 'rule-engine' end,
      'model', p_result->'extraction'->>'model',
      'promptVersion', 'discovery-agent.v1',
      'configurationStatus', 'known',
      'agentId', null,
      'observedAt', now()
    ),
    p_result,
    now()
  );

  insert into public.admin_session_actions(actor_id, action, target_session_id)
  values (p_actor_id, 'session.extraction_completed', p_session_id);
end
$$;

revoke all on function public.admin_apply_extraction(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_apply_extraction(uuid, uuid, jsonb) to service_role;
