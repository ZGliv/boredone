-- Server-only removal coordination. Storage bytes are removed via Storage API;
-- Auth is deleted last. No service credential is exposed to the browser.
begin;
create table bordone_private.journal_removals (
  user_id uuid primary key,
  request_id uuid not null unique,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
-- Deliberately no Auth FK: an opaque completion receipt must survive Auth
-- deletion so a lost final HTTP response can be confirmed, not guessed.
alter table bordone_private.journal_removals enable row level security;
revoke all on bordone_private.journal_removals from public, anon, authenticated, service_role;

create or replace function bordone_private.journal_owner() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'journal_sign_in_required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bordone-journal:' || actor::text, 0));
  if exists (select 1 from bordone_private.journal_removals where user_id=actor) then
    raise exception 'journal_account_removing' using errcode = '42501';
  end if;
  if not exists (select 1 from bordone_private.journal_members m where m.user_id=actor and m.enabled) then
    raise exception 'journal_beta_access_required' using errcode = '42501';
  end if;
  return actor;
end $$;

create function bordone_private.journal_removal(p_owner uuid,p_request_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job bordone_private.journal_removals;
begin
  if p_owner is null or p_request_id is null or p_action is null or p_action not in ('begin','status') then
    raise exception 'journal_invalid_removal' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bordone-journal:' || p_owner::text,0));
  -- Opportunistic receipt retention only; never discard an unfinished request.
  delete from bordone_private.journal_removals where completed_at < now()-interval '7 days';
  select * into job from bordone_private.journal_removals where user_id=p_owner;
  if p_action='begin' then
    if not exists(select 1 from auth.users where id=p_owner) then
      raise exception 'journal_sign_in_required' using errcode='42501';
    end if;
    if job.user_id is null then
      insert into bordone_private.journal_removals(user_id,request_id) values(p_owner,p_request_id) returning * into job;
    end if;
    update bordone_private.journal_members set enabled=false where user_id=p_owner;
    -- A verified owner may recover an existing request from another device.
  elsif job.user_id is null or job.request_id is distinct from p_request_id then
    return null;
  end if;
  if job.completed_at is null and not exists(select 1 from auth.users where id=p_owner)
    and not exists(select 1 from storage.objects where bucket_id='journal-photos-v1'
      and (owner_id=p_owner::text or name like p_owner::text || '/%')) then
    update bordone_private.journal_removals set completed_at=now() where user_id=p_owner returning * into job;
  end if;
  return jsonb_build_object('requestId',job.request_id,'status',case when job.completed_at is null then 'pending' else 'complete' end);
end $$;
revoke all on function bordone_private.journal_removal(uuid,uuid,text) from public,anon,authenticated;
grant usage on schema bordone_private to service_role;
grant execute on function bordone_private.journal_removal(uuid,uuid,text) to service_role;
create function public.journal_account_removal(p_owner uuid,p_request_id uuid,p_action text) returns jsonb
language sql security invoker set search_path = '' as $$
  select bordone_private.journal_removal(p_owner,p_request_id,p_action);
$$;
revoke all on function public.journal_account_removal(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.journal_account_removal(uuid,uuid,text) to service_role;
commit;
