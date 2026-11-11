-- TEST ONLY: Minimal Supabase-shaped auth/storage fixtures for SQL/RLS tests.
-- This is NOT Auth, PostgREST, Storage/S3, or proof of cloud integration.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  owner_id text,
  metadata jsonb,
  unique(bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select,insert,update,delete on storage.objects to anon,authenticated;
grant usage on schema public to anon,authenticated;
-- Emulate permissive project defaults so migration must explicitly remove them.
alter default privileges in schema public grant all on tables to anon,authenticated;
alter default privileges in schema public grant execute on functions to anon,authenticated;
