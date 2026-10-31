/*
 * Quick settings: a side panel for Premium Home's OWN functions, opened with the ⚙ button in the
 * top bar (or the green key / Q in the preview). Every row really works locally. TV picture, sound,
 * volume, inputs and network are not controllable by a webOS app without verified APIs, so they
 * are explained instead of faked.
 * PH.OPTS holds the option lists shared with Settings.
 */
(function (PH) {
  'use strict';

  var h = PH.h;

  PH.OPTS = {
    onOff: [[true, 'On'], [false, 'Off']],
    autoDelay: [[0, 'Off'], [30, '30 s'], [60, '1 min'], [90, '90 s'], [120, '2 min'], [300, '5 min'], [600, '10 min']],
    ambientDim: [['low', 'Low'], ['medium', 'Medium'], ['strong', 'Strong']],
    rotate: [[1440, 'Daily'], [0, 'Off'], [30, 'Every 30 min'], [60, 'Every hour'], [180, 'Every 3 hours']],
    pool: [['photos', 'Photos'], ['all', 'Photos & artwork'], ['favorites', 'Favourites']],
    themeMode: [['auto', 'Auto'], ['day', 'Day'], ['night', 'Night']],
    motion: [['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']],
    saver: [[20, 'After 20 min'], [30, 'After 30 min'], [45, 'After 45 min'], [60, 'After 60 min']],
    dimMinutes: [[10, 'After 10 min'], [15, 'After 15 min'], [30, 'After 30 min'], [45, 'After 45 min']],
    photoMinutes: [[0, 'Off'], [5, 'Every 5 min'], [10, 'Every 10 min'], [15, 'Every 15 min'], [30, 'Every 30 min']],
    wallpaperDim: [[0, 'None'], [15, 'Light'], [30, 'Medium'], [45, 'Strong']],
    cwRow: [['auto', 'When there are titles'], ['off', 'Hidden']],
    cwMax: [[3, '3 cards'], [4, '4 cards']]
  };

  PH.optLabel = function (opts, v) {
    var o = opts.find(function (x) { return x[0] === v; });
    return o ? o[1] : String(v);
  };
  PH.optNext = function (opts, v) {
    var i = opts.findIndex(function (x) { return x[0] === v; });
    return opts[(i + 1) % opts.length][0];
  };

  // Name of the background now in use, for the Wallpaper rows.
  PH.backgroundName = function () {
    var e = PH.backdrop.effective();
    if (e.background === 'scenic') return PH.wallpaperById[e.scenicId].name;
    return { dynamic: 'Dynamic weather', cinematic: 'Cinematic aurora', photo: 'My photo', minimal: 'Minimal black' }[e.background];
  };

  PH.themeText = function () {
    var now = PH.daypart.current() === 'night' ? 'night' : 'day';
    var mode = PH.state.config.theme.themeMode;
    return mode === 'auto' ? 'Auto · ' + now + ' now' : PH.optLabel(PH.OPTS.themeMode, mode);
  };

  var entry = null;
  var returnKey = null;

  function cycle(section, field, opts) {
    return function () {
      PH.app.update(function (c) { c[section][field] = PH.optNext(opts, c[section][field]); return c; });
      refresh();
    };
  }

  function rows() {
    var c = PH.state.config, w = PH.weather.current();
    var vpn = PH.vpn.status();
    return [
      ['ambient-now', 'Ambient view', 'Full-screen time and weather', 'Show', function () { close(); PH.ambient.open({ returnKey: returnKey }); }],
      ['auto', 'Auto ambient', 'Home fades to ambient after no input', PH.optLabel(PH.OPTS.autoDelay, c.ambientMode.autoDelaySeconds), cycle('ambientMode', 'autoDelaySeconds', PH.OPTS.autoDelay)],
      ['photo', 'Ambient photos', 'A new photo while ambient shows', PH.optLabel(PH.OPTS.photoMinutes, c.ambientMode.photoMinutes), cycle('ambientMode', 'photoMinutes', PH.OPTS.photoMinutes)],
      ['wallpaper', 'Wallpaper', 'Preview and choose', PH.backgroundName(), function () { close(); PH.gallery.open(); }],
      ['rotate', 'Change wallpaper', 'Daily: a new photo each day, no repeats', PH.optLabel(PH.OPTS.rotate, c.wallpaper.rotateMinutes), cycle('wallpaper', 'rotateMinutes', PH.OPTS.rotate)],
      ['next-wp', 'Next wallpaper', 'Skip to another one now', 'Next', function () { PH.backdrop.rotateNow(); refresh(); }],
      ['theme', 'Day / night', 'Warmer and dimmer at night', PH.themeText(), cycle('theme', 'themeMode', PH.OPTS.themeMode)],
      ['motion', 'Motion', 'Full, reduced or no animation', PH.optLabel(PH.OPTS.motion, c.appearance.motion), cycle('appearance', 'motion', PH.OPTS.motion)],
      ['weather', 'Live weather', w.enabled ? 'Open-Meteo, city only' : 'Asks before going online', w.enabled ? 'On' : 'Off', function () {
        if (c.weather.enabled) { PH.weatherUI.turnOff(); refresh(); } else PH.weatherUI.askConsent();
      }],
      ['saver', 'Black screen', 'Pure black with no input; LG\'s screensaver may start first', PH.optLabel(PH.OPTS.saver, c.oledCare.screensaverMinutes), cycle('oledCare', 'screensaverMinutes', PH.OPTS.saver)],
      ['vpn', 'VPN', 'TV-wide VPN needs a router', vpn.label, function () { PH.settings.explainVpn(); }],
      ['lg-home', 'LG Home', 'The TV\u2019s own home screen', 'Open', function () { close(); PH.launcher.openLgHome(); }],
      ['home-btn', 'Home button', 'Turn the Home-button takeover back on after a triple-Home', 'Resume', function () { close(); PH.launcher.openSystemApp(PH.HOME_HELPER_APP_ID, 'Premium Home Helper'); }],
      ['tv', 'Picture, sound & inputs', 'TV settings', 'How', function () {
        PH.ui.menu({ title: 'Picture, sound and inputs', message: 'Use the Settings (⚙) button on your LG remote for picture mode, brightness, sound, volume, ' +
          'inputs and OLED Care. Premium Home cannot read or change TV settings, and does not pretend to.', items: [{ label: 'OK' }] });
      }],
      ['help', 'Remote help', 'Keys and pointer', 'Show', PH.quick.help],
      ['export', 'Export configuration', 'Layout and preferences', 'Export', function () { PH.backup.exportConfig(); }],
      ['exit', 'Exit to LG Home', 'Leaves Premium Home', 'Exit', function () {
        PH.ui.confirm({ title: 'Exit Premium Home?', message: 'You will return to the TV\'s own home screen.', confirmLabel: 'Exit', danger: false })
          .then(function (ok) { if (ok) PH.platform.exit(); });
      }]
    ];
  }

  function rowEl(r) {
    var el = h('div', { class: 'setting qs-row', 'data-key': 'qs:' + r[0], 'data-group': 'quick-settings', 'data-hint': 'setting' }, [
      h('div', { class: 'setting-text' }, [h('div', { class: 'setting-label' }, r[1]), h('div', { class: 'setting-desc' }, r[2])]),
      h('div', { class: 'setting-value' }, r[3])
    ]);
    el._activate = r[4];
    return el;
  }

  function list() {
    return h('div', { class: 'setting-list' }, rows().map(rowEl));
  }

  function refresh() {
    if (!entry || !entry.el.parentNode) return;
    var key = PH.focus.currentKey();
    var scroll = entry.el.querySelector('.qs-scroll');
    var offset = scroll.firstElementChild.getAttribute('data-offset');
    var fresh = list();
    if (offset) { fresh.setAttribute('data-offset', offset); fresh.style.transform = scroll.firstElementChild.style.transform; }
    scroll.replaceChild(fresh, scroll.firstElementChild);
    PH.focus.restore([key]);
  }

  function close() { if (entry) { entry.close(); entry = null; } }

  function open() {
    if (entry && entry.el.parentNode) return;
    returnKey = PH.focus.currentKey();
    var panel = h('div', { class: 'qs-panel glass', role: 'dialog', 'aria-label': 'Quick settings' }, [
      h('h2', { class: 'dialog-title' }, 'Quick settings'),
      h('p', { class: 'qs-sub' }, 'Premium Home only. TV settings stay with the TV.'),
      h('div', { class: 'qs-scroll', 'data-scroll': 'y' }, list())
    ]);
    entry = PH.ui.layer(h('div', { class: 'dialog-backdrop qs-backdrop' }, panel), {
      onCancel: function () { entry = null; }
    });
  }

  PH.quick = {
    open: open,
    close: close,
    refresh: refresh,
    isOpen: function () { return !!(entry && entry.el.parentNode); },
    help: function () {
      var L = PH.platform.label;
      PH.ui.menu({
        title: 'Remote help',
        message: [
          '◀ ▶ ▲ ▼  Move between tiles, rows and sections',
          L('enter') + '  Open or change the focused item',
          (PH.platform.isWebOS ? 'Hold OK' : 'O') + '  Options for a tile (move, hide, remove)',
          L('back') + '  Back; on the Home tab bar it offers to exit',
          '▲ from the Home tab bar  Ambient view',
          'Pointer: point to focus, click to open, scroll wheel moves through rows',
          '⚙ in the top bar  These quick settings',
          'Home, volume, power, Settings and voice buttons always belong to the TV.'
        ].join('\n'),
        items: [{ label: 'OK' }]
      });
    }
  };

  // Settings changed elsewhere (e.g. weather consent) → keep the panel's values current.
  PH.on('weather', function () { refresh(); });
})(window.PH = window.PH || {});
