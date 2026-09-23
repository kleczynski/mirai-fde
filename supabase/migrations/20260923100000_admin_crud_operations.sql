-- Allows administrative deletion of invitations, confirmation of interview sessions,
-- and status updates. Extends admin_session_actions audit trail.

alter table public.admin_session_actions alter column target_session_id drop not null;
alter table public.admin_session_actions add column if not exists target_invitation_id uuid;

alter table public.admin_session_actions drop constraint if exists admin_session_actions_action_check;
alter table public.admin_session_actions add constraint admin_session_actions_action_check
  check (action in ('session.deleted', 'session.extraction_completed', 'session.confirmed', 'session.status_changed', 'invitation.deleted'));

grant delete on public.interview_invitations to service_role;

drop function if exists public.admin_delete_interview_invitation(uuid, uuid);
create function public.admin_delete_interview_invitation(p_actor_id uuid, p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed_session uuid;
begin
  select claimed_session_id into v_claimed_session from public.interview_invitations where id = p_invitation_id;
  if not found then
    return false;
  end if;

  insert into public.admin_session_actions(actor_id, action, target_session_id, target_invitation_id)
  values (p_actor_id, 'invitation.deleted', v_claimed_session, p_invitation_id);

  delete from public.interview_invitations where id = p_invitation_id;
  return true;
end;
$$;

revoke all on function public.admin_delete_interview_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_interview_invitation(uuid, uuid) to service_role;

drop function if exists public.admin_confirm_interview_session(uuid, uuid, jsonb);
create function public.admin_confirm_interview_session(
  p_actor_id uuid, p_session_id uuid, p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.interview_sessions%rowtype;
  finding jsonb; ev jsonb; ref text; merged jsonb;
begin
  select * into existing from public.interview_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;
  if existing.state->>'completedAt' is null then raise exception 'Interview not completed'; end if;

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
    if finding->'review'->>'status' not in ('confirmed', 'corrected') or finding->'review'->>'reviewedAt' is null then
      raise exception 'Confirmation required';
    end if;
  end loop;

  update public.interview_sessions
    set status = 'completed',
        state = existing.state || jsonb_build_object('status', 'completed', 'result', p_result, 'revision', existing.revision + 1),
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
    values (p_session_id, 'mirai.discovery.v1', p_result, coalesce(existing.state->'modelResult', p_result), now())
    on conflict (session_id) do update set payload = excluded.payload, confirmed_at = excluded.confirmed_at;

  insert into public.admin_session_actions(actor_id, action, target_session_id)
  values (p_actor_id, 'session.confirmed', p_session_id);
end;
$$;

revoke all on function public.admin_confirm_interview_session(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_confirm_interview_session(uuid, uuid, jsonb) to service_role;

drop function if exists public.admin_update_session_status(uuid, uuid, text);
create function public.admin_update_session_status(
  p_actor_id uuid, p_session_id uuid, p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.interview_sessions%rowtype;
begin
  if p_status not in ('active', 'paused', 'review') then
    raise exception 'Invalid status transition: use admin_confirm_interview_session for completed';
  end if;

  select * into existing from public.interview_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found' using errcode = 'P0002'; end if;

  update public.interview_sessions
    set status = p_status,
        state = existing.state || jsonb_build_object('status', p_status, 'revision', existing.revision + 1),
        revision = existing.revision + 1
    where id = p_session_id;

  if p_status = 'review' then
    update public.session_summaries set confirmed_at = null where session_id = p_session_id;
  end if;

  insert into public.admin_session_actions(actor_id, action, target_session_id)
  values (p_actor_id, 'session.status_changed', p_session_id);
end;
$$;

revoke all on function public.admin_update_session_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_update_session_status(uuid, uuid, text) to service_role;
