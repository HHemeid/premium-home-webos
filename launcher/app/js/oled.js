/*
 * OLED care for Premium Home's own screens (the TV's OLED Care settings are separate).
 *
 * v0.9 inactivity schedule. Every time is "since the last deliberate input while Premium Home is
 * in front"; when another app or input is in front nothing runs, and coming back counts as input.
 *   - 6 s      remote hints fade out
 *   - 90 s     Home glides into the photo-led ambient view (ambientMode.autoDelaySeconds), only
 *              over Premium Home's own Home with nothing open on top
 *   - every 10 min while ambient is showing: the next licensed photo, shown for ambient only and
 *              never saved (ambientMode.photoMinutes); the text moves to another spot with it
 *   - 45 min   a deep dim: wallpaper, scene and text fade well down, the greeting hides and the
 *              weather animation stops (oledCare.dimMinutes, strength = ambientMode.ambientDim)
 *   - 60 min   pure black (#000): nothing else is drawn, no clock, nothing animates
 *              (oledCare.screensaverMinutes). This is the app's own screen, NOT LG's Screen Off:
 *              webOS documents no supported way for this kind of app to turn the panel off, so
 *              none is used. The panel stays on and LG's pixel cleaning is not triggered by it.
 *   - pixel shift: static chrome (.shiftable) moves a few pixels every 2 minutes
 * LG's own screensaver, Screen Move, logo dimming and Pixel Refresher always come first. Measured on
 * the owner's C4 (v0.9.1): LG's screensaver covers Premium Home about 3 minutes after the last key.
 * The page stays "visible" but loses focus, so a window blur while idle is treated like another app
 * in front: the schedule and every animation pause underneath. The key that dismisses LG's
 * screensaver gives focus back, which counts as input, so you return to a fully awake screen
 * (never a stale dim or black one). Nothing here fakes input, plays hidden video or sets
 * screenSaverProperties. Only deliberate input (keys, wheel, clicks, pointer moves over 12 px)
 * resets the schedule. These reduce static brightness; they cannot guarantee no burn-in.
 */
(function (PH) {
  'use strict';

  var HINTS_HIDE_S = 6;
  var IDLE_DIM_S = 45;          // optional "Dim Home after 45 s" (oledCare.dimWhenIdle, off by default)
  var BLACK_HIDE_MS = 1300;     // after the fade to black, everything under it stops being drawn
  var SHIFT_MS = 120000;
  var SHIFTS = [[0, 0], [3, 2], [-2, 3], [-3, -2], [2, -3], [-1, 1]];
  var AMB_SPOTS = 3;            // ambient text positions, changed with each photo

  var stage, saver, hideTimer;
  var now = function () { return Date.now(); };
  var lastInput = now();
  var ambientSince = 0;
  var photoStep = 0;
  var saverOn = false;
  var lgOverlay = false;        // LG's own screensaver (or another LG overlay) is covering the app
  var LG_OVERLAY_MIN_IDLE_S = 30;
  var pointerAnchor = null;
  var shiftIndex = 0;

  function care() { return PH.state.config.oledCare; }

  // The whole schedule as a pure function, so every boundary can be unit-tested with a fake clock.
  // idleS: seconds since deliberate input. ambientS: seconds the ambient view has been showing
  // (null when it isn't). Thresholds are inclusive: 90 s means "at 90 s".
  function schedule(idleS, ambientS, cfg) {
    var a = cfg.ambientMode, o = cfg.oledCare;
    var photoS = a.photoMinutes * 60;
    return {
      hintsIdle: idleS >= HINTS_HIDE_S,
      homeDim: o.dimWhenIdle && idleS >= IDLE_DIM_S,
      openAmbient: ambientS === null && a.autoDelaySeconds > 0 && idleS >= a.autoDelaySeconds,
      photoStep: ambientS !== null && photoS > 0 ? Math.floor(ambientS / photoS) : 0,
      dim: idleS >= o.dimMinutes * 60,
      black: idleS >= o.screensaverMinutes * 60
    };
  }

  function start(el) {
    stage = el;
    saver = document.getElementById('screensaver');
    setInterval(tick, 1000);
    setInterval(shift, SHIFT_MS);
    window.addEventListener('blur', function () {
      if (document.hidden || (now() - lastInput) / 1000 < LG_OVERLAY_MIN_IDLE_S) return;
      lgOverlay = true;
      stage.classList.add('lg-overlay');
    });
    window.addEventListener('focus', function () {
      if (!lgOverlay) return;
      lgOverlay = false;
      stage.classList.remove('lg-overlay');
      wake();
    });
  }

  function tick() {
    if (document.hidden || lgOverlay || !stage) return;   // another app or LG's screensaver is in front (wake() restarts the schedule on return)
    var t = now(), idle = (t - lastInput) / 1000;
    var ambient = !!PH.state.ambient;
    var s = schedule(idle, ambient ? Math.max(0, (t - ambientSince) / 1000) : null, PH.state.config);
    stage.classList.toggle('hints-idle', s.hintsIdle);
    stage.classList.toggle('is-idle', s.homeDim && !ambient);
    stage.classList.toggle('ambient-dim', s.dim);
    if (s.black) { showScreensaver(); return; }
    if (ambient && s.photoStep !== photoStep) {
      photoStep = s.photoStep;
      PH.backdrop.ambientStep(photoStep);
      placeAmbient();
    }
    if (s.openAmbient && PH.ambient.canAutoOpen()) PH.ambient.open({ auto: true });
  }

  function setShift(p) {
    stage.style.setProperty('--shift-x', p[0] + 'px');
    stage.style.setProperty('--shift-y', p[1] + 'px');
  }

  function shift() {
    if (document.hidden) return;
    if (!care().pixelShift) { resetShift(); return; }
    shiftIndex = (shiftIndex + 1) % SHIFTS.length;
    setShift(SHIFTS[shiftIndex]);
  }

  function resetShift() {
    shiftIndex = 0;
    if (stage) setShift(SHIFTS[0]);
  }

  // The ambient text sits in one of a few spots and moves with each new photo.
  function placeAmbient() {
    if (stage) stage.setAttribute('data-amb-spot', String(photoStep % AMB_SPOTS));
  }

  // Pure black: the black layer fades in, then everything under it is hidden so nothing is drawn
  // or animated behind it (no clock, no wallpaper, no weather).
  function showScreensaver() {
    if (saverOn) return;
    saverOn = true;
    pointerAnchor = null;
    saver.classList.add('is-on');
    stage.classList.add('saver-on');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (saverOn) stage.classList.add('saver-black'); }, BLACK_HIDE_MS);
  }

  // Pointer input counts only after a deliberate move (>12 px from where the pointer last
  // counted), so Magic Remote jitter and the browser's synthetic mousemoves never reset the
  // schedule or wake the black screen. Returns true when the event should be swallowed (the
  // black screen is or was just up).
  function pointerMoved(x, y) {
    if (!pointerAnchor) { pointerAnchor = [x, y]; return saverOn; }
    if (Math.abs(x - pointerAnchor[0]) + Math.abs(y - pointerAnchor[1]) < 12) return saverOn;
    pointerAnchor = [x, y];
    return wake();
  }

  // Records input. Returns true when that input only woke the black screen.
  function wake() {
    lastInput = now();
    if (PH.state.ambient) ambientOpened();   // the ambient photo clock restarts too
    if (stage) stage.classList.remove('is-idle', 'hints-idle', 'ambient-dim');
    if (!saverOn) return false;
    saverOn = false;
    clearTimeout(hideTimer);
    saver.classList.remove('is-on');
    stage.classList.remove('saver-on', 'saver-black');
    return true;
  }

  function ambientOpened() { ambientSince = now(); photoStep = 0; placeAmbient(); }

  // Testing aid: pretend the last input was `seconds` ago (and, in ambient, that ambient opened
  // when auto ambient would have opened it), then run the schedule now.
  function idleFor(seconds) {
    lastInput = now() - seconds * 1000;
    if (PH.state.ambient) {
      var delay = PH.state.config.ambientMode.autoDelaySeconds;
      ambientSince = Math.min(ambientSince, lastInput + Math.min(seconds, delay > 0 ? delay : 0) * 1000);
    }
    tick();
  }

  PH.oled = {
    schedule: schedule,
    idleFor: idleFor,
    ambientOpened: ambientOpened,
    idleSeconds: function () { return (now() - lastInput) / 1000; },
    isSaverOn: function () { return saverOn; },
    // What is actually on screen, as far as the app can tell (LG's own screen-off is not visible to it).
    state: function () {
      return { premiumAmbient: !!PH.state.ambient, dimmed: !!stage && stage.classList.contains('ambient-dim'), black: saverOn,
        lgSystemScreensaver: document.hidden ? 'unknown (app hidden)' : lgOverlay, poweredOff: 'unknown' };
    },
    isDimmed: function () { return !!stage && stage.classList.contains('ambient-dim'); },
    photoStep: function () { return photoStep; },
    start: start,
    tick: tick,
    wake: wake,
    pointerMoved: pointerMoved,
    showScreensaver: showScreensaver,
    resetShift: resetShift,
    // Testing aid: a fake clock (tests only; never used by the app itself).
    _setClock: function (fn) { now = fn || function () { return Date.now(); }; }
  };
})(window.PH = window.PH || {});
