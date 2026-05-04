-- Enable pgvector if not already enabled
create extension if not exists vector;

-- Create the match_memories function for semantic search
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
    1 - (memories.embedding <=> query_embedding) as similarity
  from memories
  where 1 - (memories.embedding <=> query_embedding) > match_threshold
  order by memories.embedding <=> query_embedding
  limit match_count;
end;
$$;
