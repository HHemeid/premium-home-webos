/*
 * Ambient view: full-screen scene or wallpaper with large time, date and weather, and nothing
 * else (no logos, tiles or badges).
 * Opened by Up from the Home tab bar, from Quick settings, or automatically after the chosen
 * delay without input while Home is showing (oled.js). Any remote key, a click or the wheel
 * returns to exactly where you were. The text drifts slowly and gets pixel shift, because it may
 * stay on screen for a long time on an OLED.
 */
(function (PH) {
  'use strict';

  var h = PH.h;

  function deg(n) { return (n < 0 ? '−' + Math.abs(n) : String(n)) + '°'; }

  function status(w) {
    if (w.status === 'demo') return h('div', { class: 'amb-status is-demo' }, 'DEMO · sample conditions, not live');
    if (w.status === 'live') return h('div', { class: 'amb-status' }, 'Open-Meteo · ' + w.statusText.replace(/^Live · Open-Meteo · /, 'updated '));
    if (w.status === 'stale') return h('div', { class: 'amb-status' }, w.statusText);
    return null;
  }

  function render() {
    var el = document.getElementById('ambient');
    if (!el) return;
    PH.clear(el);
    el.hidden = !PH.state.ambient;
    if (!PH.state.ambient) return;
    var w = PH.weather.current();
    el.appendChild(h('div', { class: 'amb-drift' }, h('div', { class: 'amb-content shiftable' }, [
      PH.state.config.clock.greetingShow && PH.state.config.clock.greetingAmbient ? h('div', { class: 'amb-greet', 'data-clock': 'greeting' }) : null,
      h('div', { class: 'amb-time' }, [h('span', { 'data-clock': 'time' }), h('small', { 'data-clock': 'suffix' })]),
      h('div', { class: 'amb-date', 'data-clock': 'date' }),
      w.hasData ? h('div', { class: 'amb-weather' }, [
        h('span', { class: 'amb-temp' }, deg(w.temp)),
        h('span', { class: 'amb-cond' }, w.condition.label)
      ]) : null,
      w.hasData ? h('div', { class: 'amb-place' }, w.city) : null,
      PH.weatherUI.miniForecast(),
      status(w)
    ])));
    PH.widgets.refresh(el);
  }

  var returnKey = null;
  var openedBy = null;

  // opts: { auto: true } when opened by inactivity; { returnKey } to come back somewhere specific.
  function open(opts) {
    if (PH.state.ambient) return;
    returnKey = (opts && opts.returnKey) || PH.focus.currentKey() || 'tab:home';
    openedBy = opts && opts.auto ? 'auto' : 'manual';
    PH.state.ambient = true;
    PH.oled.ambientOpened();
    PH.app.render();
  }

  function close() {
    if (!PH.state.ambient) return;
    PH.state.ambient = false;
    openedBy = null;
    PH.backdrop.ambientEnded();
    PH.app.render({ focus: [returnKey, 'tab:home'] });
  }

  // Auto ambient only over Premium Home's own Home with nothing else open or in progress, and
  // only while the app is visible (never over Netflix, YouTube, inputs or other apps).
  function canAutoOpen() {
    var s = PH.state;
    return s.section === 'home' && !s.ambient && !s.overlay && !s.move && !s.editMode &&
      !PH.ui.dialogOpen() && !document.hidden && !(document.activeElement && document.activeElement.tagName === 'INPUT');
  }

  PH.ambient = { open: open, close: close, render: render, canAutoOpen: canAutoOpen, openedBy: function () { return openedBy; } };
})(window.PH = window.PH || {});
