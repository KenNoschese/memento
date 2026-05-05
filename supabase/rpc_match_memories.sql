create extension if not exists vector;

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
