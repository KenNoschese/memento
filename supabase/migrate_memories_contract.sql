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

drop function if exists match_memories(vector(768), double precision, integer);
