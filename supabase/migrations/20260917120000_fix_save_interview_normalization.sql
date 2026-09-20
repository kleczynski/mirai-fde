-- Hosted PostgreSQL treats `array array[...]` as a nested array here. Replace
-- the function without changing its access, transaction, or validation rules.
create or replace function public.save_interview(p_session jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); sid uuid := (p_session->>'id')::uuid; existing public.interview_sessions%rowtype;
  turn jsonb; finding jsonb; result jsonb := p_session->'result'; original jsonb := p_session->'modelResult';
  n integer := 0; incoming_revision integer := (p_session->>'revision')::integer; ev jsonb; ref text; merged jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if sid is null or incoming_revision is null or incoming_revision < 1 or p_session->>'status' not in ('active','paused','review','completed') then raise exception 'Invalid session'; end if;
  if jsonb_typeof(p_session->'turns') <> 'array' or jsonb_array_length(p_session->'turns') > 300 then raise exception 'Invalid turns'; end if;
  if not (p_session->'consent' @> '{"version":"discovery-consent.v1","aiDisclosure":true,"transcriptStorage":true,"analysis":true,"audioStorage":false,"retentionDays":30}'::jsonb) then raise exception 'Consent required'; end if;
  if (p_session->>'expiresAt')::timestamptz <= now() then raise exception 'Session expired'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sid::text,0));
  select * into existing from public.interview_sessions where id=sid for update;
  if found then
    if existing.owner_id <> uid then raise exception 'Access denied' using errcode='42501'; end if;
    if existing.expires_at <= now() then raise exception 'Session expired'; end if;
    if existing.revision = incoming_revision and existing.state = p_session then return; end if;
    if existing.revision >= incoming_revision then raise exception 'Stale revision'; end if;
    if existing.started_at <> (p_session->>'startedAt')::timestamptz or existing.expires_at <> (p_session->>'expiresAt')::timestamptz or existing.consent <> p_session->'consent' then raise exception 'Immutable session metadata'; end if;
    if jsonb_array_length(p_session->'turns') < jsonb_array_length(existing.state->'turns') then raise exception 'Transcript is append-only'; end if;
    for turn in select value from jsonb_array_elements(existing.state->'turns') loop if (p_session->'turns'->n) <> turn then raise exception 'Transcript is append-only'; end if; n := n+1; end loop;
    if existing.state->'modelResult' <> 'null'::jsonb and existing.state->'modelResult' <> original then raise exception 'Original extraction is immutable'; end if;
  end if;
  if result is not null and result <> 'null'::jsonb then
    if result->>'schemaVersion' <> 'mirai.discovery.v1' or result->>'sessionId' <> sid::text or result->'transcript' <> p_session->'turns' or result->'consent' <> p_session->'consent' then raise exception 'Invalid export metadata'; end if;
    if original is null or original = 'null'::jsonb then raise exception 'Original extraction required'; end if;
    for ev in select value from jsonb_array_elements(result->'evidence') loop if not exists (select 1 from jsonb_array_elements(p_session->'turns') seg where seg->>'id'=ev->>'segmentId' and seg->>'speaker'='participant' and length(ev->>'quote')>0 and position(ev->>'quote' in seg->>'text')>0) then raise exception 'Invalid evidence'; end if; end loop;
    merged := coalesce(result->'participantContext','[]') || coalesce(result->'painPoints','[]') || coalesce(result->'workflows','[]') || coalesce(result->'tools','[]') || coalesce(result->'constraints','[]') || coalesce(result->'automationOpportunities','[]') || jsonb_build_array(result->'recommendedNextStep');
    for finding in select value from jsonb_array_elements(merged) loop
      if length(finding->>'text') < 1 then raise exception 'Empty finding'; end if;
      if finding ? 'confidence' and ((finding->>'confidence')::numeric not between 0 and 1 or jsonb_array_length(finding->'evidenceIds')<1) then raise exception 'Invalid confidence or evidence'; end if;
      for ref in select jsonb_array_elements_text(finding->'evidenceIds') loop if not exists(select 1 from jsonb_array_elements(result->'evidence') e where e->>'id'=ref) then raise exception 'Unknown evidence reference'; end if; end loop;
      if p_session->>'status'='completed' and (finding->'review'->>'status' not in ('confirmed','corrected') or finding->'review'->>'reviewedAt' is null) then raise exception 'Confirmation required'; end if;
    end loop;
  elsif p_session->>'status' = 'completed' then raise exception 'Result required'; end if;
  insert into public.interview_sessions(id,owner_id,status,scenario_version,prompt_version,consent,started_at,completed_at,expires_at,state,revision)
    values(sid,uid,p_session->>'status','discovery-interview.v1','discovery-agent.v1',p_session->'consent',(p_session->>'startedAt')::timestamptz,(p_session->>'completedAt')::timestamptz,(p_session->>'expiresAt')::timestamptz,p_session,incoming_revision)
    on conflict(id) do update set status=excluded.status,completed_at=excluded.completed_at,state=excluded.state,revision=excluded.revision;
  n := 0;
  for turn in select value from jsonb_array_elements(p_session->'turns') loop
    insert into public.conversation_turns(id,session_id,sequence,speaker,raw_response) values((turn->>'id')::uuid,sid,n,turn->>'speaker',turn) on conflict(session_id,id) do nothing;
    insert into public.transcript_segments(id,session_id,turn_id,text,speaker,captured_at) values((turn->>'id')::uuid,sid,(turn->>'id')::uuid,turn->>'text',turn->>'speaker',(turn->>'timestamp')::timestamptz) on conflict(session_id,id) do nothing; n := n+1;
  end loop;
  if result is not null and result <> 'null'::jsonb then
    delete from public.extracted_insights where session_id=sid; delete from public.pain_points where session_id=sid; delete from public.workflows where session_id=sid; delete from public.automation_opportunities where session_id=sid;
    for finding in select value from jsonb_array_elements((result->'participantContext') || (result->'tools') || (result->'constraints')) loop insert into public.extracted_insights values((finding->>'id')::uuid,sid,finding); end loop;
    for finding in select value from jsonb_array_elements(result->'painPoints') loop insert into public.pain_points values((finding->>'id')::uuid,sid,finding); end loop;
    for finding in select value from jsonb_array_elements(result->'workflows') loop insert into public.workflows values((finding->>'id')::uuid,sid,finding); end loop;
    for finding in select value from jsonb_array_elements(result->'automationOpportunities') loop insert into public.automation_opportunities values((finding->>'id')::uuid,sid,finding); end loop;
    insert into public.session_summaries(session_id,schema_version,payload,model_payload,confirmed_at) values(sid,'mirai.discovery.v1',result,original,case when p_session->>'status'='completed' then now() else null end) on conflict(session_id) do update set payload=excluded.payload,confirmed_at=excluded.confirmed_at;
  end if;
end $$;
revoke all on function public.save_interview(jsonb) from public,anon;
grant execute on function public.save_interview(jsonb) to authenticated;
