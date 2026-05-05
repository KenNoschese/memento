-- Memento Database Migration: Aligning Contract
-- This script aligns the database with 3072-dimensional Gemini embeddings and real audio storage.

-- 1. Ensure vector extension is enabled
create extension if not exists vector;

-- 2. Create memory_type enum if it doesn't exist
do $$
begin
  if not exists (select 1 from pg_type where typname = 'memory_type') then
    create type memory_type as enum ('page', 'voice_note');
  end if;
end
$$;

-- 3. Update memories table structure
alter table memories add column if not exists type memory_type;
alter table memories add column if not exists dedupe_key text;
alter table memories add column if not exists audio text; -- For Base64 audio storage

-- Ensure existing records have a type
update memories set type = 'page' where type is null;
alter table memories alter column type set not null;
alter table memories alter column type set default 'page';

-- 4. Align embedding dimensions to 3072 (Gemini default)
-- Note: This will fail if there are existing rows with different dimensions.
-- In a hackathon, it's often easiest to truncate the table if it's just test data.
-- alter table memories alter column embedding type vector(3072);

-- 5. Create unique index for deduplication
create unique index if not exists memories_dedupe_key_idx on memories (dedupe_key);

-- 6. Update match_memories RPC
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
  url text,
  title text,
  content text,
  audio text,
  embedding vector(3072),
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
    memories.audio,
    memories.embedding,
    memories.type,
    1 - (memories.embedding <=> query_embedding) as similarity
  from memories
  where 1 - (memories.embedding <=> query_embedding) > match_threshold
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;
