-- Keep the previous RPC during the rolling frontend deployment. It is removed
-- by the follow-up migration after the new frontend is live.
create function public.claim_interview_invitation_v2(p_token text, p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  claimant uuid := auth.uid();
  invitation public.interview_invitations%rowtype;
  digest_hex text;
begin
  if claimant is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_session_id is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid invitation'; end if;
  digest_hex := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')), 'hex');
  select * into invitation from public.interview_invitations where token_hash = digest_hex for update;
  if not found then raise exception 'Invitation not found'; end if;
  if invitation.claimed_by is not null then
    if invitation.claimed_by = claimant then
      return pg_catalog.jsonb_build_object('sessionId', invitation.claimed_session_id, 'canCreate', invitation.session_started_at is null);
    end if;
    raise exception 'Invitation already used';
  end if;
  if invitation.expires_at <= now() then raise exception 'Invitation expired'; end if;
  if exists (select 1 from public.interview_sessions where id = p_session_id) then raise exception 'Session already exists'; end if;
  update public.interview_invitations
  set claimed_by = claimant, claimed_session_id = p_session_id, claimed_at = now()
  where id = invitation.id;
  return pg_catalog.jsonb_build_object('sessionId', p_session_id, 'canCreate', true);
end;
$$;
revoke all on function public.claim_interview_invitation_v2(text, uuid) from public, anon;
grant execute on function public.claim_interview_invitation_v2(text, uuid) to authenticated;
