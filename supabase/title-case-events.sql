-- Title Case for event titles: "Sunday service" → "Sunday Service", "Prayer meeting" → "Prayer Meeting".
-- Run once in the Supabase SQL Editor. Safe to run again (titles already in Title Case are left alone).
--
-- The website, admin page and daily email already SHOW titles in Title Case (titleCase in main.js), and the
-- admin page SAVES new titles that way, so this only tidies the titles already stored. It uses the same rule:
--   * every word starts with a capital letter; only first letters are raised (TCF, ACC, McKenzie stay as typed)
--   * short joining words stay lowercase unless they are the first or last word, or follow ":" "–" "—" "·" "|":
--     a, an, and, at, by, for, in, of, on, or, the, to, with
--   * a word that starts lowercase with capitals later (iPad), times (9:30am), emails and links are left alone
-- Soft-deleted events are tidied too, so a restored event matches. Editors' names (updated_by) are kept.

create or replace function pg_temp.tcf_title_case(t text) returns text
language plpgsql immutable as $fn$
declare
  r record;
  result text := '';
  is_first boolean := true;
  next_first boolean;
  w text; pre text; core text; bare text;
  small text[] := array['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'];
begin
  if t is null then return null; end if;
  for r in
    select x.m[1] as ws, x.m[2] as word, x.ord, count(*) over () as total
    from regexp_matches(t, '(\s*)(\S+)', 'g') with ordinality as x(m, ord)
    order by x.ord
  loop
    w := r.word;
    next_first := w ~ '[:–—·|]$';
    pre := substring(w from '^[("''“‘\[]*');
    core := substr(w, char_length(pre) + 1);
    if core = '' or core ~* '@|://|^www\.' or core !~ '^[A-Za-zÀ-ÿ]' then
      null;                                                           -- times, emails, links, symbols
    else
      bare := regexp_replace(core, '[^A-Za-zÀ-ÿ]+$', '');
      if not is_first and r.ord < r.total and lower(bare) = any (small)
         and not (char_length(bare) > 1 and bare = upper(bare)) then
        w := pre || lower(core);                                      -- "and", "of", "the" …
      elsif core ~ '^[a-zß-ÿ]' and substr(core, 2) ~ '[A-ZÀ-Þ]' then
        null;                                                         -- iPad, eBay
      else
        w := pre || upper(left(core, 1)) || substr(core, 2);
      end if;
    end if;
    result := result || r.ws || w;
    is_first := next_first;
  end loop;
  return result || coalesce(substring(t from '\s+$'), '');
end
$fn$;

-- 1. Preview: the titles that will change
select date, title as before, pg_temp.tcf_title_case(title) as after
from public.events
where title is distinct from pg_temp.tcf_title_case(title)
order by date, title;

-- 2. Update them
begin;
update public.events
set title = pg_temp.tcf_title_case(title)
where title is distinct from pg_temp.tcf_title_case(title);
commit;

-- 3. Check: should return no rows
select date, title from public.events where title is distinct from pg_temp.tcf_title_case(title);
