/*
 * Weather UI: the Home weather card, the Weather Details dialog, the consent flow and the
 * city picker. All data comes from PH.weather.current(); this file never fetches.
 */
(function (PH) {
  'use strict';

  var h = PH.h;

  // Line icons per condition (original SVG). Stroke uses currentColor; sun/moon get accent.
  var SUN = '<g class="wx-sun"><circle cx="32" cy="30" r="10"/><path d="M32 12v5M32 43v5M14 30h5M45 30h5M19.3 17.3l3.5 3.5M44.7 17.3l-3.5 3.5M19.3 42.7l3.5-3.5M44.7 42.7l-3.5-3.5"/></g>';
  var SUN_SMALL = '<g class="wx-sun"><circle cx="24" cy="22" r="8"/><path d="M24 7v4M24 33v4M9 22h4M35 22h4M13.4 11.4l2.8 2.8M34.6 11.4l-2.8 2.8M13.4 32.6l2.8-2.8"/></g>';
  var MOON = '<path class="wx-sun" d="M38 14a16 16 0 1 0 12 24 12 12 0 0 1-12-24z"/>';
  var MOON_SMALL = '<path class="wx-sun" d="M28 9a12 12 0 1 0 10 17 9 9 0 0 1-10-17z"/>';
  var CLOUD = '<path d="M20 48h26a9 9 0 0 0 1-18 13 13 0 0 0-25 3 7.5 7.5 0 0 0-2 15z" fill="#0b0d11"/>';
  var CLOUD_HIGH = '<path d="M20 42h26a9 9 0 0 0 1-18 13 13 0 0 0-25 3 7.5 7.5 0 0 0-2 15z" fill="#0b0d11"/>';
  var SHAPES = {
    clear: function (day) { return day ? SUN : MOON; },
    calm: function (day) { return day ? SUN : MOON; },
    partly: function (day) { return (day ? SUN_SMALL : MOON_SMALL) + CLOUD; },
    overcast: function () { return '<path d="M14 38h28a8 8 0 0 0 1-16 12 12 0 0 0-23 3 7 7 0 0 0-6 13z"/>' + CLOUD; },
    fog: function () { return '<path d="M12 22h40M8 31h44M14 40h38M10 49h34"/>'; },
    drizzle: function () { return CLOUD_HIGH + '<path d="M26 50v4M34 52v4M42 50v4"/>'; },
    rain: function () { return CLOUD_HIGH + '<path d="M26 49l-3 8M35 49l-3 8M44 49l-3 8"/>'; },
    snow: function () { return CLOUD_HIGH + '<g fill="currentColor" stroke="none"><circle cx="25" cy="52" r="2"/><circle cx="34" cy="56" r="2"/><circle cx="43" cy="52" r="2"/></g>'; },
    thunder: function () { return CLOUD_HIGH + '<path d="M35 44l-6 9h7l-5 9"/>'; },
    unknown: function () { return CLOUD; }
  };

  function icon(key, isDay, size) {
    var s = size || 64;
    return '<svg viewBox="0 0 64 64" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (SHAPES[key] || SHAPES.unknown)(isDay) + '</svg>';
  }

  function deg(n) { return (n < 0 ? '−' + Math.abs(n) : String(n)) + '°'; }

  // ---------- Home card ----------

  function card() {
    var w = PH.weather.current();
    var el;
    if (w.hasData) {
      var range = w.daily && w.daily[0] ? ' · H ' + deg(w.daily[0].max) + ' L ' + deg(w.daily[0].min) : '';
      el = h('div', { class: 'wx-card glass is-' + w.status, 'data-key': 'weather:card', 'data-group': 'weather', 'data-hint': 'weather' }, [
        h('div', { class: 'wx-row' }, [
          h('div', { class: 'wx-icon', html: icon(w.condition.key, w.condition.isDay, 76) }),
          h('div', { class: 'wx-temp' }, [deg(w.temp), h('span', { class: 'wx-unit' }, w.units)]),
          w.status === 'demo' ? h('div', { class: 'wx-demo' }, 'DEMO') : null
        ]),
        h('div', { class: 'wx-cond' }, w.condition.label),
        h('div', { class: 'wx-meta' }, (w.feels !== null ? 'Feels ' + deg(w.feels) : '') + range),
        h('div', { class: 'wx-city' }, w.city),
        h('div', { class: 'wx-status' }, [h('span', { class: 'wx-dot' }), w.statusText])
      ]);
    } else {
      var prompt = w.status === 'off' ? 'Live weather is off. ' + PH.platform.label('enter') + ' to set up' : w.statusText;
      el = h('div', { class: 'wx-card wx-empty glass is-' + w.status, 'data-key': 'weather:card', 'data-group': 'weather', 'data-hint': 'weather' }, [
        h('div', { class: 'wx-row' }, [
          h('div', { class: 'wx-icon', html: icon('partly', true, 64) }),
          h('div', { class: 'wx-empty-title' }, w.status === 'loading' ? 'Weather' : w.status === 'off' ? 'Weather' : 'Offline')
        ]),
        h('div', { class: 'wx-city' }, w.city),
        h('div', { class: 'wx-status' }, [h('span', { class: 'wx-dot' }), prompt])
      ]);
    }
    el._activate = openDetails;
    return el;
  }

  // ---------- Details dialog ----------

  function detailsBody(w) {
    if (!w.hasData) {
      return h('div', { class: 'wx-detail' }, [
        h('p', { class: 'wx-detail-note' }, w.status === 'off'
          ? 'Live weather is off. Nothing is requested from the internet until you turn it on.'
          : w.status === 'loading' ? 'Connecting to Open-Meteo…' : 'No weather data yet. ' + (w.error ? '(' + w.error + ')' : '')),
        h('div', { class: 'wx-attrib' }, 'Weather data by Open-Meteo.com · CC BY 4.0')
      ]);
    }
    return h('div', { class: 'wx-detail' }, [
      h('div', { class: 'wx-now' }, [
        h('div', { class: 'wx-now-icon', html: icon(w.condition.key, w.condition.isDay, 120) }),
        h('div', { class: 'wx-now-text' }, [
          h('div', { class: 'wx-now-temp' }, deg(w.temp) + w.units),
          h('div', { class: 'wx-now-cond' }, w.condition.label),
          h('div', { class: 'wx-now-meta' }, [
            w.feels !== null ? 'Feels like ' + deg(w.feels) : null,
            w.windKmh !== null ? ' · Wind ' + w.windKmh + ' km/h' : null
          ])
        ]),
        w.status === 'demo' ? h('div', { class: 'wx-demo wx-demo-lg' }, 'DEMO') : null
      ]),
      h('div', { class: 'wx-days' }, (w.daily || []).slice(0, 4).map(function (d) {
        return h('div', { class: 'wx-day' }, [
          h('div', { class: 'wx-day-label' }, d.label),
          h('div', { class: 'wx-day-icon', html: icon(d.condition.key, true, 56) }),
          h('div', { class: 'wx-day-temps' }, [h('b', null, deg(d.max)), ' ', deg(d.min)]),
          h('div', { class: 'wx-day-pop' }, d.pop !== null && d.pop !== undefined ? d.pop + '% precip.' : '')
        ]);
      })),
      h('div', { class: 'wx-status' }, [h('span', { class: 'wx-dot' }), w.statusText + ' · ' + w.city]),
      h('div', { class: 'wx-attrib' }, w.status === 'demo'
        ? 'Demo preview: sample conditions for testing the scenes, not a forecast.'
        : 'Weather data by Open-Meteo.com · CC BY 4.0')
    ]);
  }

  function openDetails() {
    var w = PH.weather.current();
    var items = [];
    if (w.status === 'demo') items.push({ label: 'Exit demo preview', onSelect: function () { PH.weather.setDemo(null); } });
    if (!w.enabled) {
      items.push({ label: 'Turn on live weather…', onSelect: askConsent });
    } else {
      items.push({ label: 'Refresh now', onSelect: function () { PH.weather.refresh().then(openDetails); } });
      items.push({ label: 'Change city', sub: w.city, onSelect: pickCity });
      items.push({ label: 'Turn live weather off', onSelect: turnOff });
    }
    items.push({ label: 'Close' });
    PH.ui.menu({ title: 'Weather', wide: true, body: detailsBody(w), items: items });
  }

  function askConsent() {
    var c = PH.cityById[PH.state.config.weather.cityId];
    PH.ui.confirm({
      title: 'Turn on live weather?',
      message: 'Premium Home will ask Open-Meteo (api.open-meteo.com) for the weather in ' + c.name + ', ' + c.region +
        ' about every 30 minutes while it is open.\n\n' +
        'It sends only the city\'s approximate coordinates: no GPS, address or account. Like any internet request, your network\'s IP address is visible to Open-Meteo.\n\n' +
        'Weather data: Open-Meteo.com, CC BY 4.0, free for non-commercial use. You can turn this off or clear the cache in Settings at any time.',
      confirmLabel: 'Turn on',
      danger: false
    }).then(function (ok) {
      if (!ok) return;
      PH.app.update(function (cfg) { cfg.weather.enabled = true; return cfg; });
      PH.ui.toast('Live weather on');
    });
  }

  function turnOff() {
    PH.app.update(function (cfg) { cfg.weather.enabled = false; return cfg; });
    PH.weather.clearCache();
    PH.ui.toast('Live weather off; cached data cleared');
  }

  function pickCity() {
    var current = PH.state.config.weather.cityId;
    PH.ui.menu({
      title: 'Weather city',
      message: 'City-level coordinates only. No GPS or IP location.',
      focusIndex: Math.max(0, PH.cities.findIndex(function (c) { return c.id === current; })),
      items: PH.cities.map(function (c) {
        return {
          label: c.name + ', ' + c.region,
          sub: c.id === current ? 'current' : null,
          onSelect: function () {
            PH.app.update(function (cfg) { cfg.weather.cityId = c.id; return cfg; });
            PH.ui.toast('Weather city: ' + c.name);
          }
        };
      })
    });
  }

  // Home: the next three days under the weather pill, only when there is real (or labelled demo) data.
  function miniForecast() {
    var w = PH.weather.current();
    if (!w.hasData || !w.daily || w.daily.length < 2) return null;
    return h('div', { class: 'wx-mini' + (w.status === 'stale' ? ' is-stale' : '') }, w.daily.slice(1, 4).map(function (d) {
      return h('div', { class: 'wx-mini-day' }, [
        h('span', { class: 'wx-mini-label' }, d.label),
        h('span', { class: 'wx-mini-icon', html: icon(d.condition.key, true, 30) }),
        h('span', { class: 'wx-mini-temps' }, [h('b', null, deg(d.max)), ' ', deg(d.min)])
      ]);
    }));
  }

  // A light colour wash over the photo that follows real conditions (no particles: cheap on the GPU).
  function tint() {
    var w = PH.weather.current();
    if (!w.hasData) return 'none';
    var k = w.condition.key;
    return k === 'rain' || k === 'drizzle' || k === 'thunder' ? 'wet' : k === 'snow' ? 'snow'
      : k === 'overcast' || k === 'fog' ? 'grey' : k === 'clear' || k === 'partly' ? 'clear' : 'none';
  }

  PH.weatherUI = { card: card, icon: icon, openDetails: openDetails, askConsent: askConsent, turnOff: turnOff, pickCity: pickCity, miniForecast: miniForecast, tint: tint };
})(window.PH = window.PH || {});
