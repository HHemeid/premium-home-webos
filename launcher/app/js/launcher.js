/*
 * App launching (v0.7).
 *
 * On the TV, streaming apps open for real through LG's documented Application Manager service
 * (luna://com.webos.applicationManager/launch), called through the web runtime's service
 * bridge. Only app IDs in PH.VERIFIED_APP_IDS (catalog.js) are launched: each was confirmed
 * installed with getAppLoadStatus AND launched into the foreground on the owner's C4.
 *
 * What each tile does (kindOf):
 *   'native'    on the TV, an app or input whose webOS ID is verified on this C4: opens it
 *               (streaming apps, HDMI 1-4, Live TV, Web Browser; v0.8).
 *   'not-found' on the TV, an app whose webOS ID isn't verified (e.g. Apple TV, Plex): explains
 *               that, opens nothing, and never pretends.
 *   'preview'   the Mac browser preview: a labelled preview screen, nothing is opened.
 * Nothing on the TV is simulated any more.
 */
(function (PH) {
  'use strict';

  var h = PH.h;
  var TIMEOUT_MS = 6000;

  // Minimal Luna call through PalmServiceBridge (what LG's webOSTV.js uses underneath).
  function luna(uri, params) {
    return new Promise(function (resolve, reject) {
      if (typeof window.PalmServiceBridge === 'undefined') { reject({ errorText: 'service bridge unavailable' }); return; }
      var bridge = new window.PalmServiceBridge();
      var timer = setTimeout(function () { reject({ errorText: 'no reply', errorCode: 'timeout' }); }, TIMEOUT_MS);
      bridge.onservicecallback = function (msg) {
        clearTimeout(timer);
        var r;
        try { r = JSON.parse(msg); } catch (e) { reject({ errorText: 'bad reply' }); return; }
        if (r.returnValue === false) reject(r); else resolve(r);
      };
      bridge.call(uri, JSON.stringify(params || {}));
      luna.inFlight.push(bridge);   // keep a reference until the reply arrives
      if (luna.inFlight.length > 8) luna.inFlight.shift();
    });
  }
  luna.inFlight = [];

  function kindOf(app) {
    if (!PH.platform.isWebOS) return 'preview';
    return app.appId && PH.VERIFIED_APP_IDS.indexOf(app.appId) >= 0 ? 'native' : 'not-found';
  }

  // Short status for menus: null when the tile really opens the app.
  function subLabel(app) {
    return { native: null, 'not-found': 'not found on this TV', preview: 'preview' }[kindOf(app)];
  }

  // Recent records a native launch only after the TV accepted the request ("Opened" means the
  // TV switched to it; it doesn't claim anything played).
  function notice(title, message) {
    PH.ui.menu({ title: title, message: message, items: [{ label: 'OK', onSelect: function () {} }] });
  }

  function nativeLaunch(app) {
    var started = Date.now();
    luna('luna://com.webos.applicationManager/launch', { id: app.appId }).then(function () {
      PH.recents.add(app.id, 'native');
      PH.launcher.last = { id: app.id, ok: true, ms: Date.now() - started };
    }, function (err) {
      PH.launcher.last = { id: app.id, ok: false, error: err };
      var missing = err && (err.errorCode === -101 || /not exist/i.test(err.errorText || ''));
      notice('Couldn’t open ' + app.name, missing
        ? app.name + ' isn’t installed on this TV. Install it from LG’s Apps store, then try again.'
        : 'The TV didn’t open ' + app.name + ' (' + (err && (err.errorText || err.errorCode) || 'unknown error') + '). Try again, or open it from LG Home.');
    });
  }

  function notFound(app) {
    notice(app.name + ' isn’t linked yet', 'Premium Home couldn’t find ' + app.name + ' on this TV under any app ID it knows, so it won’t pretend to open it. ' +
      'If it is installed, open it from LG Home for now.');
  }

  function preview(app, label) {
    PH.recents.add(app.id, 'demo');
    var layer = document.getElementById('layer-launch');
    var idLine = app.appId ? 'webOS app ID: ' + app.appId : 'webOS app ID: not known yet';
    var note = app.category === 'input' ? 'Mac preview: on the TV this switches to the input.' : 'Mac preview: on the TV this opens the app.';
    var el = h('div', { class: 'launch', style: '--brand-rgb:' + PH.hexToRgb(app.color) }, [
      h('div', { class: 'launch-orb' }, app.mono),
      h('div', { class: 'launch-title' }, (app.category === 'input' ? 'Switching to ' : 'Opening ') + (label || app.name)),
      h('div', { class: 'launch-note' }, note),
      h('div', { class: 'launch-id' }, idLine),
      h('div', { class: 'launch-bar' }, h('i'))
    ]);
    layer.appendChild(el);

    var timer = setTimeout(close, 2600);
    function close() {
      clearTimeout(timer);
      if (PH.state.overlay === overlay) PH.state.overlay = null;
      el.classList.add('is-leaving');
      if (PH.state.config.recents.rememberRecents) PH.app.render(); // shows it under Recent
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
      PH.ui.updateHints();
    }
    var overlay = { close: close };
    el.addEventListener('click', close);
    PH.state.overlay = overlay;
    PH.ui.updateHints();
  }

  // LG's own Home: always a way back, whatever Premium Home is doing.
  function openLgHome() {
    if (!PH.platform.isWebOS) { PH.ui.toast('Mac preview: on the TV this opens LG Home'); return; }
    luna('luna://com.webos.applicationManager/launch', { id: PH.LG_HOME_APP_ID }).catch(function () {
      notice('Couldn\u2019t open LG Home', 'Press the Home button on your remote.');
    });
  }

  // One of the TV's own apps by ID (e.g. LG Settings): opens it, or explains why it couldn't.
  function openSystemApp(appId, name) {
    if (!PH.platform.isWebOS) { PH.ui.toast('Mac preview: on the TV this opens ' + name); return; }
    luna('luna://com.webos.applicationManager/launch', { id: appId }).catch(function (err) {
      notice('Couldn\u2019t open ' + name, 'The TV didn\u2019t open it (' + ((err && (err.errorText || err.errorCode)) || 'unknown error') + '). Use the remote\u2019s Settings button.');
    });
  }

  PH.luna = luna;
  PH.launcher = {
    last: null,
    kindOf: kindOf,
    subLabel: subLabel,
    // 'native' on the TV (streaming apps open for real), 'preview' in the Mac browser.
    mode: function () { return PH.platform.isWebOS ? 'native' : 'preview'; },
    openLgHome: openLgHome,
    openSystemApp: openSystemApp,
    launch: function (app, opts) {
      var kind = kindOf(app);
      if (kind === 'native') nativeLaunch(app);
      else if (kind === 'not-found') notFound(app);
      else preview(app, opts && opts.label);
    }
  };
})(window.PH = window.PH || {});
