/*
 * "My photo" wallpaper: one picture the owner picks, kept in this app's IndexedDB (not
 * localStorage) on this device only. Never uploaded, never exported, never in review zips.
 *
 * The picture is decoded, checked, downscaled to at most what fills a 1920x1080 screen
 * (longest side 3840), and re-encoded as JPEG. Re-encoding also drops EXIF metadata such as
 * GPS position. Whether the TV offers a file picker to a developer app is untested.
 */
(function (PH) {
  'use strict';

  var DB = 'premiumHome', STORE = 'media';
  var KEY = 'wallpaper-photo' + (PH.config && PH.config.TEST_MODE ? '.test' : '');
  var MAX_BYTES = 25 * 1024 * 1024;
  var MIN_W = 640, MIN_H = 360, MAX_SIDE_IN = 12000, MAX_SIDE_OUT = 3840;
  var TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  var cachedUrl = null, cachedAt = null;

  // Pure checks, unit-tested. Returns an error message or null.
  function checkFile(type, size) {
    if (TYPES.indexOf(type) < 0) return 'Choose a JPEG, PNG or WebP picture.';
    if (!(size > 0)) return 'That file is empty.';
    if (size > MAX_BYTES) return 'That picture is larger than 25 MB.';
    return null;
  }

  function checkSize(w, h) {
    if (w < MIN_W || h < MIN_H) return 'That picture is too small (at least 640 × 360).';
    if (w > MAX_SIDE_IN || h > MAX_SIDE_IN) return 'That picture is too large to process safely.';
    return null;
  }

  // Output size: cover 1920x1080 without upscaling; longest side at most MAX_SIDE_OUT.
  function targetSize(w, h) {
    var s = Math.min(1, Math.max(1920 / w, 1080 / h), MAX_SIDE_OUT / Math.max(w, h));
    return { width: Math.round(w * s), height: Math.round(h * s) };
  }

  function db() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('Photo storage is not available here.')); return; }
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Photo storage is not available here.')); };
    });
  }

  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode), result;
        Promise.resolve(fn(t.objectStore(STORE))).then(function (r) { result = r; });
        t.oncomplete = function () { d.close(); resolve(result && result.result !== undefined ? result.result : result); };
        t.onabort = t.onerror = function () {
          d.close();
          var e = t.error;
          reject(e && e.name === 'QuotaExceededError' ? new Error('Not enough storage on this device for that picture.') : (e || new Error('Could not save the picture.')));
        };
      });
    });
  }

  function decode(file) {
    if (typeof createImageBitmap === 'function') return createImageBitmap(file);
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
      img.src = url;
    });
  }

  // file → { blob, width, height, bytes }
  function prepare(file) {
    var err = checkFile(file.type, file.size);
    if (err) return Promise.reject(new Error(err));
    return decode(file).catch(function () { throw new Error('That file could not be read as a picture.'); }).then(function (img) {
      var w = img.width, h = img.height, bad = checkSize(w, h);
      if (bad) { if (img.close) img.close(); throw new Error(bad); }
      var t = targetSize(w, h);
      var canvas = document.createElement('canvas');
      canvas.width = t.width; canvas.height = t.height;
      canvas.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
      if (img.close) img.close();
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          canvas.width = canvas.height = 0;
          if (!blob) { reject(new Error('Could not prepare the picture.')); return; }
          resolve({ blob: blob, width: t.width, height: t.height, bytes: blob.size });
        }, 'image/jpeg', 0.86);
      });
    });
  }

  function save(file) {
    return prepare(file).then(function (p) {
      var rec = { blob: p.blob, width: p.width, height: p.height, bytes: p.bytes, addedAt: new Date().toISOString() };
      return tx('readwrite', function (s) { return s.put(rec, KEY); }).then(function () { forget(); return rec; });
    });
  }

  function get() {
    return tx('readonly', function (s) { return s.get(KEY); }).then(function (r) { return r && r.blob ? r : null; }).catch(function () { return null; });
  }

  // Object URL for the stored picture (one at a time; the previous one is revoked).
  function url() {
    if (cachedUrl) return Promise.resolve(cachedUrl);
    return get().then(function (r) {
      if (!r) return null;
      forget();
      cachedUrl = URL.createObjectURL(r.blob);
      cachedAt = r;
      return cachedUrl;
    });
  }

  function forget() {
    if (cachedUrl) URL.revokeObjectURL(cachedUrl);
    cachedUrl = null; cachedAt = null;
  }

  function remove() {
    forget();
    return tx('readwrite', function (s) { return s.delete(KEY); }).catch(function () { return null; });
  }

  PH.photo = {
    MAX_BYTES: MAX_BYTES, checkFile: checkFile, checkSize: checkSize, targetSize: targetSize,
    prepare: prepare, save: save, get: get, url: url, remove: remove,
    info: function () { return cachedAt; }
  };
})(window.PH = window.PH || {});
