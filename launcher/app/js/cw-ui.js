/*
 * Continue Watching / Saved for later: Home row cards, card options, and the save-a-title flow.
 * Cards show progress only when a provider reported it (never for saved titles), and opening
 * one opens the service's app at most; it never claims to resume.
 */
(function (PH) {
  'use strict';

  var h = PH.h;

  function ago(iso) {
    var mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (mins < 60) return mins <= 1 ? 'just now' : mins + ' min ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hrs / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }

  function statusText(it) {
    if (it.provider === 'fixture') return 'DEV DEMO · ' + it.progressPercent + '% (not real)';
    if (it.isManuallySaved) return 'Saved ' + ago(it.updatedAt) + (it.note ? ' · ' + it.note : '');
    return PH.cw.PROVIDERS.filter(function (p) { return p.id === it.provider; }).map(function (p) { return p.name; })[0] + ' · ' + ago(it.updatedAt);
  }

  function card(it) {
    var app = it.serviceId ? PH.catalogById[it.serviceId] : null;
    var el = h('div', {
      class: 'cw-card' + (it.provider === 'fixture' ? ' is-fixture' : ''), 'data-key': 'cw:' + it.provider + ':' + it.providerItemId,
      'data-group': 'cw', 'data-hint': 'card', style: app ? '--brand-rgb:' + PH.hexToRgb(app.color) : null
    }, [
      h('div', { class: 'cw-top' }, [
        app && app.logo ? h('img', { class: 'cw-logo logo-' + app.logoKind, src: 'assets/brands/' + app.logo + '.svg', alt: '', draggable: 'false' })
          : h('div', { class: 'cw-service' }, app ? app.name : 'Any service'),
        it.provider === 'fixture' ? h('div', { class: 'cw-demo' }, 'DEV DEMO') : it.isManuallySaved ? h('div', { class: 'cw-tag' }, 'Saved') : null
      ]),
      h('div', { class: 'cw-title' }, it.title),
      it.subtitle ? h('div', { class: 'cw-sub' }, it.subtitle) : null,
      h('div', { class: 'cw-status' }, statusText(it)),
      it.progressPercent !== null ? h('div', { class: 'cw-bar' }, h('i', { style: 'width:' + it.progressPercent + '%' })) : null
    ]);
    el._activate = function () { options(it); };
    el._options = el._activate;
    return el;
  }

  function options(it) {
    var app = it.serviceId ? PH.catalogById[it.serviceId] : null;
    var items = [];
    if (app) items.push({ label: 'Open ' + app.name, sub: 'app only' + (PH.launcher.subLabel(app) ? ' · ' + PH.launcher.subLabel(app) : ''), onSelect: function () { PH.launcher.launch(app); } });
    if (it.isManuallySaved) {
      items.push({ label: 'Remove from list', danger: true, onSelect: function () {
        PH.cw.removeSaved(it.providerItemId);
        PH.app.render({ focus: ['favorites:' + (PH.state.config.favorites[0] || '')] });
        PH.ui.toast(it.title + ' removed');
      } });
    }
    items.push({ label: 'Close' });
    PH.ui.menu({
      title: it.title,
      message: (it.subtitle ? it.subtitle + '\n' : '') + (it.provider === 'fixture'
        ? 'Developer demo card with made-up progress, shown only in test mode.'
        : it.isManuallySaved ? 'A title you saved. Premium Home can open the app, not this title: Netflix, Disney+, Prime Video, YouTube, Tubi and Stremio do not share progress or allow resuming from here.'
        : 'From ' + it.progressSource + '.'),
      items: items
    });
  }

  function saveFlow() {
    PH.ui.prompt({ title: 'Save a title', message: 'Type a show or movie to keep on Home. It stays on this TV only.', maxLength: 80, placeholder: 'e.g. The Last of Us', confirmLabel: 'Next' })
      .then(function (title) {
        if (!title) return;
        var services = PH.DEFAULT_FAVORITES.map(function (id) { return PH.catalogById[id]; });
        PH.ui.menu({
          title: 'Where do you watch it?',
          items: services.map(function (app) {
            return { label: app.name, swatch: app.color, onSelect: function () { finish(title, app.id); } };
          }).concat([{ label: 'Not sure / other', onSelect: function () { finish(title, null); } }])
        });
      });
    function finish(title, serviceId) {
      var r = PH.cw.saveTitle({ title: title, serviceId: serviceId });
      if (!r.ok) { PH.ui.toast(r.error); return; }
      PH.app.render();
      PH.ui.toast(r.item.title + ' saved for later' + (PH.state.config.watching.cwRow === 'off' ? ' (the row is hidden in Settings)' : ''));
    }
  }

  function manage() {
    var list = PH.cw.loadSaved();
    if (!list.length) { PH.ui.toast('No saved titles'); return; }
    PH.ui.menu({
      title: 'Saved titles', message: 'Choose one to remove it.',
      items: list.map(function (it) {
        return { label: it.title, sub: it.serviceId ? PH.catalogById[it.serviceId].name : '', onSelect: function () {
          PH.cw.removeSaved(it.providerItemId);
          PH.app.render({ focus: ['set:cw-manage'] });
          PH.ui.toast(it.title + ' removed');
        } };
      })
    });
  }

  PH.cwUI = { card: card, options: options, saveFlow: saveFlow, manage: manage, ago: ago };
})(window.PH = window.PH || {});
