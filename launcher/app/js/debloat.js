/*
 * TV cleanup & privacy status (v0.8.2). Reports what is TRUE on this TV and nothing more.
 * - Optional store apps: installed or not, checked live with the read-only
 *   applicationManager/getAppLoadStatus. Premium Home cannot uninstall store apps; removal is
 *   LG's own App Edit on the TV (or ares-install --remove for developer-installed apps).
 * - LG privacy / ad controls: webOS denies apps any read access to these settings ("Access
 *   denied" on the owner's C4), so each is shown as "set on the TV" with its menu path, never
 *   as a fake on/off value.
 * - Built-in ad / ACR components: unchanged; removing them needs root (not done, not planned).
 * Proposals are recommendations for the owner's single approval, not actions.
 */
(function (PH) {
  'use strict';

  // From the TV's own app list (SSAP listApps, 2026-10-27). proposal: 'remove' | 'keep' | 'owner'.
  var OPTIONAL = [
    { appId: 'com.miniclip.eightballpool', name: '8 Ball Pool', proposal: 'remove', note: 'Ad-supported game. Reinstall any time from LG Apps; game progress may need its account.' },
    { appId: 'airplay', name: 'AirPlay', proposal: 'keep', note: 'Casting from Apple devices. Keep unless you never use AirPlay; may not be removable.' },
    { appId: 'com.apple.applemusic', name: 'Apple Music', proposal: 'owner', note: 'Remove if you don’t use Apple Music. Reinstall from LG Apps; sign in again.' },
    { appId: 'com.apple.appletv', name: 'Apple TV', proposal: 'owner', note: 'Remove if you don’t use Apple TV+. Reinstall from LG Apps; sign in again.' },
    { appId: 'com.bell.fibetv.production', name: 'Bell Fibe TV', proposal: 'owner', note: 'Remove if you have no Bell Fibe subscription.' },
    { appId: 'shortcutcopilot', name: 'Copilot', proposal: 'remove', note: 'AI assistant shortcut. Not needed for Premium Home or streaming.' },
    { appId: 'ca.bellmedia.crave', name: 'Crave', proposal: 'owner', note: 'Remove if you have no Crave subscription.' },
    { appId: 'com.fubotvcanada.app', name: 'Fubo', proposal: 'owner', note: 'Remove if you have no Fubo subscription.' },
    { appId: 'com.twin.app.gamingportal', name: 'LG Gaming Portal', proposal: 'keep', note: 'Cloud-gaming hub. Keep if you use GeForce NOW / Xbox through it; may not be removable.' },
    { appId: 'epoxyaisports', name: 'LG Sports Playbook', proposal: 'remove', note: 'LG sports feed with promotions. May not be removable.' },
    { appId: 'com.plutotv.app', name: 'Pluto TV', proposal: 'owner', note: 'Free ad-supported TV. Remove if unused.' },
    { appId: 'spotify-beehive', name: 'Spotify', proposal: 'owner', note: 'Remove if you don’t play Spotify on the TV.' },
    { appId: 'yandex.alice', name: 'Yandex Alice', proposal: 'remove', note: 'Voice assistant, not needed.' }
  ];

  // LG's own settings; paths per LG docs where published (see PRIVACY-SETTINGS-GUIDE.md).
  var PRIVACY = [
    { name: 'Viewing information (ACR)', path: 'Settings › Support › Privacy & Terms › User Agreements', effect: 'Decline to stop viewing-data collection.' },
    { name: 'Interest-based advertising', path: 'Settings › Support › Privacy & Terms › User Agreements', effect: 'Decline for non-personalised ads.' },
    { name: 'Live Plus', path: 'Settings › General › System › Additional Settings (may differ on this firmware)', effect: 'Off stops content recognition on inputs.' },
    { name: 'Limit ad tracking / reset ad ID', path: 'Settings › General › System › Additional Settings › Advertisement, or Privacy & Terms', effect: 'On, then reset the ID.' },
    { name: 'Home promotion / content recommendation', path: 'Settings › General › System › Additional Settings › Home Settings', effect: 'Off reduces promoted tiles in LG Home.' }
  ];

  var PROTECTED_COUNT = 27;
  var state = null;   // { checkedAt, installed: { appId: true|false } } after a live check

  function check() {
    if (!PH.platform.isWebOS) return Promise.resolve(null);
    var installed = {};
    return OPTIONAL.reduce(function (p, app) {
      return p.then(function () {
        return PH.luna('luna://com.webos.applicationManager/getAppLoadStatus', { appId: app.appId })
          .then(function (r) { installed[app.appId] = !!r.exist; }, function () { installed[app.appId] = null; });
      });
    }, Promise.resolve()).then(function () {
      state = { checkedAt: new Date(), installed: installed };
      return state;
    });
  }

  function statusOf(app) {
    if (!state) return PH.platform.isWebOS ? 'Checking…' : 'Not checked (Mac preview)';
    var v = state.installed[app.appId];
    return v === true ? 'Installed' : v === false ? 'Removed' : 'Unknown';
  }

  function proposalText(p) { return p === 'remove' ? 'proposed: remove' : p === 'keep' ? 'proposed: keep' : 'your call'; }

  function removedCount() {
    return state ? OPTIONAL.filter(function (a) { return state.installed[a.appId] === false; }).length : 0;
  }

  PH.debloat = {
    OPTIONAL: OPTIONAL, PRIVACY: PRIVACY, PROTECTED_COUNT: PROTECTED_COUNT,
    check: check, statusOf: statusOf, proposalText: proposalText, removedCount: removedCount,
    state: function () { return state; }
  };
})(window.PH = window.PH || {});
