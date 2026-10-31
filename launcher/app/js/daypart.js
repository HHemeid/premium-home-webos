/*
 * Automatic day / night theme. Pure function of the clock and settings, so it is unit-tested:
 *  - Day or Night: fixed.
 *  - Auto: when "Follow sunrise and sunset" is on AND live weather is on with data, Open-Meteo's
 *    is_day flag decides (no extra request: it is part of the weather response). Otherwise the
 *    owner's day-start / night-start hours on the TV's own clock decide. No network is needed.
 */
(function (PH) {
  'use strict';

  // hourOf: the local hour (0-23) of `now`; schedule wraps past midnight when dayStart > nightStart.
  function compute(now, theme, sunIsDay) {
    if (theme.themeMode === 'day' || theme.themeMode === 'night') return theme.themeMode;
    if (theme.followSun && typeof sunIsDay === 'boolean') return sunIsDay ? 'day' : 'night';
    var h = now.getHours(), a = theme.dayStartHour, b = theme.nightStartHour;
    if (a === b) return 'day';
    var isDay = a < b ? h >= a && h < b : h >= a || h < b;
    return isDay ? 'day' : 'night';
  }

  // Where the decision came from, for the Settings text.
  function source(theme, sunIsDay) {
    if (theme.themeMode !== 'auto') return 'manual';
    return theme.followSun && typeof sunIsDay === 'boolean' ? 'sun' : 'schedule';
  }

  function sunIsDay() {
    if (!PH.weather || !PH.state) return undefined;
    var w = PH.weather.current();
    return w.hasData && w.status !== 'demo' ? !!w.condition.isDay : undefined;
  }

  PH.daypart = {
    compute: compute,
    source: source,
    current: function () { return compute(new Date(), PH.state.config.theme, sunIsDay()); },
    currentSource: function () { return source(PH.state.config.theme, sunIsDay()); }
  };
})(window.PH = window.PH || {});
