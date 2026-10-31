/*
 * Weather engine (Open-Meteo forecast API, no key, HTTPS).
 *
 * Privacy rules, enforced here:
 *  - No request is ever made unless config.weather.enabled is true. That flag is only set
 *    after the owner confirms the consent dialog.
 *  - Requests carry only the chosen city's approximate coordinates (places.js).
 *  - Refresh at most every 30 minutes, only while the app is visible and not in the
 *    screensaver. After a failure, wait 5 minutes before retrying automatically.
 *  - The cache keeps one trimmed response (no history) and can be cleared in Settings.
 *  - Demo fixtures are for previewing scenes only and are always labelled DEMO.
 *
 * The pure helpers (conditionFor, buildUrl, parse, convert) are unit-tested under Node.
 */
(function (PH) {
  'use strict';

  var ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  var REFRESH_MS = 30 * 60 * 1000;
  var RETRY_MS = 5 * 60 * 1000;
  var TIMEOUT_MS = 10000;
  var CACHE_KEY = 'premiumHome.weather.v1' + (PH.config && PH.config.TEST_MODE ? '.test' : '');

  // WMO weather interpretation codes (Open-Meteo docs) → scene key + label.
  var CODES = {
    0: ['clear', 'Clear sky'], 1: ['clear', 'Mainly clear'], 2: ['partly', 'Partly cloudy'], 3: ['overcast', 'Overcast'],
    45: ['fog', 'Fog'], 48: ['fog', 'Rime fog'],
    51: ['drizzle', 'Light drizzle'], 53: ['drizzle', 'Drizzle'], 55: ['drizzle', 'Dense drizzle'],
    56: ['drizzle', 'Freezing drizzle'], 57: ['drizzle', 'Freezing drizzle'],
    61: ['rain', 'Light rain'], 63: ['rain', 'Rain'], 65: ['rain', 'Heavy rain'],
    66: ['rain', 'Freezing rain'], 67: ['rain', 'Heavy freezing rain'],
    71: ['snow', 'Light snow'], 73: ['snow', 'Snow'], 75: ['snow', 'Heavy snow'], 77: ['snow', 'Snow grains'],
    80: ['rain', 'Rain showers'], 81: ['rain', 'Rain showers'], 82: ['rain', 'Violent rain showers'],
    85: ['snow', 'Snow showers'], 86: ['snow', 'Heavy snow showers'],
    95: ['thunder', 'Thunderstorm'], 96: ['thunder', 'Thunderstorm, hail'], 97: ['thunder', 'Heavy thunderstorm'],
    99: ['thunder', 'Thunderstorm, heavy hail']
  };

  function conditionFor(code, isDay) {
    var c = typeof code === 'number' && Object.prototype.hasOwnProperty.call(CODES, code) ? CODES[code] : ['unknown', 'Conditions unavailable'];
    var label = c[1];
    if (!isDay && code === 0) label = 'Clear';
    return { key: c[0], label: label, isDay: !!isDay };
  }

  function buildUrl(city) {
    return ENDPOINT +
      '?latitude=' + city.lat.toFixed(2) + '&longitude=' + city.lon.toFixed(2) +
      '&current=temperature_2m,apparent_temperature,is_day,weather_code,cloud_cover,precipitation,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=auto&forecast_days=4';
  }

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  // Keeps only what the UI needs. Returns null if the response is unusable.
  function parse(json) {
    if (!json || typeof json !== 'object' || !json.current || typeof json.current !== 'object') return null;
    var cur = json.current;
    var temp = num(cur.temperature_2m), code = num(cur.weather_code);
    if (temp === null || code === null) return null;
    var daily = [];
    var d = json.daily;
    if (d && Array.isArray(d.time)) {
      for (var i = 0; i < d.time.length && daily.length < 4; i++) {
        var max = num(d.temperature_2m_max && d.temperature_2m_max[i]);
        var min = num(d.temperature_2m_min && d.temperature_2m_min[i]);
        if (typeof d.time[i] !== 'string' || max === null || min === null) continue;
        daily.push({
          date: d.time[i],
          code: num(d.weather_code && d.weather_code[i]),
          maxC: max, minC: min,
          pop: num(d.precipitation_probability_max && d.precipitation_probability_max[i])
        });
      }
    }
    return {
      tempC: temp,
      feelsC: num(cur.apparent_temperature),
      isDay: cur.is_day === 1,
      code: code,
      cloud: num(cur.cloud_cover),
      precip: num(cur.precipitation),
      windKmh: num(cur.wind_speed_10m),
      observedAt: typeof cur.time === 'string' ? cur.time : null,
      daily: daily
    };
  }

  function convert(c, units) {
    if (c === null || c === undefined) return null;
    return Math.round(units === 'F' ? c * 9 / 5 + 32 : c);
  }

  // ---------- demo fixtures (never shown as live) ----------

  function fixture(code, isDay, temp, feels, days) {
    return {
      tempC: temp, feelsC: feels, isDay: isDay, code: code, cloud: null, precip: null, windKmh: 12, observedAt: null,
      daily: days.map(function (x, i) { return { date: 'D' + i, code: x[0], maxC: x[1], minC: x[2], pop: x[3] }; })
    };
  }

  var DEMOS = {
    'clear-day': fixture(0, true, 18, 17, [[0, 20, 8, 0], [1, 21, 9, 5], [2, 17, 7, 10], [3, 15, 6, 20]]),
    'clear-night': fixture(0, false, -12, -18, [[0, -6, -15, 0], [2, -4, -13, 5], [71, -7, -14, 60], [3, -5, -12, 10]]),
    'partly': fixture(2, true, 9, 7, [[2, 11, 1, 10], [3, 8, 0, 25], [61, 7, 2, 70], [1, 12, 3, 5]]),
    'overcast': fixture(3, true, 4, 1, [[3, 6, -1, 20], [3, 5, -2, 30], [2, 7, 0, 15], [0, 9, 1, 0]]),
    'fog': fixture(45, true, 2, 0, [[45, 6, -1, 10], [3, 7, 0, 20], [2, 8, 1, 10], [0, 9, 0, 0]]),
    'rain': fixture(63, true, 7, 4, [[63, 9, 4, 90], [61, 10, 5, 70], [3, 11, 4, 30], [2, 13, 5, 10]]),
    'snow': fixture(73, true, -8, -14, [[73, -6, -12, 85], [71, -9, -17, 60], [3, -11, -20, 20], [0, -14, -24, 0]]),
    'thunder': fixture(95, false, 16, 16, [[95, 24, 13, 80], [80, 21, 12, 60], [2, 23, 11, 10], [0, 25, 12, 0]])
  };

  // ---------- runtime state ----------

  var state = { status: 'off', data: null, fetchedAt: 0, lastAttemptAt: 0, error: null, demo: null, inflight: false };

  function cfg() { return PH.state.config.weather; }
  function city() { return PH.cityById[cfg().cityId] || PH.cityById[PH.DEFAULT_CITY]; }

  function readCache() {
    try {
      var c = JSON.parse(PH.storage.get(CACHE_KEY) || 'null');
      if (c && c.v === 1 && c.cityId === cfg().cityId && typeof c.fetchedAt === 'number' && c.data && typeof c.data.tempC === 'number') return c;
    } catch (e) { /* ignore a broken cache */ }
    return null;
  }

  function writeCache() {
    PH.storage.set(CACHE_KEY, JSON.stringify({ v: 1, cityId: cfg().cityId, fetchedAt: state.fetchedAt, data: state.data }));
  }

  function clearCache() {
    PH.storage.set(CACHE_KEY, '');
    state.data = null;
    state.fetchedAt = 0;
    state.status = cfg().enabled ? 'offline' : 'off';
    changed();
  }

  function changed() { PH.emit('weather', current()); }

  // Called on start and whenever weather settings change.
  function sync() {
    if (!cfg().enabled) {
      state.status = 'off'; state.data = null; state.fetchedAt = 0; state.error = null;
      changed();
      return;
    }
    var cached = readCache();
    if (cached) {
      state.data = cached.data;
      state.fetchedAt = cached.fetchedAt;
      state.status = Date.now() - cached.fetchedAt < REFRESH_MS ? 'live' : 'stale';
    } else {
      state.data = null; state.fetchedAt = 0;
      state.status = 'loading';
    }
    changed();
    if (Date.now() - state.fetchedAt >= REFRESH_MS) refresh();
  }

  function refresh() {
    if (!cfg().enabled || state.inflight) return Promise.resolve();
    if (typeof fetch !== 'function') { fail('This browser cannot make the request.'); return Promise.resolve(); }
    state.inflight = true;
    state.lastAttemptAt = Date.now();
    if (!state.data) { state.status = 'loading'; changed(); }
    var requestedCity = cfg().cityId;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);

    return fetch(buildUrl(city()), { signal: ctrl ? ctrl.signal : undefined, credentials: 'omit', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        var data = parse(json);
        if (!data) throw new Error('Unexpected response');
        if (!cfg().enabled || cfg().cityId !== requestedCity) return; // settings changed meanwhile
        state.data = data; state.fetchedAt = Date.now(); state.status = 'live'; state.error = null;
        writeCache();
        changed();
      })
      .catch(function (e) {
        fail(e && e.name === 'AbortError' ? 'Timed out' : (e && e.message) || 'Network error');
      })
      .then(function () { clearTimeout(timer); state.inflight = false; });
  }

  function fail(message) {
    state.error = message;
    state.status = state.data ? 'stale' : 'offline';
    changed();
  }

  // Background refresh: a cheap check every minute; a request at most every 30 min.
  function tick() {
    if (!cfg().enabled || state.inflight || document.hidden || PH.oled.isSaverOn()) return;
    var since = Date.now() - state.fetchedAt;
    if (state.status === 'live' && since >= REFRESH_MS) state.status = 'stale';
    var waited = Date.now() - state.lastAttemptAt;
    if (since >= REFRESH_MS && waited >= (state.error ? RETRY_MS : 0)) refresh();
  }

  function start() {
    sync();
    setInterval(tick, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  }

  function setDemo(key) {
    state.demo = key && DEMOS[key] ? key : null;
    changed();
  }

  function timeText(ms) {
    return new Date(ms).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: !PH.state.config.clock.hour24 });
  }

  // View model for the UI. Numbers appear only for live/stale data or labelled demos.
  function current() {
    var units = cfg().units, c = city();
    var demo = state.demo ? DEMOS[state.demo] : null;
    var data = demo || (state.status === 'live' || state.status === 'stale' ? state.data : null);
    var vm = {
      status: demo ? 'demo' : state.status,
      enabled: cfg().enabled,
      city: c.name + ', ' + c.region,
      units: units,
      hasData: !!data,
      error: state.error,
      demoKey: state.demo,
      fetchedAt: state.fetchedAt
    };
    if (data) {
      var cond = conditionFor(data.code, data.isDay);
      vm.temp = convert(data.tempC, units);
      vm.feels = convert(data.feelsC, units);
      vm.condition = cond;
      vm.windKmh = data.windKmh === null ? null : Math.round(data.windKmh);
      vm.daily = data.daily.map(function (d, i) {
        return { label: dayLabel(d.date, i), condition: conditionFor(d.code, true), max: convert(d.maxC, units), min: convert(d.minC, units), pop: d.pop };
      });
    }
    vm.statusText = {
      demo: 'DEMO · sample conditions, not live',
      off: 'Weather is off',
      loading: 'Connecting to Open-Meteo…',
      live: 'Live · Open-Meteo · ' + (state.fetchedAt ? timeText(state.fetchedAt) : ''),
      stale: (state.error ? 'Offline · ' : '') + 'Last updated ' + (state.fetchedAt ? timeText(state.fetchedAt) : ''),
      offline: 'Offline · no weather data yet'
    }[vm.status];
    return vm;
  }

  function dayLabel(date, i) {
    if (i === 0) return 'Today';
    var d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00') : null;
    if (!d || isNaN(d)) return ['Today', 'Tomorrow', 'Day 3', 'Day 4'][i] || '';
    return d.toLocaleDateString('en-CA', { weekday: 'short' });
  }

  // Scene key for the hero background: real or demo conditions, else time of day only.
  function sceneKey() {
    var vm = current();
    if (vm.hasData) {
      var k = vm.condition.key === 'drizzle' ? 'rain' : vm.condition.key === 'unknown' ? 'calm' : vm.condition.key;
      return k + (vm.condition.isDay ? '-day' : '-night');
    }
    return 'calm-' + PH.daypart.current();
  }

  PH.weather = {
    ENDPOINT: ENDPOINT,
    REFRESH_MS: REFRESH_MS,
    DEMOS: Object.keys(DEMOS),
    conditionFor: conditionFor,
    buildUrl: buildUrl,
    parse: parse,
    convert: convert,
    start: start,
    sync: sync,
    refresh: refresh,
    clearCache: clearCache,
    setDemo: setDemo,
    current: current,
    sceneKey: sceneKey,
    _state: state
  };
})(window.PH = window.PH || {});
