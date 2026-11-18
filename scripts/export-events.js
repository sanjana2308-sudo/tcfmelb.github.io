#!/usr/bin/env node
/* Backup: copy events, campuses and gallery details from Supabase into data/events.json,
   data/campuses.json and data/gallery.json, and work out what changed since the previous backup.

     node scripts/export-events.js

   Runs every day in GitHub Actions (.github/workflows/supabase-daily.yml), which also keeps the
   free Supabase project awake. Needs Node 20 or newer.

   Settings (environment variables, all optional locally):
     SUPABASE_URL        project URL                (default: this project)
     SUPABASE_ANON_KEY   public/publishable key     (default: this project's publishable key)
     REPORT_FILE         where to write a JSON report for scripts/daily-summary.js
     DATA_DIR            folder to write into       (default: data/)

   Only the PUBLIC key is ever used, so the backup contains what visitors can see: deleted events
   and photos are left out, and editors' email addresses (updated_by) can't be read at all.
   data/events.json keeps the older "description" and "cancelled" fields too, so it stays
   readable by Pages CMS and works as the website's fallback when Supabase cannot be reached.
   data/gallery.json holds only the photo details (file path, description, caption), not the photos. */
'use strict';
const fs = require('fs');
const path = require('path');

const SB_URL = (process.env.SUPABASE_URL || 'https://ahrwrjxlsaprqbbtjvzk.supabase.co').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_CmYHlzu_nPM0MM1SkMOOZA_uIYVYz4o';
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');

class ReadError extends Error {
  constructor(table, status, detail) {
    super(`Supabase read failed for "${table}" (HTTP ${status || 'no response'}): ${detail}`);
    this.table = table; this.status = status || 0;
  }
}

/* Refuse anything that is not a public key: a secret or service-role key must never be used here. */
function assertPublicKey(key) {
  if (!key) throw new Error('SUPABASE_ANON_KEY is empty.');
  if (/^sb_secret_/.test(key)) throw new Error('Refusing to run with a secret key. Use the publishable (public) key.');
  if (/^eyJ/.test(key)) { // legacy JWT key: check its role claim
    let role = '';
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch (e) { /* unreadable */ }
    if (role !== 'anon') throw new Error('Refusing to run: this key is not the anon (public) key.');
  }
}

async function getTable(table, query) {
  let res;
  try {
    res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SB_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
  } catch (e) {
    throw new ReadError(table, 0, e.name === 'TimeoutError' ? 'timed out' : e.message);
  }
  const text = await res.text();
  if (res.status !== 200) throw new ReadError(table, res.status, text.slice(0, 200));
  let rows;
  try { rows = JSON.parse(text); } catch (e) { throw new ReadError(table, res.status, 'response was not valid JSON'); }
  if (!Array.isArray(rows)) throw new ReadError(table, res.status, 'response was not a list');
  return rows;
}

function toEventBackup(e) {
  return {
    id: e.id,
    title: e.title,
    type: e.type,
    date: e.date,
    time: e.time || '',
    campuses: e.campuses && e.campuses.length ? e.campuses : e.location ? [] : ['all'], // [] = not at a campus
    note: e.note || '',
    combined_with: e.combined_with || null, // a cancellation combined with another campus: the campus everyone joins
    location: e.location || null,           // special events: a place that is not a campus
    location_address: e.location_address || null,
    location_url: e.location_url || null,
    description: e.note || '',            // older field name (Pages CMS / fallback)
    cancelled: e.type === 'Cancellation', // older field (Pages CMS / fallback)
    updated_at: e.updated_at
  };
}
function toCampusBackup(c) {
  const { updated_by, ...rest } = c; // never store editors' emails
  return rest;
}
function toGalleryBackup(g) {
  return { id: g.id, image_path: g.image_path, alt: g.alt, caption: g.caption || '', campuses: g.campuses && g.campuses.length ? g.campuses : ['all'], sort: g.sort, created_at: g.created_at };
}

/* ---------- what changed since the previous backup ---------- */
const s = (v) => (v == null ? '' : String(v));
const list = (v) => [].concat(v == null ? ['all'] : v).map(String).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* Events are matched by id; entries from the older format (no id) by date + title + campuses.
   The older format has no type, only "cancelled", so type is compared only when both have one. */
const EVENT_FIELDS = ['title', 'type', 'date', 'time', 'campuses', 'note', 'combined_with', 'location', 'location_address', 'location_url'];
function legacyKey(e) { return [e.date, s(e.title).trim().toLowerCase(), list(e.campuses).join(',')].join('|'); }
function eventView(e) {
  return {
    title: s(e.title), type: e.type || null, date: s(e.date).slice(0, 10), time: s(e.time),
    campuses: list(e.campuses), note: s(e.note != null ? e.note : e.description), combined_with: s(e.combined_with),
    location: s(e.location), location_address: s(e.location_address), location_url: s(e.location_url),
    cancelled: e.type ? e.type === 'Cancellation' : e.cancelled === true
  };
}
function eventFieldChanges(before, after) {
  const a = eventView(before), b = eventView(after), out = [];
  for (const f of EVENT_FIELDS) {
    if (f === 'type' && (!a.type || !b.type)) {
      if (a.cancelled !== b.cancelled) out.push({ field: 'type', before: a.type || (a.cancelled ? 'Cancellation' : 'not cancelled'), after: b.type || (b.cancelled ? 'Cancellation' : 'not cancelled') });
      continue;
    }
    if (!same(a[f], b[f])) out.push({ field: f, before: a[f], after: b[f] });
  }
  return out;
}
function diffEvents(previous, current) {
  const prev = Array.isArray(previous) ? previous : [];
  const byId = new Map(prev.filter((e) => e.id).map((e) => [e.id, e]));
  const byLegacy = new Map(prev.filter((e) => !e.id).map((e) => [legacyKey(e), e]));
  const matched = new Set();
  const details = { added: [], changed: [], removed: [] };
  for (const e of current) {
    const old = (e.id && byId.get(e.id)) || byLegacy.get(legacyKey(e));
    if (!old || matched.has(old)) { details.added.push(e); continue; }
    matched.add(old);
    const fields = eventFieldChanges(old, e);
    if (fields.length) details.changed.push({ event: e, fields });
  }
  details.removed = prev.filter((e) => !matched.has(e));
  return { added: details.added.length, changed: details.changed.length, removed: details.removed.length, firstBackup: !prev.length, details };
}

const CAMPUS_FIELDS = ['name', 'sunday_time', 'venue', 'address', 'transport_note', 'language', 'map_url'];
function diffCampuses(previous, current) {
  if (!Array.isArray(previous) || !previous.length) return { firstBackup: true, added: [], removed: [], changed: [] };
  const old = new Map(previous.map((c) => [c.slug, c]));
  const now = new Map(current.map((c) => [c.slug, c]));
  const out = { firstBackup: false, added: [], removed: [], changed: [] };
  for (const c of current) {
    const p = old.get(c.slug);
    if (!p) { out.added.push(c); continue; }
    const fields = CAMPUS_FIELDS.filter((f) => s(p[f]) !== s(c[f])).map((f) => ({ field: f, before: s(p[f]), after: s(c[f]) }));
    if (fields.length) out.changed.push({ campus: c, fields });
  }
  out.removed = previous.filter((c) => !now.has(c.slug));
  return out;
}

function diffGallery(previous, current) {
  if (!Array.isArray(previous)) return { firstBackup: true, added: [], removed: [], changed: [], reordered: false };
  const old = new Map(previous.map((g) => [g.id, g]));
  const now = new Map(current.map((g) => [g.id, g]));
  const out = { firstBackup: false, added: [], removed: [], changed: [], reordered: false };
  for (const g of current) {
    const p = old.get(g.id);
    if (!p) { out.added.push(g); continue; }
    const fields = ['alt', 'caption', 'campuses'].filter((f) => !same(f === 'campuses' ? list(p[f]) : s(p[f]), f === 'campuses' ? list(g[f]) : s(g[f])))
      .map((f) => ({ field: f, before: f === 'campuses' ? list(p[f]) : s(p[f]), after: f === 'campuses' ? list(g[f]) : s(g[f]) }));
    if (fields.length) out.changed.push({ photo: g, fields });
  }
  out.removed = previous.filter((g) => !now.has(g.id));
  // Order changed if the photos present both times are now in a different sequence.
  const order = (arr) => arr.filter((g) => old.has(g.id) && now.has(g.id)).sort((a, b) => a.sort - b.sort).map((g) => g.id);
  out.reordered = !same(order(previous), order(current));
  return out;
}

/* ---------- files ---------- */
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}
function write(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file); // replace in one step so a failed run never leaves half a file
}
function report(obj) {
  if (process.env.REPORT_FILE) fs.writeFileSync(process.env.REPORT_FILE, JSON.stringify(obj, null, 2));
}

async function main() {
  if (process.env.GITHUB_ACTIONS && (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)) {
    throw new ReadError('events', 0, 'repository variables SUPABASE_URL and SUPABASE_ANON_KEY are not set');
  }
  assertPublicKey(SB_KEY);
  const readEvents = (extras) => getTable('events', `select=id,title,type,date,time,campuses,note${extras[0] ? ',' + extras[0] : ''},updated_at&deleted_at=is.null&order=date.asc,time.asc`)
    .catch((e) => { if (e.status === 400 && extras.length > 1) return readEvents(extras.slice(1)); throw e; });
  const [events, campuses, gallery] = await Promise.all([
    // The location columns exist once supabase/special-events.sql has been run, combined_with once
    // add-combined-with.sql has: until then read with fewer columns (HTTP 400 = unknown column).
    readEvents(['combined_with,location,location_address,location_url', 'combined_with', '']),
    getTable('campuses', 'select=slug,name,sunday_time,venue,address,transport_note,language,map_url,sort,updated_at&order=sort.asc'),
    getTable('gallery', 'select=id,image_path,alt,caption,campuses,sort,created_at&deleted_at=is.null&order=sort.asc,created_at.desc')
  ]);
  if (!campuses.length) throw new ReadError('campuses', 200, 'no campuses returned (has supabase/schema.sql been run?)');

  const files = { events: path.join(DATA, 'events.json'), campuses: path.join(DATA, 'campuses.json'), gallery: path.join(DATA, 'gallery.json') };
  const data = { events: events.map(toEventBackup), campuses: campuses.map(toCampusBackup), gallery: gallery.map(toGalleryBackup) };
  const changes = diffEvents(readJSON(files.events), data.events);
  const campusChanges = diffCampuses(readJSON(files.campuses), data.campuses);
  const galleryChanges = diffGallery(readJSON(files.gallery), data.gallery);
  write(files.events, data.events);
  write(files.campuses, data.campuses);
  write(files.gallery, data.gallery);
  console.log(`Backed up ${data.events.length} events, ${data.campuses.length} campuses and ${data.gallery.length} photos ` +
    `(events: ${changes.added} added, ${changes.changed} changed, ${changes.removed} removed).`);
  report({ ok: true, events: data.events, campuses: data.campuses, gallery: data.gallery, changes, campusChanges, galleryChanges });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Export failed:', err.message);
    report({ ok: false, status: err.status || 0, table: err.table || '', error: err.message });
    process.exit(1);
  });
}

module.exports = { diffEvents, diffCampuses, diffGallery, toEventBackup, toCampusBackup, toGalleryBackup, assertPublicKey };
