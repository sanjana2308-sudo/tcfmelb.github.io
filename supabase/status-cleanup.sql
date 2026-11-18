-- Status cleanup: guest speakers are regular Sunday services, and "combined" becomes an optional
-- part of a cancellation. Run once in the Supabase SQL Editor (Dashboard → SQL Editor → New query →
-- paste → Run). Safe to run more than once. supabase/schema.sql already includes this for new installs.
-- Needs supabase/add-combined-with.sql and supabase/add-sunday-service-type.sql to have been run first.
--
-- After this:
--   Normal     type Sunday service / Prayer / Meeting / Service change (a real change of time or place)
--   Cancelled  type Cancellation; combined_with (optional) = the campus everyone joins instead
--
-- No new column, so the visitor (anon) column grants don't change: visitors keep reading
-- id, title, type, date, time, campuses, note, combined_with, deleted_at, created_at, updated_at,
-- and updated_by (editors' emails) stays hidden. Updates made here keep "updated_by" as it was.

begin;

-- 1. combined_with now belongs to a cancellation (and still can't be one of the event's own campuses)
alter table public.events drop constraint if exists events_combined_with_check;

-- 2. Existing combined services (Service change + combined_with) become cancellations, combined_with kept.
--    They have no time of their own (the website shows the joined campus's time instead).
update public.events
set type = 'Cancellation', time = null
where type = 'Service change'
  and combined_with is not null;

alter table public.events add constraint events_combined_with_check check (
  combined_with is null or (type = 'Cancellation' and not (combined_with = any (campuses)))
);

-- 3. Guest speakers: "Sunday service" + a "with ..." note is a regular service, note kept
update public.events
set type = 'Sunday service'
where type = 'Service change'
  and combined_with is null
  and lower(btrim(title)) = 'sunday service'
  and btrim(note) ~* '^with\M';

commit;

-- Check: what is left as Service change or Cancellation, and the visitor grants (true, true, false).
select date, type, title, time, array_to_string(campuses, ', ') as campuses, combined_with, note
from public.events
where deleted_at is null and type in ('Service change', 'Cancellation')
order by date, time;

select has_column_privilege('anon', 'public.events', 'type', 'SELECT')          as visitors_can_read_type,
       has_column_privilege('anon', 'public.events', 'combined_with', 'SELECT') as visitors_can_read_combined_with,
       has_column_privilege('anon', 'public.events', 'updated_by', 'SELECT')    as visitors_can_read_editor_email;
