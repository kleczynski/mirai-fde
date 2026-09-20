-- Administrative reads and deletion are performed only by trusted server
-- endpoints after Supabase magic-link identity verification.  This table keeps
-- an immutable, non-public audit trail without exposing control-plane access
-- through the Data API.
create table public.admin_session_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('session.deleted')),
  target_session_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index admin_session_actions_target on public.admin_session_actions(target_session_id, occurred_at desc);
create index admin_session_actions_actor on public.admin_session_actions(actor_id, occurred_at desc);

alter table public.admin_session_actions enable row level security;
revoke all on public.admin_session_actions from public, anon, authenticated;

comment on table public.admin_session_actions is
  'Server-only control-plane audit log. Never grant this table to browser roles.';

-- The server calls this through the service-role key only. Keeping the audit
-- insert and cascade delete in one database transaction prevents a deletion
-- without an audit record (or a false audit record when deletion fails).
create function public.admin_delete_interview_session(p_actor_id uuid, p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.interview_sessions where id = p_session_id) then
    return false;
  end if;

  insert into public.admin_session_actions(actor_id, action, target_session_id)
  values (p_actor_id, 'session.deleted', p_session_id);
  delete from public.interview_sessions where id = p_session_id;
  return true;
end
$$;

revoke all on function public.admin_delete_interview_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_interview_session(uuid, uuid) to service_role;
