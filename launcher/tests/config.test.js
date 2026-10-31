// Unit tests for app/js/config.js. Run from CUSTOM-HOME:  node --test tests/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Loads the browser scripts into a sandbox with a fake localStorage.
function loadPH() {
  const store = {};
  const window = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    }
  };
  const ctx = vm.createContext({ window });
  for (const f of ['util.js', 'catalog.js', 'places.js', 'wallpapers.js', 'config.js', 'weather.js', 'daypart.js', 'recents.js', 'cw.js', 'photo.js', 'vpn.js', 'debloat.js', 'widgets.js', 'oled.js']) {
    const file = path.join(__dirname, '..', 'app', 'js', f);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return { PH: window.PH, store };
}

// Objects from the sandbox have another realm's prototypes; compare as plain JSON.
const plain = (x) => JSON.parse(JSON.stringify(x));

test('defaults are valid and put the six favorites, on Home in order', () => {
  const { PH } = loadPH();
  const r = PH.config.validate(PH.config.defaults());
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.warnings), []);
  assert.deepEqual(plain(r.config.favorites), ['youtube', 'netflix', 'disneyplus', 'stremio', 'primevideo', 'tubi']);
  assert.equal(r.config.weather.units, 'C', 'Celsius by default');
  assert.equal(r.config.weather.enabled, false, 'live weather off until the owner opts in');
  assert.equal(r.config.weather.cityId, 'toronto', 'default city');
  assert.equal(r.config.appearance.background, 'scenic', 'v0.5: a scenic wallpaper on first run');
  assert.equal(r.config.version, 7);
});

test('export then restore gives back the same configuration', () => {
  const { PH } = loadPH();
  let cfg = PH.config.defaults();
  cfg = PH.config.ops.setHidden(cfg, 'twitch', true);
  cfg = PH.config.ops.moveRelative(cfg, 'favorites', 'tubi', 'youtube', false);
  cfg.appearance.accent = 'graphite';
  cfg.oledCare.screensaverMinutes = 30;

  const text = JSON.stringify(PH.config.exportDoc(cfg, new Date('2026-10-27T12:00:00Z')));
  const r = PH.config.validate(JSON.parse(text));
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.config), plain(cfg));
  assert.match(JSON.parse(text).note, /not a TV settings backup/);
});

test('rejects files that are not Premium Home configurations', () => {
  const { PH } = loadPH();
  assert.equal(PH.config.validate(null).ok, false);
  assert.equal(PH.config.validate([]).ok, false);
  assert.equal(PH.config.validate({ schema: 'something-else', version: 1 }).ok, false);
  const newer = PH.config.validate({ schema: PH.config.SCHEMA, version: 99 });
  assert.equal(newer.ok, false);
  assert.match(newer.error, /newer version/);
});

test('skips unknown or duplicate shortcuts and drops orphaned favorites', () => {
  const { PH } = loadPH();
  const r = PH.config.validate({
    schema: PH.config.SCHEMA,
    version: 1,
    shortcuts: [{ id: 'netflix' }, { id: 'not-an-app' }, { id: 'netflix', hidden: true }, { id: 'tubi', hidden: true }],
    favorites: ['netflix', 'youtube', 'netflix']
  });
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.config.shortcuts), [{ id: 'netflix', hidden: false }, { id: 'tubi', hidden: true }]);
  assert.deepEqual(plain(r.config.favorites), ['netflix']);
  // unknown id, duplicate shortcut, orphaned favorite, duplicate favorite
  assert.equal(r.warnings.length, 4);
});

test('prototype-named ids are rejected with a warning, never silently', () => {
  const { PH } = loadPH();
  for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    const r = PH.config.validate(JSON.parse(JSON.stringify({
      schema: PH.config.SCHEMA,
      version: 1,
      shortcuts: [{ id }, { id: 'netflix' }],
      favorites: [id, 'netflix']
    })));
    assert.equal(r.ok, true, id);
    assert.deepEqual(plain(r.config.shortcuts), [{ id: 'netflix', hidden: false }], id);
    assert.deepEqual(plain(r.config.favorites), ['netflix'], id);
    assert.ok(r.warnings.some((w) => w.includes('unknown shortcut "' + id + '"')), id + ': shortcut warning');
    assert.ok(r.warnings.some((w) => w.includes('"' + id + '" from Home')), id + ': favorite warning');
  }
  assert.equal(PH.isCatalogId('constructor'), false);
  assert.equal(PH.isCatalogId('__proto__'), false);
  assert.equal(PH.isCatalogId('netflix'), true);
});

test('non-string ids and malformed entries are rejected with warnings', () => {
  const { PH } = loadPH();
  const r = PH.config.validate({
    schema: PH.config.SCHEMA,
    version: 1,
    shortcuts: [{ id: 42 }, { id: null }, null, 'netflix', ['netflix'], {}, { id: 'youtube' }],
    favorites: [7, { id: 'youtube' }, 'youtube']
  });
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.config.shortcuts), [{ id: 'youtube', hidden: false }]);
  assert.deepEqual(plain(r.config.favorites), ['youtube']);
  assert.equal(r.warnings.length, 8);
});

test('intentionally empty lists stay empty', () => {
  const { PH } = loadPH();
  const r = PH.config.validate({ schema: PH.config.SCHEMA, version: 1, shortcuts: [], favorites: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.config.shortcuts), []);
  assert.deepEqual(plain(r.config.favorites), []);
  assert.deepEqual(plain(r.warnings), []);
});

test('a good v0.1 export (Fahrenheit, weather on) still restores unchanged', () => {
  const { PH } = loadPH();
  const v01 = {
    schema: 'lg-c4-premium-home/config', version: 1,
    appearance: { accent: 'glacier', glass: true, motion: 'full', safeAreaGuides: false },
    clock: { hour24: false, showDate: true },
    weather: { enabled: true, units: 'F' },
    oledCare: { pixelShift: true, dimWhenIdle: true, screensaverMinutes: 5 },
    shortcuts: [{ id: 'youtube', hidden: false }, { id: 'netflix', hidden: true }],
    favorites: ['youtube'],
    exportedAt: '2026-10-27T15:00:00.000Z', exportedBy: 'Premium Home 0.1.0', note: 'x'
  };
  const r = PH.config.validate(v01);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.warnings), []);
  assert.equal(r.config.weather.units, 'F');
  assert.equal(r.config.weather.enabled, false, 'a v1 "weather on" was only a placeholder, never consent to network requests');
  assert.equal(r.config.version, 7, 'migrated to the current schema');
  assert.equal(r.config.appearance.background, 'scenic', 'new field gets its default');
  assert.equal(r.config.appearance.accent, 'glacier');
  assert.deepEqual(plain(r.config.shortcuts), v01.shortcuts);
});

test('add() ignores ids that are not own catalog keys', () => {
  const { PH } = loadPH();
  const cfg = PH.config.defaults();
  for (const id of ['constructor', '__proto__', 'toString', 7, null]) {
    assert.equal(PH.config.ops.add(cfg, id).shortcuts.length, cfg.shortcuts.length, String(id));
  }
});

test('invalid setting values fall back to defaults with a warning', () => {
  const { PH } = loadPH();
  const r = PH.config.validate({
    schema: PH.config.SCHEMA,
    version: PH.config.VERSION,
    appearance: { accent: 'pink', glass: 'yes' },
    oledCare: { screensaverMinutes: 7, pixelShift: false }
  });
  assert.equal(r.ok, true);
  assert.equal(r.config.appearance.accent, 'ice');
  assert.equal(r.config.appearance.glass, true);
  assert.equal(r.config.oledCare.screensaverMinutes, 60);
  assert.equal(r.config.oledCare.pixelShift, false);
  assert.equal(r.warnings.length, 3);
});

test('moveRelative places items before or after the neighbour', () => {
  const { PH } = loadPH();
  const cfg = PH.config.defaults();
  const fwd = PH.config.ops.moveRelative(cfg, 'favorites', 'youtube', 'stremio', true);
  assert.deepEqual(plain(fwd.favorites), ['netflix', 'disneyplus', 'stremio', 'youtube', 'primevideo', 'tubi']);
  const back = PH.config.ops.moveRelative(cfg, 'favorites', 'tubi', 'netflix', false);
  assert.deepEqual(plain(back.favorites), ['youtube', 'tubi', 'netflix', 'disneyplus', 'stremio', 'primevideo']);
  const sc = PH.config.ops.moveRelative(cfg, 'shortcuts', 'hdmi4', 'youtube', false);
  assert.equal(sc.shortcuts[0].id, 'hdmi4');
  assert.deepEqual(plain(cfg.favorites), plain(PH.DEFAULT_FAVORITES), 'input config is not mutated');
});

test('remove, add, hide and favorite operations', () => {
  const { PH } = loadPH();
  const ops = PH.config.ops;
  let cfg = ops.remove(PH.config.defaults(), 'netflix');
  assert.equal(cfg.shortcuts.some((s) => s.id === 'netflix'), false);
  assert.equal(cfg.favorites.includes('netflix'), false);

  cfg = ops.add(cfg, 'netflix');
  assert.equal(cfg.shortcuts[cfg.shortcuts.length - 1].id, 'netflix');
  assert.equal(ops.add(cfg, 'bogus').shortcuts.length, cfg.shortcuts.length);

  cfg = ops.setHidden(cfg, 'plex', true); // not a shortcut: no change
  cfg = ops.setHidden(cfg, 'xbox', true);
  cfg = ops.toggleFavorite(cfg, 'xbox');   // favoriting unhides
  assert.equal(PH.config.findShortcut(cfg, 'xbox').hidden, false);
  assert.equal(cfg.favorites[cfg.favorites.length - 1], 'xbox');
  cfg = ops.toggleFavorite(cfg, 'xbox');
  assert.equal(cfg.favorites.includes('xbox'), false);
});

test('load falls back to defaults when saved data is corrupt, and round-trips via save', () => {
  const { PH, store } = loadPH();
  store[PH.config.STORAGE_KEY] = '{not json';
  const bad = PH.config.load();
  assert.equal(bad.source, 'default');
  assert.equal(bad.warnings.length, 1);

  const cfg = PH.config.ops.setHidden(PH.config.defaults(), 'browser', true);
  assert.equal(PH.config.save(cfg), true);
  const good = PH.config.load();
  assert.equal(good.source, 'saved');
  assert.deepEqual(plain(good.config), plain(cfg));
});


// ---------- v0.3: schema v2 and weather ----------

const FIXTURE = path.join(__dirname, 'browser', 'fixtures', 'open-meteo-sample.json');

test('a v0.2 export (schema v1, no new fields) migrates to the current schema with defaults and no warnings', () => {
  const { PH } = loadPH();
  const v02 = {
    schema: 'lg-c4-premium-home/config', version: 1,
    appearance: { accent: 'ice', glass: true, motion: 'reduced', safeAreaGuides: false },
    clock: { hour24: true, showDate: true },
    weather: { enabled: false, units: 'C' },
    oledCare: { pixelShift: true, dimWhenIdle: true, screensaverMinutes: 10 },
    shortcuts: [{ id: 'youtube', hidden: false }, { id: 'tubi', hidden: false }],
    favorites: ['tubi', 'youtube'],
    exportedBy: 'Premium Home 0.2.0'
  };
  const r = PH.config.validate(v02);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.warnings), []);
  assert.equal(r.config.version, 7);
  assert.equal(r.config.appearance.motion, 'reduced');
  assert.equal(r.config.appearance.background, 'scenic');
  assert.equal(r.config.appearance.effects, true);
  assert.equal(r.config.weather.cityId, 'toronto');
  assert.deepEqual(plain(r.config.favorites), ['tubi', 'youtube']);
});

test('new v2 fields are validated: bad background, motion and city fall back with warnings', () => {
  const { PH } = loadPH();
  const r = PH.config.validate({
    schema: PH.config.SCHEMA, version: 2,
    appearance: { background: 'neon', motion: 'off', effects: 'yes' },
    weather: { cityId: '__proto__', enabled: true, units: 'K' }
  });
  assert.equal(r.ok, true);
  assert.equal(r.config.appearance.background, 'scenic');
  assert.equal(r.config.appearance.motion, 'off', '"off" is a valid motion value in v2');
  assert.equal(r.config.appearance.effects, true);
  assert.equal(r.config.weather.cityId, 'toronto');
  assert.equal(r.config.weather.units, 'C');
  assert.equal(r.warnings.length, 4);
});

test('WMO weather codes map to the right scene and label; unknown codes stay neutral', () => {
  const { PH } = loadPH();
  const c = PH.weather.conditionFor;
  const expect = { 0: 'clear', 1: 'clear', 2: 'partly', 3: 'overcast', 45: 'fog', 48: 'fog', 51: 'drizzle', 57: 'drizzle',
    61: 'rain', 67: 'rain', 80: 'rain', 82: 'rain', 71: 'snow', 77: 'snow', 85: 'snow', 86: 'snow', 95: 'thunder', 99: 'thunder' };
  for (const [code, key] of Object.entries(expect)) assert.equal(c(Number(code), true).key, key, 'code ' + code);
  for (const bad of [4, 42, 100, -1, null, '0', undefined]) {
    assert.equal(c(bad, true).key, 'unknown', 'code ' + bad);
    assert.equal(c(bad, true).label, 'Conditions unavailable');
  }
  assert.equal(c(0, true).label, 'Clear sky');
  assert.equal(c(0, false).label, 'Clear', 'night wording');
  assert.equal(c('constructor', true).key, 'unknown', 'prototype names are not codes');
});

test('the real Open-Meteo response (saved fixture) parses into the fields the UI needs', () => {
  const { PH } = loadPH();
  const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const d = PH.weather.parse(raw);
  assert.ok(d, 'parsed');
  assert.equal(typeof d.tempC, 'number');
  assert.equal(typeof d.code, 'number');
  assert.equal(typeof d.isDay, 'boolean');
  assert.equal(d.daily.length, 4);
  assert.deepEqual(Object.keys(d).sort(), ['cloud', 'code', 'daily', 'feelsC', 'isDay', 'observedAt', 'precip', 'tempC', 'windKmh']);
  assert.ok(!('latitude' in d) && !('timezone' in d), 'no location or provider metadata kept');
});

test('unusable responses parse to null instead of showing invented values', () => {
  const { PH } = loadPH();
  const p = PH.weather.parse;
  for (const bad of [null, 'x', [], {}, { current: null }, { current: { temperature_2m: '5', weather_code: 3 } },
    { current: { temperature_2m: 5 } }, { current: { temperature_2m: NaN, weather_code: 3 } }]) {
    assert.equal(p(bad), null, JSON.stringify(bad));
  }
  const ok = p({ current: { temperature_2m: -3.4, weather_code: 71, is_day: 0 }, daily: { time: ['2026-10-27', 5], temperature_2m_max: [1, 2], temperature_2m_min: [-4, -5] } });
  assert.equal(ok.daily.length, 1, 'malformed daily rows are skipped');
  assert.equal(ok.isDay, false);
});

test('request URL uses HTTPS, the city-level coordinates only, and no key', () => {
  const { PH } = loadPH();
  const url = PH.weather.buildUrl(PH.cityById.toronto);
  assert.match(url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  assert.match(url, /latitude=43\.65&longitude=-79\.38/);
  assert.doesNotMatch(url, /key|token|ip=|address/i);
});

test('temperature conversion rounds and handles missing values', () => {
  const { PH } = loadPH();
  assert.equal(PH.weather.convert(-2.4, 'C'), -2);
  assert.equal(PH.weather.convert(-40, 'F'), -40);
  assert.equal(PH.weather.convert(20, 'F'), 68);
  assert.equal(PH.weather.convert(null, 'C'), null);
});

// ---------- v0.4: schema v3, day/night, recents, Continue Watching, photo checks, VPN ----------

// A v0.3.2 export as the app wrote it (schema v2), with non-default choices.
const V032_EXPORT = {
  schema: 'lg-c4-premium-home/config', version: 2,
  appearance: { accent: 'glacier', glass: false, motion: 'reduced', background: 'cinematic', effects: false, ambient: false, safeAreaGuides: false },
  clock: { hour24: true, showDate: false },
  weather: { enabled: true, units: 'F', cityId: 'edmonton' },
  oledCare: { pixelShift: false, dimWhenIdle: true, screensaverMinutes: 2 },
  shortcuts: [{ id: 'netflix', hidden: false }, { id: 'youtube', hidden: true }, { id: 'hdmi1', hidden: false }],
  favorites: ['netflix'],
  exportedAt: '2026-10-27T17:00:00.000Z', exportedBy: 'Premium Home 0.3.2'
};

test('v3 defaults: 90 s auto ambient, auto theme 7–19, first scenic wallpaper, Continue Watching max 4', () => {
  const { PH } = loadPH();
  const d = PH.config.defaults();
  assert.equal(PH.config.validate(d).warnings.length, 0);
  assert.deepEqual(plain(d.ambientMode), { autoDelaySeconds: 90, ambientDim: 'medium', photoMinutes: 10 });
  assert.deepEqual(plain(d.theme), { themeMode: 'auto', dayStartHour: 7, nightStartHour: 19, followSun: true });
  assert.deepEqual(plain(d.wallpaper), { scenicId: 'two-medicine', wallpaperDim: 15, rotateMinutes: 1440, pool: 'photos', favoriteIds: [] }, 'v0.8: a landscape photo first, changing daily');
  assert.deepEqual(plain(d.watching), { cwRow: 'auto', cwMax: 4 });
  assert.deepEqual(plain(d.oledCare), { pixelShift: true, dimWhenIdle: false, dimMinutes: 45, screensaverMinutes: 60 }, 'v0.9: dim at 45 min, black at 60 min, no 45 s dim');
  assert.equal(d.appearance.background, 'scenic', 'v0.5: first run opens on a scenic wallpaper');
  const kept = PH.clone(d); kept.appearance.background = 'dynamic';
  assert.equal(PH.config.validate(kept).config.appearance.background, 'dynamic', 'a saved Dynamic weather choice is kept, never overwritten');
  assert.ok(PH.config.CHOICES.autoDelaySeconds.includes(300), '5 minutes is selectable');
  assert.ok(PH.config.CHOICES.autoDelaySeconds.includes(0), 'auto ambient can be turned off');
});

test('a v0.3.2 export migrates to v3 keeping every old choice, and v3 round-trips through export', () => {
  const { PH } = loadPH();
  const r = PH.config.validate(V032_EXPORT);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.warnings), []);
  assert.equal(r.config.version, 7);
  for (const sec of ['appearance', 'clock']) {
    for (const [k, v] of Object.entries(V032_EXPORT[sec])) assert.equal(r.config[sec][k], v, sec + '.' + k);
  }
  assert.equal(r.config.oledCare.pixelShift, false, 'pixel shift choice kept');
  assert.equal(r.config.oledCare.dimWhenIdle, false, 'v0.9: the owner\'s new schedule replaces the 45 s dim');
  assert.equal(r.config.oledCare.screensaverMinutes, 60, 'v0.9: the old 2-minute screensaver becomes black at 60 min');
  assert.deepEqual(plain(r.config.weather), { enabled: true, units: 'F', cityId: 'edmonton' }, 'v2 weather consent is kept (it was real consent)');
  assert.deepEqual(plain(r.config.shortcuts), V032_EXPORT.shortcuts);
  assert.deepEqual(plain(r.config.favorites), ['netflix']);
  assert.equal(r.config.ambientMode.autoDelaySeconds, 90, 'new fields get defaults');

  const cfg = r.config;
  cfg.ambientMode.autoDelaySeconds = 300;
  cfg.theme.themeMode = 'night';
  cfg.wallpaper = { scenicId: 'northern-lights', wallpaperDim: 30, rotateMinutes: 60, pool: 'favorites', favoriteIds: ['moraine-lake'] };
  cfg.appearance.background = 'scenic';
  cfg.gaming.inputNames.hdmi1 = 'PlayStation 5';
  cfg.gaming.favoriteInput = 'hdmi1';
  const doc = JSON.parse(JSON.stringify(PH.config.exportDoc(cfg, new Date('2026-10-27T12:00:00Z'))));
  assert.match(doc.note, /not included: your wallpaper photo, saved titles and recent apps/i);
  const back = PH.config.validate(doc);
  assert.equal(back.ok, true);
  assert.deepEqual(plain(back.warnings), []);
  assert.deepEqual(plain(back.config), plain(cfg));
});

test('v3 fields are validated: bad values fall back with warnings, HDMI names are cleaned', () => {
  const { PH } = loadPH();
  const r = PH.config.validate({
    schema: PH.config.SCHEMA, version: 3,
    ambientMode: { autoDelaySeconds: 45, ambientDim: 'max' },
    theme: { themeMode: 'auto', dayStartHour: 24, nightStartHour: '19', followSun: 'yes' },
    wallpaper: { scenicId: '../../etc/passwd', wallpaperDim: 99, rotateMinutes: 60 },
    watching: { cwRow: 'auto', cwMax: 5 },
    gaming: { favoriteInput: 'hdmi9', inputNames: { hdmi1: '  PS5‮\u0007  Pro  ', hdmi2: { x: 1 }, hdmi3: 'A'.repeat(60), __proto__: 'x' } }
  });
  assert.equal(r.ok, true);
  const c = r.config;
  assert.equal(c.ambientMode.autoDelaySeconds, 90);
  assert.equal(c.ambientMode.ambientDim, 'medium');
  assert.equal(c.theme.dayStartHour, 7);
  assert.equal(c.theme.nightStartHour, 19);
  assert.equal(c.theme.followSun, true);
  assert.equal(c.wallpaper.scenicId, 'two-medicine');
  assert.equal(c.wallpaper.wallpaperDim, 15);
  assert.equal(c.wallpaper.rotateMinutes, 60, 'valid values are kept');
  assert.equal(c.watching.cwMax, 4);
  assert.equal(c.gaming.favoriteInput, '');
  assert.equal(c.gaming.inputNames.hdmi1, 'PS5 Pro', 'control and bidi characters removed');
  assert.equal(c.gaming.inputNames.hdmi2, '');
  assert.equal(c.gaming.inputNames.hdmi3.length, 24);
  assert.equal(Object.keys(c.gaming.inputNames).length, 4);
  assert.ok(r.warnings.length >= 10, 'each bad value is reported');
});

test('day/night: schedule boundaries, wrap past midnight, manual modes and sunrise/sunset', () => {
  const { PH } = loadPH();
  const at = (h, m) => new Date(2026, 9, 27, h, m || 0);
  const t = { themeMode: 'auto', dayStartHour: 7, nightStartHour: 19, followSun: true };
  assert.equal(PH.daypart.compute(at(6, 59), t), 'night');
  assert.equal(PH.daypart.compute(at(7, 0), t), 'day');
  assert.equal(PH.daypart.compute(at(18, 59), t), 'day');
  assert.equal(PH.daypart.compute(at(19, 0), t), 'night');
  assert.equal(PH.daypart.compute(at(0, 0), t), 'night', 'midnight');
  assert.equal(PH.daypart.compute(at(23, 59), t), 'night');
  const wrap = Object.assign({}, t, { dayStartHour: 20, nightStartHour: 4 });
  assert.equal(PH.daypart.compute(at(23, 0), wrap), 'day', 'day can span midnight');
  assert.equal(PH.daypart.compute(at(3, 59), wrap), 'day');
  assert.equal(PH.daypart.compute(at(4, 0), wrap), 'night');
  assert.equal(PH.daypart.compute(at(12, 0), Object.assign({}, t, { themeMode: 'night' })), 'night');
  assert.equal(PH.daypart.compute(at(2, 0), Object.assign({}, t, { themeMode: 'day' })), 'day');
  assert.equal(PH.daypart.compute(at(12, 0), t, false), 'night', 'sun flag wins when weather data exists');
  assert.equal(PH.daypart.compute(at(2, 0), t, true), 'day');
  assert.equal(PH.daypart.compute(at(2, 0), Object.assign({}, t, { followSun: false }), true), 'night', 'sun ignored when off');
  assert.equal(PH.daypart.source(t, undefined), 'schedule', 'no weather: no network needed');
  assert.equal(PH.daypart.compute(at(12, 0), Object.assign({}, t, { nightStartHour: 7 })), 'day', 'equal hours mean always day');
});

test('day/night follows the TV clock\'s own time zone', () => {
  const saved = process.env.TZ;
  try {
    const instant = Date.UTC(2026, 9, 28, 2, 0); // 20:00 Oct 27 in Edmonton, 11:00 Oct 28 in Tokyo
    const t = { themeMode: 'auto', dayStartHour: 7, nightStartHour: 19, followSun: false };
    process.env.TZ = 'America/Edmonton';
    const { PH } = loadPH();
    assert.equal(PH.daypart.compute(new Date(instant), t), 'night');
    process.env.TZ = 'Asia/Tokyo';
    assert.equal(PH.daypart.compute(new Date(instant), t), 'day');
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

test('recent: only known shortcuts, newest first, no duplicates, at most 8, demo vs native kept', () => {
  const { PH } = loadPH();
  let list = [];
  const ids = ['youtube', 'netflix', 'disneyplus', 'stremio', 'primevideo', 'tubi', 'livetv', 'browser', 'xbox'];
  ids.forEach((id, i) => { list = PH.recents.record(list, id, 'demo', new Date(2026, 9, 27, 10, i)); });
  assert.equal(list.length, 8);
  assert.equal(list[0].id, 'xbox');
  assert.ok(!list.some((r) => r.id === 'youtube'), 'oldest dropped');
  list = PH.recents.record(list, 'netflix', 'native', new Date(2026, 9, 27, 11));
  assert.equal(list[0].id, 'netflix');
  assert.equal(list[0].kind, 'native');
  assert.equal(list.filter((r) => r.id === 'netflix').length, 1);
  assert.deepEqual(plain(PH.recents.record(list, 'not-an-app', 'demo')), plain(list));
  assert.deepEqual(plain(PH.recents.record(list, 'tubi', 'played')), plain(list), 'unknown kinds rejected');
  const cleaned = PH.recents.sanitize([{ id: 'youtube', kind: 'demo', at: '2026-10-27T10:00:00Z' }, { id: 'youtube', kind: 'demo', at: '2026-10-27T09:00:00Z' },
    { id: '__proto__', kind: 'demo', at: '2026-10-27T10:00:00Z' }, { id: 'netflix', kind: 'demo', at: 'yesterday' }, null, 'x']);
  assert.deepEqual(plain(cleaned).map((r) => r.id), ['youtube']);
  assert.deepEqual(plain(PH.recents.sanitize({ not: 'a list' })), []);
});

test('Continue Watching: saved titles never carry progress; provider progress needs a source and 0–100', () => {
  const { PH } = loadPH();
  const now = new Date('2026-10-27T12:00:00Z');
  const manual = PH.cw.normalize({ provider: 'manual', title: 'Shogun', serviceId: 'disneyplus', updatedAt: now.toISOString(), progressPercent: 85, progressSource: 'me' }, now);
  assert.equal(manual.progressPercent, null, 'manual entries never show progress');
  assert.equal(manual.isManuallySaved, true);
  const ok = PH.cw.normalize({ provider: 'trakt', providerItemId: 't1', title: 'Show', updatedAt: now.toISOString(), progressPercent: 42.4, progressSource: 'Trakt playback' }, now);
  assert.equal(ok.progressPercent, 42);
  for (const bad of [120, -1, NaN, '50', Infinity]) {
    assert.equal(PH.cw.normalize({ provider: 'trakt', title: 'S', updatedAt: now.toISOString(), progressPercent: bad, progressSource: 'Trakt' }, now).progressPercent, null, String(bad));
  }
  assert.equal(PH.cw.normalize({ provider: 'trakt', title: 'S', updatedAt: now.toISOString(), progressPercent: 50 }, now).progressPercent, null, 'no source, no progress');
  assert.equal(PH.cw.normalize({ provider: 'netflix-scrape', title: 'S', updatedAt: now.toISOString() }, now), null, 'unknown providers rejected');
  assert.equal(PH.cw.normalize({ provider: 'manual', title: '   ', updatedAt: now.toISOString() }, now), null);
  assert.equal(PH.cw.normalize({ provider: 'manual', title: 'S', updatedAt: '2027-06-01T00:00:00Z' }, now), null, 'future timestamps rejected');
  const nasty = PH.cw.normalize({ provider: 'manual', title: '<img src=x onerror=alert(1)>‮' + 'x'.repeat(200), updatedAt: now.toISOString(), serviceId: 'constructor',
    artwork: 'https://evil.example/a.jpg' }, now);
  assert.equal(nasty.title.length, 80);
  assert.ok(!/‮/.test(nasty.title));
  assert.equal(nasty.serviceId, null);
  assert.equal(nasty.artwork, null, 'remote artwork not accepted');
  assert.equal(PH.cw.normalize({ provider: 'fixture', title: 'S', updatedAt: now.toISOString(), artwork: 'assets/../../x.svg' }, now).artwork, null);
});

test('Continue Watching: merge sorts newest first, collapses duplicates (verified progress wins) and caps at 3/4', () => {
  const { PH } = loadPH();
  const now = new Date('2026-10-27T12:00:00Z');
  const n = (o) => PH.cw.normalize(Object.assign({ updatedAt: now.toISOString() }, o), now);
  const saved = n({ provider: 'manual', title: 'Dune', serviceId: 'primevideo', updatedAt: '2026-10-27T11:00:00Z' });
  const tracked = n({ provider: 'trakt', providerItemId: 'd', title: 'dune', serviceId: 'primevideo', updatedAt: '2026-10-26T11:00:00Z', progressPercent: 30, progressSource: 'Trakt' });
  const others = ['A', 'B', 'C', 'D'].map((t, i) => n({ provider: 'manual', title: t, updatedAt: '2026-10-2' + i + 'T10:00:00Z' }));
  const merged = PH.cw.merge([[saved, tracked], others, [null]], 4);
  assert.equal(merged.length, 4);
  assert.equal(merged[0].title.toLowerCase(), 'dune');
  assert.equal(merged[0].progressPercent, 30, 'the verified entry replaces the saved duplicate');
  assert.deepEqual(plain(merged.slice(1).map((x) => x.title)), ['D', 'C', 'B']);
  assert.equal(PH.cw.merge([others], 3).length, 3);
  assert.equal(PH.cw.rowTitle([saved]), 'Saved for later');
  assert.equal(PH.cw.rowTitle([saved, tracked]), 'Continue Watching');
  const fixtures = PH.cw.fixtureItems(now);
  assert.ok(fixtures.every((f) => f.provider === 'fixture' && /DEV DEMO/.test(f.progressSource)), 'fixtures are always labelled');
});

test('Continue Watching: saved titles persist locally, dedupe, remove and clear; bad storage is ignored', () => {
  const { PH, store } = loadPH();
  assert.deepEqual(plain(PH.cw.loadSaved()), []);
  assert.equal(PH.cw.saveTitle({ title: '  ' }).ok, false);
  const a = PH.cw.saveTitle({ title: 'Severance', serviceId: 'appletv' });
  assert.equal(a.ok, true);
  PH.cw.saveTitle({ title: 'severance', serviceId: 'appletv' });
  PH.cw.saveTitle({ title: 'Andor', serviceId: 'disneyplus' });
  assert.deepEqual(plain(PH.cw.loadSaved().map((x) => x.title)), ['Andor', 'severance']);
  PH.cw.removeSaved(PH.cw.loadSaved()[0].providerItemId);
  assert.deepEqual(plain(PH.cw.loadSaved().map((x) => x.title)), ['severance']);
  store[PH.cw.KEY] = JSON.stringify([{ provider: 'trakt', title: 'Injected', updatedAt: '2026-10-27T10:00:00Z', progressPercent: 99, progressSource: 'x' }, 'junk']);
  assert.deepEqual(plain(PH.cw.loadSaved()), [], 'only manual entries are accepted from local storage');
  store[PH.cw.KEY] = '{broken';
  assert.deepEqual(plain(PH.cw.loadSaved()), []);
  PH.cw.clearSaved();
  assert.equal(store[PH.cw.KEY], '[]');
});

test('wallpaper photo checks: type, size and dimension limits; output covers 1080p without upscaling', () => {
  const { PH } = loadPH();
  assert.equal(PH.photo.checkFile('image/jpeg', 3e6), null);
  assert.match(PH.photo.checkFile('image/gif', 3e6), /JPEG, PNG or WebP/);
  assert.match(PH.photo.checkFile('image/svg+xml', 3e3), /JPEG, PNG or WebP/, 'SVG (scriptable) refused');
  assert.match(PH.photo.checkFile('image/png', 0), /empty/);
  assert.match(PH.photo.checkFile('image/png', PH.photo.MAX_BYTES + 1), /25 MB/);
  assert.match(PH.photo.checkSize(320, 240), /too small/);
  assert.match(PH.photo.checkSize(20000, 3000), /too large/);
  assert.equal(PH.photo.checkSize(4000, 3000), null);
  assert.deepEqual(plain(PH.photo.targetSize(4000, 3000)), { width: 1920, height: 1440 });
  assert.deepEqual(plain(PH.photo.targetSize(1280, 720)), { width: 1280, height: 720 }, 'never upscaled');
  assert.deepEqual(plain(PH.photo.targetSize(12000, 2000)), { width: 3840, height: 640 }, 'panoramas capped at 3840');
  assert.deepEqual(plain(PH.photo.targetSize(3840, 2160)), { width: 1920, height: 1080 });
});

test('every bundled wallpaper is a local file: 1920x1080 photos with credits and thumbnails, safe SVG artwork; VPN is never shown as controllable', () => {
  const { PH } = loadPH();
  const photos = PH.wallpapers.filter((w) => w.photo), art = PH.wallpapers.filter((w) => !w.photo);
  assert.equal(photos.length, 9);
  assert.equal(art.length, 6);
  const licences = fs.readFileSync(path.join(__dirname, '..', 'ASSET-LICENSES.md'), 'utf8');
  const jpegSize = (buf) => {   // width/height from the JPEG SOF marker
    for (let i = 2; i < buf.length;) {
      const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc2) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + len;
    }
    return null;
  };
  for (const w of photos) {
    const dir = path.join(__dirname, '..', 'app');
    assert.deepEqual(jpegSize(fs.readFileSync(path.join(dir, w.file))), [1920, 1080], w.id + ' is 1920x1080');
    assert.deepEqual(jpegSize(fs.readFileSync(path.join(dir, w.thumb))), [384, 216], w.id + ' thumbnail');
    assert.ok(fs.statSync(path.join(dir, w.file)).size < 600000, w.id + ' stays small for the TV');
    assert.match(w.credit, /public domain|CC BY/, w.id + ' shows its licence');
    assert.ok(licences.includes('assets/photos/' + w.id + '.jpg'), w.id + ' is listed in ASSET-LICENSES.md');
  }
  for (const w of art) {
    const svg = fs.readFileSync(path.join(__dirname, '..', 'app', w.file), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1920 1080"/, w.id);
    assert.doesNotMatch(svg, /<script|<image|href="http|<foreignObject/i, w.id + ' has no scripts or external references');
  }
  const v = PH.vpn.status();
  assert.equal(v.state, 'not-configured');
  assert.equal(v.canControl, false);
  assert.equal(PH.vpn.hasAdapter(), false);
});

test('cleanLabel strips control and bidi characters, collapses spaces and counts characters, not bytes', () => {
  const { PH } = loadPH();
  assert.equal(PH.cleanLabel('  a\tb\n\nc  ', 10), 'a b c');
  assert.equal(PH.cleanLabel('x​‮y⁦', 10), 'x y');
  assert.equal(PH.cleanLabel('🎮🎮🎮', 2), '🎮🎮');
  assert.equal(PH.cleanLabel(42, 10), '');
});

test('v4: a saved v3 "rotation Off" is kept; fresh and older configs rotate daily; pool and favourites are validated', () => {
  const { PH } = loadPH();
  const v3 = PH.config.defaults();
  v3.version = 3;
  v3.wallpaper = { scenicId: 'bowman-lake', wallpaperDim: 15, rotateMinutes: 0 };
  delete v3.wallpaper.pool;
  let r = PH.config.validate(v3);
  assert.equal(r.ok, true);
  assert.equal(r.config.version, 7);
  assert.equal(r.config.wallpaper.rotateMinutes, 0, 'an existing Off choice is never switched on');
  assert.equal(r.config.wallpaper.pool, 'photos');
  assert.deepEqual(plain(r.config.wallpaper.favoriteIds), []);
  r = PH.config.validate({ schema: PH.config.SCHEMA, version: 2, appearance: { motion: 'reduced' } });
  assert.equal(r.config.wallpaper.rotateMinutes, 1440, 'a config that never had wallpaper settings gets Daily');
  const d = PH.config.defaults();
  d.wallpaper.pool = 'favorites';
  d.wallpaper.favoriteIds = ['moraine-lake', 'nope', 'moraine-lake', 42, 'aurora-denali'];
  r = PH.config.validate(d);
  assert.deepEqual(plain(r.config.wallpaper.favoriteIds), ['moraine-lake', 'aurora-denali'], 'unknown and duplicate ids dropped');
  assert.ok(r.warnings.length >= 3, 'with warnings');
  d.wallpaper.pool = 'everything';
  assert.equal(PH.config.validate(d).config.wallpaper.pool, 'photos', 'bad pool falls back');
  assert.ok(PH.config.CHOICES.rotateMinutes.includes(1440), 'Daily is a choice');
});

test('launch IDs: all six favourites and the TV inputs use IDs confirmed on the owner\'s C4', () => {
  const { PH } = loadPH();
  const expect = { youtube: 'youtube.leanback.v4', netflix: 'netflix', disneyplus: 'com.disney.disneyplus-prod', primevideo: 'amazon', stremio: 'io.strem.tv', tubi: 'com.tubitv.ott.tubi',
    livetv: 'com.webos.app.livetv', browser: 'com.webos.app.browser', hdmi1: 'com.webos.app.hdmi1', hdmi2: 'com.webos.app.hdmi2', hdmi3: 'com.webos.app.hdmi3', hdmi4: 'com.webos.app.hdmi4' };
  for (const [id, appId] of Object.entries(expect)) {
    assert.equal(PH.catalogById[id].appId, appId, id);
    assert.ok(PH.VERIFIED_APP_IDS.includes(appId), appId + ' is verified');
  }
  for (const id of PH.DEFAULT_FAVORITES) assert.ok(PH.VERIFIED_APP_IDS.includes(PH.catalogById[id].appId), id + ' (favourite) opens for real');
  assert.equal(PH.LG_HOME_APP_ID, 'com.webos.app.home');
  for (const app of PH.catalog) if (app.appId && !PH.VERIFIED_APP_IDS.includes(app.appId)) assert.fail(app.id + ' has an unverified ID');
});

test('TV cleanup: 13 optional apps from the TV list, never an app we must keep; no fake privacy state; nothing claimed removed without a check', () => {
  const { PH } = loadPH();
  const D = PH.debloat;
  assert.equal(D.OPTIONAL.length, 13);
  const keep = ['youtube.leanback.v4', 'netflix', 'com.disney.disneyplus-prod', 'amazon', 'io.strem.tv', 'com.tubitv.ott.tubi', 'local.lgc4.premiumhome', 'com.palmdts.devmode', 'com.webos.app.home'];
  for (const a of D.OPTIONAL) {
    assert.ok(!keep.includes(a.appId), a.appId + ' must never be proposed');
    assert.ok(!/^com\.(webos|lge|palm)\./.test(a.appId), a.appId + ' is not a built-in component');
    assert.ok(['remove', 'keep', 'owner'].includes(a.proposal), a.appId + ' proposal');
    assert.ok(a.note.length > 10, a.appId + ' explains the effect');
  }
  assert.equal(new Set(D.OPTIONAL.map((a) => a.appId)).size, 13, 'no duplicates');
  for (const p of D.PRIVACY) assert.ok(!('enabled' in p) && !('value' in p), p.name + ' has no invented on/off state');
  assert.equal(D.removedCount(), 0, 'nothing counted as removed before a live check');
});

test('v5 greeting: time bands switch exactly at 05:00, 12:00, 17:00 and 00:00', () => {
  const { PH } = loadPH();
  const at = (h, m) => new Date(2026, 9, 28, h, m, 0);
  const g = (h, m) => PH.widgets.greeting(at(h, m));
  assert.equal(g(4, 59), 'Good night');
  assert.equal(g(5, 0), 'Good morning');
  assert.equal(g(11, 59), 'Good morning');
  assert.equal(g(12, 0), 'Good afternoon');
  assert.equal(g(16, 59), 'Good afternoon');
  assert.equal(g(17, 0), 'Good evening');
  assert.equal(g(23, 59), 'Good evening');
  assert.equal(g(0, 0), 'Good night');
  assert.equal(PH.widgets.greetingText(at(17, 0), { greetingNames: 'Alex & Sam' }), 'Good evening, Alex & Sam');
  assert.equal(PH.widgets.greetingText(at(9, 0), { greetingNames: '' }), 'Good morning', 'no names: no comma');
});

test('v5 greeting: v4 configs migrate with greeting on, no names and every other setting kept', () => {
  const { PH } = loadPH();
  const v4 = PH.config.defaults();
  v4.version = 4;
  delete v4.clock.greetingShow; delete v4.clock.greetingNames; delete v4.clock.greetingAmbient;
  v4.clock.hour24 = true;
  v4.wallpaper.rotateMinutes = 0;
  const r = PH.config.validate(v4);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.warnings), []);
  assert.equal(r.config.version, 7);
  assert.equal(r.config.clock.hour24, true);
  assert.equal(r.config.wallpaper.rotateMinutes, 0);
  assert.equal(r.config.clock.greetingShow, true);
  assert.equal(r.config.clock.greetingNames, '');
  assert.equal(r.config.clock.greetingAmbient, true);
  assert.equal(PH.config.defaults().clock.greetingNames, '', 'no household names in the source defaults');
});

test('v5 greeting: names keep letters (any script), & and apostrophes; markup, control and bidi characters are removed', () => {
  const { PH } = loadPH();
  const clean = PH.config.cleanGreetingNames;
  assert.equal(clean('Alex & Sam'), 'Alex & Sam');
  assert.equal(clean('  Zoë   & José-María  '), 'Zoë & José-María');
  assert.equal(clean('O’Neil, Ana'), 'O’Neil, Ana');
  assert.equal(clean('محمد & ليلى'), 'محمد & ليلى');
  assert.equal(clean('<img src=x onerror=alert(1)>'), 'img srcx onerroralert1');
  assert.equal(clean('Al‮ex\u0000​ & Sam'), 'Alex & Sam');
  assert.equal(clean('a'.repeat(60)).length, PH.config.GREETING_NAMES_MAX);
  assert.equal(clean(42), null);
  const cfg = PH.config.defaults();
  cfg.clock.greetingNames = '<b>Alex</b>';
  let r = PH.config.validate(cfg);
  assert.equal(r.config.clock.greetingNames, 'bAlexb');
  assert.equal(r.warnings.length, 1);
  cfg.clock.greetingNames = { evil: true };
  r = PH.config.validate(cfg);
  assert.equal(r.config.clock.greetingNames, '');
  cfg.clock.greetingNames = 'Alex & Sam'; cfg.clock.greetingShow = 'yes';
  r = PH.config.validate(cfg);
  assert.equal(r.config.clock.greetingShow, true, 'invalid flag falls back to the default');
  assert.equal(r.config.clock.greetingNames, 'Alex & Sam');
});

test('v5 greeting: names persist through save and load', () => {
  const { PH } = loadPH();
  const cfg = PH.config.defaults();
  cfg.clock.greetingNames = 'Alex & Sam'; cfg.clock.greetingAmbient = false;
  PH.config.save(cfg);
  const back = PH.config.load();
  assert.equal(back.source, 'saved');
  assert.equal(back.config.clock.greetingNames, 'Alex & Sam');
  assert.equal(back.config.clock.greetingAmbient, false);
});

test('v6 OLED schedule: ambient at 90 s, photo every 10 min, dim at 45:00, black at 60:00 (fake clock)', () => {
  const { PH } = loadPH();
  const cfg = PH.config.defaults();
  const S = (idle, amb) => PH.oled.schedule(idle, amb === undefined ? null : amb, cfg);
  assert.equal(S(5).hintsIdle, false); assert.equal(S(6).hintsIdle, true);
  assert.equal(S(89).openAmbient, false); assert.equal(S(90).openAmbient, true); assert.equal(S(91).openAmbient, true);
  assert.equal(S(91, 1).openAmbient, false, 'never re-opens while ambient is showing');
  assert.equal(S(45, null).homeDim, false, 'no 45-second general dim by default');
  assert.equal(S(90 + 599, 599).photoStep, 0); assert.equal(S(90 + 600, 600).photoStep, 1);
  assert.equal(S(90 + 1199, 1199).photoStep, 1); assert.equal(S(90 + 1200, 1200).photoStep, 2);
  assert.equal(S(44 * 60 + 59).dim, false); assert.equal(S(45 * 60).dim, true); assert.equal(S(45 * 60 + 1).dim, true);
  assert.equal(S(59 * 60 + 59).black, false); assert.equal(S(60 * 60).black, true); assert.equal(S(60 * 60 + 1).black, true);
  cfg.ambientMode.photoMinutes = 0;
  assert.equal(S(3600, 3000).photoStep, 0, 'photo change off');
  cfg.ambientMode.autoDelaySeconds = 0;
  assert.equal(S(10000).openAmbient, false, 'auto ambient off');
  cfg.oledCare.dimWhenIdle = true;
  assert.equal(S(44).homeDim, false); assert.equal(S(45).homeDim, true);
});

test('v6 migration: a v0.8.3 (v5) config gets the new schedule and keeps greeting, wallpaper and everything else', () => {
  const { PH } = loadPH();
  const v5 = PH.config.defaults();
  v5.version = 5;
  v5.oledCare = { pixelShift: false, dimWhenIdle: true, screensaverMinutes: 5, saverClock: true };
  v5.ambientMode = { autoDelaySeconds: 120, ambientDim: 'strong' };
  v5.clock.greetingNames = 'Alex & Sam';
  v5.wallpaper.rotateMinutes = 0; v5.wallpaper.scenicId = 'bowman-lake';
  v5.appearance.accent = 'graphite';
  const r = PH.config.validate(v5);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.warnings), []);
  assert.equal(r.config.version, 7);
  assert.deepEqual(plain(r.config.oledCare), { pixelShift: false, dimWhenIdle: false, dimMinutes: 45, screensaverMinutes: 60 });
  assert.deepEqual(plain(r.config.ambientMode), { autoDelaySeconds: 120, ambientDim: 'strong', photoMinutes: 10 }, 'own ambient choices kept; photo change added');
  assert.equal(r.config.clock.greetingNames, 'Alex & Sam');
  assert.equal(r.config.wallpaper.rotateMinutes, 0);
  assert.equal(r.config.appearance.accent, 'graphite');
  assert.equal('saverClock' in r.config.oledCare, false, 'the screensaver clock is gone: black means black');
});

test('v6 limits: black screen at most 60 min and never Off; unknown dim or photo values fall back with a warning', () => {
  const { PH } = loadPH();
  assert.deepEqual(plain(PH.config.CHOICES.screensaverMinutes), [20, 30, 45, 60]);
  const cfg = PH.config.defaults();
  cfg.oledCare.screensaverMinutes = 0; cfg.oledCare.dimMinutes = 240; cfg.ambientMode.photoMinutes = 1;
  const r = PH.config.validate(cfg);
  assert.equal(r.config.oledCare.screensaverMinutes, 60);
  assert.equal(r.config.oledCare.dimMinutes, 45);
  assert.equal(r.config.ambientMode.photoMinutes, 10);
  assert.equal(r.warnings.length, 3);
  const newer = PH.config.defaults(); newer.version = PH.config.VERSION + 1;
  assert.equal(PH.config.validate(newer).ok, false, 'a newer schema is refused, never half-read');
});

test('v7 is a no-op in this build: a v6 config migrates with nothing added', () => {
  const { PH } = loadPH();
  const v6 = PH.config.defaults(); v6.version = 6; v6.clock.greetingNames = 'Alex & Sam';
  const r = PH.config.validate(v6);
  assert.equal(r.ok, true); assert.deepEqual(plain(r.warnings), []);
  assert.equal(r.config.version, 7);
  assert.deepEqual(plain(r.config.favorites), ['youtube', 'netflix', 'disneyplus', 'stremio', 'primevideo', 'tubi']);
  assert.equal(r.config.clock.greetingNames, 'Alex & Sam', 'names kept');
});
