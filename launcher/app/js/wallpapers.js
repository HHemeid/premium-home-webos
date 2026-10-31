/*
 * Bundled wallpapers.
 * - Photographs (v0.6): licensed landscapes in assets/photos, each a 1920x1080 JPEG plus a
 *   384x216 gallery thumbnail. Public domain (U.S. National Park Service / Fish & Wildlife Service) except Moraine Lake,
 *   CC BY 3.0, whose credit is shown in the gallery and About. Sources: ASSET-LICENSES.md.
 * - Artwork: original SVG scenes from tools/make-wallpapers.py (no third-party images).
 * The first entry is the first-run default. `night` marks scenes that suit the night theme when
 * wallpaper rotation picks the next one.
 */
(function (PH) {
  'use strict';

  var PHOTOS = [
    { id: 'two-medicine', name: 'Two Medicine Lake', credit: 'Photo · NPS, public domain', night: false },
    { id: 'bowman-lake', name: 'Bowman Lake', credit: 'Photo · NPS, public domain', night: false },
    { id: 'lake-mcdonald', name: 'Lake McDonald', credit: 'Photo · NPS, public domain', night: false },
    { id: 'oldman-lake', name: 'Oldman Lake Sunrise', credit: 'Photo · NPS, public domain', night: false },
    { id: 'moraine-lake', name: 'Moraine Lake', credit: 'Photo · Florian Fuchs, CC BY 3.0', night: false },
    { id: 'big-sur-coast', name: 'Big Sur Coast', credit: 'Photo · USFWS, public domain', night: false },
    { id: 'acadia-coast', name: 'Acadia Coast', credit: 'Photo · NPS / V. Stauffenberg, public domain', night: false },
    { id: 'aurora-denali', name: 'Aurora over Denali', credit: 'Photo · NPS / Lisa Fay, public domain', night: true },
    { id: 'aurora-glacier', name: 'Aurora at Glacier', credit: 'Photo · NPS, public domain', night: true }
  ];
  var ART = [
    { id: 'alpine-dusk', name: 'Alpine Lake Dusk', night: false },
    { id: 'misty-pines', name: 'Misty Pine Forest', night: false },
    { id: 'blue-hour', name: 'Snowfall Blue Hour', night: true },
    { id: 'northern-lights', name: 'Northern Lights', night: true },
    { id: 'mountain-sunrise', name: 'Warm Mountain Sunrise', night: false },
    { id: 'night-lake', name: 'Night Lake', night: true }
  ];
  PHOTOS.forEach(function (w) { w.photo = true; w.file = 'assets/photos/' + w.id + '.jpg'; w.thumb = 'assets/photos/' + w.id + '-thumb.jpg'; });
  ART.forEach(function (w) { w.file = w.thumb = 'assets/wallpapers/' + w.id + '.svg'; });

  PH.wallpapers = PHOTOS.concat(ART);
  PH.wallpaperById = Object.create(null);
  PH.wallpapers.forEach(function (w) { PH.wallpaperById[w.id] = w; });
})(window.PH = window.PH || {});
