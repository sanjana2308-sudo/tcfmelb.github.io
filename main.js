/* Tamil Christian Fellowship Melbourne — shared site script (every page).
   Header, mobile menu, reveal motion, desktop pointer effects, announcement bar, events, service times,
   "This week" notices, gallery and copy buttons.
   Events, service times and gallery photos are read live from Supabase (edited on the admin page);
   the announcement bar comes from /data/announcement.json. */
(function () {
  'use strict';

  /* ---------- Title Case: one shared rule for the website, the admin page and the daily email ----------
     "sunday service" → "Sunday Service", "prayer meeting at noble park" → "Prayer Meeting at Noble Park".
     Every word starts with a capital, except short joining words (unless first, last, or after ":" "–" "—" "·" "|").
     Only first letters are raised: TCF, ACC, McKenzie and "Ps" stay as typed; a word that starts lowercase
     but has capitals later (iPad) is left alone, as are times (9:30am), emails and links.
     supabase/title-case-events.sql applies the same rule to stored titles. */
  var SMALL_WORDS = ['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'];
  function titleCase(s) {
    var first = true;
    return String(s == null ? '' : s).replace(/\S+/g, function (w, at, all) {
      var isFirst = first, isLast = !/\S/.test(all.slice(at + w.length));
      first = /[:–—·|]$/.test(w);          // the next word starts a new part
      var m = /^([("'“‘\[]*)([\s\S]*)$/.exec(w), pre = m[1], core = m[2];
      if (!core || /@|:\/\/|^www\./i.test(core) || !/^[A-Za-zÀ-ÿ]/.test(core)) return w;
      var bare = core.replace(/[^A-Za-zÀ-ÿ]+$/, '');
      if (!isFirst && !isLast && SMALL_WORDS.indexOf(bare.toLowerCase()) > -1 && !(bare.length > 1 && bare === bare.toUpperCase())) return pre + core.toLowerCase();
      if (/^[a-zß-ÿ]/.test(core) && /[A-ZÀ-Þ]/.test(core.slice(1))) return w; // iPad, eBay
      return pre + core.charAt(0).toUpperCase() + core.slice(1);
    });
  }
  // Node (scripts/daily-summary.js): export the shared helper only
  if (typeof document === 'undefined') {
    if (typeof module === 'object' && module.exports) module.exports = { titleCase: titleCase, SMALL_WORDS: SMALL_WORDS };
    return;
  }
  window.tcfTitleCase = titleCase;
  // The admin page loads this file with data-shared, for the helper only (none of the public-site code runs)
  if (document.currentScript && document.currentScript.hasAttribute('data-shared')) return;


  var CAMPUSES = [
    { slug: 'melton', name: 'Melton' },
    { slug: 'mernda', name: 'Mernda' },
    { slug: 'sunshine', name: 'Sunshine' },
    { slug: 'tarneit', name: 'Tarneit' },
    { slug: 'noble-park', name: 'Noble Park' }
  ];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var root = document.documentElement;
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobile-menu');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }

  /* ---------- Header + hero parallax ---------- */
  var heroMedia = document.querySelector('.hero__media');
  var hero = document.querySelector('.hero');
  var heroH = hero ? hero.offsetHeight : 0;
  var announce = null;
  var annH = 0;
  var ticking = false;
  function onScroll() {
    var y = window.scrollY;
    var menuOpen = menu && !menu.hidden;
    if (header) {
      header.classList.toggle('is-solid', y > 24 || menuOpen);
      header.classList.toggle('is-compact', y > 120 && !menuOpen && !reduce.matches);
    }
    if (announce) root.style.setProperty('--ann', Math.max(0, annH - y) + 'px');
    if (heroMedia) {
      heroMedia.style.transform = (reduce.matches || y > heroH) ? '' : 'translate3d(0,' + (y * 0.15).toFixed(1) + 'px,0)';
    }
    fxParallax();
    ticking = false;
  }

  /* ---------- Section backgrounds (.bgfx) ----------
     Animations run only while a section is on screen and the tab is visible
     (CSS pauses .bgfx without .is-live). Parallax moves [data-depth] layers with
     transforms only, at 768px and wider, and never with reduced motion. */
  var fxWide = window.matchMedia('(min-width: 768px)');
  var fxBoxes = [];
  var fxOn = false;
  function fxParallax() {
    var on = fxWide.matches && !reduce.matches;
    if (!on && !fxOn) return;
    var vh = window.innerHeight;
    for (var i = 0; i < fxBoxes.length; i++) {
      var b = fxBoxes[i];
      if (!on) { b.layers.forEach(function (l) { l.style.transform = ''; }); continue; }
      if (!b.visible) continue;
      var r = b.el.getBoundingClientRect();
      var off = (r.top + r.height / 2) - vh / 2;
      b.layers.forEach(function (l) {
        l.style.transform = 'translate3d(0,' + (off * -l._depth).toFixed(1) + 'px,0)';
      });
    }
    fxOn = on;
  }
  (function initFx() {
    var nodes = document.querySelectorAll('.bgfx');
    if (!nodes.length) return;
    nodes.forEach(function (el) {
      var layers = Array.prototype.slice.call(el.querySelectorAll('[data-depth]'));
      layers.forEach(function (l) { l._depth = parseFloat(l.getAttribute('data-depth')) || 0; });
      fxBoxes.push({ el: el, layers: layers, visible: false });
    });
    function sync() {
      fxBoxes.forEach(function (b) { b.el.classList.toggle('is-live', b.visible && !document.hidden); });
    }
    if ('IntersectionObserver' in window) {
      var fio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          for (var i = 0; i < fxBoxes.length; i++) if (fxBoxes[i].el === en.target) fxBoxes[i].visible = en.isIntersecting;
        });
        sync();
        fxParallax();
      }, { rootMargin: '120px 0px' });
      fxBoxes.forEach(function (b) { fio.observe(b.el); });
    } else {
      fxBoxes.forEach(function (b) { b.visible = true; });
      sync();
    }
    document.addEventListener('visibilitychange', sync);
    fxWide.addEventListener('change', fxParallax);
    reduce.addEventListener('change', fxParallax);
  })();
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener('resize', function () {
    heroH = hero ? hero.offsetHeight : 0;
    if (announce) annH = announce.offsetHeight;
    onScroll();
  }, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  if (toggle && menu) {
    var setMenu = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
      onScroll();
    };
    toggle.addEventListener('click', function () { setMenu(menu.hidden); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { setMenu(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 60rem)').addEventListener('change', function (e) { if (e.matches) setMenu(false); });
  }

  /* ---------- Dropdowns (Services menu, "Change campus") ----------
     Native <details> already works with keyboard and touch. This adds: only one open
     at a time, close on outside click/tap, close when focus leaves, and Escape to close. */
  var drops = Array.prototype.slice.call(document.querySelectorAll('details[data-drop]'));
  function closeDrop(d, focus) {
    if (!d.open) return;
    d.open = false;
    if (focus) d.querySelector('summary').focus();
  }
  drops.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) drops.forEach(function (o) { if (o !== d) closeDrop(o); });
    });
    d.addEventListener('focusout', function (e) {
      if (e.relatedTarget && !d.contains(e.relatedTarget)) closeDrop(d);
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && d.open) { e.stopPropagation(); closeDrop(d, true); }
    });
  });
  document.addEventListener('click', function (e) {
    drops.forEach(function (d) { if (!d.contains(e.target)) closeDrop(d); });
  });

  /* ---------- Latest message: click-to-load YouTube (youtube-nocookie.com) ----------
     Nothing is requested from YouTube until the button is pressed. If the player cannot load
     (offline, blocked, or no response), the player area is removed and only the
     "Watch all messages" button remains. */
  document.querySelectorAll('[data-yt-list]').forEach(function (box) {
    var btn = box.querySelector('.watch__facade');
    if (!btn) return;
    function fail() {
      var section = box.closest('section');
      var fallback = section && section.querySelector('.section-foot a');
      var hadFocus = box.contains(document.activeElement);
      box.remove();
      if (hadFocus && fallback) fallback.focus();
    }
    btn.addEventListener('click', function () {
      if (navigator.onLine === false) { fail(); return; }
      var list = box.getAttribute('data-yt-list');
      if (!/^[A-Za-z0-9_-]+$/.test(list)) { fail(); return; }
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/videoseries?list=' + list + '&autoplay=1&rel=0&modestbranding=1';
      f.title = 'Latest message — Tamil Christian Fellowship Melbourne on YouTube';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      var timer = setTimeout(fail, 15000);
      f.addEventListener('load', function () { clearTimeout(timer); });
      f.addEventListener('error', function () { clearTimeout(timer); fail(); });
      box.replaceChild(f, btn);
      f.focus();
    });
  });

  /* ---------- Announcement bar (/data/announcement.json) ---------- */
  getJSON('/data/announcement.json').then(function (a) {
    if (!a || !a.enabled || !a.text) return;
    announce = document.createElement('div');
    announce.className = 'announce';
    announce.setAttribute('role', 'region');
    announce.setAttribute('aria-label', 'Announcement');
    var link = typeof a.link === 'string' ? a.link.trim() : '';
    announce.innerHTML = /^(https?:\/\/|\/)/.test(link)
      ? '<a href="' + esc(link) + '">' + esc(a.text) + '</a>'
      : esc(a.text);
    var skip = document.querySelector('.skip-link');
    document.body.insertBefore(announce, skip ? skip.nextSibling : document.body.firstChild);
    annH = announce.offsetHeight;
    onScroll();
  }).catch(function () { /* no announcement — nothing to show */ });

  /* ---------- Reveal on scroll ----------
     Staggered within each batch that enters together. With reduced motion
     the CSS turns this into a plain opacity fade. */
  function clearDelay(el) {
    el.addEventListener('transitionend', function done(ev) {
      if (ev.propertyName === 'opacity') { el.style.transitionDelay = ''; el.removeEventListener('transitionend', done); }
    });
  }
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    var batch = entries.filter(function (en) { return en.isIntersecting; }).map(function (en) { return en.target; });
    batch.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
    batch.forEach(function (el, i) {
      if (i) { el.style.transitionDelay = Math.min(i, 6) * 90 + 'ms'; clearDelay(el); }
      el.classList.add('is-in');
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;
  function reveal(el) { if (io) io.observe(el); else el.classList.add('is-in'); }

  /* ---------- Pointer effects (desktop only) ----------
     Gold dot that follows the pointer exactly, a soft ring that trails it and
     grows over links, buttons and cards, a gold glow on light sections and a
     spotlight on navy ones, a gold border glow that follows the pointer on the
     card under it, and a magnetic pull (max 6px) on buttons.
     Only with a fine pointer + hover, 768px and wider, and no reduced motion.
     Everything moves with transform/translate/opacity inside one
     requestAnimationFrame loop that stops when idle and when the tab is hidden;
     the card glow updates a gradient position on the one card under the pointer. */
  (function pointerFx() {
    var wideFx = window.matchMedia('(min-width: 768px)');
    var CARD = '.campus, .sunday, .event, .expect, .connect-card, .give-card, .ministry, .faq details';
    var HOT = 'a, button, summary, [role="button"], input, select, textarea, label';
    var DARK = '.on-dark, .hero, .site-footer, .campus--info, .watch__player';
    var layer, dot, ring, glow, spot, raf = 0, seen = false;
    var tx = 0, ty = 0, rx = 0, ry = 0, gx = 0, gy = 0;
    var card = null, cx = 0, cy = 0, btn = null, bx = 0, by = 0;
    function enabled() { return fine.matches && wideFx.matches && !reduce.matches; }
    function clamp(v) { return Math.max(-6, Math.min(6, v)); }
    function build() {
      layer = document.createElement('div');
      layer.className = 'pfx';
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<div class="pfx__glow"></div><div class="pfx__spot"></div><div class="pfx__ring"></div><div class="pfx__dot"></div>';
      document.body.appendChild(layer);
      glow = layer.children[0]; spot = layer.children[1]; ring = layer.children[2]; dot = layer.children[3];
    }
    function setCard(c) {
      if (c === card) return;
      if (card) card.classList.remove('is-glow');
      card = c;
      if (card) card.classList.add('is-glow');
    }
    function setBtn(b) {
      if (b === btn) return;
      if (btn) btn.style.translate = '';
      btn = b; bx = by = 0;
    }
    function frame() {
      raf = 0;
      rx += (tx - rx) * 0.2; ry += (ty - ry) * 0.2;
      gx += (tx - gx) * 0.1; gy += (ty - gy) * 0.1;
      dot.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
      glow.style.transform = spot.style.transform = 'translate3d(' + gx.toFixed(1) + 'px,' + gy.toFixed(1) + 'px,0)';
      if (card) { card.style.setProperty('--mx', cx.toFixed(0) + 'px'); card.style.setProperty('--my', cy.toFixed(0) + 'px'); }
      if (btn) btn.style.translate = bx.toFixed(1) + 'px ' + by.toFixed(1) + 'px';
      if (Math.abs(tx - gx) > 0.3 || Math.abs(ty - gy) > 0.3) raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (layer) layer.classList.remove('is-on');
      setCard(null); setBtn(null);
      seen = false;
    }
    function update(t) {
      var hot = !!t.closest(HOT);
      var c = t.closest(CARD);
      layer.classList.add('is-on');
      layer.classList.toggle('is-hot', hot);
      layer.classList.toggle('is-card', !!c && !hot);
      layer.classList.toggle('is-dark', !!t.closest(DARK));
      setCard(c);
      if (card) { var r = card.getBoundingClientRect(); cx = tx - r.left; cy = ty - r.top; }
      setBtn(t.closest('.btn'));
      if (btn) {
        var br = btn.getBoundingClientRect();
        bx = clamp((tx - (br.left + br.width / 2)) * 0.18);
        by = clamp((ty - (br.top + br.height / 2)) * 0.3);
      }
      if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
    }
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !enabled()) { stop(); return; }
      if (!layer) build();
      tx = e.clientX; ty = e.clientY;
      if (!seen) { rx = gx = tx; ry = gy = ty; seen = true; }
      update(e.target.closest ? e.target : document.body);
    }, { passive: true });
    // Scrolling under a still pointer: re-check what is under it (once per frame)
    var scrollPending = false;
    window.addEventListener('scroll', function () {
      if (!seen || scrollPending || document.hidden) return;
      scrollPending = true;
      requestAnimationFrame(function () {
        scrollPending = false;
        if (!seen) return;
        var el = document.elementFromPoint(tx, ty);
        if (el) update(el);
      });
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', stop);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
    [wideFx, reduce, fine].forEach(function (m) { m.addEventListener('change', function () { if (!enabled()) stop(); }); });
  })();

  function enhance(scope) {
    scope.querySelectorAll('.reveal').forEach(reveal);
  }
  enhance(document);

  /* ---------- Live content (Supabase) ----------
     Events, regular service times and gallery photos are read from Supabase with the
     PUBLISHABLE key, which can only read (Row Level Security blocks every write).
     If Supabase cannot be reached or is paused, the page keeps what is already in the
     HTML (service times) or falls back to /data/events.json (events), so visitors
     still see correct information. All date logic uses Australia/Melbourne time. */
  var SB_URL = 'https://ahrwrjxlsaprqbbtjvzk.supabase.co';
  var SB_KEY = 'sb_publishable_CmYHlzu_nPM0MM1SkMOOZA_uIYVYz4o'; // publishable (public) key — read-only under RLS
  function sbGet(path) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : 0;
    return fetch(SB_URL + '/rest/v1/' + path, {
      headers: { apikey: SB_KEY, Accept: 'application/json' }, cache: 'no-store', signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('Supabase ' + r.status);
      return r.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }
  function photoUrl(path) {
    return SB_URL + '/storage/v1/object/public/gallery/' + String(path).split('/').map(encodeURIComponent).join('/');
  }

  /* Melbourne calendar date as "YYYY-MM-DD", whatever the visitor's own time zone is */
  function melToday() {
    try {
      var o = {};
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
      if (o.year && o.month && o.day) return o.year + '-' + o.month + '-' + o.day;
    } catch (e) { /* very old browser: fall through to local date */ }
    var n = new Date();
    return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2);
  }
  function isoAdd(iso, days) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  var TODAY = melToday();

  /* ---------- Regular service times (campuses table) ----------
     Every element with data-cs="<campus slug>" is a scope for that campus. Text inside the
     nearest scope that matches the value printed in the HTML (DEFAULTS below, which must
     match the static pages) is swapped for the value saved by editors. Event lists,
     "This week" and the gallery are skipped. */
  var DEFAULTS = {
    'melton': { sunday_time: '9:30am', venue: 'Melton Seniors Community and Learning Centre', address: '1 McKenzie St, Melton VIC 3337', transport_note: '~10mins by bus from Melton Station', language: 'Tamil · English interpretation', map_url: 'https://goo.gl/maps/uk894wFGkuztXfcp6' },
    'mernda': { sunday_time: '10am', venue: 'Mernda Central College (Community Hub)', address: '70 Breadalbane Ave, Mernda VIC 3754', transport_note: '~3mins by bus from Mernda Station', language: 'Tamil · English interpretation', map_url: 'https://maps.app.goo.gl/EyPxqa8zUrCBKGkk6' },
    'sunshine': { sunday_time: '4pm', venue: 'Sunshine Uniting Church', address: '32 Withers St, Sunshine VIC 3020', transport_note: '~200 metres from Sunshine Railway Station', language: 'Tamil · English interpretation', map_url: 'https://goo.gl/maps/8un4HzaqzprCLfLQ8' },
    'tarneit': { sunday_time: '4:30pm', venue: 'Tarneit Community Learning Centre', address: '150 Sunset Views Blvd, Tarneit VIC 3029', transport_note: '~5min walk from Tarneit Station', language: 'Bilingual · English & Tamil', map_url: 'https://maps.app.goo.gl/EoxARXwt6qY5FwAV8' },
    'noble-park': { sunday_time: '5pm', venue: 'Ukrainian Community Centre', address: '26 Chandler Rd, Noble Park VIC 3174', transport_note: '~10min by bus from Noble Park Station', language: 'Bilingual · English & Tamil', map_url: 'https://maps.app.goo.gl/ozATNoLdJJk1gKda7' }
  };
  var LIVE = '[data-events], [data-thisweek], [data-gallery], script, style';
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function partOfDay(t) {
    var m = /^(\d{1,2})(?::\d{2})?\s*(am|pm)/i.exec(String(t).trim());
    if (!m) return '';
    var h = (+m[1] % 12) + (/pm/i.test(m[2]) ? 12 : 0);
    return h < 12 ? 'Sunday morning' : h < 16 ? 'Sunday afternoon' : 'Sunday evening';
  }
  function applyCampuses(rows) {
    var changes = {};
    rows.forEach(function (r) {
      var d = DEFAULTS[r && r.slug];
      if (!d) return;
      var swaps = [];
      ['sunday_time', 'venue', 'address', 'transport_note', 'language'].forEach(function (k) {
        var v = r[k] == null ? '' : String(r[k]).trim();
        if (v && v !== d[k]) {
          // Times only match as whole words ("4pm" must not match inside "14pm"); text fields match as written.
          var re = k === 'sunday_time' ? new RegExp('(^|[^\\w:])' + reEsc(d[k]) + '(?![\\w])', 'g') : new RegExp('()' + reEsc(d[k]), 'g');
          swaps.push({ re: re, to: v });
        }
      });
      var map = r.map_url && /^https:\/\//.test(r.map_url) && r.map_url !== d.map_url ? r.map_url : '';
      var time = r.sunday_time && r.sunday_time !== d.sunday_time ? String(r.sunday_time).trim() : '';
      if (swaps.length || map) changes[r.slug] = { swaps: swaps, map: map, time: time, oldMap: d.map_url };
    });
    if (!Object.keys(changes).length) return;
    document.querySelectorAll('[data-cs]').forEach(function (scope) {
      var c = changes[scope.getAttribute('data-cs')];
      if (!c) return;
      var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (n) {
        var el = n.parentElement;
        if (!el || el.closest('[data-cs]') !== scope || el.closest(LIVE)) return;
        var t = n.nodeValue, before = t;
        c.swaps.forEach(function (s) { t = t.replace(s.re, function (m, pre) { return pre + s.to; }); });
        if (t !== before) n.nodeValue = t;
      });
      scope.querySelectorAll('.campus__time span').forEach(function (el) {
        if (c.time && el.closest('[data-cs]') === scope && partOfDay(c.time)) el.textContent = partOfDay(c.time);
      });
      if (c.map) {
        var links = scope.matches('a[href]') ? [scope] : [];
        links.concat(Array.prototype.slice.call(scope.querySelectorAll('a[href]'))).forEach(function (a) {
          if (a.getAttribute('href') === c.oldMap && (a === scope || a.closest('[data-cs]') === scope)) a.setAttribute('href', c.map);
        });
      }
    });
  }

  /* ---------- Events ----------
     Only events dated today or later (Melbourne time) are shown: an event disappears the day after its
     date. Past events stay in the database and the daily backup, and the admin page lists them.
     Each [data-events] block renders:
       data-campus="slug"    only events for that campus (or for "all" campuses)
     Events dated on a Sunday are grouped into one card per date ("Sunday services");
     everything else is listed under "Gatherings". Every event shows its type as a text badge. */
  var TYPES = {
    // A regular Sunday service has no badge; its note (e.g. a guest speaker) shows as text.
    'Sunday service': { cls: '', label: '' },
    'Prayer': { cls: 'badge--prayer', label: 'Prayer' },
    'Meeting': { cls: 'badge--meeting', label: 'Meeting' },
    'Service change': { cls: 'badge--change', label: 'Service Change' },
    'Cancellation': { cls: 'badge--cancel', label: 'Cancelled' },
    // At a place that is not a campus (location); listed under Gatherings for every campus
    'Special event': { cls: 'badge--special', label: 'Special Event' },
    // Not a stored type: the "This week" notice of a campus that other campuses join
    'Combined service': { cls: 'badge--combined', label: 'Combined Service' }
  };
  function parseDate(d) {
    var p = String(d || '').split('-');
    if (p.length !== 3) return null;
    var dt = new Date(+p[0], p[1] - 1, +p[2]);
    return isNaN(dt) ? null : dt;
  }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function campusList(c) {
    var list = Array.isArray(c) ? c : [c];
    list = list.map(function (x) { return String(x || '').trim().toLowerCase(); }).filter(Boolean);
    return list.indexOf('all') > -1 || !list.length ? ['all'] : list;
  }
  function campusName(slug) {
    if (slug === 'all') return 'All campuses';
    for (var i = 0; i < CAMPUSES.length; i++) if (CAMPUSES[i].slug === slug) return CAMPUSES[i].name;
    return slug;
  }
  function campusIndex(slug) {
    if (slug === 'all') return -1;
    for (var i = 0; i < CAMPUSES.length; i++) if (CAMPUSES[i].slug === slug) return i;
    return 99;
  }
  function chip(ev) {
    var d = ev._d;
    return '<time class="date-chip" datetime="' + esc(ev.date) + '"><b>' + ('0' + d.getDate()).slice(-2) +
      '</b><small>' + MONTHS[d.getMonth()].slice(0, 3) + '</small></time>';
  }
  function badge(cls, text) { return ' <span class="badge ' + cls + '">' + text + '</span>'; }
  function typeBadge(type) { var t = TYPES[type] || TYPES.Meeting; return t.label ? badge(t.cls, t.label) : ''; }
  function timeText(t) {
    t = String(t || '').trim();
    return !t ? '' : (/^\d/.test(t) ? 'at ' + t : t);
  }
  function isWith(s) { return /^with\b/i.test(String(s || '').trim()); }
  function longDate(d) { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + ordinal(d.getDate()); }

  /* Accepts Supabase rows ({type, note}) and the older data/events.json shape ({cancelled, description}) */
  function eventType(e) {
    var service = /^sunday service$/i.test(String(e.title || '').trim());
    if (e.type === 'Service change' && e.combined_with) return 'Cancellation';
    if (e.type === 'Service change' && service && isWith(e.note != null ? e.note : e.description)) return 'Sunday service';
    if (TYPES[e.type] && e.type !== 'Combined service') return e.type;
    if (e.cancelled === true || e.cancelled === 'true') return 'Cancellation';
    if (/prayer/i.test(e.title || '')) return 'Prayer';
    if (service) return 'Sunday service';
    return 'Meeting';
  }
  function normaliseEvents(list) {
    return (Array.isArray(list) ? list : []).map(function (e) {
      var d = parseDate(e && e.date);
      if (!d || !e.title) return null;
      if (String(e.date).slice(0, 10) < TODAY) return null; // past: not shown on the public site
      var type = eventType(e);
      var note = e.note != null ? e.note : e.description;
      var combined = type === 'Cancellation' && !!e.combined_with; // cancelled, and combined with another campus
      return {
        title: titleCase(String(e.title).trim()), date: String(e.date).slice(0, 10), time: e.time, description: note ? String(note) : '',
        type: type, cancelled: type === 'Cancellation', combined: combined, combinedWith: combined ? String(e.combined_with) : '',
        badge: type, // Cancelled for every cancellation, combined or not
        location: String(e.location || '').trim(), locationAddress: String(e.location_address || '').trim(), locationUrl: safeUrl(e.location_url),
        _d: d,
        _campuses: Array.isArray(e.campuses) && !e.campuses.length && e.location ? [] : campusList(e.campuses)
      };
    }).filter(Boolean);
  }
  // Special events are for everyone: shown under every campus filter and on every campus page
  function forCampus(e, campus) { return !campus || e.type === 'Special event' || e._campuses.indexOf('all') > -1 || e._campuses.indexOf(campus) > -1; }
  function safeUrl(u) { u = String(u || '').trim(); return /^https:\/\/[^\s"<>]+$/i.test(u) ? u : ''; }
  // "Get directions": the editor's link, else a Google Maps search for the venue and address
  function directionsUrl(e) {
    return e.locationUrl || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([e.location, e.locationAddress].filter(Boolean).join(', '));
  }
  function placeHTML(e) {
    if (!e.location) return '';
    return '<p class="event__place"><strong>' + esc(e.location) + '</strong>' + (e.locationAddress ? ', ' + esc(e.locationAddress) : '') + '</p>' +
      '<p class="event__map"><a href="' + esc(directionsUrl(e)) + '" target="_blank" rel="noopener">Get Directions' +
      '<span class="visually-hidden"> to ' + esc(e.location) + ' (opens in a new tab)</span></a></p>';
  }
  function isService(e) { return /^sunday service$/i.test(e.title.trim()); }
  function andList(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  /* ---------- Cancelled Sunday services, optionally combined with another campus ----------
     On a Sunday, a cancellation combined with another campus, or a cancelled "Sunday service", REPLACES the service of every campus
     it lists, for that date: the campus's regular row (and any Service change row, e.g. a guest speaker)
     is hidden, and a "Cancelled" row without a time is shown instead, so editors don't have to delete anything.
     A cancellation combined with another campus shows "Cancelled · Combined with Tarneit, 4:30pm": the time
     is the joined campus's own row that day, or its regular Sunday time. The joined campus keeps its row,
     with "Includes the Melton and Mernda services" (a row is added if it has none that day).
     times = { slug: regular Sunday time } from the campuses table. Works the same on the saved list. */
  function resolveSundays(all, times) {
    var days = {};
    all.forEach(function (e) {
      e._hidden = {};
      if (e._d.getDay() !== 0 || e.type === 'Special event' || !(e.combined || (e.cancelled && isService(e)))) return;
      var day = days[e.date] || (days[e.date] = { replaced: {}, joining: {} });
      var slugs = e._campuses.indexOf('all') > -1
        ? CAMPUSES.map(function (c) { return c.slug; }).filter(function (c) { return c !== e.combinedWith; }) : e._campuses;
      e._replaces = true;
      slugs.forEach(function (c) { day.replaced[c] = true; });
      if (e.combined) {
        var j = day.joining[e.combinedWith] || (day.joining[e.combinedWith] = []);
        slugs.forEach(function (c) { if (j.indexOf(c) < 0) j.push(c); });
      }
    });
    all.forEach(function (e) {
      var day = days[e.date];
      if (!day || e._replaces || !isService(e) || e.cancelled || e.type === 'Special event') return;
      e._campuses.forEach(function (c) {
        if (c === 'all' ? CAMPUSES.every(function (x) { return day.replaced[x.slug]; }) : day.replaced[c]) e._hidden[c] = true;
      });
    });
    var extra = [];
    Object.keys(days).forEach(function (date) {
      Object.keys(days[date].joining).forEach(function (t) {
        var row = null;
        for (var i = 0; i < all.length && !row; i++) {
          var e = all[i];
          if (e.date === date && isService(e) && !e._replaces && !e.cancelled && forCampus(e, t) && !e._hidden[t] && !e._hidden.all) row = e;
        }
        var time = (row && String(row.time || '').trim()) || times[t] || '';
        if (!row) {
          var any = null;
          all.forEach(function (e) { if (e.date === date && !any) any = e; });
          row = { title: 'Sunday Service', date: date, time: times[t] || '', description: '', type: 'Sunday service', cancelled: false, combined: false,
            combinedWith: '', badge: 'Sunday service', _d: any._d, _campuses: [t], _hidden: {} };
          extra.push(row);
        }
        (row._joining || (row._joining = {}))[t] = days[date].joining[t].map(campusName);
        all.forEach(function (e) { if (e.date === date && e.combined && e.combinedWith === t) e._targetTime = time; });
      });
    });
    return all.concat(extra);
  }
  // After the "Cancelled" badge: "Combined with Tarneit, 4:30pm", or nothing when it isn't combined
  function noServiceText(e) {
    return e.combined ? 'Combined with ' + campusName(e.combinedWith) + (e._targetTime ? ', ' + e._targetTime : '') : '';
  }
  // The editor's note, unless it only repeats what the website now writes itself
  // (older combined services have the automatic note "Combined service at Tarneit, 4:30pm").
  function extraNote(e) {
    var n = String(e.description || '').trim();
    if (!n || !e.combined) return n;
    var at = campusName(e.combinedWith).toLowerCase();
    var low = n.toLowerCase().replace(/[.!]+$/, '');
    return low.indexOf('combined service at ' + at) === 0 || low.indexOf('join us at ' + at) === 0 ? '' : n;
  }
  function joiningText(names) { return 'Includes the ' + andList(names) + ' service' + (names.length > 1 ? 's' : ''); }

  function sundayCard(group) {
    var d = group.date;
    var slots = group.slots.slice().sort(function (a, b) { return a.idx - b.idx; });
    var descs = slots.map(function (s) { return s.desc; });
    var shared = slots.length > 1 && descs[0] && descs.every(function (x) { return x === descs[0]; }) &&
      slots.every(function (s) { return !s.label && !s.replaced; });
    var cls = 'sunday reveal' + (group.next ? ' is-next' : '');
    var html = '<article class="' + cls + '" data-date="' + esc(group.iso) + '">' +
      '<div class="sunday__head">' + chip({ _d: d, date: group.iso }) + '<div>' +
      '<p class="sunday__title">Sunday, ' + MONTHS[d.getMonth()] + ' ' + ordinal(d.getDate()) +
      (group.next ? badge('badge--next', 'Next') : '') + '</p>' +
      (shared ? '<p class="sunday__note">' + esc(descs[0]) + '</p>' : '') +
      '</div></div><ul class="slots">';
    slots.forEach(function (s) {
      var join = s.joining ? '<span class="who who--plain">' + esc(joiningText(s.joining)) + '</span>' : '';
      if (s.replaced) {
        // Replaced by a combined service or a cancellation: no time, the badge and "No service at …"
        html += '<li class="is-cancelled"><span class="where">' + esc(s.where) + '</span>' +
          '<span class="when"></span><span class="who">' + typeBadge(s.badge).trim() + (s.noService ? ' ' + esc(s.noService) : '') + '</span>' +
          (s.desc ? '<span class="who who--plain">' + esc(s.desc) + '</span>' : '') + '</li>';
        return;
      }
      var who = [s.label, shared ? '' : s.desc].filter(Boolean).map(esc).join(' — ');
      html += '<li' + (s.cancelled ? ' class="is-cancelled"' : s.combined ? ' class="is-combined"' : '') + '><span class="where">' + esc(s.where) + '</span>' +
        '<span class="when">' + esc(s.time) + (s.cancelled ? typeBadge(s.badge) : '') + '</span>' +
        (s.cancelled ? (who ? '<span class="who">' + who + '</span>' : '')
          // Regular Sunday service: no badge; the note (if any) as plain text under the time
          // a guest speaker ("with Ps …") in the speaker style, other notes plain
          : s.badge === 'Sunday service' ? (who ? '<span class="who' + (!s.label && isWith(s.desc) ? '' : ' who--plain') + '">' + who + '</span>' : '')
          : '<span class="who">' + typeBadge(s.badge).trim() + (who ? ' ' + who : '') + '</span>') +
        join + '</li>';
    });
    return html + '</ul></article>';
  }

  function gatheringCard(ev) {
    var d = ev._d;
    var where = ev.location && (ev.type === 'Special event' || !ev._campuses.length) ? '' : ev._campuses.map(campusName).join(' & ');
    var when = longDate(d) + ', ' + d.getFullYear();
    var t = timeText(ev.time);
    var line = esc(when) + (t ? ', ' + esc(t) : '') + (where ? ' @ ' + esc(where) : '');
    var cls = 'event reveal' + (ev._next ? ' is-next' : '');
    return '<article class="' + cls + '" data-date="' + esc(ev.date) + '">' + chip(ev) + '<div>' +
      '<h4>' + esc(ev.title) + (ev._next ? badge('badge--next', 'Next') : '') + typeBadge(ev.badge) + '</h4>' +
      '<p>' + line + '</p>' + placeHTML(ev) +
      (ev.description ? '<p' + (isWith(ev.description) ? ' class="who"' : '') + '>' + esc(ev.description) + '</p>' : '') +
      '</div></article>';
  }

  function renderEvents(block, all) {
    var campus = block.getAttribute('data-campus');
    var sWrap = block.querySelector('[data-ev-sundays-wrap]');
    var gWrap = block.querySelector('[data-ev-gatherings-wrap]');
    var sList = block.querySelector('[data-ev-sundays]');
    var gList = block.querySelector('[data-ev-gatherings]');
    var sTitle = block.querySelector('[data-ev-sundays-title]');

    var events = all.filter(function (e) { return forCampus(e, campus); }); // all upcoming (see normaliseEvents)

    /* Sundays: one card per date */
    var groups = {}, order = [];
    function onSunday(e) { return e._d.getDay() === 0 && e.type !== 'Special event'; }
    events.filter(onSunday).forEach(function (e) {
      if (e._campuses.every(function (c) { return e._hidden[c]; })) return;
      if (!groups[e.date]) { groups[e.date] = { iso: e.date, date: e._d, slots: [] }; order.push(e.date); }
      var label = /^sunday service$/i.test(e.title.trim()) ? '' : e.title;
      var slugs = e._campuses.indexOf('all') > -1 ? ['all'] : e._campuses.filter(function (c) { return !campus || c === campus; });
      slugs.forEach(function (c) {
        if (e._hidden[c]) return; // replaced by a combined service or a cancellation that day
        groups[e.date].slots.push({ where: campusName(c), idx: campusIndex(c), time: e.time, label: e._replaces ? '' : label,
          desc: e._replaces ? extraNote(e) : e.description, noService: e._replaces ? noServiceText(e) : '', replaced: !!e._replaces,
          joining: e._joining && e._joining[c], cancelled: e.cancelled, combined: e.combined, badge: e.badge });
      });
    });
    var sundays = order.map(function (k) { return groups[k]; }).sort(function (a, b) { return a.date - b.date; });
    if (sundays.length) sundays[0].next = true;

    /* Gatherings: soonest first, the first one marked "Next" */
    var gatherings = events.filter(function (e) { return !onSunday(e); }).map(function (e) {
      var c = {}; for (var k in e) c[k] = e[k]; c._next = false; return c;
    }).sort(function (a, b) { return a._d - b._d; });
    if (gatherings.length) gatherings[0]._next = true;

    if (sTitle) {
      var months = [];
      sundays.forEach(function (g) { var m = MONTHS[g.date.getMonth()]; if (months.indexOf(m) < 0) months.push(m); });
      sTitle.textContent = 'Sunday Services' + (months.length ? ' — ' + months.join(' & ') : '');
    }
    sList.innerHTML = sundays.map(sundayCard).join('');
    gList.innerHTML = gatherings.map(gatheringCard).join('');
    sWrap.hidden = !sundays.length;
    gWrap.hidden = !gatherings.length;
    block.classList.toggle('events-layout--single', !sundays.length || !gatherings.length);

    var empty = block.querySelector('[data-ev-empty]');
    if (empty) empty.hidden = !!(sundays.length || gatherings.length);
    block.removeAttribute('aria-busy');
    enhance(block);
  }

  function eventsFailed(block) {
    block.removeAttribute('aria-busy');
    block.classList.add('events-layout--single');
    block.innerHTML = '<p class="events-msg" role="status">We couldn’t load the latest events just now. ' +
      'Please <a href="/contact/">contact us</a> for service times and updates.</p>';
  }

  /* ---------- "This week" notice: cancellations and service changes in the next 7 days ---------- */
  function renderThisWeek(box, all) {
    var campus = box.getAttribute('data-campus');
    var end = isoAdd(TODAY, 6);
    var items = all.filter(function (e) {
      if (e.date < TODAY || e.date > end || !forCampus(e, campus)) return false;
      if ((e._campuses.length && e._campuses.every(function (c) { return e._hidden[c]; })) || (campus && e._hidden[campus])) return false; // replaced that day
      if (campus && e._joining && e._joining[campus]) return true; // this campus is the one being joined
      return e.type === 'Cancellation' || e.type === 'Service change' || e.type === 'Special event';
    }).sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : campusIndex(a._campuses[0]) - campusIndex(b._campuses[0]);
    });
    var list = box.querySelector('[data-thisweek-list]');
    if (!items.length || !list) { box.hidden = true; return; }
    list.innerHTML = items.map(function (e) {
      var mine = campus && e._campuses.indexOf('all') < 0 ? [campus] : e._campuses;
      if (e._replaces) {
        // "Cancelled  Melton · Sunday, November 22nd" + "Combined with Tarneit, 4:30pm" + the editor's note
        var lines = [noServiceText(e), extraNote(e)].filter(Boolean).map(esc).join(' — ');
        return '<li class="is-cancel">' + typeBadge(e.badge).trim() +
          '<span><strong>' + esc(mine.map(campusName).join(' & ')) + '</strong> · ' + (e.date === TODAY ? 'Today' : longDate(e._d)) +
          (lines ? '<span class="thisweek__detail">' + lines + '</span>' : '') + '</span></li>';
      }
      if (e.type === 'Special event') {
        // "Special event  Christmas Night · Saturday, December 5th, 4pm" + "TCF Ministries, Keilor East VIC — note"
        var st = String(e.time || '').trim();
        var place = [e.location, e.locationAddress].filter(Boolean).join(', ');
        var sd = [place, e.description].filter(Boolean).map(esc).join(' — ');
        return '<li class="is-special">' + typeBadge(e.badge).trim() + '<span><strong>' + esc(e.title) + '</strong> · ' +
          (e.date === TODAY ? 'Today' : longDate(e._d)) + (st ? ', ' + esc(st) : '') + (sd ? '<span class="thisweek__detail">' + sd + '</span>' : '') + '</span></li>';
      }
      if (campus && e._joining && e._joining[campus] && e.type !== 'Service change') {
        return '<li class="is-combined">' + typeBadge('Combined service').trim() + '<span><strong>' + esc(campusName(campus)) + '</strong> · ' +
          (e.date === TODAY ? 'Today' : longDate(e._d)) + (String(e.time || '').trim() ? ', ' + esc(String(e.time).trim()) : '') +
          '<span class="thisweek__detail">' + esc(joiningText(e._joining[campus])) + '</span></span></li>';
      }
      var where = e._campuses.filter(function (c) { return !e._hidden[c]; }).map(campusName).join(' & ');
      var t = String(e.time || '').trim();
      var when = (e.date === TODAY ? 'Today' : longDate(e._d)) + (t ? ', ' + esc(t) : '');
      var what = /^sunday service$/i.test(e.title.trim()) ? '' : e.title;
      var detail = [what, e.description, campus && e._joining && e._joining[campus] ? joiningText(e._joining[campus]) : ''].filter(Boolean).map(esc).join(' — ');
      return '<li class="' + (e.cancelled ? 'is-cancel' : e.combined ? 'is-combined' : 'is-change') + '">' + typeBadge(e.badge).trim() +
        '<span><strong>' + esc(where) + '</strong> · ' + when +
        (detail ? '<span class="thisweek__detail">' + detail + '</span>' : '') + '</span></li>';
    }).join('');
    box.hidden = false;
  }

  /* ---------- Structured data (schema.org Event) for upcoming special events only ----------
     A JSON data block, not a script: the Content-Security-Policy is unchanged. */
  function melOffset(iso) {
    try {
      var p = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', timeZoneName: 'longOffset' }).formatToParts(new Date(iso + 'T12:00:00Z'));
      for (var i = 0; i < p.length; i++) if (p[i].type === 'timeZoneName') { var m = /([+-]\d{2}:\d{2})/.exec(p[i].value); if (m) return m[1]; }
    } catch (e) { /* older browser: date only */ }
    return '';
  }
  // "4pm", "from 4pm to 6pm", "4:30pm – 6pm" → "2026-12-05T16:00:00+11:00" (date only if the time can't be read)
  function isoAt(date, h, min, ap) {
    var off = melOffset(date);
    if (!off) return date;
    var hh = (+h % 12) + (/p/i.test(ap) ? 12 : 0);
    return date + 'T' + ('0' + hh).slice(-2) + ':' + (min || '00') + ':00' + off;
  }
  function eventData(e) {
    var t = String(e.time || '');
    var re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/ig, a = re.exec(t), b = a && re.exec(t);
    var place = { '@type': 'Place', name: e.location };
    if (e.locationAddress) place.address = { '@type': 'PostalAddress', streetAddress: e.locationAddress, addressRegion: 'VIC', addressCountry: 'AU' };
    if (e.locationUrl) place.url = e.locationUrl;
    var o = {
      '@context': 'https://schema.org', '@type': 'Event', name: e.title,
      startDate: a ? isoAt(e.date, a[1], a[2], a[3]) : e.date,
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: place,
      organizer: { '@type': 'Organization', name: 'Tamil Christian Fellowship Melbourne', url: 'https://tcfmelbourne.org/' }
    };
    if (b) o.endDate = isoAt(e.date, b[1], b[2], b[3]);
    if (e.description) o.description = e.description;
    return o;
  }
  function addEventData(all) {
    var list = all.filter(function (e) { return e.type === 'Special event' && e.location; }).map(eventData); // upcoming only
    var old = document.getElementById('special-events-data');
    if (old) old.remove();
    if (!list.length) return;
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.id = 'special-events-data';
    s.textContent = JSON.stringify(list.length === 1 ? list[0] : list).replace(/</g, '\\u003c');
    document.head.appendChild(s);
  }

  /* ---------- Campus filter on /events/ ---------- */
  function bindFilter(blocks, all) {
    var sel = document.querySelector('[data-ev-filter]');
    if (!sel || sel._bound) return;
    sel._bound = true;
    sel.closest('[data-ev-filter-wrap]').hidden = false;
    sel.addEventListener('change', function () {
      blocks.forEach(function (b) {
        if (sel.value) b.setAttribute('data-campus', sel.value); else b.removeAttribute('data-campus');
        renderEvents(b, all);
        b.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-in'); });
      });
    });
  }

  var evBlocks = document.querySelectorAll('[data-events]');
  var weekBoxes = document.querySelectorAll('[data-thisweek]');
  var campusReq = document.querySelector('[data-cs]') || evBlocks.length || weekBoxes.length
    ? sbGet('campuses?select=slug,sunday_time,venue,address,transport_note,language,map_url') : null;
  if (evBlocks.length || weekBoxes.length) {
    // Regular Sunday times: live, else the saved copy, else the times printed in the pages
    var timesReq = campusReq.catch(function () { return getJSON('/data/campuses.json'); }).catch(function () { return []; }).then(function (rows) {
      var t = {};
      Object.keys(DEFAULTS).forEach(function (k) { t[k] = DEFAULTS[k].sunday_time; });
      (Array.isArray(rows) ? rows : []).forEach(function (r) { if (r && r.slug && r.sunday_time) t[r.slug] = String(r.sunday_time).trim(); });
      return t;
    });
    // Only today and later (Melbourne date): past events are not shown on any public page.
    var evQuery = function (cols) { return sbGet('events?select=' + cols + '&deleted_at=is.null&date=gte.' + TODAY + '&order=date.asc'); };
    // 400 = a column isn't there yet (special-events.sql / add-combined-with.sql not run): ask for fewer.
    // Anything else falls through to the saved list.
    var COLS = ['title,type,date,time,campuses,note,combined_with,location,location_address,location_url',
      'title,type,date,time,campuses,note,combined_with', 'title,type,date,time,campuses,note'];
    var tryCols = function (i) {
      return evQuery(COLS[i]).catch(function (e) {
        if (i + 1 < COLS.length && /Supabase 400/.test(e && e.message)) return tryCols(i + 1);
        throw e;
      });
    };
    tryCols(0)
      .then(function (rows) { return { rows: rows, saved: false }; })
      .catch(function () {
        return getJSON('/data/events.json').then(function (rows) { return { rows: rows, saved: true }; });
      })
      .then(function (res) { return timesReq.then(function (times) { res.times = times; return res; }); })
      .then(function (res) {
        var all = resolveSundays(normaliseEvents(res.rows), res.times);
        evBlocks.forEach(function (b) {
          try { renderEvents(b, all); } catch (e) { eventsFailed(b); }
          var note = b.parentNode.querySelector('[data-ev-saved]');
          if (note) note.hidden = !res.saved;
        });
        weekBoxes.forEach(function (w) { try { renderThisWeek(w, all); } catch (e) { w.hidden = true; } });
        bindFilter(evBlocks, all);
        if (evBlocks.length) { try { addEventData(all); } catch (e) { /* structured data is optional */ } }
      })
      .catch(function () {
        evBlocks.forEach(eventsFailed);
        weekBoxes.forEach(function (w) { w.hidden = true; });
      });
  }

  if (document.querySelector('[data-cs]')) {
    campusReq
      .then(function (rows) { if (Array.isArray(rows)) applyCampuses(rows); })
      .catch(function () { /* keep the times already printed in the page */ });
  }

  /* ---------- Gallery ----------
     [data-gallery] sections stay hidden until there is at least one photo.
     data-campus="slug" shows that campus's photos (plus "all campuses" photos);
     data-limit="n" shows only the first n. Thumbnails are the "-sm" copies the admin
     page uploads next to each photo; the full photo opens in an accessible lightbox. */
  var galleries = document.querySelectorAll('[data-gallery]');
  var lightbox = null;
  function thumbPath(p) { return String(p).replace(/(\.[a-z0-9]+)$/i, '-sm$1'); }
  function openLightbox(photos, index, opener) {
    if (!lightbox) {
      lightbox = document.createElement('dialog');
      lightbox.className = 'lightbox';
      lightbox.setAttribute('aria-label', 'Photo viewer');
      lightbox.innerHTML =
        '<figure class="lightbox__fig"><img class="lightbox__img" alt=""><figcaption class="lightbox__cap"></figcaption></figure>' +
        '<p class="lightbox__count" aria-live="polite"></p>' +
        '<button type="button" class="lightbox__btn lightbox__close" aria-label="Close photo viewer">×</button>' +
        '<button type="button" class="lightbox__btn lightbox__prev" aria-label="Previous photo">‹</button>' +
        '<button type="button" class="lightbox__btn lightbox__next" aria-label="Next photo">›</button>';
      document.body.appendChild(lightbox);
      lightbox.querySelector('.lightbox__close').addEventListener('click', function () { lightbox.close(); });
      lightbox.querySelector('.lightbox__prev').addEventListener('click', function () { lightbox._go(-1); });
      lightbox.querySelector('.lightbox__next').addEventListener('click', function () { lightbox._go(1); });
      lightbox.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); lightbox._go(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); lightbox._go(1); }
      });
      lightbox.addEventListener('click', function (e) { if (e.target === lightbox) lightbox.close(); });
      lightbox.addEventListener('close', function () { if (lightbox._opener) lightbox._opener.focus(); });
    }
    var img = lightbox.querySelector('.lightbox__img');
    var cap = lightbox.querySelector('.lightbox__cap');
    var count = lightbox.querySelector('.lightbox__count');
    lightbox._go = function (step) {
      index = (index + step + photos.length) % photos.length;
      var p = photos[index];
      img.src = photoUrl(p.image_path);
      img.alt = p.alt;
      cap.textContent = p.caption || '';
      cap.hidden = !p.caption;
      count.textContent = 'Photo ' + (index + 1) + ' of ' + photos.length;
    };
    lightbox._opener = opener;
    lightbox.classList.toggle('is-single', photos.length < 2);
    lightbox._go(0);
    if (typeof lightbox.showModal === 'function') lightbox.showModal(); else lightbox.setAttribute('open', '');
    lightbox.querySelector('.lightbox__close').focus();
  }
  function renderGallery(sec, rows) {
    var campus = sec.getAttribute('data-campus');
    var limit = parseInt(sec.getAttribute('data-limit'), 10) || 0;
    var all = rows.filter(function (r) { return r && r.image_path && r.alt && forCampus({ _campuses: campusList(r.campuses) }, campus); });
    var photos = limit ? all.slice(0, limit) : all;
    var list = sec.querySelector('[data-gallery-list]');
    var more = sec.querySelector('[data-gallery-more]');
    var empty = sec.querySelector('[data-gallery-empty]');
    if (!photos.length) {
      if (empty) { empty.hidden = false; sec.hidden = false; } else sec.hidden = true;
      return;
    }
    list.innerHTML = photos.map(function (p, i) {
      return '<li class="gallery__item"><button type="button" class="gallery__open" data-i="' + i + '">' +
        '<span class="visually-hidden">Enlarge photo: </span>' +
        '<img src="' + esc(photoUrl(thumbPath(p.image_path))) + '" alt="' + esc(p.alt) + '" width="600" height="450" loading="lazy" decoding="async">' +
        '</button>' + (p.caption ? '<p class="gallery__cap">' + esc(p.caption) + '</p>' : '') + '</li>';
    }).join('');
    list.querySelectorAll('img').forEach(function (img, i) {
      img.addEventListener('error', function retry() {
        img.removeEventListener('error', retry);
        img.src = photoUrl(photos[i].image_path); // no small copy: use the full photo
      });
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('.gallery__open');
      if (b) openLightbox(photos, +b.getAttribute('data-i'), b);
    });
    if (more) more.hidden = !limit;
    if (empty) empty.hidden = true;
    sec.hidden = false;
    enhance(sec);
  }
  if (galleries.length) {
    sbGet('gallery?select=image_path,alt,caption,campuses,sort&deleted_at=is.null&order=sort.asc,created_at.desc')
      .then(function (rows) {
        galleries.forEach(function (g) { try { renderGallery(g, Array.isArray(rows) ? rows : []); } catch (e) { g.hidden = true; } });
      })
      .catch(function () {
        galleries.forEach(function (g) {
          var empty = g.querySelector('[data-gallery-empty]');
          if (empty) { empty.hidden = false; g.hidden = false; } else g.hidden = true;
        });
      });
  }

  /* ---------- Copy bank details ---------- */
  var status = document.getElementById('copy-status');
  function say(t) { if (status) status.textContent = t; }
  document.querySelectorAll('.copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () {
        btn.classList.add('is-done');
        btn.innerHTML = '<svg aria-hidden="true"><use href="#i-check"/></svg>';
        say('Copied ' + text);
        setTimeout(function () {
          btn.classList.remove('is-done');
          btn.innerHTML = '<svg aria-hidden="true"><use href="#i-copy"/></svg>';
        }, 1800);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, function () { say('Copy failed — please copy ' + text + ' manually'); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { say('Please copy ' + text + ' manually'); }
        document.body.removeChild(ta);
      }
    });
  });
})();
