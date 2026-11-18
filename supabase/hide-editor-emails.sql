-- Hide editors' email addresses (updated_by) from website visitors.
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to run more than once. supabase/schema.sql already includes this for new installs.
--
-- Before: the anon role (anyone with the public key) could read
--   /rest/v1/events?select=updated_by
-- After: that request returns "permission denied"; the website and the admin page keep working.

begin;

-- Postgres only honours column-level grants if the table-wide SELECT is removed first.
revoke select on public.events, public.campuses from anon;

grant select (id, title, type, date, time, campuses, note, deleted_at, created_at, updated_at)
  on public.events to anon;
grant select (slug, name, sunday_time, venue, address, transport_note, language, map_url, sort, updated_at)
  on public.campuses to anon;

-- Logged-in editors still see everything (unchanged, repeated here for clarity).
grant select on public.events, public.campuses to authenticated;

commit;

-- Check: both rows should say false.
select table_name, has_column_privilege('anon', 'public.' || table_name, 'updated_by', 'SELECT') as visitors_can_read_editor_email
from (values ('events'), ('campuses')) t(table_name);
