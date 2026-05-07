create table if not exists api_cache (
  cache_key text primary key,
  cache_group text not null,
  user_id text,
  payload jsonb not null,
  source_count integer not null default 0,
  source_updated_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists api_cache_group_user_idx
  on api_cache (cache_group, user_id);

create or replace function set_api_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists api_cache_set_updated_at on api_cache;
create trigger api_cache_set_updated_at
before update on api_cache
for each row
execute function set_api_cache_updated_at();

alter table api_cache enable row level security;

drop policy if exists api_cache_select_anon on api_cache;
create policy api_cache_select_anon
  on api_cache
  for select
  to anon
  using (true);

drop policy if exists api_cache_insert_anon on api_cache;
create policy api_cache_insert_anon
  on api_cache
  for insert
  to anon
  with check (true);

drop policy if exists api_cache_update_anon on api_cache;
create policy api_cache_update_anon
  on api_cache
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists api_cache_delete_anon on api_cache;
create policy api_cache_delete_anon
  on api_cache
  for delete
  to anon
  using (true);
