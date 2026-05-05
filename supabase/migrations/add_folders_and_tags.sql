-- Migration: Add Folders and AI Tags
-- Create a new table for manual folder organization
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone default now()
);

-- Add folder_id and tags column to the memories table
alter table memories add column if not exists folder_id uuid references folders(id) on delete set null;
alter table memories add column if not exists tags text[] default '{}';

-- Create an index on folder_id for faster lookups
create index if not exists idx_memories_folder_id on memories(folder_id);

-- Create an index on tags for array-based searching
create index if not exists idx_memories_tags on memories using gin(tags);

-- Enable RLS on both tables (if not already enabled)
alter table folders enable row level security;
alter table memories enable row level security;

-- Add Public Access Policies (for Hackathon simplicity)
-- Note: In a production app, these would be restricted to authenticated users.

-- Folders Policies
create policy "Allow public read access on folders" on folders for select using (true);
create policy "Allow public insert access on folders" on folders for insert with check (true);
create policy "Allow public delete access on folders" on folders for delete using (true);

-- Memories Policies (Ensure existing memories table also has public access)
-- Note: We use 'on conflict do nothing' logic or similar in the DB, 
-- but here we just ensure the policies exist.
drop policy if exists "Allow public read access on memories" on memories;
create policy "Allow public read access on memories" on memories for select using (true);

drop policy if exists "Allow public insert access on memories" on memories;
create policy "Allow public insert access on memories" on memories for insert with check (true);

drop policy if exists "Allow public update access on memories" on memories;
create policy "Allow public update access on memories" on memories for update using (true);

drop policy if exists "Allow public delete access on memories" on memories;
create policy "Allow public delete access on memories" on memories for delete using (true);
