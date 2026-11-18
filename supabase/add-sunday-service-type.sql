-- Adds the event type "Sunday service" for regular Sunday services (shown without a type badge),
-- and converts the existing regular services to it.
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to run more than once. supabase/schema.sql already includes this for new installs.
--
-- No new column, so the visitor (anon) column grants don't change: visitors keep reading
-- id, title, type, date, time, campuses, note, combined_with, deleted_at, created_at, updated_at,
-- and updated_by (editors' emails) stays hidden.
-- Running updates here doesn't change "updated_by" (there is no editor email in the SQL Editor);
-- "updated_at" becomes now.

begin;

-- 1. Allow the new type (the original constraint was created inline, so Postgres named it events_type_check)
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('Sunday service', 'Prayer', 'Meeting', 'Service change', 'Cancellation'));

-- 2. Imported regular services: title "Sunday service", type Meeting
update public.events
set type = 'Sunday service'
where type = 'Meeting'
  and lower(btrim(title)) = 'sunday service';

-- 3. The 29 November youth-led services: Service change → Sunday service, note kept
update public.events
set type = 'Sunday service'
where type = 'Service change'
  and date = '2026-11-29'
  and combined_with is null
  and btrim(note) = 'Conducted by Youth / Sunday School Seniors';

commit;

-- Check: types per Sunday, and the visitor grants (should say true, true, false).
select date, type, count(*) as services, string_agg(array_to_string(campuses, ','), ' ' order by time) as campuses
from public.events
where lower(btrim(title)) = 'sunday service' and deleted_at is null
group by date, type
order by date, type;

select has_column_privilege('anon', 'public.events', 'type', 'SELECT')          as visitors_can_read_type,
       has_column_privilege('anon', 'public.events', 'combined_with', 'SELECT') as visitors_can_read_combined_with,
       has_column_privilege('anon', 'public.events', 'updated_by', 'SELECT')    as visitors_can_read_editor_email;
