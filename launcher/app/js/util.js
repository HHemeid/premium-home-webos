/* Small DOM, event and storage helpers shared by every module. */
(function (PH) {
  'use strict';

  PH.VERSION = '0.9.5';
  // Shown in Settings › About. Keep the author credit if you redistribute (MIT licence).
  PH.CREDITS = { author: '@hhemeid', url: 'github.com/hhemeid/premium-home-webos' };

  PH.h = function (tag, props, children) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    append(el, children);
    return el;
  };

  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }

  // Plain, single-line display text from untrusted input (imports, typed names, provider data):
  // no control or bidirectional-override characters, collapsed spaces, at most `max` characters.
  PH.cleanLabel = function (s, max) {
    if (typeof s !== 'string') return '';
    var t = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(t).slice(0, max || 80).join('').trim();
  };

  PH.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); };
  PH.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  PH.clamp = function (n, lo, hi) { return Math.max(lo, Math.min(hi, n)); };
  PH.hexToRgb = function (hex) {
    var n = parseInt(hex.replace('#', ''), 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  };

  var listeners = {};
  PH.on = function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); };
  PH.emit = function (name, arg) { (listeners[name] || []).forEach(function (fn) { fn(arg); }); };

  // localStorage can be missing or throw (private windows, some file:// setups),
  // so fall back to memory and report that nothing was persisted.
  var memory = {};
  PH.storage = {
    get: function (k) {
      try { return window.localStorage.getItem(k); } catch (e) { return k in memory ? memory[k] : null; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem(k, v); return true; } catch (e) { memory[k] = v; return false; }
    }
  };
})(window.PH = window.PH || {});
