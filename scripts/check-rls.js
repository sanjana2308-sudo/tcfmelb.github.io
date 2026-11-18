#!/usr/bin/env node
/* Security check: tries to INSERT, UPDATE and DELETE as an anonymous visitor (publishable key only)
   and reports whether each attempt was blocked. Run after supabase/schema.sql:

     node scripts/check-rls.js

   Every line must say BLOCKED: no writes, no deleted rows, no editor email addresses.
   The script only attempts harmless changes. */
'use strict';
const SB_URL = 'https://ahrwrjxlsaprqbbtjvzk.supabase.co';
const SB_KEY = 'sb_publishable_CmYHlzu_nPM0MM1SkMOOZA_uIYVYz4o';
const H = { apikey: SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function attempt(label, method, url, body, type) {
  const headers = type ? Object.assign({}, H, { 'Content-Type': type }) : H;
  const res = await fetch(SB_URL + url, { method, headers, body: body == null ? undefined : (type ? body : JSON.stringify(body)) });
  const text = await res.text();
  let rows = null; try { const j = JSON.parse(text); if (Array.isArray(j)) rows = j.length; } catch (e) { /* not JSON */ }
  const blocked = (!res.ok && !/invalid_mime_type|Bucket not found/.test(text)) || rows === 0;
  console.log(`${blocked ? 'BLOCKED' : 'ALLOWED!'}  ${label.padEnd(34)} HTTP ${res.status}  ${text.slice(0, 160)}`);
  return blocked;
}

(async () => {
  const probe = await fetch(`${SB_URL}/rest/v1/events?select=id,title&limit=1`, { headers: H });
  const sample = await probe.json();
  console.log(`read events as visitor: HTTP ${probe.status}`, JSON.stringify(sample).slice(0, 120));
  if (probe.status === 404 || (sample && sample.code === 'PGRST205')) {
    console.error('\nThe tables do not exist yet. Run supabase/schema.sql in the Supabase SQL editor first.');
    process.exit(2);
  }
  const id = Array.isArray(sample) && sample[0] ? sample[0].id : '00000000-0000-0000-0000-000000000000';
  // Visitors may read the special-event location (needed by the website). 400 = special-events.sql not run yet.
  const loc = await fetch(`${SB_URL}/rest/v1/events?select=location,location_address,location_url&limit=1`, { headers: H });
  console.log(`read event locations as visitor: HTTP ${loc.status}${loc.status === 400 ? ' (run supabase/special-events.sql)' : ''}`);
  const results = [
    await attempt('insert event', 'POST', '/rest/v1/events', { title: 'RLS test', type: 'Prayer', date: '2026-12-01', campuses: ['all'] }),
    await attempt('insert special event (no campus)', 'POST', '/rest/v1/events', { title: 'RLS test', type: 'Special event', date: '2026-12-01', campuses: [], location: 'RLS test' }),
    await attempt('change event location', 'PATCH', `/rest/v1/events?id=eq.${id}`, { location: 'RLS test' }),
    await attempt('update event', 'PATCH', `/rest/v1/events?id=eq.${id}`, { title: 'RLS test' }),
    await attempt('delete event', 'DELETE', `/rest/v1/events?id=eq.${id}`),
    await attempt('update campus time', 'PATCH', '/rest/v1/campuses?slug=eq.melton', { sunday_time: '1am' }),
    await attempt('insert gallery row', 'POST', '/rest/v1/gallery', { image_path: 'x.jpg', alt: 'x' }),
    await attempt('read soft-deleted events', 'GET', '/rest/v1/events?select=id&deleted_at=not.is.null'),
    await attempt('read editor emails (events)', 'GET', '/rest/v1/events?select=updated_by&limit=1'),
    await attempt('read editor emails (campuses)', 'GET', '/rest/v1/campuses?select=updated_by&limit=1'),
    await attempt('upload to gallery bucket', 'POST', '/storage/v1/object/gallery/rls-test.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg')
  ];
  const ok = results.every(Boolean);
  console.log(ok ? '\nEverything a visitor should not be able to do was blocked.'
    : '\nWARNING: at least one line says ALLOWED. If it is "read editor emails", run supabase/hide-editor-emails.sql.');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
