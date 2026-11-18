-- =====================================================================
-- Tamil Christian Fellowship Melbourne — Supabase schema
--
-- Run this whole file once in the Supabase dashboard:
--   SQL Editor → New query → paste → Run.
-- It is safe to run again: tables, policies and seed rows are only
-- created when they do not exist yet, and existing data is never removed.
--
-- Security model
--   * The website uses only the PUBLISHABLE key (role "anon").
--     Visitors can read events, campuses and gallery photos, nothing else.
--   * Editors log in on /admin/ (role "authenticated") and can add,
--     change and soft-delete rows.
--   * Sign-ups must be turned OFF in the dashboard, so the only
--     "authenticated" users are the editors you invite yourself.
--   * Nothing is ever hard-deleted from the admin page: "Delete" sets
--     deleted_at, so it can be restored (the free plan has no backups).
-- =====================================================================



-- ---------------------------------------------------------------------
-- Shared trigger: stamps updated_at and updated_by (the editor's email,
-- taken from their login token, so it cannot be faked from the browser).
-- When run from the SQL editor there is no login token, so any value
-- supplied in the statement (e.g. by the seed below) is kept.
-- ---------------------------------------------------------------------
create or replace function public.tcf_stamp_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  editor text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
begin
  new.updated_at := now();
  if editor is not null then
    new.updated_by := editor;
  end if;
  return new;
end;
$$;


-- =====================================================================
-- EVENTS
-- =====================================================================
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  type        text not null check (type in ('Sunday service', 'Prayer', 'Meeting', 'Service change', 'Cancellation', 'Special event')),
  date        date not null,
  time        text check (time is null or char_length(time) <= 40),
  campuses    text[] not null default '{all}' check (cardinality(campuses) >= 1),
  note        text check (note is null or char_length(note) <= 500),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Allowed types. Repeated as a named constraint so re-running this file upgrades older projects.
--   Prayer, Meeting gatherings
--   Sunday service  a regular Sunday service, also with a guest speaker ("with Ps Name (Guest Speaker, Country)")
--   Service change  a real one-off change of time or place
--   Cancellation    shown as "Cancelled"; optionally combined_with another campus
--   Special event   at a place that is not a campus (location below), e.g. "Christmas Night"
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('Sunday service', 'Prayer', 'Meeting', 'Service change', 'Cancellation', 'Special event'));

-- Location of an event that is not at a campus (special events). With a location, no campus is needed.
alter table public.events add column if not exists location text
  check (location is null or char_length(btrim(location)) between 1 and 120);
alter table public.events add column if not exists location_address text
  check (location_address is null or char_length(location_address) <= 200);
alter table public.events add column if not exists location_url text
  check (location_url is null or (location_url ~ '^https://[^[:space:]]+$' and char_length(location_url) <= 500));
alter table public.events drop constraint if exists events_campuses_check;
alter table public.events add constraint events_campuses_check
  check (cardinality(campuses) >= 1 or location is not null);

create index if not exists events_date_idx on public.events (date) where deleted_at is null;

drop trigger if exists events_stamp on public.events;
create trigger events_stamp
  before insert or update on public.events
  for each row execute function public.tcf_stamp_row();


-- =====================================================================
-- CAMPUSES (regular Sunday service details for each campus)
-- =====================================================================
create table if not exists public.campuses (
  slug            text primary key check (slug ~ '^[a-z0-9-]+$'),
  name            text not null check (char_length(name) between 1 and 60),
  sunday_time     text not null check (char_length(sunday_time) between 1 and 20),
  venue           text not null check (char_length(venue) <= 120),
  address         text not null check (char_length(address) <= 160),
  transport_note  text check (transport_note is null or char_length(transport_note) <= 200),
  language        text check (language is null or char_length(language) <= 80),
  map_url         text check (map_url is null or map_url ~ '^https://'),
  sort            integer not null default 0,
  updated_at      timestamptz not null default now(),
  updated_by      text
);

drop trigger if exists campuses_stamp on public.campuses;
create trigger campuses_stamp
  before insert or update on public.campuses
  for each row execute function public.tcf_stamp_row();


-- =====================================================================
-- EVENTS: combined services (needs the campuses table above)
-- =====================================================================
-- Status: Normal = any type except Cancellation; Cancelled = type Cancellation.
-- A cancellation can be "combined with" another campus (combined_with): its people join that campus.
-- (Added after the first release, so "add column if not exists" also upgrades existing projects.)
alter table public.events add column if not exists combined_with text
  references public.campuses (slug) on update cascade on delete set null;
alter table public.events drop constraint if exists events_combined_with_check;
-- Older projects: combined services were stored as Service change + combined_with
update public.events set type = 'Cancellation', time = null where type = 'Service change' and combined_with is not null;
alter table public.events add constraint events_combined_with_check check (
  combined_with is null or (type = 'Cancellation' and not (combined_with = any (campuses)))
);


-- =====================================================================
-- GALLERY (one row per photo; the file itself lives in Storage)
-- =====================================================================
create table if not exists public.gallery (
  id          uuid primary key default gen_random_uuid(),
  image_path  text not null check (image_path ~ '^[A-Za-z0-9/_.-]+$'),
  alt         text not null check (char_length(btrim(alt)) between 1 and 250),
  caption     text check (caption is null or char_length(caption) <= 250),
  campuses    text[] not null default '{all}' check (cardinality(campuses) >= 1),
  sort        integer not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists gallery_sort_idx on public.gallery (sort) where deleted_at is null;


-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.events   enable row level security;
alter table public.campuses enable row level security;
alter table public.gallery  enable row level security;

-- ----- events -----

-- Visitors (anon): may read events that have not been deleted.
drop policy if exists "events: public can read live rows" on public.events;
create policy "events: public can read live rows"
  on public.events for select to anon
  using (deleted_at is null);

-- Editors (logged in): may read every event, including soft-deleted ones,
-- so the admin page can show the "Recently deleted" list and restore them.
drop policy if exists "events: editors can read all rows" on public.events;
create policy "events: editors can read all rows"
  on public.events for select to authenticated
  using (true);

-- Editors (logged in): may add events. Visitors cannot.
drop policy if exists "events: editors can insert" on public.events;
create policy "events: editors can insert"
  on public.events for insert to authenticated
  with check (true);

-- Editors (logged in): may change events, including soft delete and restore
-- (setting or clearing deleted_at). Visitors cannot.
drop policy if exists "events: editors can update" on public.events;
create policy "events: editors can update"
  on public.events for update to authenticated
  using (true) with check (true);

-- Editors (logged in): may permanently delete an event. The admin page never
-- does this (it soft-deletes), but it is allowed for clean-ups. Visitors cannot.
drop policy if exists "events: editors can delete" on public.events;
create policy "events: editors can delete"
  on public.events for delete to authenticated
  using (true);

-- ----- campuses -----

-- Everyone (visitors and editors): may read campus details. Campuses are
-- never soft-deleted, so every row is readable.
drop policy if exists "campuses: anyone can read" on public.campuses;
create policy "campuses: anyone can read"
  on public.campuses for select to anon, authenticated
  using (true);

-- Editors (logged in): may add a campus. Visitors cannot.
drop policy if exists "campuses: editors can insert" on public.campuses;
create policy "campuses: editors can insert"
  on public.campuses for insert to authenticated
  with check (true);

-- Editors (logged in): may change service times, venue, address, etc. Visitors cannot.
drop policy if exists "campuses: editors can update" on public.campuses;
create policy "campuses: editors can update"
  on public.campuses for update to authenticated
  using (true) with check (true);

-- Editors (logged in): may remove a campus. Visitors cannot.
drop policy if exists "campuses: editors can delete" on public.campuses;
create policy "campuses: editors can delete"
  on public.campuses for delete to authenticated
  using (true);

-- ----- gallery -----

-- Visitors (anon): may read photos that have not been deleted.
drop policy if exists "gallery: public can read live rows" on public.gallery;
create policy "gallery: public can read live rows"
  on public.gallery for select to anon
  using (deleted_at is null);

-- Editors (logged in): may read every photo row, including soft-deleted ones,
-- for the "Recently deleted" list and Restore.
drop policy if exists "gallery: editors can read all rows" on public.gallery;
create policy "gallery: editors can read all rows"
  on public.gallery for select to authenticated
  using (true);

-- Editors (logged in): may add photos. Visitors cannot.
drop policy if exists "gallery: editors can insert" on public.gallery;
create policy "gallery: editors can insert"
  on public.gallery for insert to authenticated
  with check (true);

-- Editors (logged in): may change alt text, caption, campus, order, and
-- soft-delete or restore. Visitors cannot.
drop policy if exists "gallery: editors can update" on public.gallery;
create policy "gallery: editors can update"
  on public.gallery for update to authenticated
  using (true) with check (true);

-- Editors (logged in): may permanently delete a photo row. Visitors cannot.
drop policy if exists "gallery: editors can delete" on public.gallery;
create policy "gallery: editors can delete"
  on public.gallery for delete to authenticated
  using (true);


-- =====================================================================
-- GRANTS
-- "Automatically expose new tables" is off for this project, so the API
-- roles get nothing unless granted here. Start from nothing, then grant:
--   anon          → SELECT only, never updated_by (RLS above limits it to live rows)
--   authenticated → SELECT, INSERT, UPDATE, DELETE (RLS still applies)
-- =====================================================================
grant usage on schema public to anon, authenticated;

revoke all on public.events, public.campuses, public.gallery from anon, authenticated;

-- Editors (authenticated) can read every column, including updated_by.
grant select on public.events, public.campuses, public.gallery to authenticated;
grant insert, update, delete on public.events, public.campuses, public.gallery to authenticated;

-- Visitors (anon) can read only the columns the website needs. updated_by holds
-- the editor's email address, so it is deliberately NOT granted: a visitor who
-- asks for it, or for select=*, gets "permission denied".
grant select (id, title, type, date, time, campuses, note, combined_with, location, location_address, location_url,
              deleted_at, created_at, updated_at)
  on public.events to anon;
grant select (slug, name, sunday_time, venue, address, transport_note, language, map_url, sort, updated_at)
  on public.campuses to anon;
grant select on public.gallery to anon;  -- has no editor column

revoke all on function public.tcf_stamp_row() from public, anon, authenticated;


-- =====================================================================
-- STORAGE: public-read bucket "gallery"
-- Anyone can view the photos by their public URL. Only logged-in editors
-- can upload, replace or remove files. 2 MB limit; JPEG, PNG or WebP only.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Editors (logged in): may list/read file records in the gallery bucket
-- (needed by the upload API). Visitors get the photos through the public
-- URL instead, which does not need a policy, so they cannot list the bucket.
drop policy if exists "gallery files: editors can read" on storage.objects;
create policy "gallery files: editors can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'gallery');

-- Editors (logged in): may upload files into the gallery bucket. Visitors cannot.
drop policy if exists "gallery files: editors can upload" on storage.objects;
create policy "gallery files: editors can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery');

-- Editors (logged in): may replace files in the gallery bucket. Visitors cannot.
drop policy if exists "gallery files: editors can update" on storage.objects;
create policy "gallery files: editors can update"
  on storage.objects for update to authenticated
  using (bucket_id = 'gallery') with check (bucket_id = 'gallery');

-- Editors (logged in): may remove files from the gallery bucket. Visitors cannot.
drop policy if exists "gallery files: editors can delete" on storage.objects;
create policy "gallery files: editors can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'gallery');


-- =====================================================================
-- SEED: the five campuses, copied from the current campus pages.
-- Existing rows are left alone, so edits made in /admin/ are never overwritten.
-- =====================================================================
insert into public.campuses (slug, name, sunday_time, venue, address, transport_note, language, map_url, sort, updated_by) values
  ('melton',     'Melton',     '9:30am', 'Melton Seniors Community and Learning Centre', '1 McKenzie St, Melton VIC 3337',        '~10mins by bus from Melton Station',         'Tamil · English interpretation', 'https://goo.gl/maps/uk894wFGkuztXfcp6',      1, 'initial import'),
  ('mernda',     'Mernda',     '10am',   'Mernda Central College (Community Hub)',       '70 Breadalbane Ave, Mernda VIC 3754',   '~3mins by bus from Mernda Station',          'Tamil · English interpretation', 'https://maps.app.goo.gl/EyPxqa8zUrCBKGkk6', 2, 'initial import'),
  ('sunshine',   'Sunshine',   '4pm',    'Sunshine Uniting Church',                      '32 Withers St, Sunshine VIC 3020',      '~200 metres from Sunshine Railway Station',  'Tamil · English interpretation', 'https://goo.gl/maps/8un4HzaqzprCLfLQ8',      3, 'initial import'),
  ('tarneit',    'Tarneit',    '4:30pm', 'Tarneit Community Learning Centre',            '150 Sunset Views Blvd, Tarneit VIC 3029', '~5min walk from Tarneit Station',          'Bilingual · English & Tamil',    'https://maps.app.goo.gl/EoxARXwt6qY5FwAV8', 4, 'initial import'),
  ('noble-park', 'Noble Park', '5pm',    'Ukrainian Community Centre',                   '26 Chandler Rd, Noble Park VIC 3174',   '~10min by bus from Noble Park Station',      'Bilingual · English & Tamil',    'https://maps.app.goo.gl/ozATNoLdJJk1gKda7', 5, 'initial import')
on conflict (slug) do nothing;


-- =====================================================================
-- SEED: events, copied from data/events.json.
-- Only runs while the events table is empty, so running this file again
-- never duplicates events. Type mapping used for the old entries:
--   cancelled = true                         → Cancellation
--   "Sunday service" (also with a guest speaker) → Sunday service
--   title mentions prayer                     → Prayer
--   everything else                           → Meeting
-- =====================================================================
insert into public.events (title, type, date, time, campuses, note, updated_by)
select v.title, v.type, v.date, v.time, v.campuses, v.note, 'initial import'
from (values
  ('Sunday service', 'Sunday service', '2026-11-08'::date, '9:30am', array['melton']::text[], null),
  ('Sunday service', 'Sunday service', '2026-11-08'::date, '10am', array['mernda']::text[], 'with Ps Jenistan (Guest Speaker – France)'),
  ('Sunday service', 'Sunday service', '2026-11-08'::date, '4pm', array['sunshine']::text[], null),
  ('Sunday service', 'Sunday service', '2026-11-08'::date, '4:30pm', array['tarneit']::text[], null),
  ('Sunday service', 'Sunday service', '2026-11-08'::date, '5pm', array['noble-park']::text[], null),
  ('Sunday service', 'Cancellation', '2026-11-15'::date, '9:30am', array['melton']::text[], null),
  ('Sunday service', 'Sunday service', '2026-11-15'::date, '10am', array['mernda']::text[], 'with Evg. Stephen (Guest Speaker – India)'),
  ('Sunday service', 'Sunday service', '2026-11-15'::date, '4pm', array['sunshine']::text[], 'with Evg. Stephen (Guest Speaker – India)'),
  ('Sunday service', 'Cancellation', '2026-11-15'::date, '4:30pm', array['tarneit']::text[], null),
  ('Sunday service', 'Sunday service', '2026-11-15'::date, '5pm', array['noble-park']::text[], null),
  ('Sunday service', 'Sunday service', '2026-11-22'::date, '9:30am', array['melton']::text[], null),
  ('Sunday service', 'Sunday service', '2026-11-22'::date, '10am', array['mernda']::text[], 'with Ps Pitchaiah (Guest Speaker – India)'),
  ('Sunday service', 'Sunday service', '2026-11-22'::date, '4pm', array['sunshine']::text[], 'with Ps Pitchaiah (Guest Speaker – India)'),
  ('Sunday service', 'Sunday service', '2026-11-22'::date, '4:30pm', array['tarneit']::text[], null),
  ('Sunday service', 'Sunday service', '2026-11-22'::date, '5pm', array['noble-park']::text[], null),
  ('Sunday service', 'Sunday service', '2026-11-29'::date, '9:30am', array['melton']::text[], 'Conducted by Youth / Sunday School Seniors'),
  ('Sunday service', 'Sunday service', '2026-11-29'::date, '10am', array['mernda']::text[], 'Conducted by Youth / Sunday School Seniors'),
  ('Sunday service', 'Sunday service', '2026-11-29'::date, '4pm', array['sunshine']::text[], 'Conducted by Youth / Sunday School Seniors'),
  ('Sunday service', 'Sunday service', '2026-11-29'::date, '4:30pm', array['tarneit']::text[], 'Conducted by Youth / Sunday School Seniors'),
  ('Sunday service', 'Sunday service', '2026-11-29'::date, '5pm', array['noble-park']::text[], 'Conducted by Youth / Sunday School Seniors'),
  ('Fellowship Groups', 'Meeting', '2026-11-21'::date, '4:30pm', array['sunshine']::text[], 'Youth, Men''s and Women''s Meetings'),
  ('Fasting & Prayer', 'Prayer', '2026-10-31'::date, '9am', array['sunshine']::text[], 'with Bro Wesley Maxwell (Guest Speaker from India)'),
  ('An Evening of Worship and Word', 'Meeting', '2026-10-29'::date, 'from 6:30pm', array['sunshine']::text[], 'With Bro Wesley Maxwell (Gospel Singer/Evangelist from India)')
) as v(title, type, date, time, campuses, note)
where not exists (select 1 from public.events);
