-- Evidence follows source retention; anonymous cost accounting survives deletion.
create table public.brief_budget (
 id boolean primary key default true check(id),
 reserved_micros bigint not null default 0 check(reserved_micros between 0 and 1480000),
 limit_micros bigint not null default 1480000 check(limit_micros between 0 and 1480000)
);
-- Reserve the full local eval allocation. Local ledger caps calls at $0.96.
insert into public.brief_budget(id,reserved_micros) values(true,960000);
create table public.brief_runs (
 id uuid primary key,
 session_id uuid not null references public.interview_sessions(id) on delete cascade,
 actor_id uuid not null,
 source_hash text not null check(length(source_hash)=64),
 source_context jsonb not null,
 expires_at timestamptz not null,
 status text not null default 'queued' check(status in ('queued','running','waiting_admin_review','completed','failed')),
 model text not null default 'gpt-4.1-mini' check(model='gpt-4.1-mini'),
 reserved_micros integer not null default 0 check(reserved_micros between 0 and 240000),
 brief jsonb, brief_hash text, quality jsonb,
 decision text check(decision in ('approve','reject')), error_code text,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create index brief_runs_session_created_idx on public.brief_runs(session_id,created_at desc,id desc);
create table public.brief_run_steps (
 run_id uuid not null references public.brief_runs(id) on delete cascade,
 name text not null check(name in ('audit','opportunity','integration','author','critic','revision')),
 status text not null check(status in ('reserved','completed')),
 input jsonb not null, output jsonb, usage jsonb,
 created_at timestamptz not null default now(), completed_at timestamptz,
 primary key(run_id,name)
);
create table public.brief_call_receipts (
 id uuid primary key default gen_random_uuid(),
 reserved_micros integer not null check(reserved_micros=40000),
 created_at timestamptz not null default now()
);
alter table public.brief_budget enable row level security;
alter table public.brief_runs enable row level security;
alter table public.brief_run_steps enable row level security;
alter table public.brief_call_receipts enable row level security;
revoke all on public.brief_budget,public.brief_runs,public.brief_run_steps,public.brief_call_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.brief_runs,public.brief_run_steps to service_role;
grant select on public.brief_budget,public.brief_call_receipts to service_role;
create function public.reserve_brief_call(p_run_id uuid,p_name text,p_input jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.brief_runs; b public.brief_budget;
begin
 select * into b from public.brief_budget where id=true for update;
 select * into r from public.brief_runs where id=p_run_id for update;
 if r.id is null or r.expires_at<=now() or r.status not in ('queued','running')
 or not exists(select 1 from public.interview_sessions where id=r.session_id and expires_at>now() and status='completed') then raise exception 'Brief unavailable'; end if;
 if exists(select 1 from public.brief_run_steps where run_id=p_run_id and name=p_name) then return false; end if;
 if r.reserved_micros+40000>240000 or b.reserved_micros+40000>b.limit_micros then raise exception 'Brief budget exceeded'; end if;
 insert into public.brief_run_steps(run_id,name,status,input) values(p_run_id,p_name,'reserved',p_input);
 update public.brief_runs set reserved_micros=reserved_micros+40000,status='running' where id=p_run_id;
 update public.brief_budget set reserved_micros=reserved_micros+40000 where id=true;
 insert into public.brief_call_receipts(reserved_micros) values(40000);
 return true;
end $$;
revoke all on function public.reserve_brief_call(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_brief_call(uuid,text,jsonb) to service_role;

-- Review/export bind to the source revision under the same transaction lock.
create function public.transition_brief(p_run_id uuid,p_expected_status text,p_source_revision integer,p_brief_hash text,p_values jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.brief_runs; s public.interview_sessions;
begin
 select * into r from public.brief_runs where id=p_run_id;
 if r.id is null then return false; end if;
 select * into s from public.interview_sessions where id=r.session_id for update;
 select * into r from public.brief_runs where id=p_run_id for update;
 if s.id is null or r.id is null or s.expires_at<=now() or r.expires_at<=now() or s.status<>'completed'
 or (s.state->>'revision')::integer is distinct from p_source_revision or r.status is distinct from p_expected_status
 or r.brief_hash is null or r.brief_hash is distinct from p_brief_hash then return false; end if;
 update public.brief_runs set
  brief=coalesce(p_values->'brief',brief),
  decision=coalesce(p_values->>'decision',decision),
  status=coalesce(p_values->>'status',status),
  completed_at=coalesce((p_values->>'completed_at')::timestamptz,completed_at),
  error_code=p_values->>'error_code'
 where id=p_run_id;
 return true;
end $$;
revoke all on function public.transition_brief(uuid,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.transition_brief(uuid,text,integer,text,jsonb) to service_role;
