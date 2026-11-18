-- Adds the "Combined service" status to events.
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to run more than once. supabase/schema.sql already includes this for new installs.
--
-- Status is stored with the existing fields plus one new column:
--   Normal           type Prayer, Meeting or Service change, combined_with empty
--   Cancelled        type Cancellation
--   Combined service type Service change, combined_with = the campus everyone joins
-- Until this has been run, the website and admin page keep working; only saving a
-- Combined service fails.

begin;

alter table public.events add column if not exists combined_with text
  references public.campuses (slug) on update cascade on delete set null;

-- A combined service must be a Service change and cannot be combined with its own campus.
alter table public.events drop constraint if exists events_combined_with_check;
alter table public.events add constraint events_combined_with_check check (
  combined_with is null or (type = 'Service change' and not (combined_with = any (campuses)))
);

-- Visitors can read the new column (they have column-level grants, so a new column
-- is not visible to them until granted). updated_by stays hidden from visitors.
grant select (combined_with) on public.events to anon;

commit;

-- Check: should say true, then false.
select has_column_privilege('anon', 'public.events', 'combined_with', 'SELECT') as visitors_can_read_combined_with,
       has_column_privilege('anon', 'public.events', 'updated_by', 'SELECT')    as visitors_can_read_editor_email;
