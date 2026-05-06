create extension if not exists vector;

-- Drop all possible previous signatures to avoid "function not found" due to mismatches
drop function if exists match_memories(vector, float, int, text);
drop function if exists match_memories(vector(3072), float, int, text);
drop function if exists match_memories(vector(3072), float, int);

create or replace function match_memories (
  query_embedding vector(3072),
  match_threshold float,
  match_count int,
  p_user_id text default null
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
    -- CRITICAL: Filter by user_id if provided
    and (p_user_id is null or memories.user_id = p_user_id)
    and 1 - (memories.embedding <=> query_embedding) > match_threshold
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function match_memories(vector(3072), float, int, text) to anon;
grant execute on function match_memories(vector(3072), float, int, text) to authenticated;
