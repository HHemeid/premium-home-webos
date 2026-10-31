/*
 * Top bar, Home, Apps and Gaming views, plus shortcut editing (options menu and move mode).
 * Views are rebuilt from PH.state on every render; focus is restored by data-key.
 * Tiles use the bundled brand logos where available (BRAND-ASSET-SOURCES.md), else a monogram.
 * Home (v0.6) opens on one full-screen "stage": the wallpaper, clock, date and weather top left,
 * and the favorites as a compact icon dock along the bottom. Down from the dock scrolls to
 * Continue Watching / Saved, Recent and Quick access. The Gaming view lives in gaming.js.
 */
(function (PH) {
  'use strict';

  var h = PH.h;
  var SECTIONS = [['home', 'Home'], ['apps', 'Apps'], ['gaming', 'Gaming'], ['settings', 'Settings']];
  var APPS_COLUMNS = 5;

  function cfg() { return PH.state.config; }
  function shortcut(id) { return PH.config.findShortcut(cfg(), id); }

  // Displayed ids for a list: 'favorites' (Home row), 'quick' (Home: TV + inputs),
  // 'apps' (grid), 'gaming', 'inputs'.
  function idsFor(listId) {
    var c = cfg();
    if (listId === 'favorites') {
      return c.favorites.filter(function (id) { var sc = shortcut(id); return sc && !sc.hidden; });
    }
    return c.shortcuts.filter(function (sc) {
      var app = PH.catalogById[sc.id];
      if (listId === 'apps') return PH.state.showHidden || !sc.hidden;
      if (sc.hidden) return false;
      if (listId === 'gaming') return app.category === 'gaming';
      if (listId === 'inputs') return app.category === 'input';
      if (listId === 'quick') return app.category === 'input' || app.category === 'tv';
      return false;
    }).map(function (sc) { return sc.id; });
  }

  function isMoving(listId, id) {
    var m = PH.state.move;
    return !!(m && m.listId === listId && m.id === id);
  }

  function bindTile(el, app, listId, editing) {
    el._activate = function () { if (editing) openTileMenu(app, listId); else PH.launcher.launch(app); };
    el._options = function () { openTileMenu(app, listId); };
    return el;
  }

  function tile(app, listId, size) {
    var s = PH.state, sc = shortcut(app.id);
    var moving = isMoving(listId, app.id);
    var editing = s.editMode && listId === 'apps';
    var badges = [];
    if (sc && sc.hidden) badges.push(h('span', { class: 'tile-badge' }, 'Hidden'));
    if (editing && !moving) badges.push(h('span', { class: 'tile-badge edit' }, 'Edit'));

    var style = '--brand-rgb:' + PH.hexToRgb(app.color) + (app.plate ? ';--plate-rgb:' + PH.hexToRgb(app.plate) : '');
    var el = h('div', {
      class: 'tile tile-' + size + (app.logo ? ' has-logo logo-' + app.logoKind : '') + (app.plate ? ' has-plate' : '') +
        (sc && sc.hidden ? ' is-hidden-app' : '') + (moving ? ' is-moving' : ''),
      'data-key': listId + ':' + app.id,
      'data-group': listId,
      'data-hint': 'tile',
      style: style
    }, [
      app.logo ? null : h('div', { class: 'tile-mark', 'aria-hidden': 'true' }, app.mono),
      h('div', { class: 'tile-sheen' }),
      app.logo ? logo(app) : h('div', { class: 'tile-icon' }, app.mono),
      badges.length ? h('div', { class: 'tile-badges' }, badges) : null,
      moving ? h('div', { class: 'tile-move' }, [h('span', null, '◀'), h('span', null, '▶')]) : null,
      h('div', { class: 'tile-text' }, [
        h('div', { class: 'tile-name' }, app.name),
        app.logo ? null : h('div', { class: 'tile-sub' }, PH.CATEGORY_LABEL[app.category])
      ])
    ]);
    return bindTile(el, app, listId, editing);
  }

  // Bundled brand logo (assets/brands). If the file can't load, fall back to the monogram badge.
  function logo(app) {
    var img = h('img', { src: 'assets/brands/' + app.logo + '.svg', alt: '', draggable: 'false' });
    var box = h('div', { class: 'tile-logo' }, img);
    img.addEventListener('error', function () {
      var tileEl = box.parentNode;
      if (!tileEl) return;
      tileEl.classList.remove('has-logo', 'logo-' + app.logoKind, 'has-plate');
      tileEl.replaceChild(h('div', { class: 'tile-icon' }, app.mono), box);
    });
    return box;
  }

  // Home dock: a small rounded icon with the brand logo; the name shows under the focused icon.
  function dockItem(app) {
    var moving = isMoving('favorites', app.id);
    var el = h('div', {
      class: 'dock-item' + (app.logo ? ' has-logo logo-' + app.logoKind : '') + (app.plate ? ' has-plate' : '') + (moving ? ' is-moving' : ''),
      'data-key': 'favorites:' + app.id, 'data-group': 'favorites', 'data-hint': 'tile',
      style: '--brand-rgb:' + PH.hexToRgb(app.color) + (app.plate ? ';--plate-rgb:' + PH.hexToRgb(app.plate) : '')
    }, [
      h('div', { class: 'dock-icon' }, app.logo
        ? dockLogo(app)
        : h('span', { class: 'dock-mono' }, app.mono)),
      moving ? h('div', { class: 'dock-move' }, [h('span', null, '◀'), h('span', null, '▶')]) : null,
      h('div', { class: 'dock-label' }, app.name)
    ]);
    return bindTile(el, app, 'favorites', false);
  }

  function dockLogo(app) {
    var img = h('img', { src: 'assets/brands/' + app.logo + '.svg', alt: '', draggable: 'false' });
    img.addEventListener('error', function () {
      var box = img.parentNode;
      if (box) box.replaceChild(h('span', { class: 'dock-mono' }, app.mono), img);
    });
    return img;
  }

  function dockAction(key, symbol, label, fn) {
    var el = h('div', { class: 'dock-item dock-action', 'data-key': key, 'data-group': 'favorites', 'data-hint': 'button' }, [
      h('div', { class: 'dock-icon' }, symbol),
      h('div', { class: 'dock-label' }, label)
    ]);
    el._activate = fn;
    return el;
  }

  function chipIcon(app) {
    if (app.logo) return h('div', { class: 'chip-icon has-img' }, h('img', { class: 'logo-' + app.logoKind, src: 'assets/brands/' + app.logo + '.svg', alt: '', draggable: 'false' }));
    return h('div', { class: 'chip-icon' }, app.mono);
  }

  // Compact shortcut used in the Home "Quick access" row. Inputs show the name you gave them.
  function chip(app) {
    var moving = isMoving('quick', app.id);
    var named = app.category === 'input' && PH.state.config.gaming.inputNames[app.id];
    var el = h('div', {
      class: 'chip' + (moving ? ' is-moving' : ''),
      'data-key': 'quick:' + app.id, 'data-group': 'quick', 'data-hint': 'tile',
      style: '--brand-rgb:' + PH.hexToRgb(app.color)
    }, [
      chipIcon(app),
      h('div', { class: 'chip-text' }, [
        h('div', { class: 'chip-label' }, named || app.name),
        named ? h('div', { class: 'chip-sub' }, app.name) : null
      ])
    ]);
    return bindTile(el, app, 'quick', false);
  }

  // "Recent" chip: opened through Premium Home on this device. 'demo' entries exist only in the Mac preview.
  function recentChip(r) {
    var app = PH.catalogById[r.id];
    var el = h('div', { class: 'chip chip-recent', 'data-key': 'recent:' + app.id, 'data-group': 'recent', 'data-hint': 'tile', style: '--brand-rgb:' + PH.hexToRgb(app.color) }, [
      chipIcon(app),
      h('div', { class: 'chip-text' }, [
        h('div', { class: 'chip-label' }, app.category === 'input' ? PH.gaming.displayName(app.id) : app.name),
        h('div', { class: 'chip-sub' }, (r.kind === 'demo' ? 'Demo · ' : 'Requested · ') + PH.cwUI.ago(r.at))
      ])
    ]);
    el._activate = function () { PH.launcher.launch(app); };
    el._options = function () {
      PH.ui.menu({ title: app.name, message: r.kind === 'demo'
        ? 'Opened in the Mac preview. Nothing was opened on a TV.'
        : 'The TV accepted a launch request from Premium Home. That does not confirm playback.', items: [
        { label: 'Open', sub: PH.launcher.subLabel(app), onSelect: function () { PH.launcher.launch(app); } },
        { label: 'Remove from Recent', onSelect: function () { PH.recents.remove(app.id); PH.app.render({ focus: ['favorites:' + (cfg().favorites[0] || '')] }); } },
        { label: 'Clear all recent', danger: true, onSelect: function () { PH.recents.clear(); PH.app.render({ focus: ['favorites:' + (cfg().favorites[0] || '')] }); } }
      ] });
    };
    return el;
  }

  function row(listId, ids, make, extra) {
    var track = h('div', { class: 'track' }, ids.map(function (id) { return make(PH.catalogById[id] || id); }).concat(extra || []));
    var r = h('div', { class: 'row', 'data-scroll': 'x', 'data-scroll-key': listId }, track);
    PH.focus.primeScroll(r);
    return r;
  }

  function head(title, sub, actions) {
    return h('div', { class: 'section-head' }, [
      h('div', { class: 'section-title' }, title),
      sub ? h('div', { class: 'section-sub' }, sub) : null,
      actions ? h('div', { class: 'head-actions' }, actions) : null
    ]);
  }

  function pill(key, label, on, fn) {
    var el = h('div', { class: 'pill' + (on ? ' is-on' : ''), 'data-key': key, 'data-group': 'apps-actions', 'data-hint': 'button' }, label);
    el._activate = fn;
    return el;
  }

  // ---------- Top bar ----------

  function renderTopbar(bar) {
    PH.clear(bar);
    var tabs = SECTIONS.map(function (s) {
      var el = h('div', {
        class: 'tab' + (PH.state.section === s[0] ? ' is-active' : ''),
        'data-key': 'tab:' + s[0], 'data-group': 'tabs', 'data-tab': s[0], 'data-hint': 'tab'
      }, s[1]);
      el._activate = function () { PH.focus.move('down'); };
      return el;
    });
    bar.appendChild(h('nav', { class: 'tabs' }, tabs));
    bar.appendChild(h('div', { class: 'topbar-status' }, h('span', { 'data-clock': 'time-full' })));
    // Quick settings: part of the tab bar for remote navigation (Right from the last tab).
    var q = h('div', { class: 'tab tab-quick', 'data-key': 'tab:quick', 'data-group': 'tabs', 'data-hint': 'button', 'aria-label': 'Quick settings' },
      h('span', { class: 'gear', 'aria-hidden': 'true' }, '⚙'));
    q._activate = function () { PH.quick.open(); };
    bar.appendChild(q);
  }

  // ---------- Home ----------

  function renderHome(view) {
    var c = cfg();
    var favs = idsFor('favorites');
    var quick = idsFor('quick');

    var add = dockAction('favorites:+add', '+', 'Add to Home', openAddFavorite);
    var dockApps = dockAction('favorites:+apps', '⋯', 'All apps', function () { PH.app.go('apps'); PH.focus.restore(['apps-act:edit']); });

    var allApps = h('div', { class: 'chip chip-ghost', 'data-key': 'quick:+apps', 'data-group': 'quick', 'data-hint': 'button' }, [
      h('div', { class: 'chip-icon' }, '⋯'),
      h('div', { class: 'chip-label' }, 'All apps')
    ]);
    allApps._activate = function () { PH.app.go('apps'); PH.focus.restore(['apps-act:edit']); };

    var dock = row('favorites', favs, dockItem, [add, dockApps]);
    dock.classList.add('dock-row');
    var blocks = [
      h('div', { class: 'home-block home-stage', 'data-scroll-unit': '' }, [
        h('div', { class: 'home-hero' }, [
          h('div', { class: 'hero-clock shiftable dimmable' }, [
            c.clock.greetingShow ? h('div', { class: 'hero-greet', 'data-clock': 'greeting' }) : null,
            h('div', { class: 'hero-time' }, [h('span', { 'data-clock': 'time' }), h('small', { 'data-clock': 'suffix' })]),
            c.clock.showDate ? h('div', { class: 'hero-date', 'data-clock': 'date' }) : null
          ]),
          PH.weatherUI.card(),
          PH.weatherUI.miniForecast()
        ]),
        h('div', { class: 'dock' }, dock)
      ])
    ];

    // Continue Watching / Saved for later: absent (no empty row) until there is something to show.
    var cw = PH.cw.items();
    if (cw.length) {
      var real = cw.some(function (it) { return !it.isManuallySaved; });
      blocks.push(h('div', { class: 'home-block', 'data-scroll-unit': '' }, [
        head(PH.cw.rowTitle(cw), real ? 'Progress as reported by the source' : 'Titles you saved on this TV · no progress tracking'),
        row('cw', cw, PH.cwUI.card)
      ]));
    }

    var recent = c.recents.rememberRecents ? PH.recents.visible() : [];
    if (recent.length) {
      blocks.push(h('div', { class: 'home-block', 'data-scroll-unit': '' }, [
        head('Recent', 'Opened through Premium Home' + (recent.some(function (r) { return r.kind === 'demo'; }) ? ' · Demo entries are previews' : '')),
        row('recent', recent, recentChip)
      ]));
    }

    blocks.push(h('div', { class: 'home-block', 'data-scroll-unit': '' }, [
      head('Quick access', 'TV and inputs'),
      row('quick', quick, chip, [allApps])
    ]));

    // Everything under the dock is one full-screen page, so Down scrolls the photo screen away
    // completely instead of stopping half way (v0.6 defect seen on the TV).
    var page = [blocks[0]];
    if (blocks.length > 1) page.push(h('div', { class: 'home-below' }, blocks.slice(1)));
    var scroll = h('div', { class: 'home-scroll', 'data-scroll': 'y', 'data-scroll-key': 'home', 'data-scroll-snap': '' }, h('div', { class: 'home-track' }, page));
    PH.focus.primeScroll(scroll);
    view.appendChild(scroll);
  }

  // ---------- Apps ----------

  function renderApps(view) {
    var s = PH.state;
    var ids = idsFor('apps');
    var hiddenCount = cfg().shortcuts.filter(function (x) { return x.hidden; }).length;
    var actions = [
      pill('apps-act:edit', s.editMode ? 'Done editing' : 'Edit shortcuts', s.editMode, function () {
        s.editMode = !s.editMode;
        PH.app.render();
      }),
      pill('apps-act:add', 'Add shortcut', false, openAddShortcut),
      pill('apps-act:hidden', (s.showHidden ? 'Showing hidden' : 'Show hidden') + ' (' + hiddenCount + ')', s.showHidden, function () {
        s.showHidden = !s.showHidden;
        PH.app.render();
      })
    ];
    var sub = ids.length + ' shortcuts' + (s.editMode ? ' · editing: OK opens options' : '');
    view.appendChild(head('All apps', sub, actions));
    if (!ids.length) { view.appendChild(h('div', { class: 'empty' }, 'No shortcuts. Choose Add shortcut to bring some back.')); return; }
    var grid = h('div', { class: 'grid' }, ids.map(function (id) { return tile(PH.catalogById[id], 'apps', 'md'); }));
    var scroll = h('div', { class: 'grid-scroll', 'data-scroll': 'y', 'data-scroll-key': 'apps' }, grid);
    PH.focus.primeScroll(scroll);
    view.appendChild(scroll);
  }

  // ---------- Gaming (gaming.js) ----------

  function renderGaming(view) {
    PH.gaming.render(view, { head: head, row: row, tile: tile });
  }

  // ---------- Shortcut editing ----------

  function openTileMenu(app, listId) {
    var c = cfg(), sc = shortcut(app.id);
    if (!sc) return;
    var isFav = c.favorites.indexOf(app.id) >= 0;
    var key = listId + ':' + app.id;
    var items = [{ label: 'Open', sub: PH.launcher.subLabel(app), onSelect: function () { PH.launcher.launch(app); } }];

    if (idsFor(listId).length > 1 && !(listId === 'favorites' && sc.hidden)) {
      items.push({ label: listId === 'favorites' ? 'Move on Home' : 'Move', onSelect: function () { startMove(listId, app.id); } });
    }
    items.push({
      label: isFav ? 'Remove from Home' : 'Add to Home',
      onSelect: function () {
        PH.app.update(function (x) { return PH.config.ops.toggleFavorite(x, app.id); }, { focus: [key, neighborKey(listId, app.id)] });
        PH.ui.toast(isFav ? app.name + ' removed from Home' : app.name + ' added to Home');
      }
    });
    items.push({
      label: sc.hidden ? 'Unhide' : 'Hide',
      onSelect: function () {
        PH.app.update(function (x) { return PH.config.ops.setHidden(x, app.id, !sc.hidden); }, { focus: [key, neighborKey(listId, app.id)] });
        PH.ui.toast(sc.hidden ? app.name + ' is visible again' : app.name + ' hidden. Apps → Show hidden brings it back.');
      }
    });
    items.push({
      label: 'Remove shortcut', danger: true,
      onSelect: function () {
        var fallback = neighborKey(listId, app.id);
        PH.ui.confirm({
          title: 'Remove ' + app.name + '?',
          message: 'This removes the shortcut from Premium Home only. Nothing is uninstalled from the TV.\nYou can add it back with Apps → Add shortcut.',
          confirmLabel: 'Remove shortcut'
        }).then(function (ok) {
          if (!ok) return;
          PH.app.update(function (x) { return PH.config.ops.remove(x, app.id); }, { focus: [fallback] });
          PH.ui.toast(app.name + ' removed');
        });
      }
    });

    PH.ui.menu({
      title: app.name,
      message: app.appId ? 'webOS app ID (unverified): ' + app.appId : 'webOS app ID not known yet',
      items: items
    });
  }

  // Key of the tile that should take focus if this one disappears.
  function neighborKey(listId, id) {
    var ids = idsFor(listId), i = ids.indexOf(id);
    var n = ids[i + 1] || ids[i - 1];
    return n ? listId + ':' + n : null;
  }

  function startMove(listId, id) {
    var field = listId === 'favorites' ? 'favorites' : 'shortcuts';
    PH.state.move = { listId: listId, id: id, field: field, original: PH.clone(cfg()[field]) };
    PH.app.render({ focus: [listId + ':' + id] });
  }

  function moveKey(k) {
    var m = PH.state.move, key = m.listId + ':' + m.id;
    if (k === 'back') {
      PH.state.config[m.field] = m.original;
      PH.state.move = null;
      PH.app.render({ focus: [key] });
      PH.ui.toast('Move cancelled');
      return;
    }
    if (k === 'enter') {
      PH.state.move = null;
      PH.app.update(function (x) { return x; }, { focus: [key] });
      PH.ui.toast('New order saved');
      return;
    }
    var cols = m.listId === 'apps' ? APPS_COLUMNS : 0;
    var delta = { left: -1, right: 1, up: -cols, down: cols }[k];
    if (!delta) return;
    var ids = idsFor(m.listId), idx = ids.indexOf(m.id);
    var target = PH.clamp(idx + delta, 0, ids.length - 1);
    if (target === idx) return;
    PH.state.config = PH.config.ops.moveRelative(PH.state.config, m.field, m.id, ids[target], target > idx);
    PH.app.render({ focus: [key] });
  }

  function openAddFavorite() {
    var c = cfg();
    var candidates = c.shortcuts.filter(function (sc) { return !sc.hidden && c.favorites.indexOf(sc.id) < 0; });
    if (!candidates.length) { PH.ui.toast('Every visible shortcut is already on Home'); return; }
    PH.ui.menu({
      title: 'Add to Home',
      message: 'Pin a shortcut to the Favorites row.',
      items: candidates.map(function (sc) {
        var app = PH.catalogById[sc.id];
        return {
          label: app.name, sub: PH.CATEGORY_LABEL[app.category], swatch: app.color,
          onSelect: function () {
            PH.app.update(function (x) { return PH.config.ops.toggleFavorite(x, app.id); }, { focus: ['favorites:' + app.id] });
            PH.ui.toast(app.name + ' added to Home');
          }
        };
      })
    });
  }

  function openAddShortcut() {
    var inUse = new Set(cfg().shortcuts.map(function (s) { return s.id; }));
    var candidates = PH.catalog.filter(function (a) { return !inUse.has(a.id); });
    if (!candidates.length) { PH.ui.toast('All known shortcuts are already added'); return; }
    PH.ui.menu({
      title: 'Add shortcut',
      message: PH.platform.isWebOS ? 'Apps and inputs whose webOS ID is verified on this TV open for real; others say they aren\u2019t linked.' : 'Mac preview: launches are previews here.',
      items: candidates.map(function (app) {
        return {
          label: app.name, sub: PH.CATEGORY_LABEL[app.category], swatch: app.color,
          onSelect: function () {
            if (PH.state.section !== 'apps') PH.state.section = 'apps';
            PH.app.update(function (x) { return PH.config.ops.add(x, app.id); }, { focus: ['apps:' + app.id] });
            PH.ui.toast(app.name + ' added to Apps');
          }
        };
      })
    });
  }

  var RENDER = { home: renderHome, apps: renderApps, gaming: renderGaming };
  var VIEWS = ['home', 'apps', 'gaming', 'settings'];
  var built = {};   // section -> true while its DOM matches the current state

  // Shows one section, building it only if it is out of date. On the C4, rebuilding all four
  // sections on every tab change cost ~100 ms of script per press (v0.5 TV profiling).
  function show(section) {
    VIEWS.forEach(function (id) {
      document.getElementById('view-' + id).classList.toggle('is-active', section === id);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#topbar .tab[data-tab]'), function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-tab') === section);
    });
    if (built[section]) return;
    var v = document.getElementById('view-' + section);
    PH.clear(v);
    (RENDER[section] || PH.settings.render)(v);
    built[section] = true;
  }

  PH.views = {
    idsFor: idsFor,
    moveKey: moveKey,
    openAddShortcut: openAddShortcut,
    // Rebuilds the top bar and the visible section; the others rebuild when next shown.
    renderAll: function () {
      renderTopbar(document.getElementById('topbar'));
      built = {};
      show(PH.state.section);
    },
    show: show,
    invalidate: function () { built = {}; },
    isBuilt: function (section) { return !!built[section]; }
  };
})(window.PH = window.PH || {});
