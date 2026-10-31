/*
 * Gaming dashboard: the four HDMI inputs with names you choose, a favourite input, game-app
 * shortcuts, and the TV's game features shown honestly as "unavailable" until a supported
 * webOS API is verified on this TV. Switching inputs opens the TV's own HDMI app (launcher.js); nothing here
 * reads or changes Game Optimizer, VRR, HDR or picture settings.
 */
(function (PH) {
  'use strict';

  var h = PH.h;
  var PRESETS = ['PlayStation 5', 'Xbox Series X|S', 'Nintendo Switch', 'Gaming PC', 'Steam Deck', 'Apple TV', 'Cable / satellite box', 'Soundbar / AV receiver', 'Blu-ray player'];

  function cfg() { return PH.state.config.gaming; }
  function nameOf(id) { return cfg().inputNames[id] || ''; }
  function displayName(id) { return nameOf(id) || PH.catalogById[id].name; }

  function setName(id, name) {
    PH.app.update(function (c) { c.gaming.inputNames[id] = PH.cleanLabel(name, PH.config.INPUT_NAME_MAX); return c; }, { focus: ['inputs:' + id] });
  }

  function rename(id) {
    var port = PH.catalogById[id].name;
    PH.ui.menu({
      title: 'Name ' + port,
      message: 'What is connected to ' + port + '? The name is only a label in Premium Home.',
      items: PRESETS.map(function (p) {
        return { label: p, sub: nameOf(id) === p ? 'Current' : null, onSelect: function () { setName(id, p); PH.ui.toast(port + ' is now ' + p); } };
      }).concat([
        { label: 'Type a name…', onSelect: function () {
          PH.ui.prompt({ title: 'Name ' + port, value: nameOf(id), maxLength: PH.config.INPUT_NAME_MAX, placeholder: 'e.g. Living-room PS5' })
            .then(function (v) { if (v !== null) { setName(id, v); PH.ui.toast(v ? port + ' is now ' + v : port + ' name cleared'); } });
        } },
        { label: 'Clear name', onSelect: function () { setName(id, ''); } }
      ])
    });
  }

  function inputCard(id) {
    var app = PH.catalogById[id], fav = cfg().favoriteInput === id, named = !!nameOf(id);
    var el = h('div', {
      class: 'tile tile-md input-card' + (fav ? ' is-fav' : ''), 'data-key': 'inputs:' + id, 'data-group': 'inputs', 'data-hint': 'tile',
      style: '--brand-rgb:' + PH.hexToRgb(app.color)
    }, [
      h('div', { class: 'input-glyph' }, h('img', { src: 'assets/brands/' + app.logo + '.svg', alt: '', draggable: 'false' })),
      h('div', { class: 'input-text' }, [
        h('div', { class: 'input-name' }, named ? nameOf(id) : app.name),
        h('div', { class: 'input-sub' }, named ? app.name + (fav ? ' · first' : '') : (fav ? 'First input · ' : '') + 'Hold OK to name it')
      ])
    ]);
    el._activate = function () { PH.launcher.launch(app, { label: displayName(id) }); };
    el._options = function () {
      PH.ui.menu({ title: displayName(id), message: app.name + ' · switching uses the TV\u2019s own input app.', items: [
        { label: 'Switch to ' + app.name, sub: PH.launcher.subLabel(app), onSelect: function () { PH.launcher.launch(app, { label: displayName(id) }); } },
        { label: 'Rename…', onSelect: function () { rename(id); } },
        { label: fav ? 'Remove favorite' : 'Set as favorite input', onSelect: function () {
          PH.app.update(function (c) { c.gaming.favoriteInput = fav ? '' : id; return c; }, { focus: ['inputs:' + id] });
          PH.ui.toast(fav ? 'Favorite input cleared' : displayName(id) + ' is your favorite input');
        } }
      ] });
    };
    return el;
  }

  function render(view, helpers) {
    var ids = PH.config.INPUT_IDS.slice();
    var fav = cfg().favoriteInput;
    if (fav) ids = [fav].concat(ids.filter(function (x) { return x !== fav; }));
    view.appendChild(helpers.head('Inputs', 'OK switches the TV to it · hold OK to name it or put it first'));
    view.appendChild(helpers.row('inputs', ids, function (app) { return inputCard(app.id); }));
    var games = PH.views.idsFor('gaming');
    view.appendChild(helpers.head('Game apps', 'Cloud gaming and streaming'));
    view.appendChild(games.length ? helpers.row('gaming', games, function (app) { return helpers.tile(app, 'gaming', 'md'); })
      : h('div', { class: 'empty' }, 'No game shortcuts. Add them from Apps.'));
    // Picture, HDR, VRR and Game Optimizer live in the TV, not in an app; say so in one quiet line.
    view.appendChild(h('div', { class: 'gaming-note' }, 'Game Optimizer, HDR and VRR are set by the TV: press the Settings button on the remote while you play.'));
  }

  PH.gaming = { render: render, displayName: displayName, rename: rename, PRESETS: PRESETS };
})(window.PH = window.PH || {});
