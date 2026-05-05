-- Memento Database Migration: Voice notes attach to concrete page memories.

create extension if not exists vector;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'memory_type') then
    create type memory_type as enum ('page', 'voice_note');
  end if;
end
$$;

alter table memories add column if not exists type memory_type;
alter table memories add column if not exists dedupe_key text;
alter table memories add column if not exists audio text;
alter table memories add column if not exists canonical_url text;
alter table memories add column if not exists parent_memory_id uuid;
alter table memories add column if not exists is_placeholder boolean;
alter table memories add column if not exists summary text;

update memories set type = 'page' where type is null;
alter table memories alter column type set not null;
alter table memories alter column type set default 'page';

update memories
set is_placeholder = false
where is_placeholder is null;

alter table memories alter column is_placeholder set not null;
alter table memories alter column is_placeholder set default false;

create or replace function canonicalize_memory_url(raw_url text)
returns text
language plpgsql
immutable
as $$
declare
  without_fragment text;
  base_url text;
  query_string text;
  pair text;
  key text;
  value text;
  filtered_pairs text[] := '{}';
begin
  if raw_url is null or btrim(raw_url) = '' then
    return '';
  end if;

  without_fragment := split_part(raw_url, '#', 1);
  base_url := split_part(without_fragment, '?', 1);

  if position('?' in without_fragment) > 0 then
    query_string := split_part(without_fragment, '?', 2);
  else
    query_string := null;
  end if;

  if query_string is null or query_string = '' then
    return base_url;
  end if;

  foreach pair in array regexp_split_to_array(query_string, '&') loop
    if pair = '' then
      continue;
    end if;

    key := split_part(pair, '=', 1);
    value := case when position('=' in pair) > 0 then split_part(pair, '=', 2) else '' end;

    if key ~* '^utm_' or lower(key) in ('fbclid', 'gclid') then
      continue;
    end if;

    filtered_pairs := array_append(
      filtered_pairs,
      case when value = '' then key else key || '=' || value end
    );
  end loop;

  if coalesce(array_length(filtered_pairs, 1), 0) = 0 then
    return base_url;
  end if;

  return base_url || '?' || array_to_string(filtered_pairs, '&');
end;
$$;

update memories
set canonical_url = canonicalize_memory_url(url)
where canonical_url is null or canonical_url = '';

alter table memories alter column canonical_url set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memories_parent_memory_id_fkey'
  ) then
    alter table memories
      add constraint memories_parent_memory_id_fkey
      foreign key (parent_memory_id)
      references memories(id)
      on delete cascade;
  end if;
end
$$;

create unique index if not exists memories_dedupe_key_idx on memories (dedupe_key);
create index if not exists memories_parent_memory_id_idx on memories (parent_memory_id);
create index if not exists memories_type_canonical_url_idx on memories (type, canonical_url);
create unique index if not exists memories_page_canonical_url_idx
  on memories (canonical_url)
  where type = 'page';

alter table memories enable row level security;

drop policy if exists memories_select_anon on memories;
create policy memories_select_anon
  on memories
  for select
  to anon
  using (true);

drop policy if exists memories_insert_anon on memories;
create policy memories_insert_anon
  on memories
  for insert
  to anon
  with check (true);

drop policy if exists memories_update_anon on memories;
create policy memories_update_anon
  on memories
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists memories_delete_anon on memories;
create policy memories_delete_anon
  on memories
  for delete
  to anon
  using (true);

with standalone_voice_notes as (
  select
    voice.id as voice_id,
    (
      select page.id
      from memories page
      where page.type = 'page'
        and page.canonical_url = voice.canonical_url
      order by
        case when page.created_at <= voice.created_at then 0 else 1 end,
        abs(extract(epoch from (voice.created_at - page.created_at)))
      limit 1
    ) as page_id
  from memories voice
  where voice.type = 'voice_note'
    and voice.parent_memory_id is null
),
voice_notes_without_page as (
  select voice_id
  from standalone_voice_notes
  where page_id is null
),
created_placeholders as (
  insert into memories (
    url,
    canonical_url,
    title,
    content,
    embedding,
    type,
    dedupe_key,
    is_placeholder
  )
  select distinct on (voice.canonical_url)
    voice.url,
    voice.canonical_url,
    coalesce(nullif(voice.title, ''), 'Voice Attachment'),
    null,
    null,
    'page',
    md5('page' || E'\n' || voice.canonical_url || E'\n' || voice.url || E'\n' || coalesce(voice.title, '')),
    true
  from memories voice
  join voice_notes_without_page orphaned on orphaned.voice_id = voice.id
  order by voice.canonical_url, voice.created_at
  on conflict (canonical_url) where type = 'page' do update
    set url = excluded.url
  returning id, canonical_url
),
resolved_pages as (
  select voice_id, page_id
  from standalone_voice_notes
  where page_id is not null
  union all
  select voice.id as voice_id, page.id as page_id
  from memories voice
  join memories page
    on page.type = 'page'
   and page.canonical_url = voice.canonical_url
  where voice.type = 'voice_note'
    and voice.parent_memory_id is null
)
update memories voice
set parent_memory_id = resolved.page_id
from resolved_pages resolved
where voice.id = resolved.voice_id
  and voice.parent_memory_id is null;

drop function if exists match_memories(vector(768), double precision, integer);
drop function if exists match_memories(vector(768), float, int);
drop function if exists match_memories(vector(1536), float, int);
drop function if exists match_memories(vector(3072), float, int);

create or replace function match_memories (
  query_embedding vector(3072),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  parent_memory_id uuid,
  url text,
  canonical_url text,
  title text,
  content text,
  audio text,
  embedding vector(3072),
  type memory_type,
  is_placeholder boolean,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    memories.id,
    memories.parent_memory_id,
    memories.url,
    memories.canonical_url,
    memories.title,
    memories.content,
    memories.audio,
    memories.embedding,
    memories.type,
    memories.is_placeholder,
    1 - (memories.embedding <=> query_embedding) as similarity
  from memories
  where memories.embedding is not null
    and 1 - (memories.embedding <=> query_embedding) > match_threshold
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function match_memories(vector(3072), float, int) to anon;
