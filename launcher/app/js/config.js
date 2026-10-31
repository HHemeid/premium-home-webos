/*
 * Configuration: defaults, validation, persistence, export, and pure edit operations.
 * Nothing in this file touches the DOM, so it is unit-tested under Node (see tests/).
 */
(function (PH) {
  'use strict';

  var SCHEMA = 'lg-c4-premium-home/config';
  // v1: Premium Home 0.1–0.2. v2 (0.3): adds background, effects, ambient, motion 'off', weather.cityId.
  // v3 (0.4): adds ambientMode, theme, wallpaper, watching, recents, gaming, oledCare.saverClock and
  // the 'scenic' / 'photo' backgrounds.
  // v4 (0.8): daily wallpaper rotation (rotateMinutes 1440 = once per calendar day, the new default),
  // wallpaper.pool and wallpaper.favoriteIds.
  // v5 (0.8.3): personal greeting (clock.greetingShow, clock.greetingNames, clock.greetingAmbient).
  // v6 (0.9.0): the owner's OLED schedule. oledCare.dimMinutes (45) and ambientMode.photoMinutes
  // (10) are new; oledCare.screensaverMinutes is now the pure-black screen (60 min); the
  // screensaver clock is gone and "dim Home after 45 s" is off.
  // v7 (0.9.1): reserved (the author's build adds a personal shortcut here; this build adds nothing).
  var VERSION = 7;
  // Browser smoke tests load the app with ?test=1 and get their own storage slot,
  // so running them never touches the real saved layout.
  var TEST_MODE = typeof location !== 'undefined' && /[?&]test=1(&|$)/.test(location.search);
  var STORAGE_KEY = 'premiumHome.config.v1' + (TEST_MODE ? '.test' : '');

  // Allowed values for enumerated fields. Field names are unique across sections.
  var HOURS = Array.apply(null, Array(24)).map(function (_, i) { return i; });
  var INPUT_IDS = ['hdmi1', 'hdmi2', 'hdmi3', 'hdmi4'];
  var CHOICES = {
    accent: ['ice', 'glacier', 'graphite'],
    motion: ['full', 'reduced', 'off'],
    background: ['dynamic', 'cinematic', 'scenic', 'photo', 'minimal'],
    units: ['F', 'C'],
    cityId: PH.cities.map(function (c) { return c.id; }),
    screensaverMinutes: [20, 30, 45, 60],   // pure black; capped at 60 min, and never Off
    dimMinutes: [10, 15, 30, 45],
    photoMinutes: [0, 5, 10, 15, 30],
    autoDelaySeconds: [0, 30, 60, 90, 120, 300, 600],
    ambientDim: ['low', 'medium', 'strong'],
    themeMode: ['auto', 'day', 'night'],
    dayStartHour: HOURS,
    nightStartHour: HOURS,
    scenicId: PH.wallpapers.map(function (w) { return w.id; }),
    wallpaperDim: [0, 15, 30, 45],
    rotateMinutes: [0, 1440, 30, 60, 180],   // 1440 = daily: a new wallpaper each calendar day
    pool: ['photos', 'all', 'favorites'],
    cwRow: ['auto', 'off'],
    cwMax: [3, 4],
    favoriteInput: [''].concat(INPUT_IDS)
  };
  var SECTIONS = ['appearance', 'clock', 'weather', 'oledCare', 'ambientMode', 'theme', 'wallpaper', 'watching', 'recents', 'gaming'];
  var INPUT_NAME_MAX = 24;
  var GREETING_NAMES_MAX = 40;

  function defaults() {
    return {
      schema: SCHEMA,
      version: VERSION,
      appearance: { accent: 'ice', glass: true, motion: 'full', background: 'scenic', effects: true, ambient: true, safeAreaGuides: false },
      // greetingNames is empty in the source on purpose: household names are set on the TV only.
      clock: { hour24: false, showDate: true, greetingShow: true, greetingNames: '', greetingAmbient: true },
      // Live weather is opt-in: nothing is requested until the owner turns it on and confirms.
      weather: { enabled: false, units: 'C', cityId: PH.DEFAULT_CITY },
      oledCare: { pixelShift: true, dimWhenIdle: false, dimMinutes: 45, screensaverMinutes: 60 },
      // Home fades into the ambient view after this many seconds without input (0 = never).
      ambientMode: { autoDelaySeconds: 90, ambientDim: 'medium', photoMinutes: 10 },
      theme: { themeMode: 'auto', dayStartHour: 7, nightStartHour: 19, followSun: true },
      wallpaper: { scenicId: PH.wallpapers[0].id, wallpaperDim: 15, rotateMinutes: 1440, pool: 'photos', favoriteIds: [] },
      watching: { cwRow: 'auto', cwMax: 4 },
      recents: { rememberRecents: true },
      gaming: { favoriteInput: '', inputNames: { hdmi1: '', hdmi2: '', hdmi3: '', hdmi4: '' } },
      shortcuts: PH.DEFAULT_SHORTCUTS.map(function (id) { return { id: id, hidden: false }; }),
      favorites: PH.DEFAULT_FAVORITES.slice()
    };
  }

  function fail(message) { return { ok: false, error: message, warnings: [] }; }

  // Upgrades older documents one version at a time.
  // v1 → v2: new fields are filled with defaults by validate(). In v1, weather.enabled only meant
  // "show the placeholder" (no network existed), so it is never treated as consent to go online.
  // v2 → v3: only new sections and choices, all filled with defaults by validate().
  // v3 → v4: a saved rotation choice (including Off) is kept; only fresh configs default to Daily.
  function migrate(doc) {
    var d = PH.clone(doc);
    if (d.version === 1) {
      d.version = 2;
      if (d.weather && typeof d.weather === 'object' && !Array.isArray(d.weather)) d.weather.enabled = false;
    }
    if (d.version === 2) d.version = 3;
    if (d.version === 3) {
      d.version = 4;
      if (d.wallpaper && typeof d.wallpaper === 'object' && !Array.isArray(d.wallpaper) && d.wallpaper.rotateMinutes === undefined) d.wallpaper.rotateMinutes = 0;
    }
    if (d.version === 4) d.version = 5;   // v4 → v5: new greeting fields get defaults in validate()
    if (d.version === 5) {
      // v5 → v6: the owner's new OLED schedule replaces the old 45 s dim and 2–15 min screensaver.
      d.version = 6;
      if (d.oledCare && typeof d.oledCare === 'object' && !Array.isArray(d.oledCare)) {
        d.oledCare.dimWhenIdle = false;
        d.oledCare.screensaverMinutes = 60;
        delete d.oledCare.saverClock;
      }
    }
    if (d.version === 6) {
      // v6 → v7: nothing to add in this build (the author's own build adds a personal shortcut
      // here). The step is kept so saved settings from either build line up.
      d.version = 7;
    }
    return d;
  }

  // HDMI names typed or picked by the owner: plain text, at most INPUT_NAME_MAX characters.
  function validInputNames(given, out, warnings) {
    if (!given || typeof given !== 'object' || Array.isArray(given)) { warnings.push('Ignored invalid HDMI names.'); return; }
    INPUT_IDS.forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(given, id)) return;
      if (typeof given[id] !== 'string') { warnings.push('Ignored an invalid name for ' + id.toUpperCase() + '.'); return; }
      out[id] = PH.cleanLabel(given[id], INPUT_NAME_MAX);
    });
  }

  // Household names for the greeting: first names only. Letters, digits, spaces and & ' ’ - . ,
  // after cleanLabel (no control or bidi characters); at most GREETING_NAMES_MAX characters.
  // Rendered with textContent only, so markup can never take effect.
  function cleanGreetingNames(s) {
    if (typeof s !== 'string') return null;
    return PH.cleanLabel(s.replace(/[^\p{L}\p{M}\p{N} &'\u2019.,-]/gu, ''), GREETING_NAMES_MAX).replace(/\s+/g, ' ').trim();
  }
  function validGreetingNames(given, warnings) {
    var clean = cleanGreetingNames(given);
    if (clean === null) { warnings.push('Ignored invalid greeting names.'); return ''; }
    if (clean !== given.trim()) warnings.push('Greeting names were cleaned (only letters, spaces and & \' - . , are kept).');
    return clean;
  }

  // Favourite wallpapers: known wallpaper ids only, no duplicates.
  function validWallpaperIds(given, warnings) {
    if (!Array.isArray(given)) { warnings.push('Ignored invalid favourite wallpapers.'); return []; }
    var seen = new Set();
    return given.filter(function (id) {
      var ok = typeof id === 'string' && !!PH.wallpaperById[id] && !seen.has(id);
      if (ok) seen.add(id); else warnings.push('Skipped an unknown favourite wallpaper.');
      return ok;
    });
  }

  // Returns { ok, config, warnings } or { ok: false, error }. Never throws on bad input.
  function validate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('The file does not contain a configuration object.');
    if (input.schema !== SCHEMA) return fail('This is not a Premium Home configuration file.');
    if (typeof input.version !== 'number' || input.version < 1) return fail('The configuration has no valid version number.');
    if (input.version > VERSION) {
      return fail('This configuration is from a newer version (' + input.version + ') than this app supports (' + VERSION + ').');
    }

    var src = migrate(input);
    var out = defaults();
    var warnings = [];

    SECTIONS.forEach(function (sec) {
      var given = src[sec];
      if (given === undefined) return;
      if (!given || typeof given !== 'object' || Array.isArray(given)) {
        warnings.push('Ignored "' + sec + '": not a group of settings.');
        return;
      }
      Object.keys(out[sec]).forEach(function (field) {
        if (!Object.prototype.hasOwnProperty.call(given, field)) return;
        var v = given[field];
        if (field === 'inputNames') { validInputNames(v, out[sec].inputNames, warnings); return; }
        if (field === 'favoriteIds') { out[sec].favoriteIds = validWallpaperIds(v, warnings); return; }
        if (field === 'greetingNames') { out[sec].greetingNames = validGreetingNames(v, warnings); return; }
        var allowed = CHOICES[field];
        var good = allowed ? allowed.indexOf(v) >= 0 : typeof v === typeof out[sec][field];
        if (good) out[sec][field] = v;
        else warnings.push('Ignored invalid value for ' + sec + '.' + field + '.');
      });
    });

    // Sets (not plain objects) so prototype names such as "__proto__" are ordinary values.
    if (Array.isArray(src.shortcuts)) {
      var seen = new Set();
      out.shortcuts = [];
      src.shortcuts.forEach(function (s) {
        var id = s && typeof s === 'object' ? s.id : undefined;
        if (typeof id !== 'string') { warnings.push('Skipped a shortcut without a valid id.'); return; }
        if (!PH.isCatalogId(id)) { warnings.push('Skipped unknown shortcut "' + id + '".'); return; }
        if (seen.has(id)) { warnings.push('Skipped duplicate shortcut "' + id + '".'); return; }
        seen.add(id);
        out.shortcuts.push({ id: id, hidden: s.hidden === true });
      });
    } else if (src.shortcuts !== undefined) {
      warnings.push('Shortcut list was invalid; default shortcuts used.');
    }

    var have = new Set(out.shortcuts.map(function (s) { return s.id; }));
    var favSource = src.favorites;
    var favGiven = Array.isArray(favSource);
    if (!favGiven) {
      if (favSource !== undefined) warnings.push('Home favorites list was invalid; defaults used.');
      favSource = PH.DEFAULT_FAVORITES;
    }
    var favSeen = new Set();
    out.favorites = favSource.filter(function (id) {
      if (typeof id !== 'string') { warnings.push('Skipped a Home favorite without a valid id.'); return false; }
      if (!have.has(id)) {
        if (favGiven) warnings.push('Removed "' + id + '" from Home: no matching shortcut.');
        return false;
      }
      if (favSeen.has(id)) { warnings.push('Skipped duplicate Home favorite "' + id + '".'); return false; }
      favSeen.add(id);
      return true;
    });

    return { ok: true, config: out, warnings: warnings };
  }

  function load() {
    var raw = PH.storage.get(STORAGE_KEY);
    if (!raw) return { config: defaults(), source: 'default', warnings: [] };
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) {
      return { config: defaults(), source: 'default', warnings: ['Saved settings were unreadable, so defaults were loaded.'] };
    }
    var r = validate(parsed);
    if (!r.ok) return { config: defaults(), source: 'default', warnings: ['Saved settings could not be used, so defaults were loaded.'] };
    return { config: r.config, source: 'saved', warnings: r.warnings };
  }

  function save(cfg) { return PH.storage.set(STORAGE_KEY, JSON.stringify(cfg)); }

  function exportDoc(cfg, now) {
    var doc = PH.clone(cfg);
    doc.exportedAt = (now || new Date()).toISOString();
    doc.exportedBy = 'Premium Home ' + PH.VERSION;
    doc.note = 'Premium Home layout and preferences only. Not included: your wallpaper photo, saved titles and recent apps ' +
      '(they stay on this device). This is not a TV settings backup or a firmware backup.';
    return doc;
  }

  function findShortcut(cfg, id) {
    for (var i = 0; i < cfg.shortcuts.length; i++) if (cfg.shortcuts[i].id === id) return cfg.shortcuts[i];
    return null;
  }

  // Pure edit operations: each returns a new config and leaves the input untouched.
  var ops = {
    // Moves `id` next to `neighborId` in cfg[field] ('shortcuts' or 'favorites').
    moveRelative: function (cfg, field, id, neighborId, after) {
      var c = PH.clone(cfg);
      var list = c[field];
      var keyOf = field === 'favorites' ? function (x) { return x; } : function (x) { return x.id; };
      var from = list.findIndex(function (x) { return keyOf(x) === id; });
      if (from < 0 || id === neighborId) return c;
      var item = list.splice(from, 1)[0];
      var to = list.findIndex(function (x) { return keyOf(x) === neighborId; });
      if (to < 0) { list.splice(from, 0, item); return c; }
      list.splice(after ? to + 1 : to, 0, item);
      return c;
    },
    setHidden: function (cfg, id, hidden) {
      var c = PH.clone(cfg), s = findShortcut(c, id);
      if (s) s.hidden = !!hidden;
      return c;
    },
    unhideAll: function (cfg) {
      var c = PH.clone(cfg);
      c.shortcuts.forEach(function (s) { s.hidden = false; });
      return c;
    },
    remove: function (cfg, id) {
      var c = PH.clone(cfg);
      c.shortcuts = c.shortcuts.filter(function (s) { return s.id !== id; });
      c.favorites = c.favorites.filter(function (f) { return f !== id; });
      return c;
    },
    add: function (cfg, id) {
      var c = PH.clone(cfg);
      if (!PH.isCatalogId(id)) return c;
      var s = findShortcut(c, id);
      if (s) s.hidden = false;
      else c.shortcuts.push({ id: id, hidden: false });
      return c;
    },
    toggleFavorite: function (cfg, id) {
      var c = PH.clone(cfg);
      var i = c.favorites.indexOf(id);
      if (i >= 0) { c.favorites.splice(i, 1); return c; }
      var s = findShortcut(c, id);
      if (!s) return c;
      s.hidden = false;
      c.favorites.push(id);
      return c;
    },
    restoreDefaultShortcuts: function (cfg) {
      var c = PH.clone(cfg), d = defaults();
      c.shortcuts = d.shortcuts;
      c.favorites = d.favorites;
      return c;
    }
  };

  PH.config = {
    SCHEMA: SCHEMA,
    TEST_MODE: TEST_MODE,
    GREETING_NAMES_MAX: GREETING_NAMES_MAX,
    cleanGreetingNames: cleanGreetingNames,
    VERSION: VERSION,
    STORAGE_KEY: STORAGE_KEY,
    CHOICES: CHOICES,
    INPUT_IDS: INPUT_IDS,
    INPUT_NAME_MAX: INPUT_NAME_MAX,
    defaults: defaults,
    validate: validate,
    load: load,
    save: save,
    exportDoc: exportDoc,
    findShortcut: findShortcut,
    ops: ops
  };
})(window.PH = window.PH || {});
