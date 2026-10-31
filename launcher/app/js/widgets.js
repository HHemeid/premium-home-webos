/*
 * Clock, date and greeting.
 * Elements opt in with data-clock="time|suffix|time-full|date|weekday|monthday|greeting"
 * and are refreshed each minute.
 * Weather lives in weather.js / weather-ui.js.
 */
(function (PH) {
  'use strict';

  function time(d, hour24) {
    var h = d.getHours(), m = d.getMinutes(), mm = (m < 10 ? '0' : '') + m;
    if (hour24) return { time: (h < 10 ? '0' : '') + h + ':' + mm, suffix: '' };
    return { time: ((h % 12) || 12) + ':' + mm, suffix: h < 12 ? 'AM' : 'PM' };
  }

  function greeting(d) {
    var h = d.getHours();
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  // "Good evening, Alex & Sam": the time band plus the household names from settings, if any.
  function greetingText(d, clock) {
    var names = clock && clock.greetingNames;
    return greeting(d) + (names ? ', ' + names : '');
  }

  function refresh(root) {
    if (!PH.state || !PH.state.config) return;
    var now = new Date();
    var t = time(now, PH.state.config.clock.hour24);
    var values = {
      time: t.time,
      suffix: t.suffix,
      'time-full': t.time + (t.suffix ? ' ' + t.suffix : ''),
      date: now.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }),
      weekday: now.toLocaleDateString('en-CA', { weekday: 'long' }),
      monthday: now.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' }),
      greeting: greetingText(now, PH.state.config.clock)
    };
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-clock]'), function (el) {
      var v = values[el.getAttribute('data-clock')];
      if (v !== undefined && el.textContent !== v) el.textContent = v;
    });
  }

  var lastMinute = -1;
  function start() {
    setInterval(function () {
      var m = new Date().getMinutes();
      if (m !== lastMinute) { lastMinute = m; refresh(); if (PH.app && PH.state.config) PH.app.refreshTheme(); } // day/night switch
    }, 1000);
  }

  PH.widgets = { time: time, greeting: greeting, greetingText: greetingText, refresh: refresh, start: start };
})(window.PH = window.PH || {});
