-- The Pile: a save is an ordinary journal visit with status 'saved', so RLS,
-- the owner lock, idempotent mutation IDs, conflicts and account removal all
-- apply unchanged. This migration only relaxes payload validation and splits
-- the live-record limit. No table, grant or row-level security policy changes.
--
-- Payload rules added (mirrors validateOuting/validateSource in src/model.js):
--   * status may also be 'saved'; a save never has a visitDate.
--   * place may be JSON null ONLY when status = 'saved', and then a source is
--     required. The 'place' key itself stays mandatory, so a dropped key is
--     still rejected rather than read as an unresolved save.
--   * optional 'source' object with exactly url, app, text, savedAt, eventDate,
--     expiresAt. Absent on every pre-existing row, so old payloads (and clients
--     that predate saves) validate exactly as before.
--
-- Limits: the old rule was 500 live rows and 1000 retained rows. Saves are
-- photo-free (~1 KB), so they get their own budget of 1000 live saves while
-- plans + memories stay at 500. Tombstones are permanent (a deleted id cannot
-- be revived) and triaging a pile deletes often, so the retained-row cap rises
-- to 5000. Live limits are checked after the write, inside the per-owner
-- advisory lock taken by journal_owner(); raising aborts the statement, which
-- rolls the write back. They are checked only when a write moves a row into a
-- bucket (insert, or saved <-> plan/memory), so edits at the cap still work.
begin;

create or replace function bordone_private.validate_journal_payload(value jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare key text; max_length integer; place jsonb := value->'place'; source jsonb := value->'source';
  keys text[] := array['place','status','planDate','visitDate','notes','with','rating','createdAt','updatedAt'];
  source_keys text[] := array['url','app','text','savedAt','eventDate','expiresAt'];
begin
  if value is null or jsonb_typeof(value) <> 'object' or octet_length(value::text) > 65536
    or not (value ?& keys)
    or exists (select 1 from jsonb_object_keys(value) k where k <> all(keys || array['source'])) then
    raise exception 'journal_invalid_payload' using errcode = '22023';
  end if;
  foreach key in array array['status','planDate','visitDate','notes','with','createdAt','updatedAt'] loop
    max_length := case key when 'notes' then 6000 when 'with' then 200 else 40 end;
    if jsonb_typeof(value->key) is distinct from 'string' or length(value->>key) > max_length then
      raise exception 'journal_invalid_payload' using errcode = '22023';
    end if;
  end loop;
  if value->>'status' not in ('saved','planned','visited')
    or (value->>'planDate' <> '' and not bordone_private.valid_journal_date(value->>'planDate'))
    or (value->>'visitDate' <> '' and not bordone_private.valid_journal_date(value->>'visitDate'))
    or (value->>'status' = 'visited' and value->>'visitDate' = '')
    or (value->>'status' = 'saved' and value->>'visitDate' <> '')
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

  if value ? 'source' then
    if jsonb_typeof(source) is distinct from 'object' or not (source ?& source_keys)
      or exists (select 1 from jsonb_object_keys(source) k where k <> all(source_keys)) then
      raise exception 'journal_invalid_source' using errcode = '22023';
    end if;
    foreach key in array source_keys loop
      max_length := case key when 'url' then 2048 when 'text' then 2000 when 'savedAt' then 40 when 'app' then 20 else 10 end;
      if jsonb_typeof(source->key) is distinct from 'string' or length(source->>key) > max_length then
        raise exception 'journal_invalid_source' using errcode = '22023';
      end if;
    end loop;
    if source->>'app' not in ('instagram','tiktok','youtube','google-maps','web','note')
      or (source->>'url' <> '' and source->>'url' !~* '^https?://[^[:space:]]+$')
      or (source->>'eventDate' <> '' and not bordone_private.valid_journal_date(source->>'eventDate'))
      or (source->>'expiresAt' <> '' and not bordone_private.valid_journal_date(source->>'expiresAt')) then
      raise exception 'journal_invalid_source' using errcode = '22023';
    end if;
    if not isfinite((source->>'savedAt')::timestamptz) then
      raise exception 'journal_invalid_timestamp' using errcode = '22023';
    end if;
  end if;

  if jsonb_typeof(place) = 'null' then
    -- An unresolved save: nothing to locate yet, but it must carry what was saved.
    if value->>'status' <> 'saved' or not (value ? 'source') then
      raise exception 'journal_invalid_place' using errcode = '22023';
    end if;
    return;
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

-- Same body as 20261109153807 except the limit block.
create or replace function bordone_private.save_journal_visit(p_id text, p_expected_revision integer, p_mutation_id uuid,
  p_payload jsonb, p_photo_ids uuid[], p_deleted boolean)
returns public.journal_visits language plpgsql security definer set search_path = '' as $$
declare actor uuid := bordone_private.journal_owner(); prior public.journal_visits; result public.journal_visits;
  is_save boolean := not p_deleted and p_payload->>'status' = 'saved';
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
  if coalesce(prior.revision,0) <> p_expected_revision then raise exception 'journal_conflict' using errcode = 'PT409'; end if;
  if prior.deleted and not p_deleted then raise exception 'journal_visit_deleted' using errcode = '22023'; end if;
  if not p_deleted and exists (select 1 from unnest(p_photo_ids) pid where not exists (
    select 1 from public.journal_assets a join storage.objects o on o.bucket_id = 'journal-photos-v1' and o.name = a.object_name
    where a.user_id = actor and a.id = pid and a.state = 'ready' and o.owner_id = actor::text
  )) then raise exception 'journal_photos_not_ready' using errcode = '22023'; end if;
  if prior.revision is null then
    if (select count(*) from public.journal_visits where user_id = actor) >= 5000 then
      raise exception 'journal_visit_limit' using errcode = '54000';
    end if;
    insert into public.journal_visits(user_id,id,revision,mutation_id,payload,photo_ids,deleted)
      values (actor,p_id,1,p_mutation_id,p_payload,p_photo_ids,p_deleted) returning * into result;
  else
    update public.journal_visits set revision = prior.revision + 1, mutation_id = p_mutation_id, payload = p_payload,
      photo_ids = p_photo_ids, deleted = p_deleted, changed_at = now() where user_id = actor and id = p_id returning * into result;
  end if;
  if not p_deleted and (prior.revision is null or (coalesce(prior.payload->>'status','') = 'saved') <> is_save)
    and (select count(*) from public.journal_visits where user_id = actor and not deleted
      and (payload->>'status' = 'saved') = is_save) > (case when is_save then 1000 else 500 end) then
    raise exception 'journal_visit_limit' using errcode = '54000';
  end if;
  return result;
end $$;

commit;
