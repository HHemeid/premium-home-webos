/*
 * Recently opened: ONLY shortcuts opened through Premium Home, kept on this device (never exported).
 * webOS gives apps no reliable system-wide launch history, so this never claims to show what
 * was watched or opened elsewhere. A 'native' entry means the TV accepted a launch request, not
 * that playback started. 'demo' entries come only from the Mac preview; on the TV, Demo entries
 * left over from earlier simulated versions are dropped (v0.8).
 */
(function (PH) {
  'use strict';

  var MAX = 8;
  var KEY = 'premiumHome.recents.v1' + (PH.config && PH.config.TEST_MODE ? '.test' : '');

  // Pure: newest first, one entry per shortcut, at most MAX.
  function record(list, id, kind, now) {
    if (!PH.isCatalogId(id) || (kind !== 'demo' && kind !== 'native')) return list.slice();
    var next = list.filter(function (r) { return r.id !== id; });
    next.unshift({ id: id, kind: kind, at: (now || new Date()).toISOString() });
    return next.slice(0, MAX);
  }

  // Pure: drops anything malformed or unknown from stored data.
  function sanitize(raw) {
    if (!Array.isArray(raw)) return [];
    var seen = new Set();
    return raw.filter(function (r) {
      var good = r && PH.isCatalogId(r.id) && (r.kind === 'demo' || r.kind === 'native') &&
        typeof r.at === 'string' && !isNaN(Date.parse(r.at)) && !seen.has(r.id);
      if (good) seen.add(r.id);
      return good;
    }).slice(0, MAX).map(function (r) { return { id: r.id, kind: r.kind, at: r.at }; });
  }

  function load() {
    var list;
    try { list = sanitize(JSON.parse(PH.storage.get(KEY) || '[]')); } catch (e) { return []; }
    return PH.platform && PH.platform.isWebOS ? list.filter(function (r) { return r.kind === 'native'; }) : list;
  }

  function add(id, kind) {
    if (!PH.state.config.recents.rememberRecents) return;
    PH.storage.set(KEY, JSON.stringify(record(load(), id, kind)));
  }

  function clear() { PH.storage.set(KEY, '[]'); }

  function remove(id) { PH.storage.set(KEY, JSON.stringify(load().filter(function (r) { return r.id !== id; }))); }

  // Shown entries: still a visible shortcut.
  function visible() {
    return load().filter(function (r) {
      var sc = PH.config.findShortcut(PH.state.config, r.id);
      return sc && !sc.hidden;
    });
  }

  PH.recents = { MAX: MAX, KEY: KEY, record: record, sanitize: sanitize, load: load, add: add, remove: remove, clear: clear, visible: visible };
})(window.PH = window.PH || {});
