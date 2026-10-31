/*
 * Home hero scene: original CSS/SVG artwork, no image files or video.
 *
 * Scene keys: calm|clear|partly|overcast|fog|rain|snow|thunder + -day|-night (from weather.js),
 * or 'aurora' (Cinematic background). Without weather data, day/night follows the theme (daypart.js). Rebuilt only when the key or motion/effect settings change.
 * Bounded cost: at most 36 particles; everything animates with transform/opacity; the scene is
 * hidden off Home and paused while idle-dimmed or in the screensaver (see app.css).
 */
(function (PH) {
  'use strict';

  var MAX_PARTICLES = 36;
  var built = '';

  // Which layers each condition uses.
  var LAYERS = {
    calm: { clouds: 2, glow: true },
    clear: { sun: true, rays: true, glow: true },
    partly: { sun: true, glow: true, clouds: 3 },
    overcast: { clouds: 5 },
    fog: { clouds: 2, fog: true },
    rain: { clouds: 4, rain: true },
    snow: { clouds: 3, snow: true },
    thunder: { clouds: 5, rain: true, flash: true },
    aurora: { aurora: true }
  };

  // Deterministic pseudo-random sequence so a scene looks the same every time.
  function seq(i, salt) { var x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); }

  function land() {
    // Low ridge plus a band of spruce silhouettes (boreal forest).
    var W = 1920, H = 190, ridge = 'M0 ' + H, trees = '';
    for (var x = 0; x <= W; x += 60) ridge += ' L' + x + ' ' + (92 + Math.round(Math.sin(x / 260) * 18 + seq(x, 1) * 10));
    ridge += ' L' + W + ' ' + H + ' Z';
    for (var i = 0; i < 70; i++) {
      var tx = Math.round(i * 28 + seq(i, 2) * 18), th = 40 + Math.round(seq(i, 3) * 46), base = H - 22 + Math.round(seq(i, 4) * 10);
      var w = Math.round(th * 0.32);
      trees += 'M' + tx + ' ' + (base - th) + ' L' + (tx - w) + ' ' + base + ' L' + (tx + w) + ' ' + base + ' Z ';
    }
    return '<svg class="sc-land" viewBox="0 0 1920 190" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="sc-ridge" d="' + ridge + '"/><path class="sc-trees" d="' + trees + '"/>' +
      '<rect y="168" width="1920" height="22" class="sc-ground"/></svg>';
  }

  function particles(kind, n) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var left = (seq(i, kind === 'rain' ? 5 : 6) * 100).toFixed(2);
      var delay = (-seq(i, 7) * (kind === 'rain' ? 1.4 : 14)).toFixed(2);
      var dur = kind === 'rain' ? (0.9 + seq(i, 8) * 0.5).toFixed(2) : (10 + seq(i, 9) * 8).toFixed(2);
      var size = kind === 'snow' ? (5 + Math.round(seq(i, 10) * 7)) + 'px' : '';
      out += '<i style="left:' + left + '%;animation-delay:' + delay + 's;animation-duration:' + dur + 's' +
        (size ? ';width:' + size + ';height:' + size : '') + '"></i>';
    }
    return out;
  }

  function stars() {
    var shadows = [];
    for (var i = 0; i < 60; i++) {
      var a = (0.25 + seq(i, 11) * 0.55).toFixed(2);
      shadows.push(Math.round(seq(i, 12) * 1920) + 'px ' + Math.round(seq(i, 13) * 330) + 'px rgba(235,240,255,' + a + ')');
    }
    return '<div class="sc-stars"><i style="box-shadow:' + shadows.join(',') + '"></i></div>';
  }

  function build(key) {
    var parts = key.split('-'), cond = parts[0], night = parts[1] === 'night' || key === 'aurora';
    var L = LAYERS[cond] || LAYERS.calm;
    var a = PH.state.config.appearance;
    var lively = a.motion === 'full' && a.effects;
    var html = '<div class="sc-sky"></div>';
    if (night && cond !== 'overcast' && cond !== 'rain' && cond !== 'thunder' && cond !== 'fog') html += stars();
    if (L.aurora) html += '<div class="sc-aurora"><i></i><i></i><i></i></div>';
    if (L.glow || L.sun) html += '<div class="sc-glow"></div>';
    if (L.sun) html += night ? '<div class="sc-moon"></div>' : '<div class="sc-sun"></div>';
    if (cond === 'calm' && night) html += '<div class="sc-moon is-small"></div>';
    if (L.rays && !night) html += '<div class="sc-rays"></div>';
    if (L.clouds) {
      html += '<div class="sc-clouds">';
      for (var c = 0; c < L.clouds; c++) html += '<i class="c' + c + '"></i>';
      html += '</div>';
    }
    if (L.fog) html += '<div class="sc-fog"><i></i><i></i><i></i></div>';
    if (lively && L.rain) html += '<div class="sc-rain">' + particles('rain', MAX_PARTICLES) + '</div>';
    if (lively && L.snow) html += '<div class="sc-snow">' + particles('snow', MAX_PARTICLES) + '</div>';
    if (lively && L.flash) html += '<div class="sc-flash"></div>';
    html += land() + '<div class="sc-scrim"></div>';
    return html;
  }

  function update() {
    var el = document.getElementById('scene');
    if (!el) return;
    var a = PH.state.config.appearance, bg = PH.backdrop.effective().background;
    // Scenic wallpapers and photos replace the scene (backdrop.js); Minimal shows nothing.
    var key = bg === 'cinematic' ? 'aurora' : bg === 'dynamic' ? PH.weather.sceneKey() : '';
    var sig = key + '|' + a.motion + '|' + a.effects;
    if (sig === built) return;
    built = sig;
    el.setAttribute('data-scene', key || 'none');
    el.hidden = !key;
    el.innerHTML = key ? build(key) : '';
  }

  function particleCount() {
    var el = document.getElementById('scene');
    return el ? el.querySelectorAll('.sc-rain i, .sc-snow i').length : 0;
  }

  PH.scene = { update: update, particleCount: particleCount, MAX_PARTICLES: MAX_PARTICLES };
})(window.PH = window.PH || {});
