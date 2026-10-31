/*
 * Apps Premium Home knows how to show.
 *
 * appId values are candidates from community lists; PH.VERIFIED_APP_IDS lists the ones confirmed on this TV.
 * LG documents no API that lists installed apps, so each ID must be checked one by one with
 * luna://com.webos.applicationManager getAppLoadStatus during a future on-TV test step.
 * null means no candidate ID is known yet.
 *
 * logo: file in assets/brands/<logo>.svg (see BRAND-ASSET-SOURCES.md); tiles without one use the
 * monogram. plate: brand colour behind a light logo. A logo never means the app is installed.
 */
(function (PH) {
  'use strict';

  var apps = [
    { id: 'youtube', name: 'YouTube', appId: 'youtube.leanback.v4', category: 'video', color: '#ff0000', mono: 'Y', logo: 'youtube', logoKind: 'icon' },
    { id: 'netflix', name: 'Netflix', appId: 'netflix', category: 'video', color: '#e50914', mono: 'N', logo: 'netflix', logoKind: 'icon' },
    { id: 'disneyplus', name: 'Disney+', appId: 'com.disney.disneyplus-prod', category: 'video', color: '#1f4fe0', mono: 'D+', logo: 'disneyplus', logoKind: 'wordmark', plate: '#0b1f6b' },
    { id: 'stremio', name: 'Stremio', appId: 'io.strem.tv', category: 'video', color: '#685cee', mono: 'S', logo: 'stremio', logoKind: 'icon' },
    { id: 'primevideo', name: 'Prime Video', appId: 'amazon', category: 'video', color: '#00a8e1', mono: 'P', logo: 'primevideo', logoKind: 'wordmark' },
    { id: 'tubi', name: 'Tubi', appId: 'com.tubitv.ott.tubi', category: 'video', color: '#7408ff', mono: 'T', logo: 'tubi', logoKind: 'wordmark', plate: '#5a06c8' },
    { id: 'appletv', name: 'Apple TV', appId: null, category: 'video', color: '#8e9399', mono: 'A' },
    { id: 'hbomax', name: 'HBO Max', appId: null, category: 'video', color: '#2a4cff', mono: 'M' },
    { id: 'plex', name: 'Plex', appId: null, category: 'video', color: '#e5a00d', mono: 'P' },
    { id: 'spotify', name: 'Spotify', appId: null, category: 'music', color: '#1db954', mono: 'S' },
    // v0.9.4: every shortcut has an icon. Brand marks come from assets/brands (BRAND-ASSET-SOURCES.md);
    // the TV, browser and HDMI glyphs are drawn for this app (logoKind 'glyph': a line icon).
    { id: 'livetv', name: 'Live TV', appId: 'com.webos.app.livetv', category: 'tv', color: '#5c6b7a', mono: 'TV', logo: 'livetv', logoKind: 'glyph' },
    { id: 'browser', name: 'Web Browser', appId: 'com.webos.app.browser', category: 'tv', color: '#4a7c9b', mono: 'W', logo: 'browser', logoKind: 'glyph' },
    { id: 'xbox', name: 'Xbox', appId: null, category: 'gaming', color: '#107c10', mono: 'X', logo: 'xbox', logoKind: 'wordmark', plate: '#107c10' },
    { id: 'geforcenow', name: 'GeForce NOW', appId: null, category: 'gaming', color: '#76b900', mono: 'G', logo: 'geforcenow', logoKind: 'wordmark', plate: '#1e1e1e' },
    { id: 'twitch', name: 'Twitch', appId: null, category: 'gaming', color: '#9146ff', mono: 'T', logo: 'twitch', logoKind: 'icon', plate: '#9146ff' },
    { id: 'steamlink', name: 'Steam Link', appId: null, category: 'gaming', color: '#3d8fd1', mono: 'S' },
    { id: 'hdmi1', name: 'HDMI 1', appId: 'com.webos.app.hdmi1', category: 'input', color: '#6b7280', mono: '1', logo: 'hdmi1', logoKind: 'glyph' },
    { id: 'hdmi2', name: 'HDMI 2', appId: 'com.webos.app.hdmi2', category: 'input', color: '#6b7280', mono: '2', logo: 'hdmi2', logoKind: 'glyph' },
    { id: 'hdmi3', name: 'HDMI 3', appId: 'com.webos.app.hdmi3', category: 'input', color: '#6b7280', mono: '3', logo: 'hdmi3', logoKind: 'glyph' },
    { id: 'hdmi4', name: 'HDMI 4', appId: 'com.webos.app.hdmi4', category: 'input', color: '#6b7280', mono: '4', logo: 'hdmi4', logoKind: 'glyph' }
  ];

  PH.catalog = apps;
  // Null-prototype map: ids like "constructor" or "__proto__" can never match inherited keys.
  PH.catalogById = Object.create(null);
  apps.forEach(function (a) { PH.catalogById[a.id] = a; });

  // The only check for "is this a shortcut id we support": own key, string type.
  PH.isCatalogId = function (id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PH.catalogById, id);
  };

  // Confirmed on the owner's C4 (2026-10-27): installed (getAppLoadStatus) AND launched into the
  // foreground through com.webos.applicationManager/launch, one at a time with the owner's
  // approval. Only these open (launcher.js); anything else is 'not-found' on the TV.
  // Stremio (io.strem.tv) and Tubi (com.tubitv.ott.tubi) were read from the TV's own app list
  // (SSAP listApps, owner-approved prompt) and launch-tested the same way during the v0.7.0 test.
  // v0.8: the TV's own inputs and apps, IDs exactly as listed by the TV (SSAP listApps). HDMI 1,
  // Live TV, the browser and LG Home were launch-tested; HDMI 2-4 use the same system app type.
  PH.VERIFIED_APP_IDS = ['youtube.leanback.v4', 'netflix', 'com.disney.disneyplus-prod', 'amazon', 'io.strem.tv', 'com.tubitv.ott.tubi',
    'com.webos.app.livetv', 'com.webos.app.browser', 'com.webos.app.hdmi1', 'com.webos.app.hdmi2', 'com.webos.app.hdmi3', 'com.webos.app.hdmi4'];
  // LG's own Home, opened by "Open LG Home" (always available as a way back).
  PH.LG_HOME_APP_ID = 'com.webos.app.home';
  // v0.9.2: the supervised Home-button helper. Opening it turns the Home-button takeover back on
  // (after a triple-Home stop) and brings Premium Home to the front. Premium Home can't read its state.
  PH.HOME_HELPER_APP_ID = 'com.local.premiumhome.homehelper';

  PH.CATEGORY_LABEL ={ video: 'Streaming', music: 'Music', tv: 'TV', gaming: 'Gaming', input: 'Input' };

  PH.DEFAULT_FAVORITES = ['youtube', 'netflix', 'disneyplus', 'stremio', 'primevideo', 'tubi'];
  PH.DEFAULT_SHORTCUTS = PH.DEFAULT_FAVORITES.concat([
    'livetv', 'browser', 'xbox', 'geforcenow', 'twitch', 'hdmi1', 'hdmi2', 'hdmi3', 'hdmi4'
  ]);
})(window.PH = window.PH || {});
