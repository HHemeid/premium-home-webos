/*
 * Platform adapter: the only place that knows whether we run on webOS or in a browser.
 * Key codes follow LG's Magic Remote guide (Back = 461, colour keys 403-406).
 */
(function (PH) {
  'use strict';

  var ua = navigator.userAgent || '';
  var isWebOS = !!(window.PalmSystem || /Web0S|webOS/i.test(ua) ||
    (window.webOS && window.webOS.platform && window.webOS.platform.tv));

  var KEYMAP = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down',
    13: 'enter',
    461: 'back',      // remote Back
    27: 'back',       // Esc (Mac preview)
    8: 'back',        // Backspace (Mac preview)
    403: 'options',   // red key, on remotes that have colour keys
    404: 'quick',     // green key: Quick settings (the C4's Magic Remote may not have colour keys;
                      // the ⚙ button in the top bar always works)
    79: 'options',    // "O" (Mac preview)
    81: 'quick',      // "Q" (Mac preview)
    405: 'ambient',   // yellow key: ambient view
    65: 'ambient'     // "A" (Mac preview)
  };
  // Home, power, volume, channel, Settings and voice keys are never mapped: webOS keeps them.

  var LABELS = isWebOS
    ? { enter: 'OK', back: 'Back', options: 'Hold OK', quick: '⚙', ambient: 'Yellow' }
    : { enter: 'Enter', back: 'Esc', options: 'O', quick: 'Q', ambient: 'A' };

  PH.platform = {
    isWebOS: isWebOS,
    name: isWebOS ? 'webOS TV' : 'Mac browser preview',
    key: function (e) { return KEYMAP[e.keyCode] || null; },
    label: function (k) { return LABELS[k] || k; },
    // Called after our own "Exit Premium Home?" confirmation. LG's Back-button guide: an app with
    // its own exit popup should call window.close(); webOS.platformBack() would show a second,
    // system exit popup on webOS 6+. Untested on the TV.
    exit: function () {
      if (PH.platform.isWebOS) window.close();
      else PH.ui.toast('Exit is simulated in the preview');
    }
  };
})(window.PH = window.PH || {});
