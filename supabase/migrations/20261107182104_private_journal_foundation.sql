-- Bordone private beta. No hosted project is provisioned by this migration.
-- Requires Supabase auth/storage schemas. Create the PRIVATE journal-photos-v1
-- bucket through Storage API (1,050,000 bytes; JPEG/PNG/WebP) before uploads.
-- All client mutations serialize per account; API roles have read-only tables.
begin;
create schema if not exists bordone_private;
revoke all on schema bordone_private from public, anon, authenticated;
grant usage on schema bordone_private to authenticated;

create table bordone_private.journal_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  max_photo_bytes bigint not null default 52428800 check (max_photo_bytes between 1 and 52428800)
);
alter table bordone_private.journal_members enable row level security;
revoke all on bordone_private.journal_members from public, anon, authenticated;

create table public.journal_assets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  object_name text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 1050000),
  state text not null default 'reserved' check (state in ('reserved', 'ready', 'deleting', 'deleted')),
  created_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, object_name)
);
create table public.journal_visits (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(btrim(id)) > 0 and length(id) <= 100),
  revision integer not null check (revision > 0),
  mutation_id uuid not null,
  payload jsonb,
  photo_ids uuid[] not null default '{}',
  deleted boolean not null default false,
  changed_at timestamptz not null default now(),
  primary key (user_id, id),
  check (cardinality(photo_ids) <= 24),
  check ((deleted and payload is null and cardinality(photo_ids) = 0)
    or (not deleted and jsonb_typeof(payload) = 'object' and payload is not null))
);
alter table public.journal_assets enable row level security;
alter table public.journal_visits enable row level security;
revoke all on public.journal_assets, public.journal_visits from public, anon, authenticated;
grant select on public.journal_assets, public.journal_visits to authenticated;
create policy journal_assets_owner_read on public.journal_assets for select to authenticated
  using (user_id = (select auth.uid()));
create policy journal_visits_owner_read on public.journal_visits for select to authenticated
  using (user_id = (select auth.uid()));

-- This guard is used only by private functions, not exposed as an RPC. The
-- definer boundary permits guarded mutations while direct table writes stay
-- forbidden. Never accept a user_id from the caller or trust user_metadata.
create function bordone_private.journal_owner() returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'journal_sign_in_required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bordone-journal:' || actor::text, 0));
  if not exists (select 1 from bordone_private.journal_members m where m.user_id = actor and m.enabled) then
    raise exception 'journal_beta_access_required' using errcode = '42501';
  end if;
  return actor;
end $$;

create function bordone_private.valid_journal_date(value text) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  return to_char(value::date, 'YYYY-MM-DD') = value;
exception when others then return false;
end $$;

create function bordone_private.validate_journal_payload(value jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare key text; max_length integer; place jsonb := value->'place';
begin
  if value is null or jsonb_typeof(value) <> 'object' or octet_length(value::text) > 65536
    or not (value ?& array['place','status','planDate','visitDate','notes','with','rating','createdAt','updatedAt'])
    or exists (select 1 from jsonb_object_keys(value) k where k <> all(array['place','status','planDate','visitDate','notes','with','rating','createdAt','updatedAt'])) then
    raise exception 'journal_invalid_payload' using errcode = '22023';
  end if;
  foreach key in array array['status','planDate','visitDate','notes','with','createdAt','updatedAt'] loop
    max_length := case key when 'notes' then 6000 when 'with' then 200 else 40 end;
    if jsonb_typeof(value->key) is distinct from 'string' or length(value->>key) > max_length then
      raise exception 'journal_invalid_payload' using errcode = '22023';
    end if;
  end loop;
  if value->>'status' not in ('planned','visited')
    or (value->>'planDate' <> '' and not bordone_private.valid_journal_date(value->>'planDate'))
    or (value->>'visitDate' <> '' and not bordone_private.valid_journal_date(value->>'visitDate'))
    or (value->>'status' = 'visited' and value->>'visitDate' = '')
    or jsonb_typeof(value->'rating') is distinct from 'number' then
    raise exception 'journal_invalid_payload' using errcode = '22023';
  end if;
  if (value->>'rating')::numeric not between 0 and 5 or (value->>'rating')::numeric <> trunc((value->>'rating')::numeric) then
    raise exception 'journal_invalid_rating' using errcode = '22023';
  end if;
  -- Dates remain local calendar dates. UTC+14 can already be on tomorrow's date.
  if value->>'visitDate' <> '' and (value->>'visitDate')::date > (now() at time zone 'UTC')::date + 1 then
    raise exception 'journal_future_visit' using errcode = '22023';
  end if;
  if not isfinite((value->>'createdAt')::timestamptz) or not isfinite((value->>'updatedAt')::timestamptz) then
    raise exception 'journal_invalid_timestamp' using errcode = '22023';
  end if;
  if jsonb_typeof(place) is distinct from 'object' or not (place ?& array['id','name']) then
    raise exception 'journal_invalid_place' using errcode = '22023';
  end if;
  foreach key in array array['id','name','address','category','source','sourceUrl','website','hours','fee','access'] loop
    max_length := case key when 'id' then 160 when 'name' then 180 when 'address' then 600
      when 'hours' then 400 when 'access' then 40 when 'sourceUrl' then 4096 when 'website' then 4096 else 100 end;
    if (place ? key and (jsonb_typeof(place->key) is distinct from 'string' or length(place->>key) > max_length))
      or (key in ('id','name') and length(btrim(place->>key)) = 0) then
      raise exception 'journal_invalid_place' using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from jsonb_object_keys(place) k where k <> all(array['id','name','address','category','source','sourceUrl','website','hours','fee','access','lat','lng'])) then
    raise exception 'journal_invalid_place' using errcode = '22023';
  end if;
  if place ? 'lat' or place ? 'lng' then
    if jsonb_typeof(place->'lat') is distinct from 'number' or jsonb_typeof(place->'lng') is distinct from 'number' then
      raise exception 'journal_invalid_coordinates' using errcode = '22023';
    end if;
    if abs((place->>'lat')::numeric) > 90 or abs((place->>'lng')::numeric) > 180 then
      raise exception 'journal_invalid_coordinates' using errcode = '22023';
    end if;
  end if;
end $$;

create function bordone_private.prepare_journal_photo(p_id uuid, p_sha256 text, p_mime_type text, p_byte_size integer)
returns public.journal_assets language plpgsql security definer set search_path = '' as $$
declare actor uuid := bordone_private.journal_owner(); asset public.journal_assets; used_bytes bigint; quota bigint;
begin
  if p_id is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_mime_type is null or p_mime_type not in ('image/jpeg','image/png','image/webp')
    or p_byte_size is null or p_byte_size not between 1 and 1050000 then
    raise exception 'journal_invalid_photo' using errcode = '22023';
  end if;
  select * into asset from public.journal_assets where user_id = actor and id = p_id;
  if found then
    if asset.sha256 <> p_sha256 or asset.mime_type <> p_mime_type or asset.byte_size <> p_byte_size then
      raise exception 'journal_photo_id_reused' using errcode = '22023';
    end if;
    if asset.state in ('deleting','deleted') then raise exception 'journal_photo_retired' using errcode = '22023'; end if;
    return asset;
  end if;
  -- Reserve the bucket's full per-file ceiling until the upload is finalized.
  -- Storage preflight has no authoritative byte count; client sizes are untrusted.
  select coalesce(sum(case when state in ('reserved','deleting') then 1050000 else byte_size end)
    filter (where state <> 'deleted'),0) into used_bytes from public.journal_assets where user_id = actor;
  used_bytes := greatest(used_bytes, (select coalesce(sum((metadata->>'size')::bigint),0)
    from storage.objects where bucket_id = 'journal-photos-v1' and owner_id = actor::text));
  select max_photo_bytes into quota from bordone_private.journal_members where user_id = actor;
  if used_bytes + 1050000 > quota then raise exception 'journal_photo_quota' using errcode = '54000'; end if;
  if (select count(*) from public.journal_assets where user_id = actor) >= 24000 then
    raise exception 'journal_photo_record_limit' using errcode = '54000';
  end if;
  insert into public.journal_assets(user_id,id,object_name,sha256,mime_type,byte_size)
    values (actor,p_id,actor::text || '/' || p_id::text || case p_mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end,p_sha256,p_mime_type,p_byte_size)
    returning * into asset;
  return asset;
end $$;

create function bordone_private.finish_journal_photo(p_id uuid) returns public.journal_assets
language plpgsql security definer set search_path = '' as $$
declare actor uuid := bordone_private.journal_owner(); asset public.journal_assets;
begin
  select * into asset from public.journal_assets where user_id = actor and id = p_id;
  if not found or asset.state not in ('reserved','ready') then raise exception 'journal_photo_unavailable' using errcode = '22023'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'journal-photos-v1' and o.name = asset.object_name
      and o.owner_id = actor::text and (o.metadata->>'size')::bigint = asset.byte_size and o.metadata->>'mimetype' = asset.mime_type) then
    raise exception 'journal_photo_upload_incomplete' using errcode = '22023';
  end if;
  if asset.state = 'ready' then return asset; end if;
  update public.journal_assets set state = 'ready', changed_at = now() where user_id = actor and id = p_id returning * into asset;
  return asset;
end $$;

create function bordone_private.save_journal_visit(p_id text, p_expected_revision integer, p_mutation_id uuid,
  p_payload jsonb, p_photo_ids uuid[], p_deleted boolean)
returns public.journal_visits language plpgsql security definer set search_path = '' as $$
declare actor uuid := bordone_private.journal_owner(); prior public.journal_visits; result public.journal_visits;
begin
  if p_id is null or length(btrim(p_id)) = 0 or length(p_id) > 100 or p_expected_revision is null or p_expected_revision < 0
    or p_mutation_id is null or p_deleted is null or p_photo_ids is null or array_position(p_photo_ids, null) is not null
    or cardinality(p_photo_ids) > 24 or coalesce(array_ndims(p_photo_ids),1) <> 1 then
    raise exception 'journal_invalid_mutation' using errcode = '22023';
  end if;
  if p_deleted then
    if p_payload is not null or cardinality(p_photo_ids) <> 0 then raise exception 'journal_invalid_deletion' using errcode = '22023'; end if;
  else
    perform bordone_private.validate_journal_payload(p_payload);
  end if;
  select * into prior from public.journal_visits where user_id = actor and id = p_id;
  if found and prior.mutation_id = p_mutation_id then
    if prior.payload is distinct from p_payload or prior.photo_ids is distinct from p_photo_ids or prior.deleted <> p_deleted then
      raise exception 'journal_mutation_id_reused' using errcode = '22023';
    end if;
    return prior; -- The previous request committed but its response was lost.
  end if;
  if coalesce(prior.revision,0) <> p_expected_revision then raise exception 'journal_conflict' using errcode = '40001'; end if;
  if prior.deleted and not p_deleted then raise exception 'journal_visit_deleted' using errcode = '22023'; end if;
  if not p_deleted and exists (select 1 from unnest(p_photo_ids) pid where not exists (
    select 1 from public.journal_assets a join storage.objects o on o.bucket_id = 'journal-photos-v1' and o.name = a.object_name
    where a.user_id = actor and a.id = pid and a.state = 'ready' and o.owner_id = actor::text
  )) then raise exception 'journal_photos_not_ready' using errcode = '22023'; end if;
  if prior.revision is null then
    if (select count(*) from public.journal_visits where user_id = actor) >= 1000
      or (not p_deleted and (select count(*) from public.journal_visits where user_id = actor and not deleted) >= 500) then
      raise exception 'journal_visit_limit' using errcode = '54000';
    end if;
    insert into public.journal_visits(user_id,id,revision,mutation_id,payload,photo_ids,deleted)
      values (actor,p_id,1,p_mutation_id,p_payload,p_photo_ids,p_deleted) returning * into result;
  else
    update public.journal_visits set revision = prior.revision + 1, mutation_id = p_mutation_id, payload = p_payload,
      photo_ids = p_photo_ids, deleted = p_deleted, changed_at = now() where user_id = actor and id = p_id returning * into result;
  end if;
  return result;
end $$;

create function bordone_private.begin_journal_photo_delete(p_id uuid) returns public.journal_assets
language plpgsql security definer set search_path = '' as $$
declare actor uuid := bordone_private.journal_owner(); asset public.journal_assets;
begin
  select * into asset from public.journal_assets where user_id = actor and id = p_id;
  if not found then raise exception 'journal_photo_unavailable' using errcode = '22023'; end if;
  if exists (select 1 from public.journal_visits where user_id = actor and not deleted and p_id = any(photo_ids)) then
    raise exception 'journal_photo_in_use' using errcode = '22023';
  end if;
  if asset.state not in ('deleting','deleted') then
    update public.journal_assets set state = 'deleting', changed_at = now() where user_id = actor and id = p_id returning * into asset;
  end if;
  return asset;
end $$;
create function bordone_private.finish_journal_photo_delete(p_id uuid) returns public.journal_assets
language plpgsql security definer set search_path = '' as $$
declare actor uuid := bordone_private.journal_owner(); asset public.journal_assets;
begin
  select * into asset from public.journal_assets where user_id = actor and id = p_id;
  if not found or asset.state not in ('deleting','deleted') then raise exception 'journal_photo_not_deleting' using errcode = '22023'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'journal-photos-v1' and name = asset.object_name) then
    raise exception 'journal_photo_delete_incomplete' using errcode = '22023';
  end if;
  if asset.state = 'deleted' then return asset; end if;
  update public.journal_assets set state = 'deleted', changed_at = now() where user_id = actor and id = p_id returning * into asset;
  return asset;
end $$;

-- Storage writes still go through the Storage API, never SQL deletion of object
-- metadata. Immutable unique paths cannot be overwritten or reused after delete.
create function bordone_private.journal_storage_write(p_name text, p_bucket text, p_metadata jsonb, p_delete boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := bordone_private.journal_owner(); asset public.journal_assets;
begin
  if p_bucket is distinct from 'journal-photos-v1' then return false; end if;
  select * into asset from public.journal_assets where user_id = actor and object_name = p_name;
  if not found then return false; end if;
  if p_delete then return asset.state = 'deleting'; end if;
  -- Supabase's pre-upload probe provides mimetype/contentLength, not size.
  -- Its completed-upload probe and our finish RPC check measured size. Use raw
  -- ArrayBuffer upload, not multipart, and verify against hosted Storage before launch.
  return asset.state = 'reserved' and p_metadata->>'mimetype' = asset.mime_type
    and (not (p_metadata ? 'size') or (p_metadata->>'size')::bigint = asset.byte_size);
end $$;
create policy journal_photo_read on storage.objects for select to authenticated using (
  bucket_id = 'journal-photos-v1' and owner_id = (select auth.uid())::text and exists (
    select 1 from public.journal_assets a where a.user_id = (select auth.uid()) and a.object_name = storage.objects.name and a.state <> 'deleted'
  )
);
create policy journal_photo_insert on storage.objects for insert to authenticated with check (
  owner_id = (select auth.uid())::text and bordone_private.journal_storage_write(name,bucket_id,metadata,false)
);
create policy journal_photo_delete on storage.objects for delete to authenticated using (
  owner_id = (select auth.uid())::text and bordone_private.journal_storage_write(name,bucket_id,metadata,true)
);
-- No UPDATE policy: .upload(..., {upsert:false}) only. Ready photos are immutable.

-- Each public write names the session it was prepared for. If the SDK swaps
-- tokens while a request is being dispatched, it must not file A's memory in B.
-- This is a consistency guard, never a substitute for auth.uid() authorization.
create function public.prepare_journal_photo(p_owner uuid, p_id uuid, p_sha256 text, p_mime_type text, p_byte_size integer)
returns public.journal_assets language plpgsql security invoker set search_path = '' as $$
begin
  if p_owner is null or p_owner is distinct from auth.uid() then raise exception 'journal_account_changed' using errcode = '42501'; end if;
  return bordone_private.prepare_journal_photo(p_id,p_sha256,p_mime_type,p_byte_size);
end $$;
create function public.finish_journal_photo(p_owner uuid, p_id uuid) returns public.journal_assets
language plpgsql security invoker set search_path = '' as $$
begin
  if p_owner is null or p_owner is distinct from auth.uid() then raise exception 'journal_account_changed' using errcode = '42501'; end if;
  return bordone_private.finish_journal_photo(p_id);
end $$;
create function public.save_journal_visit(p_owner uuid, p_id text, p_expected_revision integer, p_mutation_id uuid, p_payload jsonb, p_photo_ids uuid[], p_deleted boolean)
returns public.journal_visits language plpgsql security invoker set search_path = '' as $$
begin
  if p_owner is null or p_owner is distinct from auth.uid() then raise exception 'journal_account_changed' using errcode = '42501'; end if;
  return bordone_private.save_journal_visit(p_id,p_expected_revision,p_mutation_id,p_payload,p_photo_ids,p_deleted);
end $$;
create function public.begin_journal_photo_delete(p_owner uuid, p_id uuid) returns public.journal_assets
language plpgsql security invoker set search_path = '' as $$
begin
  if p_owner is null or p_owner is distinct from auth.uid() then raise exception 'journal_account_changed' using errcode = '42501'; end if;
  return bordone_private.begin_journal_photo_delete(p_id);
end $$;
create function public.finish_journal_photo_delete(p_owner uuid, p_id uuid) returns public.journal_assets
language plpgsql security invoker set search_path = '' as $$
begin
  if p_owner is null or p_owner is distinct from auth.uid() then raise exception 'journal_account_changed' using errcode = '42501'; end if;
  return bordone_private.finish_journal_photo_delete(p_id);
end $$;

revoke all on all functions in schema bordone_private from public, anon, authenticated;
grant execute on function bordone_private.prepare_journal_photo(uuid,text,text,integer),
  bordone_private.finish_journal_photo(uuid), bordone_private.save_journal_visit(text,integer,uuid,jsonb,uuid[],boolean),
  bordone_private.begin_journal_photo_delete(uuid), bordone_private.finish_journal_photo_delete(uuid),
  bordone_private.journal_storage_write(text,text,jsonb,boolean) to authenticated;
revoke all on function public.prepare_journal_photo(uuid,uuid,text,text,integer), public.finish_journal_photo(uuid,uuid),
  public.save_journal_visit(uuid,text,integer,uuid,jsonb,uuid[],boolean), public.begin_journal_photo_delete(uuid,uuid),
  public.finish_journal_photo_delete(uuid,uuid) from public, anon, authenticated;
grant execute on function public.prepare_journal_photo(uuid,uuid,text,text,integer), public.finish_journal_photo(uuid,uuid),
  public.save_journal_visit(uuid,text,integer,uuid,jsonb,uuid[],boolean), public.begin_journal_photo_delete(uuid,uuid),
  public.finish_journal_photo_delete(uuid,uuid) to authenticated;
commit;
