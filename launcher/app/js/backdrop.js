/*
 * Full-screen wallpaper layer (#wallpaper): bundled scenic art or the owner's photo.
 * The animated weather / aurora scene lives in scene.js; Minimal shows neither.
 *
 * - Preview: the gallery shows a choice here before it is applied; Back restores the saved one.
 * - Rotation:
 *   - Daily (default, rotateMinutes 1440): a new wallpaper on each local calendar day, checked at
 *     start, when the app comes back to the front, and every minute. Every wallpaper in the pool
 *     (photos, all, or favourites) is shown once before any repeats; a file that fails to load is
 *     skipped. The cycle lives on this device only (CYCLE_KEY), never in the saved config.
 *   - Every N minutes: the next scenic wallpaper, preferring night scenes at night.
 *   Rotation never counts as input, so it never keeps the screensaver away, and it pauses while
 *   the screensaver is on or the app is hidden.
 * - Only the current image is loaded; the previous one is removed after the crossfade.
 */
(function (PH) {
  'use strict';

  var preview = null;    // { background, scenicId } while browsing the gallery
  var rotatedId = null;  // scenic id chosen by rotation (not saved)
  var ambientId = null;  // v0.9: photo shown while ambient is open, every N minutes (never saved)
  var lastRotate = Date.now();
  var shown = '';
  var warnedMissing = false;
  var broken = Object.create(null);   // wallpaper ids whose file failed to load this session
  var DAILY = 1440;
  var CYCLE_KEY = 'premiumHome.wallpaperCycle.v1' + (PH.config && PH.config.TEST_MODE ? '.test' : '');

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // The wallpapers daily rotation draws from. Favourites fall back to all photos if none are set.
  function pool() {
    var w = PH.state.config.wallpaper;
    var ids = w.pool === 'all' ? PH.wallpapers.map(function (x) { return x.id; })
      : w.pool === 'favorites' && w.favoriteIds.length ? w.favoriteIds.slice()
      : PH.wallpapers.filter(function (x) { return x.photo; }).map(function (x) { return x.id; });
    return ids.filter(function (id) { return PH.wallpaperById[id] && !broken[id]; });
  }

  function readCycle() {
    try {
      var c = JSON.parse(localStorage.getItem(CYCLE_KEY) || 'null');
      if (c && typeof c.date === 'string' && typeof c.id === 'string' && Array.isArray(c.used)) return c;
    } catch (e) { /* fall through */ }
    return null;
  }
  function writeCycle(c) { try { localStorage.setItem(CYCLE_KEY, JSON.stringify(c)); } catch (e) { /* memory only */ } }

  // Picks the wallpaper for today (or the next one when forced), never repeating within a cycle.
  function daily(force) {
    var ids = pool();
    if (!ids.length) return null;
    var c = readCycle(), day = today();
    // Today's wallpaper stays for the day, including one the owner picked by hand.
    if (c && c.date === day && !force && PH.wallpaperById[c.id] && !broken[c.id]) return c.id;
    var used = c ? c.used.filter(function (id) { return ids.indexOf(id) >= 0; }) : [];
    var left = ids.filter(function (id) { return used.indexOf(id) < 0; });
    if (!left.length) { used = []; left = ids.filter(function (id) { return !c || id !== c.id; }); if (!left.length) left = ids; }
    var id = left[Math.floor(Math.random() * left.length)];
    used.push(id);
    writeCycle({ date: day, id: id, used: used });
    return id;
  }

  function effective() {
    var c = PH.state.config;
    var bg = preview ? preview.background : c.appearance.background;
    var id = preview && preview.scenicId ? preview.scenicId : (PH.state.ambient && ambientId) || rotatedId || c.wallpaper.scenicId;
    return { background: bg, scenicId: PH.wallpaperById[id] ? id : PH.wallpapers[0].id };
  }

  function layerEl() { return document.getElementById('wallpaper'); }

  function show(sig, src) {
    var layer = layerEl();
    if (!layer || sig === shown) return;
    shown = sig;
    var old = Array.prototype.slice.call(layer.querySelectorAll('.wp-img'));
    var drop = function () { old.forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); }); };
    if (!src) { drop(); layer.hidden = true; return; }
    layer.hidden = false;
    var img = PH.h('img', { class: 'wp-img', alt: '', draggable: 'false', decoding: 'async' });
    img.onload = function () {
      img.classList.add('is-in');
      setTimeout(drop, PH.state.config.appearance.motion === 'full' ? 900 : 0);
    };
    img.onerror = function () {
      if (img.parentNode) img.parentNode.removeChild(img);
      shown = '';
      // A daily wallpaper that can't load is skipped for the rest of the session.
      var bad = /^scenic:(.+)$/.exec(sig);
      if (bad && rotatedId === bad[1]) { broken[bad[1]] = true; rotatedId = null; tick(); update(); }
    };
    img.src = src;
    layer.appendChild(img);
  }

  function update() {
    var layer = layerEl();
    if (!layer) return;
    var e = effective(), c = PH.state.config;
    var night = PH.daypart.current() === 'night';
    // Owner's dimming plus a little more at night; app.css dims further off Home.
    layer.style.setProperty('--wp-dim', String(Math.min(0.75, c.wallpaper.wallpaperDim / 100 + (night ? 0.12 : 0))));
    if (e.background === 'scenic') { show('scenic:' + e.scenicId, PH.wallpaperById[e.scenicId].file); return; }
    if (e.background !== 'photo') { show('', null); return; }
    PH.photo.url().then(function (url) {
      if (effective().background !== 'photo') return;
      if (url) { show('photo:' + url, url); return; }
      show('', null);
      if (!preview && !warnedMissing) {
        warnedMissing = true;
        PH.ui.toast('Your photo is not stored on this device. Choose it again in Wallpaper.');
      }
    });
  }

  function setPreview(p) {
    preview = p;
    document.getElementById('stage').setAttribute('data-bg', effective().background);
    update();
    PH.scene.update();
  }

  function nextScenic(fromId, night) {
    var list = PH.wallpapers, i = list.findIndex(function (w) { return w.id === fromId; });
    for (var step = 1; step <= list.length; step++) {
      var w = list[(i + step) % list.length];
      if (w.night === night) return w.id;
    }
    return list[(i + 1) % list.length].id;
  }

  // Checked every minute, when the app returns to the front, and by tests via rotateNow.
  function tick(force) {
    var c = PH.state.config, mins = c.wallpaper.rotateMinutes;
    if (!mins || c.appearance.background !== 'scenic') { rotatedId = null; lastRotate = Date.now(); return; }
    if (preview || document.hidden || PH.oled.isSaverOn()) return;
    if (mins === DAILY) {
      var id = daily(force);
      if (id && id !== rotatedId) { rotatedId = id; update(); }
      return;
    }
    if (!force && Date.now() - lastRotate < mins * 60000) return;
    lastRotate = Date.now();
    rotatedId = nextScenic(effective().scenicId, PH.daypart.current() === 'night');
    update();
  }

  // Ambient photo change (oled.js, every ambientMode.photoMinutes): the next photo in the same pool
  // as daily rotation (favourites only when chosen), shown for ambient only. It never replaces the
  // saved or daily wallpaper: Home gets that back when ambient closes.
  function ambientStep(step) {
    var c = PH.state.config;
    if (!step || !PH.state.ambient || preview || c.appearance.background !== 'scenic') return;
    var ids = pool();
    if (ids.length < 2) return;
    var i = ids.indexOf(effective().scenicId);
    ambientId = ids[(i + 1) % ids.length];
    update();
  }

  PH.backdrop = {
    effective: effective,
    ambientStep: ambientStep,
    ambientEnded: function () { if (ambientId) { ambientId = null; update(); } },
    update: update,
    setPreview: setPreview,
    nextScenic: nextScenic,
    // A new saved choice restarts rotation from it; with daily rotation it is today's wallpaper.
    chosen: function (id) {
      rotatedId = null; lastRotate = Date.now(); warnedMissing = false;
      if (id && PH.wallpaperById[id]) {
        var c = readCycle(), used = c ? c.used.filter(function (x) { return x !== id; }) : [];
        used.push(id);
        writeCycle({ date: today(), id: id, used: used });
      }
    },
    start: function () {
      setInterval(tick, 60000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
      tick();
    },
    rotateNow: function () { tick(true); },
    check: function () { tick(); },
    today: today,
    pool: pool,
    cycle: readCycle
  };
})(window.PH = window.PH || {});
