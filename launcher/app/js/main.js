/* App state, rendering, and remote/keyboard/pointer input. */
(function (PH) {
  'use strict';

  var LONG_PRESS_MS = 550;
  var REPEAT_MS = 110;   // held arrow keys: at most one move per 110 ms, so focus never overshoots
  var WHEEL_MS = 140;
  var stage;
  var pressTimer = null;
  var lastRepeat = 0, lastWheel = 0;
  var shownSince = Date.now();   // when the app last came to the front (see webOSRelaunch)
  var lastRelaunch = 0;

  // webOS passes launch parameters as JSON in PalmSystem.launchParams.
  function launchParam() {
    try { var p = JSON.parse((window.PalmSystem && window.PalmSystem.launchParams) || '{}'); return p && p.premiumHome; } catch (e) { return null; }
  }

  PH.state = {
    config: null,
    section: 'home',
    editMode: false,
    showHidden: false,
    move: null,      // { listId, id, field, original } while rearranging
    overlay: null,   // { close } while the preview launch screen is up (Mac only)
    ambient: false,  // full-screen time/weather view (Up from the Home tab bar, Quick settings, or auto)
    settingsCategory: 'appearance',
    lastSaved: null,
    scale: 1
  };

  PH.app = {
    render: function (opts) {
      var keep = PH.focus.currentKey();
      applyAppearance();
      PH.views.renderAll();
      PH.backdrop.update();
      PH.scene.update();
      PH.ambient.render();
      PH.widgets.refresh();
      PH.focus.restore(((opts && opts.focus) || []).concat(keep ? [keep] : []));
      PH.focus.refreshEdges();
      PH.ui.updateHints();
    },
    // mutator receives a copy of the config and returns the next config. The result is saved.
    update: function (mutator, opts) {
      var before = JSON.stringify(PH.state.config.weather);
      PH.state.config = mutator(PH.clone(PH.state.config)) || PH.state.config;
      PH.state.lastSaved = PH.config.save(PH.state.config) ? new Date() : 'memory';
      PH.app.render(opts);
      if (JSON.stringify(PH.state.config.weather) !== before) PH.weather.sync();
    },
    // Day/night can change on the minute without anything else changing (widgets.js calls this).
    refreshTheme: function () {
      var part = PH.daypart.current();
      if (stage.getAttribute('data-daypart') === part) return;
      stage.setAttribute('data-daypart', part);
      PH.backdrop.update();
      PH.scene.update();
    },
    // Switching sections only swaps the visible view (rebuilt if out of date); a full render()
    // here made every tab change on the C4 wait for all four sections to be rebuilt.
    go: function (section) {
      if (PH.state.section === section) return;
      if (section !== 'apps' && PH.state.editMode) { PH.state.editMode = false; PH.views.invalidate(); }
      PH.state.section = section;
      stage.setAttribute('data-section', section);
      PH.views.show(section);
      PH.widgets.refresh();
      PH.focus.refreshEdges();
      PH.ui.updateHints();
    }
  };

  function applyAppearance() {
    var a = PH.state.config.appearance;
    stage.setAttribute('data-accent', a.accent);
    stage.setAttribute('data-glass', a.glass ? 'on' : 'off');
    stage.setAttribute('data-motion', a.motion);
    stage.setAttribute('data-bg', PH.backdrop.effective().background);
    stage.setAttribute('data-daypart', PH.daypart.current());
    stage.setAttribute('data-ambient-dim', PH.state.config.ambientMode.ambientDim);
    stage.setAttribute('data-wx', a.effects ? PH.weatherUI.tint() : 'none');
    stage.setAttribute('data-section', PH.state.section);
    stage.classList.toggle('is-ambient', !!PH.state.ambient);
    document.getElementById('safe-guides').hidden = !a.safeAreaGuides;
    if (!PH.state.config.oledCare.pixelShift) PH.oled.resetShift();
  }

  // The layout is a fixed 1920x1080 canvas; scale it to whatever window it is in.
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    PH.state.scale = s;
    stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

  // opts.wheel: from the scroll wheel, which never opens the ambient view.
  function handle(k, opts) {
    var s = PH.state;
    if (s.overlay) { if (k === 'enter' || k === 'back' || k === 'options') s.overlay.close(); return; }
    if (s.move) { if (k !== 'quick') { PH.views.moveKey(k === 'options' ? 'enter' : k); PH.ui.updateHints(); } return; }
    // Any key leaves the ambient view and returns focus to where it was.
    if (s.ambient) { PH.ambient.close(); return; }
    if (k === 'ambient') {          // yellow key (A in the preview): ambient view from anywhere
      if (PH.ui.dialogOpen()) return;
      if (s.section !== 'home') PH.app.go('home');
      PH.ambient.open({ returnKey: PH.focus.currentKey() || 'tab:home' });
      return;
    }
    if (k === 'quick') {
      if (PH.quick.isOpen()) PH.ui.closeTopDialog();
      else if (!PH.ui.dialogOpen()) PH.quick.open();
      return;
    }
    if (k === 'back') { back(); return; }
    var el = PH.focus.current();
    // One more Up from the tab bar on Home opens the ambient view.
    if (k === 'up' && !(opts && opts.wheel) && s.section === 'home' && s.config.appearance.ambient && !PH.ui.dialogOpen() &&
        el && el.getAttribute('data-group') === 'tabs') { PH.ambient.open({ returnKey: 'tab:home' }); return; }
    if (k === 'enter') { if (el && el._activate) el._activate(); return; }
    if (k === 'options') {
      if (el && el._options) el._options();
      else if (el && el._activate) el._activate();
      return;
    }
    PH.focus.move(k);
  }

  // Back: close dialog > leave edit mode > go to the tab bar > go Home > offer to exit.
  function back() {
    if (PH.ui.closeTopDialog()) return;
    var s = PH.state;
    if (s.editMode) { s.editMode = false; PH.app.render(); return; }
    var el = PH.focus.current();
    if (!el || el.getAttribute('data-group') !== 'tabs') { PH.focus.restore(['tab:' + s.section]); return; }
    if (s.section !== 'home') { PH.focus.restore(['tab:home']); return; }
    PH.ui.confirm({ title: 'Exit Premium Home?', message: 'You will return to the TV\'s own home screen.', confirmLabel: 'Exit', danger: false })
      .then(function (ok) { if (ok) PH.platform.exit(); });
  }

  // OK acts on release so that holding it (long press) can open Options instead.
  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing(e)) return;
    var k = PH.platform.key(e);
    if (!k) return; // keys we don't map (Home, volume, power, Settings…) stay with webOS
    stage.classList.remove('pointer-mode');
    e.preventDefault();
    if (PH.oled.wake()) return;
    if (k === 'enter') {
      if (e.repeat || pressTimer) return;
      pressTimer = setTimeout(function () { pressTimer = null; handle('options'); }, LONG_PRESS_MS);
      return;
    }
    if (e.repeat) {
      if (Date.now() - lastRepeat < REPEAT_MS) return;
      lastRepeat = Date.now();
    }
    handle(k);
  }

  // While a text field has the keyboard: letters, Backspace and caret arrows edit the text.
  // OK or Down closes the keyboard and moves to Save; Up moves above; Back just closes the keyboard.
  function typing(e) {
    var a = document.activeElement;
    if (!a || a.tagName !== 'INPUT' || a.type === 'file') return false;
    PH.oled.wake();
    var c = e.keyCode;
    if (c === 13 || c === 40 || c === 38 || c === 461 || c === 27) {
      e.preventDefault();
      a.blur();
      var save = document.querySelector('[data-key="prompt:save"]');
      if (c === 13 || c === 40) { if (save) PH.focus.set(save); else PH.focus.move('down'); }
      else if (c === 38) PH.focus.move('up');
    }
    return true;
  }

  function onKeyUp(e) {
    if (PH.platform.key(e) !== 'enter' || !pressTimer || typingNow()) return;
    clearTimeout(pressTimer);
    pressTimer = null;
    handle('enter');
  }

  function typingNow() { var a = document.activeElement; return !!(a && a.tagName === 'INPUT' && a.type !== 'file'); }

  // Magic Remote wheel: moves through the focused row (or list); at a row's end it continues to
  // the next row. Throttled so one notch is one step.
  function onWheel(e) {
    e.preventDefault();
    if (Date.now() - lastWheel < WHEEL_MS || !e.deltaY && !e.deltaX) return;
    lastWheel = Date.now();
    if (PH.oled.wake()) return;
    var el = PH.focus.current();
    var c = el && el.closest('[data-scroll]');
    var forward = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0;
    var horizontal = c && c.getAttribute('data-scroll') === 'x';
    var before = PH.focus.currentKey();
    handle(horizontal ? (forward ? 'right' : 'left') : (forward ? 'down' : 'up'), { wheel: true });
    if (horizontal && PH.focus.currentKey() === before && !PH.state.ambient) handle(forward ? 'down' : 'up', { wheel: true });
  }

  // Pointer support mirrors the Magic Remote cursor: hover focuses, click activates.
  function bindPointer() {
    stage.addEventListener('wheel', onWheel, { passive: false });
    // webOS reports when the Magic Remote cursor appears or hides (LG Magic Remote guide).
    document.addEventListener('cursorStateChange', function (e) {
      stage.classList.toggle('pointer-mode', !!(e.detail && e.detail.visibility));
    });
    stage.addEventListener('mousemove', function (e) {
      var swallowed = PH.oled.pointerMoved(e.clientX, e.clientY);
      if (!swallowed && PH.oled.idleSeconds() < 0.05) stage.classList.add('pointer-mode');
      if (swallowed || PH.state.move || PH.state.ambient) return;
      var el = e.target.closest('[data-key]');
      if (el && el !== PH.focus.current() && PH.focus.isFocusable(el)) PH.focus.set(el);
    });
    stage.addEventListener('click', function (e) {
      if (PH.oled.wake()) return;
      if (PH.state.move) return;
      if (PH.state.ambient) { PH.ambient.close(); return; }
      if (e.target._backdrop) { PH.ui.closeTopDialog(); return; }
      var el = e.target.closest('[data-key]');
      if (!el || !PH.focus.isFocusable(el)) return;
      PH.focus.set(el);
      if (el._activate) el._activate();
    });
    stage.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var el = e.target.closest('[data-key]');
      if (el && PH.focus.isFocusable(el) && el._options) { PH.focus.set(el); el._options(); }
    });
  }

  function init() {
    stage = document.getElementById('stage');
    var loaded = PH.config.load();
    PH.state.config = loaded.config;
    PH.focus.init(stage);

    PH.on('focus', function (el) {
      // Home keeps the tab bar out of the way until focus reaches it (Up from the clock area).
      stage.classList.toggle('nav-shown', el.getAttribute('data-group') === 'tabs');
      var tab = el.getAttribute('data-tab');
      if (tab) PH.app.go(tab);
      PH.ui.updateHints();
    });

    // ?section=apps|gaming|settings opens that section (used for screenshots and testing).
    var start = (/[?&]section=(home|apps|gaming|settings)(&|$)/.exec(location.search) || [])[1];
    if (start) PH.state.section = start;

    fit();
    window.addEventListener('resize', function () { fit(); });
    PH.backdrop.check();   // today's daily wallpaper is chosen before the first frame: one image decode
    PH.app.render({ focus: start && start !== 'home' ? [] : ['favorites:' + (loaded.config.favorites[0] || ''), 'tab:home'] });
    PH.widgets.start();
    PH.oled.start(stage);
    PH.backdrop.start();

    // Weather: re-render when its state changes. ?weatherDemo=<scene> previews a labelled demo.
    PH.on('weather', function () { PH.app.render(); });
    var demo = (/[?&]weatherDemo=([a-z-]+)/.exec(location.search) || [])[1];
    if (demo) PH.weather.setDemo(demo);
    // Screenshot aid, test mode only (separate storage): ?test=1&background=cinematic
    var bg = (/[?&]background=(dynamic|cinematic|scenic|minimal)(&|$)/.exec(location.search) || [])[1];
    var wp = (/[?&]wallpaper=([a-z-]+)(&|$)/.exec(location.search) || [])[1];
    if (bg && PH.config.TEST_MODE) {
      PH.state.config.appearance.background = bg;
      if (wp && PH.wallpaperById[wp]) { PH.state.config.wallpaper.scenicId = wp; PH.state.config.wallpaper.rotateMinutes = 0; }
      PH.backdrop.check();
      PH.app.render();
    }
    var theme = (/[?&]theme=(day|night)(&|$)/.exec(location.search) || [])[1];
    if (theme && PH.config.TEST_MODE) { PH.state.config.theme.themeMode = theme; PH.app.render(); }
    if (PH.config.TEST_MODE && /[?&]view=ambient(&|$)/.test(location.search)) PH.ambient.open();
    // More screenshot aids, test mode only: &seedRecent=1 &cat=<settings category> &focus=<data-key> &open=gallery|quick
    if (PH.config.TEST_MODE) {
      var q = function (name) { return (new RegExp('[?&]' + name + '=([a-z0-9:+-]+)(&|$)').exec(location.search) || [])[1]; };
      if (q('motion')) { PH.state.config.appearance.motion = q('motion'); PH.app.render(); }
      if (q('seedRecent')) { PH.recents.add('youtube', 'demo'); PH.recents.add('netflix', 'demo'); PH.recents.add('hdmi1', 'demo'); }
      if (q('cat')) PH.state.settingsCategory = q('cat');
      if (q('seedRecent') || q('cat')) PH.app.render();
      if (q('focus')) PH.focus.restore([decodeURIComponent(q('focus'))]);
      if (q('open') === 'gallery') PH.gallery.open();
      if (q('open') === 'quick') PH.quick.open();
    }
    if (PH.config.TEST_MODE && /[?&]idle=(\d+)/.test(location.search)) PH.oled.idleFor(Number(/[?&]idle=(\d+)/.exec(location.search)[1]));
    PH.weather.start();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    bindPointer();
    // Hidden (another app in front, or the TV's own screensaver): stop every animation.
    document.addEventListener('visibilitychange', function () {
      stage.classList.toggle('doc-hidden', document.hidden);
      if (!document.hidden) {
        shownSince = Date.now();
        PH.widgets.refresh(); PH.oled.wake(); PH.app.refreshTheme();
        // Back from an app opened here: show it under Recent (Home is rebuilt only if it is showing).
        if (PH.state.section === 'home' && !PH.ui.dialogOpen() && !PH.state.move) PH.app.render();
      }
    });
    // webOS relaunch (e.g. the app is opened again from LG Home or a launcher shortcut while it is
    // already running): come back to a clean Home with focus on the dock.
    document.addEventListener('webOSRelaunch', function () {
      // Launched again while already in front on Home (the Quick Access key pressed twice, the app
      // tile chosen again, or a future approved Home-button helper): toggle the ambient view. This is
      // the in-app version of "press Home again for Ambient"; the physical Home key is not ours.
      // A burst of relaunches (e.g. a helper's "press Home three times" escape, < 0.8 s apart)
      // toggles at most once, and a launch marked as a boot/tile start (launch parameter
      // {"premiumHome":"start"}) never toggles: see HOME-BUTTON-INTEGRATION-PLAN.md.
      var now = Date.now(), burst = now - lastRelaunch < 800;
      lastRelaunch = now;
      if (burst) return;
      // v0.9.4: Home pressed while LG's own screensaver covers the app. The helper's launch reaches
      // us, but no key reaches the TV, so the screensaver stays. Ask webOS to bring our window to the
      // front instead of toggling Ambient underneath it; whatever happens, the next key wakes us.
      if (PH.oled.state().lgSystemScreensaver === true) {
        var sys = window.webOSSystem || window.PalmSystem;
        try { if (sys && typeof sys.activate === 'function') sys.activate(); } catch (e) { /* not fatal */ }
        PH.oled.wake();
        return;
      }
      var alreadyHere = !document.hidden && now - shownSince > 1500 && launchParam() !== 'start';
      if (alreadyHere && PH.state.section === 'home' && !PH.ui.dialogOpen() && !PH.state.move && !PH.state.overlay) {
        if (PH.state.ambient) PH.ambient.close(); else PH.ambient.open({ returnKey: PH.focus.currentKey() });
        return;
      }
      if (PH.state.ambient) PH.ambient.close();
      while (PH.ui.closeTopDialog()) { /* close every dialog */ }
      if (PH.state.overlay) PH.state.overlay.close();
      PH.app.go('home');
      PH.focus.restore(['favorites:' + (PH.state.config.favorites[0] || ''), 'tab:home']);
    });

    loaded.warnings.forEach(function (w) { PH.ui.toast(w); });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.PH = window.PH || {});
