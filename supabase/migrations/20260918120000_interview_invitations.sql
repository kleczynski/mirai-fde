-- Administrator labels recipients; browser clients never read this table.
create table public.interview_invitations (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) between 1 and 120),
  industry text check (industry is null or length(trim(industry)) between 1 and 120),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  claimed_by uuid references auth.users(id),
  claimed_session_id uuid unique,
  claimed_at timestamptz,
  session_started_at timestamptz,
  check ((claimed_by is null and claimed_session_id is null and claimed_at is null)
    or (claimed_by is not null and claimed_session_id is not null and claimed_at is not null)),
  check (session_started_at is null or claimed_at is not null)
);
create index interview_invitations_created_at on public.interview_invitations(created_at desc, id desc);
create index interview_invitations_claimed_session on public.interview_invitations(claimed_session_id) where claimed_session_id is not null;
alter table public.interview_invitations enable row level security;
revoke all on public.interview_invitations from anon, authenticated;
grant select, insert, update on public.interview_invitations to service_role;

create function public.claim_interview_invitation(p_token_hash text, p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  claimant uuid := auth.uid();
  invitation public.interview_invitations%rowtype;
begin
  if claimant is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_session_id is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation'; end if;
  select * into invitation from public.interview_invitations where token_hash = p_token_hash for update;
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
revoke all on function public.claim_interview_invitation(text, uuid) from public, anon;
grant execute on function public.claim_interview_invitation(text, uuid) to authenticated;

-- save_interview is SECURITY DEFINER. This trigger still validates the owner of
-- every reserved session ID, including a direct RPC request from another user.
create function public.guard_invited_session_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare invited_owner uuid;
begin
  select claimed_by into invited_owner from public.interview_invitations
  where claimed_session_id = new.id;
  if found and invited_owner <> new.owner_id then
    raise exception 'Invited session owner mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_invited_session_owner before insert on public.interview_sessions
for each row execute function public.guard_invited_session_owner();
revoke all on function public.guard_invited_session_owner() from public, anon, authenticated;

create function public.mark_invited_session_started() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.interview_invitations set session_started_at = now()
  where claimed_session_id = new.id and session_started_at is null;
  return new;
end;
$$;
create trigger mark_invited_session_started after insert on public.interview_sessions
for each row execute function public.mark_invited_session_started();
revoke all on function public.mark_invited_session_started() from public, anon, authenticated;
