-- admin_apply_extraction refused to touch a session that already had a
-- result, even an unconfirmed one. In practice a weak, deterministic
-- evidence-rules draft can already exist (the participant's own finish()
-- computes it as a same-turn fallback before optionally trying the model —
-- see src/lib/useInterview.ts) while nothing about it was ever confirmed by
-- the participant (session_summaries.confirmed_at stays null until
-- save_interview sees status='completed'). An admin should be able to
-- replace that kind of throwaway draft with a real model extraction without
-- reaching for a second, near-identical function. Confirmed results remain
-- untouchable — this only adds an explicit opt-in bypass gated on
-- session_summaries.confirmed_at being null, not merely on status.
-- CREATE OR REPLACE only overwrites a function with the identical parameter
-- *type* list; adding a trailing parameter creates a second, overloaded
-- function instead of replacing the original. Drop the 3-arg version first
-- so exactly one admin_apply_extraction remains.
drop function if exists public.admin_apply_extraction(uuid, uuid, jsonb);

create function public.admin_apply_extraction(
  p_actor_id uuid, p_session_id uuid, p_result jsonb, p_allow_replace boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.interview_sessions%rowtype;
  already_confirmed timestamptz;
  finding jsonb; ev jsonb; ref text; merged jsonb; turn_ids uuid[]; next_version integer;
begin
  select * into existing from public.interview_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if existing.state->>'completedAt' is null then raise exception 'Interview not completed'; end if;
  if existing.state->'result' is not null and existing.state->'result' <> 'null'::jsonb then
    if not p_allow_replace then raise exception 'Result already exists'; end if;
    select confirmed_at into already_confirmed from public.session_summaries where session_id = p_session_id;
    if already_confirmed is not null then raise exception 'Result already confirmed by participant'; end if;
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

revoke all on function public.admin_apply_extraction(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_apply_extraction(uuid, uuid, jsonb, boolean) to service_role;
