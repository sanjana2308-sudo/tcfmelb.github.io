-- Special events at a place that is not one of our campuses (e.g. "Christmas Night" at TCF Ministries,
-- Keilor East). Run once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to run more than once. supabase/schema.sql already includes this for new installs.
-- Needs supabase/add-combined-with.sql, add-sunday-service-type.sql and status-cleanup.sql first.
--
-- Adds:
--   type "Special event"
--   location          venue name, e.g. "TCF Ministries"
--   location_address  street address, e.g. "Keilor East VIC" (used for the "Get directions" link)
--   location_url      optional map or info link (https:// only)
-- An event may have no campus ("Not at a campus") when it has a location. combined_with rules unchanged.
-- Visitors (anon) can read the three new columns; updated_by (editors' emails) stays hidden.

begin;

alter table public.events add column if not exists location text
  check (location is null or char_length(btrim(location)) between 1 and 120);
alter table public.events add column if not exists location_address text
  check (location_address is null or char_length(location_address) <= 200);
alter table public.events add column if not exists location_url text
  check (location_url is null or (location_url ~ '^https://[^[:space:]]+$' and char_length(location_url) <= 500));

alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('Sunday service', 'Prayer', 'Meeting', 'Service change', 'Cancellation', 'Special event'));

-- At least one campus, unless the event has a location (the original inline check was named events_campuses_check)
alter table public.events drop constraint if exists events_campuses_check;
alter table public.events add constraint events_campuses_check
  check (cardinality(campuses) >= 1 or location is not null);

-- Visitors: the new columns only (no table-wide grant, so updated_by stays hidden)
grant select (location, location_address, location_url) on public.events to anon;

commit;

-- Check: the visitor grants (should say true, true, true, false).
select has_column_privilege('anon', 'public.events', 'location', 'SELECT')         as visitors_can_read_location,
       has_column_privilege('anon', 'public.events', 'location_address', 'SELECT') as visitors_can_read_address,
       has_column_privilege('anon', 'public.events', 'location_url', 'SELECT')     as visitors_can_read_link,
       has_column_privilege('anon', 'public.events', 'updated_by', 'SELECT')       as visitors_can_read_editor_email;
