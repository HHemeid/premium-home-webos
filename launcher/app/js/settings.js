/*
 * Settings view: category list on the left, rows on the right.
 * OK on a row cycles its value; every change is saved immediately.
 */
(function (PH) {
  'use strict';

  var h = PH.h;
  var ON_OFF = [[true, 'On'], [false, 'Off']];
  var CATEGORIES = [
    ['appearance', 'Appearance', 'Motion, accent colour, glass and effects.'],
    ['wallpaper', 'Wallpaper & theme', 'Scenic wallpapers, your photo, and automatic day / night.'],
    ['clock', 'Clock & weather', 'How the time, date and weather appear.'],
    ['oled', 'Ambient & OLED care', 'Auto ambient, ambient photos, the 45-minute dim and the 60-minute black screen.'],
    ['watching', 'Continue Watching', 'Saved titles now; viewing-tracker connections later, only with your OK.'],
    ['shortcuts', 'Shortcuts & recent', 'Add, unhide and restore shortcuts; recently opened.'],
    ['privacy', 'Privacy & VPN', 'What goes online, what stays on this TV, and VPN status.'],
    ['cleanup', 'TV cleanup', 'Which optional apps are installed, LG privacy settings, and what has really changed.'],
    ['backup', 'Backup & restore', 'Export or restore this app\'s configuration.'],
    ['about', 'About', 'Version, platform, sources and what is not available.']
  ];

  function cfg() { return PH.state.config; }
  var cleanupChecking = false;

  function rowEl(key, label, desc, value, extra) {
    return h('div', { class: 'setting' + (extra ? ' ' + extra : ''), 'data-key': 'set:' + key, 'data-group': 'settings-rows', 'data-hint': 'setting' }, [
      h('div', { class: 'setting-text' }, [
        h('div', { class: 'setting-label' }, label),
        desc ? h('div', { class: 'setting-desc' }, desc) : null
      ]),
      value != null ? h('div', { class: 'setting-value' }, value) : null
    ]);
  }

  function choice(key, label, desc, options, path) {
    var p = path.split('.');
    var cur = cfg()[p[0]][p[1]];
    var idx = options.findIndex(function (o) { return o[0] === cur; });
    var el = rowEl(key, label, desc, idx >= 0 ? options[idx][1] : String(cur));
    el._activate = function () {
      var next = options[(idx + 1) % options.length][0];
      PH.app.update(function (c) { c[p[0]][p[1]] = next; return c; }, { focus: ['set:' + key] });
    };
    return el;
  }

  // Like choice(), but OK opens a list to pick from (for long option lists such as hours).
  function pick(key, label, desc, options, path) {
    var p = path.split('.');
    var cur = cfg()[p[0]][p[1]];
    var idx = options.findIndex(function (o) { return o[0] === cur; });
    var el = rowEl(key, label, desc, idx >= 0 ? options[idx][1] : String(cur));
    el._activate = function () {
      PH.ui.menu({
        title: label, focusIndex: Math.max(0, idx),
        items: options.map(function (o) {
          return { label: o[1], sub: o[0] === cur ? 'Current' : null, onSelect: function () {
            PH.app.update(function (c) { c[p[0]][p[1]] = o[0]; return c; }, { focus: ['set:' + key] });
          } };
        })
      });
    };
    return el;
  }

  function action(key, label, desc, value, fn, danger) {
    var el = rowEl(key, label, desc, value, danger ? 'danger' : '');
    el._activate = fn;
    return el;
  }

  function info(label, value) {
    return h('div', { class: 'setting info' }, [
      h('div', { class: 'setting-text' }, h('div', { class: 'setting-label' }, label)),
      h('div', { class: 'setting-value' }, value)
    ]);
  }

  function note(text) { return h('div', { class: 'setting-note' }, text); }

  function editGreetingNames() {
    PH.ui.prompt({ title: 'Greeting names', message: 'First names shown after "Good evening". Leave empty for no names.', value: cfg().clock.greetingNames,
      maxLength: PH.config.GREETING_NAMES_MAX, placeholder: 'e.g. Alex & Sam', confirmLabel: 'Save' }).then(function (v) {
      if (v === null) return;
      var clean = PH.config.cleanGreetingNames(v);
      PH.app.update(function (c) { c.clock.greetingNames = clean; return c; }, { focus: ['set:greet-names'] });
      PH.ui.toast(clean ? 'Greeting: ' + PH.widgets.greetingText(new Date(), { greetingNames: clean }) : 'Greeting names cleared');
    });
  }

  function hourText(hr) {
    return PH.state.config.clock.hour24 ? (hr < 10 ? '0' : '') + hr + ':00' : ((hr % 12) || 12) + ':00 ' + (hr < 12 ? 'AM' : 'PM');
  }

  function explainVpn() {
    PH.ui.menu({
      title: 'VPN: not configured',
      message: [
        'To protect all TV traffic (Netflix, YouTube, Stremio and the rest), NordVPN has to run on a VPN-capable router or a small gateway the TV connects through. A webOS app cannot create a VPN, and NordVPN\'s SmartDNS is not encryption.',
        '',
        'Next step, when you\'re ready: tell us your router make and model. We then check whether it supports NordVPN (WireGuard/OpenVPN), TV-only routing and a kill switch, and whether it has a safe local status API.',
        '',
        'Until then there is no on/off switch here, and Premium Home never shows "Connected" without the gateway confirming it. VPN can change what streaming services show.'
      ].join('\n'),
      items: [{ label: 'OK' }]
    });
  }

  function lastSavedText() {
    var t = PH.state.lastSaved;
    if (t === 'memory') return 'Not saved (storage unavailable)';
    if (!t) return 'No changes this session';
    return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  var PANELS = {
    appearance: function () {
      return [
        action('background', 'Wallpaper & background', 'Landscape photos, original artwork, dynamic weather, your photo or minimal black.',
          PH.backgroundName(), PH.gallery.open),
        choice('motion', 'Motion', 'Reduced keeps the scene still and removes rain/snow. Off stops all animation.', PH.OPTS.motion, 'appearance.motion'),
        choice('effects', 'Weather effects', 'Falling rain and snow, drifting clouds and sun rays in the Home scene.', ON_OFF, 'appearance.effects'),
        choice('accent', 'Accent colour', 'Used for focus rings and highlights.',
          [['ice', 'Icy blue'], ['glacier', 'Glacier'], ['graphite', 'Graphite (no colour)']], 'appearance.accent'),
        choice('glass', 'Glass effects', 'Frosted panels. Turn off if the TV feels slow.', ON_OFF, 'appearance.glass'),
        choice('guides', 'Safe-area guides', 'Preview aid: outlines the 5% title-safe margin used for TV overscan.',
          [[false, 'Off'], [true, 'On']], 'appearance.safeAreaGuides')
      ];
    },
    wallpaper: function () {
      var t = cfg().theme, hours = PH.config.CHOICES.dayStartHour.map(function (hr) { return [hr, hourText(hr)]; });
      var src = PH.daypart.currentSource();
      var rows = [
        action('wp-open', 'Choose wallpaper', 'Preview each one full screen before applying it.', PH.backgroundName(), PH.gallery.open),
        choice('wp-dim', 'Wallpaper dimming', 'Darkens scenic wallpapers and photos (more at night and off Home) so tiles stay readable.', PH.OPTS.wallpaperDim, 'wallpaper.wallpaperDim'),
        choice('wp-rotate', 'Change wallpaper', 'Daily: a new one each calendar day, never repeating until all have been shown. Timed options prefer night scenes at night. Never keeps the screen awake.', PH.OPTS.rotate, 'wallpaper.rotateMinutes'),
        choice('wp-pool', 'Daily from', 'Which wallpapers daily rotation uses. Mark favourites in the gallery (hold OK on one).', PH.OPTS.pool, 'wallpaper.pool'),
        action('wp-next', 'Next wallpaper', 'Skip to another one now; it stays for the rest of today.', 'Next', function () { PH.backdrop.rotateNow(); }),
        action('wp-photo', 'My photo', 'Use a picture of your own. It is resized, stripped of location data and kept on this device only.', 'Choose', function () { PH.gallery.pickPhoto(); }),
        action('wp-photo-remove', 'Remove my photo', null, 'Remove', PH.gallery.removePhoto, true),
        choice('theme', 'Day / night theme', 'Night is warmer and dimmer. Auto switches by itself.', PH.OPTS.themeMode, 'theme.themeMode'),
        pick('day-start', 'Day starts at', 'Used by Auto when sunrise / sunset is not in use.', hours, 'theme.dayStartHour'),
        pick('night-start', 'Night starts at', null, hours, 'theme.nightStartHour'),
        choice('sun', 'Follow sunrise and sunset', 'Only when live weather is on: uses the day/night flag in the same weather reading. No extra requests.', ON_OFF, 'theme.followSun'),
        info('Right now', (PH.daypart.current() === 'night' ? 'Night' : 'Day') + ' · ' + { manual: 'set by you', sun: 'from sunrise / sunset', schedule: 'from your hours' }[src]),
        note('Photographs: U.S. National Park Service (public domain), and Moraine Lake by Florian Fuchs (CC BY 3.0). Artwork scenes are original to Premium Home. Sources in ASSET-LICENSES.md. All are bundled and sized for the 1920 × 1080 canvas webOS gives apps; nothing is downloaded.')
      ];
      return rows;
    },
    clock: function () {
      var w = PH.state.config.weather, city = PH.cityById[w.cityId];
      var demo = PH.weather.current().demoKey;
      var rows = [
        choice('hour24', 'Time format', null, [[false, '12-hour'], [true, '24-hour']], 'clock.hour24'),
        choice('date', 'Show date on Home', null, ON_OFF, 'clock.showDate'),
        choice('greet', 'Greeting', 'Good morning / afternoon / evening / night, from the TV clock.', ON_OFF, 'clock.greetingShow'),
        action('greet-names', 'Greeting names', 'First names only, e.g. "Alex & Sam". Kept on this TV; never sent anywhere.', cfg().clock.greetingNames || 'None', editGreetingNames),
        choice('greet-amb', 'Greeting in ambient', 'Show the greeting above the clock in the ambient view too.', ON_OFF, 'clock.greetingAmbient'),
        action('weather', 'Live weather', w.enabled
          ? 'On. Open-Meteo is asked about every 30 minutes while Premium Home is open.'
          : 'Off. Nothing is requested from the internet. Turning it on asks for your OK first.',
          w.enabled ? 'On' : 'Off', function () { if (w.enabled) PH.weatherUI.turnOff(); else PH.weatherUI.askConsent(); }),
        action('city', 'Weather city', 'City-level coordinates only. No GPS or IP location.', city.name + ', ' + city.region, PH.weatherUI.pickCity),
        choice('units', 'Temperature units', null, [['C', '°C'], ['F', '°F']], 'weather.units')
      ];
      if (w.enabled) {
        rows.push(action('refresh', 'Refresh weather now', PH.weather.current().statusText, 'Refresh', function () {
          PH.weather.refresh().then(function () { PH.app.render({ focus: ['set:refresh'] }); });
        }));
        rows.push(action('clearcache', 'Clear weather cache', 'Deletes the saved last reading. The next refresh fetches a new one.', 'Clear', function () {
          PH.weather.clearCache();
          PH.ui.toast('Weather cache cleared');
        }));
      }
      rows.push(action('demo', 'Preview weather scenes (demo)', 'For testing the Home scenes. Shows sample conditions, always labelled DEMO, never saved.',
        demo || 'Off', function () {
          var keys = [null].concat(PH.weather.DEMOS);
          PH.weather.setDemo(keys[(keys.indexOf(demo || null) + 1) % keys.length]);
          PH.app.render({ focus: ['set:demo'] });
        }));
      rows.push(note('Weather data by Open-Meteo.com (CC BY 4.0), free for non-commercial use. Premium Home stores only the last reading, never your location history.'));
      return rows;
    },
    oled: function () {
      var c = cfg(), o = c.oledCare;
      var rows = [
        note('Without input while Premium Home is in front: hints fade at 6 s, Home becomes the ambient view at 90 s, ambient shows a new photo every 10 min, ' +
          'everything dims at 45 min and the screen turns pure black at 60 min. Any key brings it back. On Premium Home\'s screens LG\'s own screensaver uses its 30-minute mode (LG dims the screen gradually before it; any key restores brightness).'),
        choice('auto-ambient', 'Auto ambient', 'After this long without input on Home, the menus glide away into the ambient view. Never over other apps.',
          PH.OPTS.autoDelay, 'ambientMode.autoDelaySeconds'),
        choice('ambient', 'Ambient view with Up', 'Press Up from the tab bar on Home for the ambient view. Any key returns.', ON_OFF, 'appearance.ambient'),
        choice('photo', 'Ambient photos', 'A new licensed photo while ambient is showing (favourites only if you chose that pool). Never saved: Home keeps your wallpaper.', PH.OPTS.photoMinutes, 'ambientMode.photoMinutes'),
        choice('deep-dim', 'Dim', 'Wallpaper, clock and weather fade well down; the greeting hides and weather animation stops.', PH.OPTS.dimMinutes, 'oledCare.dimMinutes'),
        choice('ambient-dim', 'Dim strength', 'How dark that dim is.', PH.OPTS.ambientDim, 'ambientMode.ambientDim'),
        choice('saver', 'Black screen', 'Pure black: no clock, no photo, nothing drawn. The TV stays on; this is not LG\'s Screen Off.', PH.OPTS.saver, 'oledCare.screensaverMinutes'),
        choice('shift', 'Pixel shift', 'Moves the clock, top bar and hints a few pixels every 2 minutes.', ON_OFF, 'oledCare.pixelShift'),
        choice('dim', 'Dim Home after 45 s', 'Optional extra: fades static elements on Home after 45 seconds. Off by default.', ON_OFF, 'oledCare.dimWhenIdle'),
        action('saver-now', 'Preview black screen', 'Press any key to return.', 'Show', function () { PH.oled.showScreensaver(); })
      ];
      if (o.dimMinutes >= o.screensaverMinutes) rows.splice(1, 0, note('With these settings the black screen comes before the dim.'));
      rows.push(info('LG OLED Care', 'TV Settings → General → OLED Care'));
      rows.push(note('Premium Home can\'t turn the panel off: webOS has no supported way for this kind of app to do it, so it shows pure black instead. Only LG\'s own Screen Off, standby and Pixel Refresher clean the panel. ' +
          'Changing photos and dimming reduce static brightness; they can\'t guarantee no burn-in. LG\'s screensaver, Screen Move and logo dimming are never delayed, disabled or triggered.'));
      return rows;
    },
    watching: function () {
      var saved = PH.cw.loadSaved().length;
      var rows = [
        choice('cw-row', 'Show on Home', 'The row appears only when there is something in it.', PH.OPTS.cwRow, 'watching.cwRow'),
        choice('cw-max', 'Cards on Home', null, PH.OPTS.cwMax, 'watching.cwMax'),
        action('cw-save', 'Save a title', 'Keep a show or movie on Home as a reminder. No progress is tracked.', 'Add', PH.cwUI.saveFlow),
        action('cw-manage', 'Saved titles', 'Choose one to remove it.', saved + ' saved', PH.cwUI.manage),
        action('cw-clear', 'Clear saved titles', null, 'Clear', function () {
          if (!saved) { PH.ui.toast('No saved titles'); return; }
          PH.ui.confirm({ title: 'Clear all saved titles?', message: saved + ' title(s) will be removed from this TV.', confirmLabel: 'Clear' }).then(function (ok) {
            if (!ok) return;
            PH.cw.clearSaved();
            PH.app.render({ focus: ['set:cw-clear'] });
            PH.ui.toast('Saved titles cleared');
          });
        }, true)
      ];
      PH.cw.PROVIDERS.slice(1).forEach(function (p) {
        rows.push(action('cw-' + p.id, p.name, p.detail, 'Not connected', function () {
          PH.ui.menu({ title: p.name + ': not connected', message: p.detail + '\n\nConnecting it is a separate step that needs your account and approval. ' +
            'Netflix, Disney+, Prime Video, YouTube, Tubi and Stremio do not share watch progress with other apps, so Premium Home never shows guessed progress.', items: [{ label: 'OK' }] });
        }));
      });
      rows.push(note('Saved titles stay on this TV and are not part of the configuration export.'));
      return rows;
    },
    shortcuts: function () {
      var hidden = cfg().shortcuts.filter(function (s) { return s.hidden; }).length;
      return [
        choice('recents', 'Remember recently opened', 'Only shortcuts opened through Premium Home, on this device.', ON_OFF, 'recents.rememberRecents'),
        action('recents-clear', 'Clear recent', null, PH.recents.load().length + ' recent', function () {
          PH.recents.clear();
          PH.app.render({ focus: ['set:recents-clear'] });
          PH.ui.toast('Recent cleared');
        }),
        action('add', 'Add a shortcut', 'Choose from the apps Premium Home knows about.', 'Add', PH.views.openAddShortcut),
        action('unhide', 'Unhide all shortcuts', null, hidden + ' hidden', function () {
          if (!hidden) { PH.ui.toast('Nothing is hidden'); return; }
          PH.app.update(PH.config.ops.unhideAll, { focus: ['set:unhide'] });
          PH.ui.toast('All shortcuts visible');
        }),
        action('restore', 'Restore default shortcuts', 'Puts back the original shortcuts and Home favorites. Appearance settings stay.', 'Restore', function () {
          PH.ui.confirm({ title: 'Restore default shortcuts?', message: 'Your current shortcut order, hidden items and Home favorites will be replaced.', confirmLabel: 'Restore defaults' })
            .then(function (ok) {
              if (!ok) return;
              PH.app.update(PH.config.ops.restoreDefaultShortcuts, { focus: ['set:restore'] });
              PH.ui.toast('Default shortcuts restored');
            });
        }, true),
        note('Removing or hiding a shortcut only changes Premium Home. Nothing is installed or uninstalled on the TV.')
      ];
    },
    // v0.8.2: an honest status page. Nothing here removes or switches anything by itself.
    cleanup: function () {
      var D = PH.debloat, st = D.state();
      // Re-check when the page is opened again (e.g. after deleting apps in LG Home).
      if ((!st || Date.now() - st.checkedAt > 15000) && PH.platform.isWebOS && !cleanupChecking) {
        cleanupChecking = true;
        D.check().then(function () { cleanupChecking = false; if (PH.state.section === 'settings' && PH.state.settingsCategory === 'cleanup') PH.app.render(); });
      }
      var removed = D.removedCount();
      var rows = [
        note(removed ? removed + ' optional app' + (removed === 1 ? ' is' : 's are') + ' no longer installed (checked on this TV). Nothing else has been changed by Premium Home.'
          : 'Nothing on this TV has been removed, switched off or blocked. This page only reports, and links to LG\u2019s own settings.'),
        action('open-lg-settings', 'Open LG Settings', 'LG\u2019s settings for the privacy items below. Premium Home can\u2019t read or change them.', 'Open', function () { PH.launcher.openSystemApp('com.palm.app.settings', 'LG Settings'); }),
        action('open-lg-apps', 'Remove apps in LG Home', 'LG Home › Apps › Edit › select an app › Delete. Premium Home can\u2019t uninstall store apps.', 'Open', PH.launcher.openLgHome)
      ];
      D.OPTIONAL.forEach(function (app) {
        rows.push(action('opt-' + app.appId, app.name, D.proposalText(app.proposal) + ' · ' + app.note, D.statusOf(app), function () {
          PH.ui.menu({ title: app.name, message: app.note + ' Status on this TV: ' + D.statusOf(app) + '. ' + D.proposalText(app.proposal).replace(/^./, function (c) { return c.toUpperCase(); }) + '. To remove: LG Home › Apps › Edit.', items: [{ label: 'OK' }] });
        }));
      });
      D.PRIVACY.forEach(function (p, i) {
        rows.push(action('priv-' + i, p.name, p.path + ' · ' + p.effect, 'Set on the TV', function () { PH.launcher.openSystemApp('com.palm.app.settings', 'LG Settings'); }));
      });
      rows.push(info('Built-in ad / ACR components', D.PROTECTED_COUNT + ' · unchanged · removal needs root (not done)'));
      rows.push(info('Router / DNS filtering', 'Not set up'));
      return rows;
    },
    privacy: function () {
      var vpn = PH.vpn.status(), w = cfg().weather;
      return [
        action('vpn', 'VPN', 'TV-wide VPN needs a VPN-capable router or gateway. Premium Home shows its status once one is set up.', vpn.label, explainVpn),
        info('Goes online', w.enabled ? 'Open-Meteo weather only (city coordinates)' : 'Nothing (live weather is off)'),
        info('Stays on this TV', 'Layout, weather reading, recent, saved titles, your photo'),
        info('Never collected', 'Viewing activity from other apps, accounts, location, IDs'),
        note('Premium Home has no analytics, ads or accounts. Recent, saved titles and your photo are never exported.')
      ];
    },
    backup: function () {
      return [
        note('This saves Premium Home\'s layout and preferences only. It is not a backup of TV settings or firmware. See BACKUP-CHECKLIST.md.'),
        action('export', 'Export configuration', 'Downloads a .json file. Keep a copy in the project\'s BACKUP folder.', 'Export', PH.backup.exportConfig),
        action('import', 'Restore from file', 'Choose an exported .json file. You will see a summary before anything changes.', 'Choose file', PH.backup.importConfig),
        action('reset', 'Reset Premium Home', 'Returns every Premium Home setting and shortcut to defaults.', 'Reset', function () {
          PH.ui.confirm({ title: 'Reset Premium Home?', message: 'All Premium Home settings and shortcuts go back to defaults. Export first if you want to keep them.', confirmLabel: 'Reset everything' })
            .then(function (ok) {
              if (!ok) return;
              PH.app.update(PH.config.defaults, { focus: ['set:reset'] });
              PH.ui.toast('Premium Home reset to defaults');
            });
        }, true),
        info('Last saved', lastSavedText())
      ];
    },
    about: function () {
      return [
        info('Version', PH.VERSION),
        info('Made by', PH.CREDITS.author + ' · ' + PH.CREDITS.url),
        info('Running on', PH.platform.name),
        info('App launching', PH.launcher.mode() === 'native' ? 'Real (webOS Application Manager)' : 'Mac preview'),
        info('UI canvas', '1920 × 1080, shown at ' + Math.round(PH.state.scale * 100) + '%'),
        info('Apps and inputs that open', PH.catalog.filter(function (a) { return a.appId && PH.VERIFIED_APP_IDS.indexOf(a.appId) >= 0; }).length + ' of ' + PH.catalog.length + ' shortcuts (IDs confirmed on this C4); the rest say they aren\u2019t linked'),
        info('Network use', PH.state.config.weather.enabled ? 'Open-Meteo weather (city coordinates only)' : 'None (live weather is off)'),
        info('VPN', PH.vpn.status().label + ' (needs a router or gateway)'),
        info('Brand logos', 'Trademarks of their owners; see BRAND-ASSET-SOURCES.md'),
        info('Wallpaper photos', 'NPS (public domain); Moraine Lake © Florian Fuchs, CC BY 3.0'),
        info('TV deployment', 'Not performed'),
        note('Native launching stays off until the backup checklist is complete and each app ID has been checked on the TV.')
      ];
    }
  };

  function fillPanel(panel) {
    var cat = CATEGORIES.find(function (c) { return c[0] === PH.state.settingsCategory; }) || CATEGORIES[0];
    var list = h('div', { class: 'setting-list' }, PANELS[cat[0]]());
    var scroll = h('div', { class: 'setting-scroll', 'data-scroll': 'y', 'data-scroll-key': 'settings-' + cat[0] }, list);
    PH.focus.primeScroll(scroll);
    panel.appendChild(h('h2', { class: 'panel-title' }, cat[1]));
    panel.appendChild(h('p', { class: 'panel-sub' }, cat[2]));
    panel.appendChild(scroll);
  }

  function render(view) {
    var nav = h('div', { class: 'settings-nav', 'data-region': 'settings-nav' }, CATEGORIES.map(function (c) {
      var el = h('div', {
        class: 'cat' + (PH.state.settingsCategory === c[0] ? ' is-current' : ''),
        'data-key': 'cat:' + c[0], 'data-group': 'settings-nav', 'data-cat': c[0], 'data-hint': 'button'
      }, c[1]);
      el._activate = function () {
        var firstRow = document.querySelector('#settings-panel [data-key]');
        if (firstRow) PH.focus.set(firstRow);
      };
      return el;
    }));
    var panel = h('div', { class: 'settings-panel glass', id: 'settings-panel', 'data-region': 'settings-panel' });
    fillPanel(panel);
    view.appendChild(h('div', { class: 'settings' }, [nav, panel]));
  }

  // Focusing a category shows its panel straight away, like the TV's own settings.
  PH.on('focus', function (el) {
    var cat = el.getAttribute('data-cat');
    if (!cat || cat === PH.state.settingsCategory) return;
    PH.state.settingsCategory = cat;
    Array.prototype.forEach.call(document.querySelectorAll('.cat'), function (c) {
      c.classList.toggle('is-current', c.getAttribute('data-cat') === cat);
    });
    var panel = document.getElementById('settings-panel');
    PH.clear(panel);
    fillPanel(panel);
  });

  PH.settings = { render: render, explainVpn: explainVpn };
})(window.PH = window.PH || {});
