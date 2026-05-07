with ranked_auto_folders as (
  select
    id,
    user_id,
    lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) as normalized_name,
    created_at,
    first_value(id) over (
      partition by user_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
      order by created_at asc, id asc
    ) as canonical_id
  from folders
  where source = 'auto'
),
duplicate_auto_folders as (
  select id, canonical_id
  from ranked_auto_folders
  where normalized_name <> ''
    and id <> canonical_id
)
update memories
set folder_id = duplicate_auto_folders.canonical_id
from duplicate_auto_folders
where memories.folder_id = duplicate_auto_folders.id;

delete from folders
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
        order by created_at asc, id asc
      ) as rank_in_name
    from folders
    where source = 'auto'
  ) ranked
  where rank_in_name > 1
) duplicates
where folders.id = duplicates.id;

create unique index if not exists folders_user_auto_normalized_name_idx
  on folders (
    user_id,
    lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
  )
  where source = 'auto';
