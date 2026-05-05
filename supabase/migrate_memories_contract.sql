create extension if not exists vector;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'memory_type'
  ) then
    create type memory_type as enum ('page', 'voice_note');
  end if;
end
$$;

alter table memories
add column if not exists type memory_type;

update memories
set type = case
  when title = 'Voice Note' then 'voice_note'::memory_type
  else 'page'::memory_type
end
where type is null;

alter table memories
alter column type set default 'page'::memory_type;

alter table memories
alter column type set not null;

alter table memories
alter column embedding type vector(768);

alter table memories
add column if not exists dedupe_key text;

update memories
set dedupe_key = md5(
  concat_ws(
    E'\n',
    type::text,
    btrim(coalesce(url, '')),
    regexp_replace(btrim(coalesce(title, '')), '\s+', ' ', 'g'),
    regexp_replace(btrim(coalesce(content, '')), '\s+', ' ', 'g')
  )
)
where dedupe_key is null;

with ranked_memories as (
  select
    id,
    row_number() over (
      partition by dedupe_key
      order by created_at asc, id asc
    ) as duplicate_rank
  from memories
)
delete from memories
where id in (
  select id
  from ranked_memories
  where duplicate_rank > 1
);

alter table memories
alter column dedupe_key set not null;

create unique index if not exists memories_dedupe_key_idx
on memories (dedupe_key);

drop function if exists match_memories(vector(768), double precision, integer);

create or replace function match_memories (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  url text,
  title text,
  content text,
  embedding vector(768),
  type memory_type,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    memories.id,
    memories.url,
    memories.title,
    memories.content,
    memories.embedding,
    memories.type,
    1 - (memories.embedding <=> query_embedding) as similarity
  from memories
  where 1 - (memories.embedding <=> query_embedding) > match_threshold
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;
