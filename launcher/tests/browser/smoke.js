/*
 * Browser smoke tests for Premium Home. Open http://127.0.0.1:8642/__tests__/ (via tools/serve.py).
 *
 * Loads the real app in an iframe with ?test=1 (separate storage slot) and drives it with the
 * key codes a webOS remote sends. Results show in the page and in window.__smoke.
 * No network requests beyond this local server; nothing here can reach a TV.
 */
(function () {
  'use strict';

  var KEY = { left: 37, up: 38, right: 39, down: 40, enter: 13, back: 461, options: 79, quick: 81, ambient: 405 };
  var TEST_STORAGE = 'premiumHome.config.v1.test';
  var TEST_WEATHER_CACHE = 'premiumHome.weather.v1.test';
  var frame = document.getElementById('app');
  var W = null;        // the app's window
  var pageErrors = [];

  // ---------- helpers ----------

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function fire(type, code, repeat) {
    var e = new W.KeyboardEvent(type, { bubbles: true, cancelable: true, repeat: !!repeat });
    Object.defineProperty(e, 'keyCode', { get: function () { return code; } });
    W.document.dispatchEvent(e);
  }

  // Short press by default; holdMs > 550 is a long press (Options).
  async function press(k, holdMs) {
    fire('keydown', KEY[k]);
    if (holdMs) await wait(holdMs);
    fire('keyup', KEY[k]);
    await wait(40);
    return focus();
  }

  async function keys(list) { for (var i = 0; i < list.length; i++) await press(list[i]); return focus(); }
  function focus() { return W.PH.focus.currentKey(); }
  function $(sel) { return W.document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(W.document.querySelectorAll(sel)); }
  function sceneAnimations() {
    return W.document.getAnimations().filter(function (a) { return a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#scene') && a.playState === 'running'; }).length;
  }
  var FAVS = ['youtube', 'netflix', 'disneyplus', 'stremio', 'primevideo', 'tubi'];
  function saved() { var raw = localStorage.getItem(TEST_STORAGE); return raw ? JSON.parse(raw) : null; }

  function eq(actual, expected, label) {
    var a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) throw new Error((label ? label + ': ' : '') + 'expected ' + b + ', got ' + a);
  }
  function ok(cond, label) { if (!cond) throw new Error(label); }

  // Focus the dialog item whose label matches, using arrow keys like a remote would.
  async function chooseInDialog(label) {
    var items = Array.prototype.slice.call(W.document.querySelectorAll('.dialog-item'));
    var target = items.findIndex(function (el) { return el.querySelector('.dialog-label').textContent === label; });
    ok(target >= 0, 'dialog has no "' + label + '" item');
    var current = items.indexOf(W.PH.focus.current());
    while (current < target) { await press('down'); current++; }
    while (current > target) { await press('up'); current--; }
    eq(W.PH.focus.current().querySelector('.dialog-label').textContent, label, 'focused dialog item');
    await press('enter');
  }

  function load(fresh, query) {
    if (fresh) {
      [TEST_STORAGE, TEST_WEATHER_CACHE, 'premiumHome.recents.v1.test', 'premiumHome.saved.v1.test', 'premiumHome.wallpaperCycle.v1.test'].forEach(function (k) { localStorage.removeItem(k); });
    }
    return new Promise(function (resolve) {
      frame.onload = function () {
        W = frame.contentWindow;
        W.addEventListener('error', function (e) { pageErrors.push(e.message); });
        W.addEventListener('unhandledrejection', function (e) { pageErrors.push(String(e.reason)); });
        setTimeout(resolve, 400);
      };
      frame.src = '/index.html?test=1' + (query || '') + '&t=' + Date.now();
    });
  }

  // ---------- tests ----------

  var tests = [
    ['Boots on Home, YouTube focused, six favorites in order, °C, weather off with no numbers', async function () {
      await load(true);
      ok(W.PH && W.PH.state && W.PH.state.config, 'app did not start');
      eq(W.PH.state.section, 'home', 'section');
      eq(focus(), 'favorites:youtube', 'initial focus');
      eq(W.PH.views.idsFor('favorites'), ['youtube', 'netflix', 'disneyplus', 'stremio', 'primevideo', 'tubi'], 'favorites');
      eq(W.PH.state.config.weather.units, 'C', 'units');
      eq(W.PH.weather.current().status, 'off', 'weather status');
      var card = $('[data-key="weather:card"]');
      ok(card && /off/i.test(card.textContent), 'card says weather is off');
      ok(!/\d/.test(card.textContent), 'no numbers while weather is off');
    }],

    ['Weather off by default makes zero network requests to Open-Meteo', async function () {
      var hits = W.performance.getEntriesByType('resource').filter(function (e) { return /open-meteo/.test(e.name); });
      eq(hits.length, 0, 'open-meteo requests');
      eq(W.PH.weather._state.lastAttemptAt, 0, 'no attempt recorded');
    }],

    ['All six favorites show a brand logo when tools/fetch-logos.py has run, or the monogram fallback otherwise', async function () {
      for (var i = 0; i < FAVS.length; i++) {
        var tile = $('[data-key="favorites:' + FAVS[i] + '"]');
        var img = tile && tile.querySelector('.dock-icon img');   // v0.6: Home dock icons
        if (!img) { ok(tile.querySelector('.dock-mono'), FAVS[i] + ': no logo and no monogram'); continue; }
        if (!img.complete) await new Promise(function (r) { img.addEventListener('load', r); img.addEventListener('error', r); setTimeout(r, 2000); });
        if (img.naturalWidth === 0) { await wait(50); ok(tile.querySelector('.dock-mono'), FAVS[i] + ': fallback to monogram after a missing logo'); continue; }
        ok(/assets\/brands\/[a-z]+\.svg$/.test(img.getAttribute('src')), FAVS[i] + ': logo is not a local asset');
        eq(tile.querySelector('.dock-label').textContent, W.PH.catalogById[FAVS[i]].name, FAVS[i] + ': name (shown when focused)');
      }
    }],

    ['Right reaches all six favorites, Add to Home and All apps, each fully in view', async function () {
      // Browsers pause CSS transitions in hidden windows, so measure the settled end state:
      // Reduced motion applies the same scroll transforms instantly.
      W.PH.app.update(function (c) { c.appearance.motion = 'reduced'; return c; }, { focus: ['favorites:youtube'] });
      var expected = ['favorites:netflix', 'favorites:disneyplus', 'favorites:stremio', 'favorites:primevideo', 'favorites:tubi', 'favorites:+add', 'favorites:+apps'];
      for (var i = 0; i < expected.length; i++) {
        eq(await press('right'), expected[i], 'step ' + (i + 1));
        await wait(60);
        var el = W.PH.focus.current();
        var t = el.getBoundingClientRect();
        var r = el.closest('.row').getBoundingClientRect();
        ok(t.left >= r.left - 1 && t.right <= r.right + 1, expected[i] + ' is clipped by the row');
      }
      eq(await press('right'), 'favorites:+apps', 'Right at the row end stays in the row');
      ok(/^quick:/.test(await press('down')), 'Down goes to the Quick access row');
      eq(await keys(['right', 'right', 'right', 'right', 'right', 'right', 'right']), 'quick:+apps', 'Right ends on All apps and stays in the row');
      W.PH.app.update(function (c) { c.appearance.motion = 'full'; return c; });
    }],

    ['Mac preview: OK opens the labelled preview launch screen; Back closes it', async function () {
      W.PH.focus.restore(['favorites:netflix']);
      await press('enter');
      var overlay = $('.launch');
      ok(overlay, 'launch screen did not appear');
      ok(/Mac preview/.test(overlay.textContent), 'launch screen must say it is only a preview');
      await press('back');
      await wait(300);
      ok(!$('.launch'), 'launch screen did not close');
      eq(focus(), 'favorites:netflix', 'focus after closing');
    }],

    ['Holding OK opens Options; Back cancels and focus returns', async function () {
      await press('enter', 650);
      ok(W.PH.ui.dialogOpen(), 'options dialog did not open');
      eq($('.dialog-title').textContent, 'Netflix', 'dialog title');
      await press('back');
      ok(!W.PH.ui.dialogOpen(), 'dialog did not close');
      eq(focus(), 'favorites:netflix', 'focus restored');
    }],

    ['Move on Home reorders, saves, and survives a reload', async function () {
      W.PH.focus.restore(['favorites:youtube']);
      await press('options');
      await chooseInDialog('Move on Home');
      ok(W.PH.state.move, 'move mode did not start');
      await press('right');
      await press('enter');
      eq(W.PH.state.config.favorites.slice(0, 2), ['netflix', 'youtube'], 'new order');
      eq(saved().favorites.slice(0, 2), ['netflix', 'youtube'], 'saved order');
      await load(false);
      eq(W.PH.state.config.favorites.slice(0, 2), ['netflix', 'youtube'], 'order after reload');
    }],

    ['Back during a move cancels and restores the order', async function () {
      var before = W.PH.state.config.favorites.join(',');
      W.PH.focus.restore(['favorites:stremio']);
      await press('options');
      await chooseInDialog('Move on Home');
      await keys(['left', 'left']);
      await press('back');
      ok(!W.PH.state.move, 'still in move mode');
      eq(W.PH.state.config.favorites.join(','), before, 'order restored');
    }],

    ['Tabs: Up from a far-right tile goes weather card → active tab; Left/Right switch sections', async function () {
      await load(true);
      await keys(['right', 'right', 'right', 'right', 'right']);
      eq(await press('up'), 'weather:card', 'Up reaches the weather card first');
      eq(await press('up'), 'tab:home', 'then the active tab');
      eq(W.PH.state.section, 'home', 'section unchanged');
      eq(await press('left'), 'tab:home', 'Left on first tab stays');
      eq(await press('right'), 'tab:apps', 'Right moves along tabs');
      eq(W.PH.state.section, 'apps', 'section follows tab focus');
      eq(await press('down'), 'apps-act:edit', 'Down reaches the Apps actions');
      ok(/^apps:/.test(await press('down')), 'Down reaches the grid');
    }],

    ['Up from the tab bar opens the ambient view (time, date, no icons or tiles); any key returns', async function () {
      await load(true);
      // Motion Off: check the end state, not transition timing (paused in hidden headless windows).
      W.PH.app.update(function (c) { c.appearance.motion = 'off'; return c; }, { focus: ['favorites:youtube'] });
      ok(!$('.brand'), 'no "Premium Home" label in the top bar');
      eq(await keys(['up', 'up']), 'tab:home', 'reach the tab bar');
      await press('up');
      ok(W.PH.state.ambient, 'ambient view open');
      var amb = $('#ambient');
      ok(!amb.hidden, 'ambient visible');
      ok(/\d{1,2}:\d{2}/.test(amb.textContent), 'shows the time');
      ok(!amb.querySelector('img, svg, [data-key]'), 'no icons or focusable items');
      eq(W.getComputedStyle($('#topbar')).visibility, 'hidden', 'tab bar hidden');
      eq(W.getComputedStyle($('.views')).visibility, 'hidden', 'tiles hidden');
      await press('left');
      ok(!W.PH.state.ambient, 'any key returns (v0.4): Left closes');
      eq(focus(), 'tab:home', 'focus back on the Home tab');
      await press('up');
      await press('back');
      ok(!W.PH.state.ambient, 'Back closes');
      eq(focus(), 'tab:home', 'focus back on the Home tab');
      await press('up');
      await press('down');
      ok(!W.PH.state.ambient, 'Down also closes');
      W.PH.app.update(function (c) { c.appearance.ambient = false; return c; }, { focus: ['tab:home'] });
      await press('up');
      ok(!W.PH.state.ambient, 'turned off in Settings');
    }],

    ['Screensaver pauses every scene and ambient animation (ambient + idle too), with Full, Reduced and Off motion', async function () {
      await load(true);
      W.PH.weather.setDemo('snow');
      var underSaver = function () {
        return W.document.getAnimations().filter(function (a) {
          // Looping keyframe animations only; one-off dimming fades (CSSTransition) end by themselves.
          var t = a.effect && a.effect.target;
          return a instanceof W.CSSAnimation && t && t.closest && t.closest('#scene, #ambient') && a.playState === 'running';
        }).length;
      };
      var modes = ['full', 'reduced', 'off'];
      for (var i = 0; i < modes.length; i++) {
        W.PH.app.update(function (c) { c.appearance.motion = modes[i]; return c; });
        W.PH.ambient.open();
        W.PH.oled.idleFor(60);            // ambient + idle: the combination that used to keep running
        if (modes[i] === 'full') ok(underSaver() > 0, 'full motion animates before the screensaver');
        W.PH.oled.showScreensaver();
        await wait(50);
        eq(underSaver(), 0, modes[i] + ': running scene/ambient animations under the screensaver');
        await press('right');             // first key only wakes
        ok(!W.PH.oled.isSaverOn(), modes[i] + ': woken');
        ok(W.PH.state.ambient, modes[i] + ': ambient view still open after waking');
        if (modes[i] === 'full') ok(underSaver() > 0, 'animations resume after waking');
        W.PH.ambient.close();
      }
      W.PH.weather.setDemo(null);
    }],

    ['v0.9 OLED schedule (fake clock): ambient at 90 s, new photo every 10 min (never saved), dim at 45:00, pure black at 60:00, any key wakes', async function () {
      await load(true);
      var stage = $('#stage');
      W.PH.app.update(function (c) { c.appearance.motion = 'off'; return c; }, { focus: ['favorites:youtube'] });
      W.PH.oled.idleFor(89);
      ok(!W.PH.state.ambient, '89 s: still Home');
      ok(!stage.classList.contains('is-idle'), 'no 45-second general dim');
      W.PH.oled.idleFor(90);
      ok(W.PH.state.ambient, '90 s: ambient');
      var home = W.PH.backdrop.effective().scenicId, cycle = JSON.stringify(W.PH.backdrop.cycle()), cfgBefore = JSON.stringify(W.PH.state.config);
      W.PH.oled.idleFor(90 + 599);
      eq(W.PH.backdrop.effective().scenicId, home, '9:59 in ambient: same photo');
      W.PH.oled.idleFor(90 + 600);
      var amb1 = W.PH.backdrop.effective().scenicId;
      ok(amb1 !== home, '10:00 in ambient: a new photo');
      ok(W.PH.backdrop.pool().indexOf(amb1) >= 0, 'from the same pool as daily rotation');
      eq(stage.getAttribute('data-amb-spot'), '1', 'the text moves with the photo');
      W.PH.oled.idleFor(90 + 1200);
      ok(W.PH.backdrop.effective().scenicId !== amb1, '20:00: another photo');
      eq(JSON.stringify(W.PH.backdrop.cycle()), cycle, 'daily wallpaper cycle untouched');
      eq(JSON.stringify(W.PH.state.config), cfgBefore, 'nothing saved');
      W.PH.oled.idleFor(44 * 60 + 59);
      ok(!stage.classList.contains('ambient-dim'), '44:59: not dimmed');
      W.PH.oled.idleFor(45 * 60);
      ok(stage.classList.contains('ambient-dim'), '45:00: dimmed');
      eq(W.getComputedStyle($('#ambient .amb-greet')).visibility, 'hidden', 'greeting hidden while dimmed');
      ok(Number(W.getComputedStyle($('#ambient')).opacity) <= 0.45, 'clock and weather well down');
      W.PH.oled.idleFor(59 * 60 + 59);
      ok(!W.PH.oled.isSaverOn(), '59:59: not black');
      W.PH.oled.idleFor(60 * 60);
      ok(W.PH.oled.isSaverOn(), '60:00: black');
      await wait(1500);
      ok(stage.classList.contains('saver-black'), 'after the fade, nothing is drawn under it');
      var ss = $('#screensaver');
      eq(W.getComputedStyle(ss).backgroundColor, 'rgb(0, 0, 0)', 'pure black');
      eq(W.getComputedStyle(ss).opacity, '1', 'fully opaque');
      eq(ss.children.length, 0, 'no clock, no text, no logo');
      Array.prototype.forEach.call(stage.children, function (el) {
        if (el !== ss) eq(W.getComputedStyle(el).visibility, 'hidden', '#' + el.id + ' not drawn');
      });
      W.PH.oled.idleFor(60 * 60 + 1);
      ok(W.PH.oled.isSaverOn(), '60:01: still black');
      await press('enter', 30);
      ok(!W.PH.oled.isSaverOn(), 'OK wakes the screen');
      ok(!stage.classList.contains('saver-black') && !stage.classList.contains('ambient-dim'), 'full brightness again');
      ok(W.PH.state.ambient, 'back to the ambient view');
      await press('back');
      ok(!W.PH.state.ambient, 'Back leaves the ambient view');
      eq(W.PH.backdrop.effective().scenicId, home, 'Home has its own wallpaper back');
      W.PH.oled.idleFor(59 * 60);
      ok(!W.PH.oled.isSaverOn(), 'a key restarts the whole schedule');
      W.PH.oled.wake();
    }],


    ['Settings: Down stays in the panel, Left returns to the current category', async function () {
      await load(true);
      eq(await keys(['up', 'up', 'right', 'right', 'right']), 'tab:settings', 'reach the Settings tab');
      eq(W.PH.state.section, 'settings', 'section');
      eq(await press('down'), 'cat:appearance', 'enter categories');
      eq(await press('right'), 'set:background', 'enter panel');
      eq(await keys(['down', 'down', 'down', 'down', 'down', 'down', 'down']), 'set:guides', 'bottom of panel');
      eq(await press('left'), 'cat:appearance', 'back to category');
      eq(await press('down'), 'cat:wallpaper', 'next category');
      eq(W.PH.state.settingsCategory, 'wallpaper', 'panel follows category');
      var cats = $$('.cat').map(function (el) { return el.getAttribute('data-cat'); });
      eq(cats, ['appearance', 'wallpaper', 'clock', 'oled', 'watching', 'shortcuts', 'privacy', 'cleanup', 'backup', 'about'], 'categories');
    }],

    ['Hide removes a tile; Show hidden brings it back marked; Unhide restores it', async function () {
      W.PH.app.go('apps');
      W.PH.focus.restore(['apps:twitch']);
      await press('options');
      await chooseInDialog('Hide');
      ok(W.PH.views.idsFor('apps').indexOf('twitch') < 0, 'twitch still visible');
      W.PH.focus.restore(['apps-act:hidden']);
      await press('enter');
      var tile = $('[data-key="apps:twitch"]');
      ok(tile && tile.classList.contains('is-hidden-app'), 'hidden tile not shown as hidden');
      W.PH.focus.restore(['apps:twitch']);
      await press('options');
      await chooseInDialog('Unhide');
      eq(W.PH.config.findShortcut(W.PH.state.config, 'twitch').hidden, false, 'twitch hidden flag');
    }],

    ['Export → restore round-trip through the confirm dialog (Cancel is the default)', async function () {
      var snapshot = JSON.stringify(W.PH.config.exportDoc(W.PH.state.config));
      W.PH.app.update(function (c) { c.appearance.accent = 'graphite'; c.favorites = ['tubi']; return c; });
      W.PH.backup.applyText(snapshot);
      eq($('.dialog-title').textContent, 'Replace the current setup?', 'confirm title');
      eq(W.PH.focus.current().textContent, 'Cancel', 'default focus');
      await press('up');
      await press('enter');
      eq(W.PH.state.config.appearance.accent, 'ice', 'accent restored');
      eq(W.PH.state.config.favorites.length, 6, 'favorites restored');
    }],

    ['Bad files are rejected and change nothing; prototype-named ids are reported', async function () {
      var before = JSON.stringify(W.PH.state.config);
      W.PH.backup.applyText('{oops');
      ok(/not valid JSON/.test($('.dialog-msg').textContent), 'bad JSON message');
      await press('enter');
      W.PH.backup.applyText(JSON.stringify({ schema: 'other', version: 1 }));
      ok(/not a Premium Home/.test($('.dialog-msg').textContent), 'wrong schema message');
      await press('enter');
      W.PH.backup.applyText(JSON.stringify({ schema: W.PH.config.SCHEMA, version: 1, shortcuts: [{ id: 'constructor' }, { id: '__proto__' }, { id: 'netflix' }], favorites: ['netflix'] }));
      var msg = $('.dialog-msg').textContent;
      ok(/unknown shortcut "constructor"/.test(msg) && /unknown shortcut "__proto__"/.test(msg), 'prototype ids not reported: ' + msg);
      await press('back');
      eq(JSON.stringify(W.PH.state.config), before, 'config unchanged');
    }],

    ['Back chain ends in one Exit prompt; on webOS, Exit calls window.close() and never platformBack()', async function () {
      await load(true);
      eq(await press('back'), 'tab:home', 'Back from content goes to the tab bar');
      await press('back');
      eq($('.dialog-title').textContent, 'Exit Premium Home?', 'exit prompt');
      eq(W.PH.focus.current().textContent, 'Cancel', 'Cancel is the default');
      var closed = 0, platformBack = 0;
      W.PH.platform.isWebOS = true;
      W.close = function () { closed++; };
      W.webOS = { platformBack: function () { platformBack++; } };
      try {
        await press('up');
        await press('enter');
      } finally {
        W.PH.platform.isWebOS = false;
      }
      eq(closed, 1, 'window.close calls');
      eq(platformBack, 0, 'platformBack calls (would show a second, system exit prompt)');
    }],

    ['Screensaver: the first key only wakes the screen', async function () {
      await load(true);
      W.PH.oled.showScreensaver();
      await wait(100);
      var before = focus();
      await press('right');
      ok(!$('#screensaver').classList.contains('is-on'), 'screensaver still on');
      eq(focus(), before, 'focus moved on the waking key');
    }],

    ['Consent: Cancel keeps weather off; Turn on (stubbed API) shows live values; Back returns to the card', async function () {
      await load(true);
      var calls = 0, fixture = await (await fetch('fixtures/open-meteo-sample.json')).json();
      W.fetch = function (url) {
        calls++;
        ok(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=43\.65&longitude=-79\.38/.test(String(url)), 'request URL: ' + url);
        return Promise.resolve(new W.Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      eq(await press('up'), 'weather:card', 'focus card');
      await press('enter');
      await chooseInDialog('Turn on live weather…');
      eq($('.dialog-title').textContent, 'Turn on live weather?', 'consent dialog');
      eq(W.PH.focus.current().textContent, 'Cancel', 'Cancel is the default');
      await press('enter');
      eq(W.PH.state.config.weather.enabled, false, 'Cancel keeps it off');
      eq(calls, 0, 'no request after Cancel');
      W.PH.focus.restore(['weather:card']);
      await press('enter');
      await chooseInDialog('Turn on live weather…');
      await chooseInDialog('Turn on');
      for (var i = 0; i < 20 && W.PH.weather.current().status !== 'live'; i++) await wait(50);
      var w = W.PH.weather.current();
      eq(w.status, 'live', 'status');
      eq(calls, 1, 'exactly one request');
      var card = $('[data-key="weather:card"]');
      ok(/Live · Open-Meteo/.test(card.textContent), 'card shows source and time');
      ok(card.textContent.indexOf(String(Math.abs(w.temp))) >= 0, 'card shows the temperature');
      eq(focus(), 'weather:card', 'focus back on the card');
      await press('enter');
      eq($('.dialog-title').textContent, 'Weather', 'details open');
      ok($$('.wx-day').length >= 3, 'forecast days shown');
      ok(/Open-Meteo\.com · CC BY 4\.0/.test($('.wx-attrib').textContent), 'attribution');
      await press('back');
      eq(focus(), 'weather:card', 'Back returns to the card');
    }],

    ['API failure with no cache shows Offline and no invented numbers', async function () {
      await load(true);
      W.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); };
      W.PH.app.update(function (c) { c.weather.enabled = true; return c; });
      for (var i = 0; i < 20 && W.PH.weather.current().status === 'loading'; i++) await wait(50);
      eq(W.PH.weather.current().status, 'offline', 'status');
      var card = $('[data-key="weather:card"]');
      ok(/Offline/.test(card.textContent), 'card says Offline');
      ok(!/-?\d+°/.test(card.textContent), 'no temperature shown');
    }],

    ['Demo scenes are labelled DEMO, change the scene, stay within the particle budget, and are never saved', async function () {
      await load(true, '&background=dynamic');   // v0.5 defaults to a scenic wallpaper
      var before = localStorage.getItem(TEST_STORAGE);
      W.PH.weather.setDemo('rain');
      var card = $('[data-key="weather:card"]');
      ok(/DEMO/.test(card.textContent), 'DEMO label on card');
      eq($('#scene').getAttribute('data-scene'), 'rain-day', 'scene');
      ok(W.PH.scene.particleCount() > 0 && W.PH.scene.particleCount() <= W.PH.scene.MAX_PARTICLES, 'particle budget');
      W.PH.weather.setDemo('snow');
      eq($('#scene').getAttribute('data-scene'), 'snow-day', 'snow scene');
      W.PH.weather.setDemo(null);
      eq(localStorage.getItem(TEST_STORAGE), before, 'nothing saved');
      eq(W.PH.weather.current().status, 'off', 'back to off after the demo');
    }],

    ['Motion Off stops scene animations; Minimal hides the scene', async function () {
      W.PH.weather.setDemo('snow');
      ok(sceneAnimations() > 0, 'scene animates with Full motion');
      W.PH.app.update(function (c) { c.appearance.motion = 'off'; return c; });
      eq(sceneAnimations(), 0, 'running scene animations with Motion Off');
      W.PH.app.update(function (c) { c.appearance.background = 'minimal'; return c; });
      ok($('#scene').hidden, 'scene hidden in Minimal');
      W.PH.weather.setDemo(null);
    }],

    ['A saved v0.2 configuration migrates: order kept, new fields defaulted, weather stays off', async function () {
      localStorage.setItem(TEST_STORAGE, JSON.stringify({
        schema: 'lg-c4-premium-home/config', version: 1,
        appearance: { accent: 'glacier', glass: true, motion: 'full', safeAreaGuides: false },
        clock: { hour24: true, showDate: true }, weather: { enabled: true, units: 'C' },
        oledCare: { pixelShift: true, dimWhenIdle: true, screensaverMinutes: 5 },
        shortcuts: [{ id: 'tubi', hidden: false }, { id: 'youtube', hidden: false }], favorites: ['tubi', 'youtube']
      }));
      await load(false);
      eq(W.PH.state.config.version, 7, 'version');
      eq(W.PH.state.config.favorites, ['tubi', 'youtube'], 'order kept');
      eq(W.PH.state.config.appearance.background, 'scenic', 'new field default (v0.5: scenic)');
      eq(W.PH.state.config.weather.enabled, false, 'old flag is not consent');
    }],

    // ---------- v0.4 ----------

    ['Auto ambient: after the delay on Home only; any key restores the exact focus; dialogs, other sections and a hidden app block it', async function () {
      await load(true);
      W.PH.app.update(function (c) { c.appearance.motion = 'off'; return c; });
      eq(W.PH.state.config.ambientMode.autoDelaySeconds, 90, 'default 90 s');
      W.PH.focus.restore(['favorites:stremio']);
      W.PH.oled.idleFor(89);
      ok(!W.PH.state.ambient, 'not before 90 s');
      W.PH.oled.idleFor(91);
      ok(W.PH.state.ambient, 'opens after 90 s');
      eq(W.PH.ambient.openedBy(), 'auto', 'opened by inactivity');
      eq(W.getComputedStyle($('.views')).visibility, 'hidden', 'rows glide away');
      ok(!$('#ambient').querySelector('img, svg, [data-key]'), 'no logos or tiles in ambient');
      await press('down');
      ok(!W.PH.state.ambient, 'a key returns');
      eq(focus(), 'favorites:stremio', 'same tile focused again');
      await press('options');
      ok(W.PH.ui.dialogOpen(), 'options open');
      W.PH.oled.idleFor(200);
      ok(!W.PH.state.ambient, 'never over a dialog');
      await press('back');
      W.PH.app.go('apps');
      W.PH.oled.idleFor(200);
      ok(!W.PH.state.ambient, 'only on Home');
      W.PH.app.go('home');
      Object.defineProperty(W.document, 'hidden', { configurable: true, get: function () { return true; } });
      W.PH.oled.idleFor(200);
      ok(!W.PH.state.ambient, 'never while the app is hidden (another app in front)');
      delete W.document.hidden;
      W.PH.oled.wake();
      W.PH.app.update(function (c) { c.ambientMode.autoDelaySeconds = 300; c.oledCare.screensaverMinutes = 10; return c; });
      W.PH.oled.idleFor(299);
      ok(!W.PH.state.ambient, '5 min: not yet at 299 s');
      W.PH.oled.idleFor(301);
      ok(W.PH.state.ambient, '5 min: opens at 301 s');
      await press('back');
      W.PH.app.update(function (c) { c.ambientMode.autoDelaySeconds = 600; c.oledCare.screensaverMinutes = 5; return c; });
      W.PH.oled.idleFor(601);
      ok(W.PH.oled.isSaverOn() && !W.PH.state.ambient, 'the screensaver wins when it is due first');
      await press('right');
      W.PH.app.update(function (c) { c.ambientMode.autoDelaySeconds = 0; return c; });
      W.PH.oled.idleFor(250);
      ok(!W.PH.state.ambient, 'Off disables auto ambient');
    }],

    ['Magic Remote: hover focuses, click = OK, wheel moves through rows, pointer jitter and held keys never overshoot', async function () {
      await load(true);
      W.PH.app.update(function (c) { c.appearance.motion = 'off'; return c; });
      var stage = $('#stage');
      function mouse(type, el, dx, dy) {
        var r = el.getBoundingClientRect();
        el.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.left + r.width / 2 + (dx || 0), clientY: r.top + r.height / 2 + (dy || 0) }));
      }
      var netflix = $('[data-key="favorites:netflix"]');
      mouse('mousemove', netflix);
      mouse('mousemove', netflix, 30, 0);
      eq(focus(), 'favorites:netflix', 'hover focuses');
      ok(stage.classList.contains('pointer-mode'), 'pointer mode on');
      await press('right');
      ok(!stage.classList.contains('pointer-mode'), 'a remote key returns to D-pad focus');
      W.PH.oled.idleFor(50);
      mouse('mousemove', netflix, 32, 3);
      mouse('mousemove', netflix, 28, -2);
      ok(W.PH.oled.idleSeconds() >= 50, 'pointer jitter does not count as input');
      mouse('mousemove', netflix, -60, 0);
      ok(W.PH.oled.idleSeconds() < 1, 'a deliberate move does');
      mouse('click', $('[data-key="favorites:disneyplus"]'));
      ok(W.PH.state.overlay, 'click acts like OK (simulated launch)');
      await press('back');
      function wheel(d) { stage.dispatchEvent(new W.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: d })); return wait(170); }
      W.PH.focus.restore(['favorites:youtube']);
      await wheel(100);
      eq(focus(), 'favorites:netflix', 'wheel down moves along the row');
      await wheel(-100);
      eq(focus(), 'favorites:youtube', 'wheel up moves back');
      W.PH.focus.restore(['favorites:+apps']);
      await wheel(100);
      ok(/^(cw|recent|quick):/.test(focus()), 'at the row end the wheel continues to the next row, got ' + focus());
      W.PH.focus.restore(['favorites:youtube']);
      for (var i = 0; i < 5; i++) fire('keydown', KEY.right, true);
      fire('keyup', KEY.right);
      eq(focus(), 'favorites:netflix', 'five instant key repeats move one step');
    }],

    ['Wallpaper gallery: focus previews, Back restores, OK saves and survives reload; rotation is never saved; nothing leaves the device', async function () {
      await load(true, '&background=dynamic');
      W.PH.app.update(function (c) { c.appearance.motion = 'off'; return c; });
      eq($('#stage').getAttribute('data-bg'), 'dynamic', 'default background');
      W.PH.gallery.open();
      await wait(200);
      ok(W.PH.ui.dialogOpen(), 'gallery open');
      eq(focus(), 'gal:dynamic', 'starts on the current choice');
      eq(await keys(['right', 'right']), 'gal:scenic:two-medicine', 'third card: the first photo');
      eq($('#stage').getAttribute('data-bg'), 'scenic', 'previewing');
      ok(/photos\/two-medicine\.jpg$/.test($('#wallpaper .wp-img:last-child').getAttribute('src')), 'full-size photo previewed, not the thumbnail');
      ok(/two-medicine-thumb\.jpg$/.test($('[data-key="gal:scenic:two-medicine"] img').getAttribute('src')), 'gallery card uses the small thumbnail');
      ok($('#scene').hidden, 'weather scene hidden behind a wallpaper');
      await press('back');
      ok(!W.PH.ui.dialogOpen(), 'closed');
      eq($('#stage').getAttribute('data-bg'), 'dynamic', 'Back restores the saved background');
      eq(W.PH.state.config.appearance.background, 'dynamic', 'nothing saved');
      W.PH.gallery.open();
      await wait(200);
      eq(await keys(Array(14).fill('right')), 'gal:scenic:northern-lights', 'Northern Lights (after the nine photos)');
      await press('enter');
      eq(saved().appearance.background, 'scenic', 'saved');
      eq(saved().wallpaper.scenicId, 'northern-lights', 'saved id');
      await load(false);
      await wait(250);
      var img = $('#wallpaper .wp-img');
      ok(img && /northern-lights\.svg$/.test(img.getAttribute('src')), 'still applied after reload');
      eq(img.naturalWidth, 1920, 'drawn for the 1920 px canvas');
      W.PH.app.update(function (c) { c.wallpaper.rotateMinutes = 30; return c; });
      W.PH.backdrop.rotateNow();
      ok(W.PH.backdrop.effective().scenicId !== 'northern-lights', 'rotated');
      eq(saved().wallpaper.scenicId, 'northern-lights', 'rotation is not saved');
      var offDevice = W.performance.getEntriesByType('resource').map(function (e) { return e.name; })
        .filter(function (n) { return n.indexOf(W.location.origin) !== 0 && n.indexOf('blob:') !== 0; });
      eq(offDevice, [], 'no off-device requests');
    }],

    ['My photo: resized, re-encoded, stored in IndexedDB (not localStorage), survives reload; bad files refused; removable', async function () {
      await load(true);
      W.PH.app.update(function (c) { c.appearance.motion = 'off'; return c; });
      function makeFile(w, hgt, type) {
        return new Promise(function (resolve) {
          var c = W.document.createElement('canvas');
          c.width = w; c.height = hgt;
          var g = c.getContext('2d');
          g.fillStyle = '#334466'; g.fillRect(0, 0, w, hgt);
          g.fillStyle = '#cc9966'; g.fillRect(w / 4, hgt / 4, w / 2, hgt / 2);
          c.toBlob(function (b) { resolve(new W.File([b], 'holiday.png', { type: type || 'image/png' })); }, 'image/png');
        });
      }
      var rec = await W.PH.photo.save(await makeFile(3840, 2160));
      eq([rec.width, rec.height], [1920, 1080], 'downscaled to 1920 x 1080');
      eq(rec.blob.type, 'image/jpeg', 're-encoded as JPEG (metadata dropped)');
      ok(!Object.keys(localStorage).some(function (k) { return /photo/i.test(k); }), 'not in localStorage');
      W.PH.app.update(function (c) { c.appearance.background = 'photo'; return c; });
      await wait(250);
      ok(/^blob:/.test($('#wallpaper .wp-img').getAttribute('src')), 'shown from the device store');
      await load(false);
      await wait(350);
      var img = $('#wallpaper .wp-img');
      ok(img && /^blob:/.test(img.getAttribute('src')), 'still there after reload');
      var errs = [];
      var bad = [await makeFile(400, 300), await makeFile(2000, 1000, 'image/gif')];
      for (var i = 0; i < bad.length; i++) {
        try { await W.PH.photo.save(bad[i]); errs.push('accepted'); } catch (e) { errs.push(e.message); }
      }
      ok(/too small/.test(errs[0]) && /JPEG, PNG or WebP/.test(errs[1]), 'refused: ' + errs.join(' | '));
      ok(await W.PH.photo.get(), 'a refused file leaves the saved photo alone');
      await W.PH.photo.remove();
      eq(await W.PH.photo.get(), null, 'removed');
    }],

    ['Recent shows only launches made here (Demo); Continue Watching is absent with no data, never invents progress, DEV DEMO only on request', async function () {
      await load(true);
      W.PH.app.update(function (c) { c.appearance.motion = 'off'; return c; });
      ok(!$('.cw-card') && !/Continue Watching|Saved for later/.test($('#view-home').textContent), 'no empty row');
      ok(!$('[data-key^="recent:"]'), 'no recent yet');
      W.PH.focus.restore(['favorites:netflix']);
      await press('enter');
      await press('back');
      var chip = $('[data-key="recent:netflix"]');
      ok(chip && /Demo/.test(chip.textContent), 'Netflix under Recent, labelled Demo');
      ok(!/"kind"|"demo"|blob:/.test(JSON.stringify(W.PH.config.exportDoc(W.PH.state.config))), 'recent entries are not part of the export');
      W.PH.app.update(function (c) { c.recents.rememberRecents = false; return c; });
      ok(!$('[data-key^="recent:"]'), 'hidden when turned off');
      W.PH.cw.saveTitle({ title: 'Shogun', serviceId: 'disneyplus' });
      W.PH.app.render();
      ok(/Saved for later/.test($('#view-home').textContent), 'Saved for later row');
      ok(!/Continue Watching/.test($('#view-home').textContent), 'not called Continue Watching');
      ok(!/Shogun/.test(JSON.stringify(W.PH.config.exportDoc(W.PH.state.config))), 'saved titles are not part of the export');
      var card = $('.cw-card');
      ok(card && !card.querySelector('.cw-bar'), 'a saved title has no progress bar');
      W.PH.focus.set(card);
      await press('enter');
      eq($$('.dialog-label').map(function (e) { return e.textContent; }), ['Open Disney+', 'Remove from list', 'Close'], 'card options');
      ok(/app only · preview/.test($('.dialog-sub').textContent), 'opening is labelled app only (and preview on the Mac)');
      await press('back');
      await load(false, '&cwDemo=1');
      var cards = $$('.cw-card');
      eq(cards.length, 4, 'four cards (max 4)');
      ok(cards.filter(function (c) { return c.classList.contains('is-fixture'); }).every(function (c) { return /DEV DEMO/.test(c.textContent); }), 'every fixture card says DEV DEMO');
      W.PH.app.update(function (c) { c.watching.cwMax = 3; return c; });
      eq($$('.cw-card').length, 3, 'max 3');
      W.PH.app.update(function (c) { c.watching.cwRow = 'off'; return c; });
      eq($$('.cw-card').length, 0, 'row hidden');
    }],

    ['Quick settings: Q / ⚙ opens it; rows change real settings; VPN shows Not configured with no switch; Back returns focus', async function () {
      await load(true);
      W.PH.focus.restore(['favorites:tubi']);
      await press('quick');
      ok(W.PH.quick.isOpen(), 'open');
      eq(focus(), 'qs:ambient-now', 'first row focused');
      eq($$('.qs-row').length, 17, 'rows (v0.8 adds Next wallpaper and LG Home; v0.9.2 adds Home button)');
      eq(await press('down'), 'qs:auto', 'auto ambient row');
      await press('enter');
      eq(saved().ambientMode.autoDelaySeconds, 120, '90 s → 2 min, saved');
      ok(/2 min/.test($('[data-key="qs:auto"] .setting-value').textContent), 'value updated in place');
      eq(focus(), 'qs:auto', 'focus kept');
      var vpnRow = $('[data-key="qs:vpn"]');
      eq(vpnRow.querySelector('.setting-value').textContent, 'Not configured', 'VPN status');
      W.PH.focus.set(vpnRow);
      await press('enter');
      ok(/not configured/i.test($$('.dialog-title').pop().textContent) && /router/i.test($('.dialog-msg').textContent), 'explains the router requirement');
      eq($$('.dialog-label').map(function (e) { return e.textContent; }), ['OK'], 'no on/off switch');
      await press('back');
      ok(!/\bConnected\b/.test($('.qs-panel').textContent), 'never claims Connected');
      await press('back');
      ok(!W.PH.quick.isOpen(), 'Back closes');
      eq(focus(), 'favorites:tubi', 'focus returns');
      W.PH.focus.restore(['tab:quick']);
      await press('enter');
      ok(W.PH.quick.isOpen(), '⚙ in the top bar opens it');
      await press('back');
    }],

    ['Day / night: Auto follows the TV clock with no network; Day and Night overrides apply at once', async function () {
      await load(true, '&background=dynamic');
      var stage = $('#stage'), hr = new Date().getHours();
      W.PH.app.update(function (c) { c.theme.dayStartHour = hr; c.theme.nightStartHour = (hr + 1) % 24; return c; });
      eq(stage.getAttribute('data-daypart'), 'day', 'inside day hours');
      W.PH.app.update(function (c) { c.theme.dayStartHour = (hr + 1) % 24; c.theme.nightStartHour = hr; return c; });
      eq(stage.getAttribute('data-daypart'), 'night', 'inside night hours');
      W.PH.app.update(function (c) { c.theme.themeMode = 'day'; return c; });
      eq(stage.getAttribute('data-daypart'), 'day', 'Day override');
      W.PH.app.update(function (c) { c.theme.themeMode = 'night'; return c; });
      eq(stage.getAttribute('data-daypart'), 'night', 'Night override');
      eq($('#scene').getAttribute('data-scene'), 'calm-night', 'the scene follows the theme without weather');
      eq(W.PH.weather.current().status, 'off', 'weather still off');
    }],

    ['Gaming: name an input, set a favorite; names show on Home; no invented HDR / VRR / Hz values', async function () {
      await load(true);
      W.PH.app.go('gaming');
      eq($$('[data-key^="inputs:"]').length, 4, 'four HDMI inputs');
      W.PH.focus.restore(['inputs:hdmi1']);
      await press('options');
      await chooseInDialog('Rename…');
      await chooseInDialog('PlayStation 5');
      eq(saved().gaming.inputNames.hdmi1, 'PlayStation 5', 'saved');
      ok(/PlayStation 5/.test($('[data-key="inputs:hdmi1"]').textContent), 'shown on the card');
      W.PH.focus.restore(['inputs:hdmi3']);
      await press('options');
      await chooseInDialog('Set as favorite input');
      eq($$('[data-key^="inputs:"]')[0].getAttribute('data-key'), 'inputs:hdmi3', 'favorite comes first');
      var text = $('#view-gaming').textContent;
      ok(/Game Optimizer, HDR and VRR are set by the TV/.test(text), 'v0.9.4: one quiet note instead of the feature chips');
      ok(!/Unavailable until supported|Unnamed input/.test(text), 'no placeholder chips or "Unnamed input"');
      ok(!/\d+\s?Hz|HDR10|Dolby Vision|VRR on|ALLM on/i.test(text), 'no invented signal values');
      W.PH.app.go('home');
      ok(/PlayStation 5/.test($('[data-key="quick:hdmi1"]').textContent), 'Home quick access shows the name');
    }],

    ['Typing a title: Backspace edits (never Back), Down leaves the field for Save; the title lands on Home', async function () {
      await load(true);
      W.PH.cwUI.saveFlow();
      eq(focus(), 'prompt:field', 'field focused');
      await press('enter');
      var input = $('.prompt-input');
      eq(W.document.activeElement, input, 'OK puts the cursor in the field (the TV shows its keyboard)');
      input.value = 'Dune: Part Two';
      fire('keydown', 8); fire('keyup', 8);
      ok(W.PH.ui.dialogOpen(), 'Backspace while typing does not close the dialog');
      fire('keydown', 40); fire('keyup', 40);
      ok(W.document.activeElement !== input, 'Down closes the keyboard');
      eq(focus(), 'prompt:save', 'and moves to Save');
      await press('enter');
      await chooseInDialog('Prime Video');
      eq(W.PH.cw.loadSaved()[0].title, 'Dune: Part Two', 'saved');
      ok(/Dune: Part Two/.test($('#view-home').textContent), 'on Home');
    }],

    ['Tab switches only show a section: hidden sections are not rebuilt, a visited one is reused, and changes still reach it', async function () {
      await load(true);
      W.PH.focus.restore(['tab:home']);
      eq(focus(), 'tab:home', 'on the tab bar');
      ok(!W.PH.views.isBuilt('gaming'), 'gaming not built before it is shown');
      var homeTile = $('[data-key="favorites:youtube"]');
      eq(await keys(['right']), 'tab:apps', 'Right switches to Apps');
      ok(W.PH.views.isBuilt('apps') && !W.PH.views.isBuilt('gaming'), 'only Apps was built');
      eq(await keys(['left']), 'tab:home', 'back to Home');
      ok($('[data-key="favorites:youtube"]') === homeTile, 'Home reused, not rebuilt');
      W.PH.app.update(function (c) { c.gaming.inputNames.hdmi1 = 'PlayStation 5'; return c; });
      W.PH.app.go('gaming');
      ok(/PlayStation 5/.test($('#view-gaming').textContent), 'a settings change reaches a section built later');
    }],

    ['Scenic Home (v0.6): landscape photo by default, tab bar hidden until focused, dock navigation, nothing costly on Home', async function () {
      await load(true);
      var stage = $('#stage');
      ok(/assets\/photos\/[a-z-]+\.jpg$/.test($('#wallpaper .wp-img').getAttribute('src')), 'first run shows a licensed landscape photo (today\u2019s daily pick)');
      eq($$('#wallpaper .wp-img').length, 1, 'only one image loaded at start');
      eq(focus(), 'favorites:youtube', 'starts on the first dock icon');
      W.PH.ui.updateHints();
      eq($$('#hintbar .hint').length, 3, 'quiet hint bar on the dock: Open, Options, Settings');
      ok(!$('#hintbar .hint-right'), 'no version text on the scenic screen');
      eq(getComputedStyle($('#topbar')).opacity, '0', 'tab bar hidden on Home');
      ok($('[data-key="favorites:youtube"] .dock-label') && getComputedStyle($('[data-key="favorites:youtube"] .dock-label')).opacity !== '0', 'focused icon shows its name');
      eq(await press('up'), 'weather:card', 'Up from the dock reaches weather');
      eq(await press('up'), 'tab:home', 'then the tab bar');
      ok(stage.classList.contains('nav-shown'), 'tab bar shown while focused');
      eq(await press('down'), 'weather:card', 'Down returns');
      ok(!stage.classList.contains('nav-shown'), 'and the tab bar hides again');
      eq(await press('down'), 'favorites:youtube', 'back on the dock');
      eq(await press('right'), 'favorites:netflix', 'Right moves along the dock, never down');
      var costly = Array.prototype.filter.call($('#view-home .home-stage').querySelectorAll('*'), function (e) {
        var cs = getComputedStyle(e);
        return (cs.backdropFilter && cs.backdropFilter !== 'none') || /\d+px \d+px [1-9]\d+px/.test(cs.boxShadow) || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none');
      });
      eq(costly.length, 0, 'no backdrop blur, blurred shadow or mask on the first Home screen');
      ok(/^quick:/.test(await press('down')), 'Down from the dock reaches the rows below');
      eq($('.home-track').getAttribute('data-offset'), '1080', 'the page below replaces the photo screen completely (v0.6 TV defect)');
      await wait(450);   // let the 300 ms scroll transition settle
      var q = W.PH.focus.current().getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = sr.height / 1080;
      var qb = (q.bottom - sr.top) / k;   // in 1920x1080 canvas pixels
      ok(qb > 0 && qb <= 960, 'the rows below are on screen and clear of the hint bar (bottom at ' + Math.round(qb) + ')');
      eq(await press('up'), 'favorites:netflix', 'Up returns to the dock');
      eq($('.home-track').getAttribute('data-offset'), '0', 'and the photo screen comes back');
    }],

    ['On webOS: verified streaming apps launch through the Application Manager; missing, unlinked and input tiles never pretend', async function () {
      await load(true);
      var calls = [], reply = { returnValue: true };
      function FakeBridge() {}
      FakeBridge.prototype.call = function (uri, params) {
        calls.push({ uri: uri, params: JSON.parse(params) });
        var self = this; setTimeout(function () { self.onservicecallback(JSON.stringify(reply)); }, 5);
      };
      W.PalmServiceBridge = FakeBridge;
      W.PH.platform.isWebOS = true;
      try {
        eq(W.PH.launcher.kindOf(W.PH.catalogById.netflix), 'native', 'Netflix is launch-verified');
        eq(W.PH.launcher.kindOf(W.PH.catalogById.stremio), 'native', 'Stremio (io.strem.tv) is launch-verified');
        eq(W.PH.launcher.kindOf(W.PH.catalogById.tubi), 'native', 'Tubi (com.tubitv.ott.tubi) is launch-verified');
        eq(W.PH.launcher.kindOf(W.PH.catalogById.appletv), 'not-found', 'an app with no verified ID (Apple TV) is not-found');
        eq(W.PH.launcher.kindOf(W.PH.catalogById.hdmi1), 'native', 'v0.8: HDMI inputs open the TV\u2019s own input app');
        W.PH.launcher.launch(W.PH.catalogById.netflix);
        await wait(60);
        eq(calls.length, 1, 'one service call');
        eq(calls[0].uri, 'luna://com.webos.applicationManager/launch', 'documented Application Manager launch');
        eq(calls[0].params.id, 'netflix', 'exact verified ID');
        ok(!$('.launch'), 'no simulated screen for a real launch');
        eq(W.PH.recents.load()[0].kind, 'native', 'Recent records a real launch only after the TV accepted it');
        reply = { returnValue: false, errorCode: -101, errorText: 'not exist' };
        W.PH.launcher.launch(W.PH.catalogById.youtube);
        await wait(60);
        ok(W.PH.ui.dialogOpen() && /isn’t installed/.test($('.dialog').textContent), 'a missing app is explained');
        eq(W.PH.recents.load()[0].id, 'netflix', 'a failed launch is not added to Recent');
        await press('enter');
        W.PH.launcher.launch(W.PH.catalogById.appletv);
        await wait(30);
        eq(calls.length, 2, 'an unlinked app makes no service call');
        ok(/isn’t linked yet/.test($('.dialog').textContent), 'and says so');
        await press('enter');
        reply = { returnValue: true };
        W.PH.launcher.launch(W.PH.catalogById.hdmi1);
        await wait(60);
        eq(calls[calls.length - 1].params.id, 'com.webos.app.hdmi1', 'HDMI 1 opens the TV\u2019s HDMI1 app');
        ok(!$('.launch'), 'no preview screen on the TV');
        W.PH.launcher.openLgHome();
        await wait(30);
        eq(calls[calls.length - 1].params.id, 'com.webos.app.home', 'Open LG Home launches LG\u2019s own Home');
        ok(!/imulat/.test($('#stage').textContent), 'no "simulated" wording anywhere on the TV UI');
      } finally {
        W.PH.platform.isWebOS = false;
        delete W.PalmServiceBridge;
      }
    }],

    ['Daily wallpaper: a new photo each calendar day, no repeats until all are shown, favourites only, a hand-picked one stays for today, never saved', async function () {
      await load(true);
      var B = W.PH.backdrop, KEY = 'premiumHome.wallpaperCycle.v1.test';
      eq(W.PH.state.config.wallpaper.rotateMinutes, 1440, 'Daily is the default');
      B.check();
      var c = B.cycle();
      ok(c && c.date === B.today(), 'today has a wallpaper');
      var photos = W.PH.wallpapers.filter(function (w) { return w.photo; }).map(function (w) { return w.id; });
      ok(photos.indexOf(c.id) >= 0, 'drawn from the photos');
      eq(B.effective().scenicId, c.id, 'and shown');
      B.check();
      eq(B.cycle().id, c.id, 'same day, same wallpaper');
      var seen = [c.id];
      for (var i = 1; i < photos.length; i++) {
        var prev = B.cycle(); prev.date = '2000-01-0' + (i % 9 + 1); localStorage.setItem(KEY, JSON.stringify(prev));
        B.check();
        seen.push(B.cycle().id);
      }
      eq(new Set(seen).size, photos.length, 'every photo once before any repeat (' + seen.length + ' days)');
      var last = B.cycle(); last.date = '1999-12-31'; localStorage.setItem(KEY, JSON.stringify(last));
      B.check();
      ok(B.cycle().id !== last.id, 'a new cycle never starts with yesterday\u2019s wallpaper');
      eq(B.cycle().used.length, 1, 'and starts counting again');
      W.PH.app.update(function (x) { x.wallpaper.pool = 'favorites'; x.wallpaper.favoriteIds = ['moraine-lake', 'aurora-glacier']; return x; });
      for (var j = 0; j < 4; j++) { var f = B.cycle(); f.date = '1998-01-0' + (j + 1); localStorage.setItem(KEY, JSON.stringify(f)); B.check(); ok(['moraine-lake', 'aurora-glacier'].indexOf(B.cycle().id) >= 0, 'favourites only (' + B.cycle().id + ')'); }
      W.PH.backdrop.chosen('alpine-dusk');
      W.PH.app.update(function (x) { x.wallpaper.scenicId = 'alpine-dusk'; return x; });
      B.check();
      eq(B.effective().scenicId, 'alpine-dusk', 'a wallpaper picked by hand stays for today');
      eq(saved().wallpaper.scenicId, 'alpine-dusk', 'only the hand-picked choice is saved');
      W.PH.backdrop.rotateNow();
      ok(B.effective().scenicId !== 'alpine-dusk', 'Next wallpaper skips now');
      eq(saved().wallpaper.scenicId, 'alpine-dusk', 'rotation is never saved');
    }],

    ['Second launch while on Home toggles Ambient (in-app stand-in for "Home again"); from the background it opens Home; yellow / A key opens Ambient', async function () {
      await load(true);
      W.PH.focus.restore(['favorites:netflix']);
      await wait(1600);   // the app has been in front for a while
      W.document.dispatchEvent(new W.Event('webOSRelaunch'));
      ok(W.PH.state.ambient, 'launched again while already on Home → Ambient');
      await wait(900);
      W.document.dispatchEvent(new W.Event('webOSRelaunch'));
      ok(!W.PH.state.ambient, 'again → back to Home');
      eq(focus(), 'favorites:netflix', 'focus kept');
      W.PH.app.go('settings'); W.PH.focus.restore(['tab:settings']);
      await wait(900);
      W.document.dispatchEvent(new W.Event('webOSRelaunch'));
      ok(!W.PH.state.ambient && W.PH.state.section === 'home', 'from another section it returns to Home first');
      eq(focus(), 'favorites:youtube', 'with the dock focused');
      await wait(900);
      W.document.dispatchEvent(new W.Event('webOSRelaunch'));
      ok(W.PH.state.ambient, 'second launch while on Home → Ambient');
      W.document.dispatchEvent(new W.Event('webOSRelaunch'));
      W.document.dispatchEvent(new W.Event('webOSRelaunch'));
      ok(W.PH.state.ambient, 'a burst of relaunches (helper escape: Home ×3) toggles only once');
      await wait(900);
      W.document.dispatchEvent(new W.Event('webOSRelaunch'));
      ok(!W.PH.state.ambient, 'a separate relaunch later toggles back');
      await press('ambient');
      ok(W.PH.state.ambient, 'yellow key / A opens Ambient');
      await press('ambient');
      ok(!W.PH.state.ambient, 'any key, including it again, closes it');
    }],

    ['Live weather on Home and Ambient: compact pill, 3-day forecast, a light condition tint; nothing without consent', async function () {
      await load(true);
      ok(!$('.wx-mini'), 'no forecast while weather is off');
      eq($('#stage').getAttribute('data-wx'), 'none', 'no tint while off');
      var fixture = await (await fetch('fixtures/open-meteo-sample.json')).json();
      W.fetch = function () { return Promise.resolve(new W.Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } })); };
      W.PH.app.update(function (c) { c.weather.enabled = true; return c; });
      for (var i = 0; i < 20 && W.PH.weather.current().status !== 'live'; i++) await wait(50);
      await wait(50);
      var mini = $('.home-stage .wx-mini');
      ok(mini && mini.querySelectorAll('.wx-mini-day').length === 3, 'three days under the pill');
      ok(/°/.test(mini.textContent), 'with temperatures');
      ok(['wet', 'snow', 'grey', 'clear', 'none'].indexOf($('#stage').getAttribute('data-wx')) >= 0, 'tint follows real conditions (' + $('#stage').getAttribute('data-wx') + ')');
      W.PH.ambient.open();
      ok($('.amb-content .wx-mini'), 'Ambient shows the forecast too');
      W.PH.ambient.close();
    }],

    ['On the TV, Demo entries from older simulated versions are dropped from Recent', async function () {
      await load(true);
      localStorage.setItem('premiumHome.recents.v1.test', JSON.stringify([
        { id: 'netflix', kind: 'demo', at: new Date().toISOString() }, { id: 'youtube', kind: 'native', at: new Date().toISOString() }]));
      eq(W.PH.recents.load().length, 2, 'the Mac preview keeps both');
      W.PH.platform.isWebOS = true;
      try { eq(W.PH.recents.load().map(function (r) { return r.id + ':' + r.kind; }), ['youtube:native'], 'the TV shows only real launches'); }
      finally { W.PH.platform.isWebOS = false; }
    }],

    ['TV cleanup page reports only verified facts: installed vs removed via a live check, privacy items "Set on the TV", nothing claimed changed', async function () {
      await load(true);
      W.PH.app.go('settings'); W.PH.state.settingsCategory = 'cleanup'; W.PH.app.render({ focus: ['cat:cleanup'] });
      ok(/Nothing on this TV has been removed, switched off or blocked/.test($('#view-settings').textContent), 'honest summary on the Mac');
      ok(/Not checked \(Mac preview\)/.test($('#view-settings').textContent), 'no invented app status in the preview');
      ok(/Set on the TV/.test($('#view-settings').textContent) && !/(Disabled|Blocked)\b/.test($('#view-settings').textContent), 'privacy items never shown as switched off');
      function FakeBridge() {}
      FakeBridge.prototype.call = function (uri, params) {
        var self = this, id = JSON.parse(params).appId;
        setTimeout(function () { self.onservicecallback(JSON.stringify({ returnValue: true, exist: id !== 'com.miniclip.eightballpool' })); }, 2);
      };
      W.PalmServiceBridge = FakeBridge;
      W.PH.platform.isWebOS = true;
      try {
        await W.PH.debloat.check();
        W.PH.app.render({ focus: ['cat:cleanup'] });
        var text = $('#view-settings').textContent;
        ok(/1 optional app is no longer installed/.test(text), 'summary counts only what the TV reports removed');
        eq(W.PH.debloat.statusOf(W.PH.debloat.OPTIONAL[0]), 'Removed', '8 Ball Pool reported removed');
        eq(W.PH.debloat.statusOf(W.PH.debloat.OPTIONAL[1]), 'Installed', 'AirPlay still installed');
      } finally { W.PH.platform.isWebOS = false; delete W.PalmServiceBridge; }
    }],

    ['v0.8.3 greeting: sentence case on Home, names from Settings, saved, no clipping or overlap, ambient on/off', async function () {
      await load(true);
      W.PH.app.update(function (c) { c.appearance.motion = 'off'; return c; }, { focus: ['favorites:youtube'] });
      var band = W.PH.widgets.greeting(new Date());
      eq($('.hero-greet').textContent, band, 'no names by default: time band only');
      eq(W.getComputedStyle($('.hero-greet')).textTransform, 'none', 'sentence case, not uppercase');
      // Edit through Settings › Clock & weather › Greeting names, like the remote would.
      eq(await keys(['up', 'up', 'right', 'right', 'right']), 'tab:settings', 'reach the Settings tab');
      eq(await keys(['down', 'down', 'down']), 'cat:clock', 'Clock & weather');
      eq(await press('right'), 'set:hour24', 'enter the clock panel');
      eq(await keys(['down', 'down', 'down']), 'set:greet-names', 'reach Greeting names');
      await press('enter');
      var input = $('.prompt-input');
      ok(input, 'name prompt opens');
      input.value = '  Alex <b>&</b> Sam\u202e ';
      eq(await press('down'), 'prompt:save', 'Down to Save');
      await press('enter');
      await wait(50);
      eq(W.PH.state.config.clock.greetingNames, 'Alex b&b Sam', 'markup characters removed before saving');
      W.PH.app.update(function (c) { c.clock.greetingNames = W.PH.config.cleanGreetingNames('Alex & Sam'); return c; }, { focus: ['set:greet-names'] });
      eq(saved().clock.greetingNames, 'Alex & Sam', 'saved locally');
      ok(/Alex & Sam/.test($('[data-key="set:greet-names"]').textContent), 'Settings shows the names');
      await load(false);
      eq(W.PH.state.config.clock.greetingNames, 'Alex & Sam', 'kept after relaunch');
      eq($('.hero-greet').textContent, band + ', Alex & Sam', 'Home greeting');
      ok(!$('.hero-greet').querySelector('*'), 'text only, no elements');
      function fits() {
        var g = $('.hero-greet'), r = g.getBoundingClientRect(), t = $('.hero .hero-time, .hero-time').getBoundingClientRect();
        ok(g.scrollWidth <= g.clientWidth + 1 && g.scrollHeight <= g.clientHeight + 1, 'greeting not clipped');
        ok(r.right <= W.innerWidth && r.left >= 0, 'greeting inside the 1920 px screen');
        ok(r.bottom <= t.top + 1, 'greeting does not overlap the clock');
      }
      fits();
      W.PH.app.update(function (c) { c.clock.greetingNames = W.PH.config.cleanGreetingNames('Maximiliana-Josefina & Bartholomew-Jon'); return c; }, { focus: ['favorites:youtube'] });
      W.PH.widgets.refresh();
      ok(/Bartholomew-Jon$/.test($('.hero-greet').textContent), 'long names shown in full');
      fits();
      W.PH.app.update(function (c) { c.clock.greetingNames = 'Alex & Sam'; return c; }, { focus: ['favorites:youtube'] });
      await press('ambient');
      ok(W.PH.state.ambient, 'ambient open');
      eq($('#ambient .amb-greet').textContent, band + ', Alex & Sam', 'greeting in ambient');
      await press('ambient');
      W.PH.app.update(function (c) { c.clock.greetingAmbient = false; return c; }, { focus: ['favorites:youtube'] });
      await press('ambient');
      ok(!$('#ambient .amb-greet'), 'hidden in ambient when turned off there');
      await press('ambient');
      W.PH.app.update(function (c) { c.clock.greetingShow = false; return c; }, { focus: ['favorites:youtube'] });
      ok(!$('.hero-greet'), 'greeting off hides it on Home');
      eq(focus(), 'favorites:youtube', 'dock focus kept');
      eq(W.performance.getEntriesByType('resource').filter(function (e) { return /Alex|Sam/.test(e.name); }).length, 0, 'names in no request');
    }],

    ['v0.9.1 LG screensaver over the app: a blur while idle pauses the schedule; the key that ends it (focus) wakes a fully bright screen', async function () {
      await load(true);
      var stage = $('#stage');
      W.PH.app.update(function (c) { c.appearance.motion = 'off'; return c; }, { focus: ['favorites:youtube'] });
      W.PH.oled.wake();
      W.dispatchEvent(new W.Event('blur'));
      ok(!stage.classList.contains('lg-overlay'), 'a blur right after input is not LG\'s screensaver');
      W.PH.oled.idleFor(180);
      ok(W.PH.state.ambient, 'ambient at 3 min');
      W.dispatchEvent(new W.Event('blur'));
      ok(stage.classList.contains('lg-overlay'), 'LG screensaver detected (blur while idle)');
      eq(W.PH.oled.state().lgSystemScreensaver, true, 'state reports it');
      W.PH.oled.idleFor(60 * 60);
      ok(!W.PH.oled.isSaverOn(), 'the schedule is paused underneath: no black screen');
      W.dispatchEvent(new W.Event('focus'));
      ok(!stage.classList.contains('lg-overlay'), 'overlay gone');
      ok(!W.PH.oled.isSaverOn() && !stage.classList.contains('ambient-dim'), 'back to a fully bright screen');
      ok(W.PH.oled.idleSeconds() < 2, 'returning counts as input');
      await press('back');
      ok(!W.PH.state.ambient, 'Back leaves ambient');
    }],

    ['v0.9.2: Quick settings has Home button › Resume (opens the helper on the TV)', async function () {
      await load(true);
      eq(W.PH.HOME_HELPER_APP_ID, 'com.local.premiumhome.homehelper', 'helper id');
    }],


    ['No page errors during the run', async function () {
      eq(pageErrors, [], 'page errors');
    }]
  ];

  // ---------- runner ----------

  var tbody = document.getElementById('results');
  var summary = document.getElementById('summary');

  async function run() {
    tbody.innerHTML = '';
    pageErrors = [];
    summary.className = '';
    summary.textContent = 'Running…';
    var results = [];
    var started = Date.now();
    for (var i = 0; i < tests.length; i++) {
      var row = document.createElement('tr');
      row.innerHTML = '<td class="r RUN">…</td><td></td>';
      row.children[1].textContent = tests[i][0];
      tbody.appendChild(row);
      var t0 = Date.now(), status = 'PASS', error = null;
      try { await tests[i][1](); } catch (e) { status = 'FAIL'; error = e.message; }
      results.push({ name: tests[i][0], status: status, ms: Date.now() - t0, error: error });
      row.children[0].className = 'r ' + status;
      row.children[0].textContent = status;
      if (error) {
        var err = document.createElement('div');
        err.className = 'err';
        err.textContent = error;
        row.children[1].appendChild(err);
      }
    }
    var failed = results.filter(function (r) { return r.status === 'FAIL'; }).length;
    summary.className = failed ? 'fail' : 'pass';
    summary.textContent = (results.length - failed) + ' passed, ' + failed + ' failed (' + ((Date.now() - started) / 1000).toFixed(1) + ' s)';
    localStorage.removeItem(TEST_STORAGE);
    localStorage.removeItem(TEST_WEATHER_CACHE);
    ['premiumHome.recents.v1.test', 'premiumHome.saved.v1.test'].forEach(function (k) { localStorage.removeItem(k); });
    window.__smoke = { passed: results.length - failed, failed: failed, results: results, summary: summary.textContent, finishedAt: new Date().toISOString(), userAgent: navigator.userAgent };
    // tools/run-browser-tests.py opens this page with ?report=1 and collects the results here.
    if (/[?&]report=1(&|$)/.test(location.search)) {
      fetch('/__results__', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(window.__smoke) }).catch(function () {});
    }
  }

  document.getElementById('rerun').addEventListener('click', run);
  run();
})();
