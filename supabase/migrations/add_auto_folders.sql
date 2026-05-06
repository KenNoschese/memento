-- Migration: Distinguish automatic folders from manual folders.

alter table folders
  add column if not exists source text;

update folders
set source = 'manual'
where source is null;

alter table folders
  alter column source set default 'manual';

alter table folders
  alter column source set not null;

alter table folders
  add column if not exists auto_key text;

alter table folders
  drop constraint if exists folders_source_check;

alter table folders
  add constraint folders_source_check
  check (source in ('manual', 'auto'));

create unique index if not exists folders_user_auto_key_idx
  on folders(user_id, auto_key)
  where source = 'auto' and auto_key is not null;
