/*
 * 5-way (arrow key) spatial navigation.
 *
 * Every focusable element carries data-key (stable across re-renders) and data-group.
 * Moving picks the nearest element in the pressed direction; when that lands in a
 * different group, the group's last-focused element wins so rows "remember" position.
 * Dialogs push a scope so focus cannot leave them.
 */
(function (PH) {
  'use strict';

  var root = null;
  var current = null;
  var scopes = [];       // [{ el, returnKey }]
  var memory = {};       // group -> last data-key
  var scrollMemory = {}; // data-scroll-key -> offset

  function scope() { return scopes.length ? scopes[scopes.length - 1].el : root; }

  function isFocusable(el) {
    if (!el || !el.getAttribute('data-key')) return false;
    var s = scope();
    if (!s || !s.contains(el)) return false;
    if (!scopes.length) {
      var view = el.closest('.view');
      if (view && !view.classList.contains('is-active')) return false;
    }
    return true;
  }

  function all() {
    return Array.prototype.filter.call(scope().querySelectorAll('[data-key]'), isFocusable);
  }

  function byKey(key) {
    if (!key) return null;
    var list = all();
    for (var i = 0; i < list.length; i++) if (list[i].getAttribute('data-key') === key) return list[i];
    return null;
  }

  function first() {
    var s = scope();
    if (s !== root) return all()[0] || null;
    var view = root.querySelector('.view.is-active');
    var inView = view ? Array.prototype.filter.call(view.querySelectorAll('[data-key]'), isFocusable) : [];
    return inView[0] || all()[0] || null;
  }

  function set(el) {
    if (!el) return;
    if (current && current !== el) current.classList.remove('is-focused');
    current = el;
    el.classList.add('is-focused');
    var g = el.getAttribute('data-group');
    if (g) memory[g] = el.getAttribute('data-key');
    ensureVisible(el);
    if (el._onFocus) el._onFocus();
    PH.emit('focus', el);
  }

  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function regionOf(el) {
    var r = el.closest('[data-region]');
    return r ? r.getAttribute('data-region') : '';
  }

  function inDirection(dir, a, b) {
    if (dir === 'right') return b.x > a.x + 1;
    if (dir === 'left') return b.x < a.x - 1;
    if (dir === 'down') return b.y > a.y + 1;
    return b.y < a.y - 1;
  }

  function move(dir) {
    if (!current || !document.contains(current) || !isFocusable(current)) { set(first()); return; }
    var ar = current.getBoundingClientRect(), ac = center(ar);
    var horizontal = dir === 'left' || dir === 'right';
    var best = null, bestScore = Infinity;

    var candidates = [];
    var fromTabs = current.getAttribute('data-group') === 'tabs';
    all().forEach(function (el) {
      if (el === current) return;
      // Left/right never crosses between the tab bar and content: tabs are entered with Up or Back.
      if (horizontal && fromTabs !== (el.getAttribute('data-group') === 'tabs')) return;
      var br = el.getBoundingClientRect(), bc = center(br);
      if (!inDirection(dir, ac, bc)) return;
      candidates.push({
        el: el,
        rect: br,
        primary: horizontal ? Math.abs(bc.x - ac.x) : Math.abs(bc.y - ac.y),
        secondary: horizontal ? Math.abs(bc.y - ac.y) : Math.abs(bc.x - ac.x)
      });
    });
    if (!candidates.length) return;

    var here = regionOf(current);
    if (horizontal) {
      // Left/right stays in the current row (vertical overlap). At a row's end it stops, except
      // when crossing into another [data-region] column, e.g. settings categories → panel.
      var sameRow = candidates.filter(function (c) { return c.rect.top < ar.bottom - 4 && c.rect.bottom > ar.top + 4; });
      candidates = sameRow.length ? sameRow : !here ? [] : candidates.filter(function (c) {
        var r = regionOf(c.el);
        return r && r !== here;
      });
      if (!candidates.length) return;
    }
    if (!horizontal) {
      // Up/down inside a vertically scrolling page (Home) moves within it first: off-screen rows
      // above or below come before the always-visible tab bar.
      var page = current.closest('[data-scroll="y"]');
      var inside = page ? candidates.filter(function (c) { return page.contains(c.el); }) : [];
      if (inside.length) candidates = inside;
    }
    if (!horizontal && here) {
      // Up/down stays inside a [data-region] column (e.g. settings list vs. panel);
      // from a region it may only leave to elements outside any region (the tab bar).
      var same = candidates.filter(function (c) { return regionOf(c.el) === here; });
      candidates = same.length ? same : candidates.filter(function (c) { return regionOf(c.el) === ''; });
      if (!candidates.length) return;
    }

    if (horizontal) {
      candidates.forEach(function (c) {
        var score = c.primary + c.secondary * 3;
        if (score < bestScore) { bestScore = score; best = c.el; }
      });
    } else {
      // Up/down: go to the nearest row first, then the closest item within it.
      var nearest = Math.min.apply(null, candidates.map(function (c) { return c.primary; }));
      var band = nearest + ar.height * 0.5;
      candidates.forEach(function (c) {
        if (c.primary <= band && c.secondary < bestScore) { bestScore = c.secondary; best = c.el; }
      });
    }

    // Entering another group: prefer its active item (e.g. the current section's tab),
    // then the item last focused there.
    var group = best.getAttribute('data-group');
    if (group && group !== current.getAttribute('data-group')) {
      var preferred = all().filter(function (el) {
        return el.getAttribute('data-group') === group && el.classList.contains('is-active');
      })[0] || byKey(memory[group]);
      if (preferred && inDirection(dir, ac, center(preferred.getBoundingClientRect()))) best = preferred;
    }
    set(best);
  }

  // Scrolls every [data-scroll] container around el with a transform, the usual TV approach.
  // Inside an outer container, the item's [data-scroll-unit] block (e.g. a row with its heading)
  // is what gets scrolled into view.
  function ensureVisible(el) {
    var target = el;
    for (var c = el.closest('[data-scroll]'); c; c = c.parentElement && c.parentElement.closest('[data-scroll]')) {
      scrollInto(c, target);
      target = c.closest('[data-scroll-unit]') || c;
    }
  }

  function scrollInto(c, el) {
    var track = c.firstElementChild;
    var horizontal = c.getAttribute('data-scroll') === 'x';
    var cs = window.getComputedStyle(c);
    var viewSize = horizontal
      ? c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      : c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var pos = 0;
    for (var n = el; n && n !== track; n = n.offsetParent) pos += horizontal ? n.offsetLeft : n.offsetTop;
    var size = horizontal ? el.offsetWidth : el.offsetHeight;
    var total = horizontal ? track.scrollWidth : track.scrollHeight;
    var cur = Number(track.getAttribute('data-offset') || 0);

    if (c.hasAttribute('data-scroll-snap')) {
      // Snap to the start of a whole section (Home): the first section start that still shows
      // all of the target, so nothing is ever cut in half at the top.
      var tops = Array.prototype.map.call(track.children, function (u) { return u.offsetTop; });
      var fit = tops.filter(function (t) { return t >= pos + size - viewSize && t <= pos; });
      if (fit.length) cur = Math.min.apply(null, fit);
      else if (pos < cur) cur = pos;
      else if (pos + size > cur + viewSize) cur = pos + size - viewSize;
    } else if (pos < cur) cur = pos;
    else if (pos + size > cur + viewSize) cur = pos + size - viewSize;
    cur = PH.clamp(cur, 0, Math.max(0, total - viewSize));

    applyOffset(track, cur, horizontal);
    var key = c.getAttribute('data-scroll-key');
    if (key) scrollMemory[key] = cur;
    updateEdges(c);
  }

  // Edge fades show that a row or list continues beyond what is visible.
  function updateEdges(c) {
    var track = c.firstElementChild;
    if (!track) return;
    var horizontal = c.getAttribute('data-scroll') === 'x';
    var cs = window.getComputedStyle(c);
    var viewSize = horizontal
      ? c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      : c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var total = horizontal ? track.scrollWidth : track.scrollHeight;
    var cur = Number(track.getAttribute('data-offset') || 0);
    c.classList.toggle('more-before', cur > 1);
    c.classList.toggle('more-after', cur < total - viewSize - 1);
  }

  function applyOffset(track, offset, horizontal) {
    track.setAttribute('data-offset', offset);
    track.style.transform = horizontal ? 'translate3d(' + -offset + 'px,0,0)' : 'translate3d(0,' + -offset + 'px,0)';
  }

  PH.focus = {
    init: function (el) { root = el; },
    current: function () { return current && document.contains(current) ? current : null; },
    currentKey: function () { return current && document.contains(current) ? current.getAttribute('data-key') : null; },
    isFocusable: isFocusable,
    set: set,
    move: move,
    // Focus the first key that exists; otherwise the first focusable in scope.
    restore: function (keys) {
      for (var i = 0; i < (keys || []).length; i++) {
        var el = byKey(keys[i]);
        if (el) { set(el); return; }
      }
      set(first());
    },
    // Call after rendering: sets edge fades on every visible scroll container.
    refreshEdges: function () {
      Array.prototype.forEach.call(root.querySelectorAll('.view.is-active [data-scroll]'), updateEdges);
    },
    // Re-apply a remembered scroll offset to a freshly rendered container.
    primeScroll: function (c) {
      var key = c.getAttribute('data-scroll-key');
      if (key && scrollMemory[key]) applyOffset(c.firstElementChild, scrollMemory[key], c.getAttribute('data-scroll') === 'x');
    },
    pushScope: function (el, initialIndex) {
      scopes.push({ el: el, returnKey: this.currentKey() });
      var list = all();
      set(list[initialIndex || 0] || list[0]);
    },
    popScope: function () {
      var s = scopes.pop();
      this.restore(s ? [s.returnKey] : []);
    }
  };
})(window.PH = window.PH || {});
