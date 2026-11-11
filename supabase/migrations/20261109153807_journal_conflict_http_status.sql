-- Version conflicts require user reconciliation, not a transaction retry.
-- PostgREST retries SQLSTATE 40001; PT409 returns HTTP 409 immediately.
create or replace function bordone_private.save_journal_visit(p_id text, p_expected_revision integer, p_mutation_id uuid,
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
  if coalesce(prior.revision,0) <> p_expected_revision then raise exception 'journal_conflict' using errcode = 'PT409'; end if;
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
