/*
 * Continue Watching: provider-agnostic data layer (no DOM; unit-tested under Node).
 *
 * What is real in v0.4:
 *  - 'manual': titles the owner saves by hand ("Saved for later"). Never shown with progress.
 *  - Provider adapters (Trakt, Plex, Jellyfin) are declared but NOT connected: each needs the
 *    owner's account, consent and a companion bridge so no token ever ships in this app.
 *  - 'fixture': sample cards for screenshots/tests, only with ?test=1&cwDemo=1, always "DEV DEMO".
 * Netflix, Disney+, Prime Video, YouTube, Tubi and Stremio expose no watch progress to a webOS
 * app, so nothing here reads, scrapes or guesses it. Saved titles stay on this device and are
 * not part of the configuration export.
 */
(function (PH) {
  'use strict';

  var MAX_SAVED = 24;
  var TEST_MODE = !!(PH.config && PH.config.TEST_MODE);
  var KEY = 'premiumHome.saved.v1' + (TEST_MODE ? '.test' : '');
  var PROVIDERS = ['manual', 'trakt', 'plex', 'jellyfin', 'fixture'];
  var LOCAL_ART = /^assets\/[a-z0-9_\/-]+\.(svg|png|jpe?g|webp)$/i;
  var FUTURE_SLACK_MS = 24 * 3600 * 1000;

  // Returns a clean item or null. Progress survives only with a named source from a real (or
  // fixture) provider; a manual entry can never carry progress.
  function normalize(raw, now) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (PROVIDERS.indexOf(raw.provider) < 0) return null;
    var title = PH.cleanLabel(raw.title, 80);
    var at = typeof raw.updatedAt === 'string' ? Date.parse(raw.updatedAt) : NaN;
    if (!title || isNaN(at) || at > (now || new Date()).getTime() + FUTURE_SLACK_MS) return null;
    var manual = raw.provider === 'manual';
    var item = {
      provider: raw.provider,
      providerItemId: PH.cleanLabel(typeof raw.providerItemId === 'string' ? raw.providerItemId : '', 80) || title.toLowerCase(),
      title: title,
      subtitle: PH.cleanLabel(raw.subtitle, 80),
      serviceId: PH.isCatalogId(raw.serviceId) ? raw.serviceId : null,
      updatedAt: new Date(at).toISOString(),
      isManuallySaved: manual,
      progressPercent: null,
      progressSource: null,
      artwork: typeof raw.artwork === 'string' && LOCAL_ART.test(raw.artwork) && raw.artwork.indexOf('..') < 0 ? raw.artwork : null,
      note: manual ? PH.cleanLabel(raw.note, 60) : ''
    };
    var src = PH.cleanLabel(raw.progressSource, 60);
    var p = raw.progressPercent;
    if (!manual && src && typeof p === 'number' && isFinite(p) && p >= 0 && p <= 100) {
      item.progressPercent = Math.round(p);
      item.progressSource = src;
    }
    return item;
  }

  function sameShow(a, b) {
    return a.title.toLowerCase() === b.title.toLowerCase() && a.subtitle.toLowerCase() === b.subtitle.toLowerCase() &&
      (a.serviceId === b.serviceId || !a.serviceId || !b.serviceId);
  }

  // Newest first, duplicates collapsed (same provider id, or the same show from two sources; the
  // entry with verified progress wins, then the newer one), at most `max`.
  function merge(lists, max) {
    var all = [].concat.apply([], lists).filter(Boolean).sort(function (a, b) {
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
    var out = [];
    all.forEach(function (it) {
      var i = out.findIndex(function (o) {
        return (o.provider === it.provider && o.providerItemId === it.providerItemId) || sameShow(o, it);
      });
      if (i < 0) { out.push(it); return; }
      if (out[i].progressPercent === null && it.progressPercent !== null) out[i] = it;
    });
    return out.slice(0, max);
  }

  // ---------- saved titles (manual provider, this device only) ----------

  function loadSaved(now) {
    var raw;
    try { raw = JSON.parse(PH.storage.get(KEY) || '[]'); } catch (e) { raw = []; }
    if (!Array.isArray(raw)) return [];
    return raw.map(function (r) { return normalize(r, now); })
      .filter(function (it) { return it && it.provider === 'manual'; }).slice(0, MAX_SAVED);
  }

  function writeSaved(list) { return PH.storage.set(KEY, JSON.stringify(list)); }

  // Returns { ok, item } or { ok: false, error }.
  function saveTitle(input, now) {
    var t = now || new Date();
    var item = normalize({
      provider: 'manual', title: input.title, subtitle: input.subtitle, serviceId: input.serviceId,
      note: input.note, updatedAt: t.toISOString(), providerItemId: 'm' + t.getTime().toString(36) + Math.random().toString(36).slice(2, 7)
    }, t);
    if (!item) return { ok: false, error: 'Enter a title first.' };
    var list = loadSaved(t).filter(function (x) { return !sameShow(x, item); });
    list.unshift(item);
    writeSaved(list.slice(0, MAX_SAVED));
    return { ok: true, item: item };
  }

  function removeSaved(providerItemId) {
    writeSaved(loadSaved().filter(function (x) { return x.providerItemId !== providerItemId; }));
  }

  function clearSaved() { writeSaved([]); }

  // ---------- providers ----------

  var PROVIDER_INFO = [
    { id: 'manual', name: 'Saved titles', status: 'connected', detail: 'On this device. You add titles yourself; no progress is tracked.' },
    { id: 'trakt', name: 'Trakt', status: 'unconfigured', detail: 'Not connected. Needs your Trakt account, your OK, and a companion bridge so no sign-in token is stored in this app. Only shows what Trakt itself records.' },
    { id: 'plex', name: 'Plex / Jellyfin', status: 'unconfigured', detail: 'Only relevant if you run your own media server. Not set up.' }
  ];

  function fixtureItems(now) {
    var t = (now || new Date()).getTime(), H = 3600 * 1000;
    return [
      { title: 'Glacier Station', subtitle: 'S2 · E5', serviceId: 'netflix', p: 42, ago: 3 * H },
      { title: 'The Quiet Coast', subtitle: 'Film', serviceId: 'primevideo', p: 78, ago: 26 * H },
      { title: 'Northern Line', subtitle: 'S1 · E3', serviceId: 'disneyplus', p: 12, ago: 50 * H },
      { title: 'Midnight Kitchen', subtitle: 'Episode 8', serviceId: 'youtube', p: 63, ago: 80 * H }
    ].map(function (x, i) {
      return normalize({ provider: 'fixture', providerItemId: 'demo' + i, title: x.title, subtitle: x.subtitle, serviceId: x.serviceId,
        updatedAt: new Date(t - x.ago).toISOString(), progressPercent: x.p, progressSource: 'DEV DEMO fixture (not real)' }, now);
    });
  }

  function fixtureOn() {
    return TEST_MODE && typeof location !== 'undefined' && /[?&]cwDemo=1(&|$)/.test(location.search);
  }

  // Items for the Home row, honouring the owner's settings.
  function items() {
    var w = PH.state.config.watching;
    if (w.cwRow === 'off') return [];
    return merge([fixtureOn() ? fixtureItems() : [], loadSaved()], w.cwMax);
  }

  function rowTitle(list) {
    return list.some(function (it) { return !it.isManuallySaved; }) ? 'Continue Watching' : 'Saved for later';
  }

  PH.cw = {
    MAX_SAVED: MAX_SAVED, KEY: KEY, PROVIDERS: PROVIDER_INFO,
    normalize: normalize, merge: merge, fixtureItems: fixtureItems,
    loadSaved: loadSaved, saveTitle: saveTitle, removeSaved: removeSaved, clearSaved: clearSaved,
    items: items, rowTitle: rowTitle
  };
})(window.PH = window.PH || {});
