/*
 * Wallpaper gallery: a bottom sheet over a live preview. Focusing a card previews it full screen,
 * OK applies and saves it, Back puts the saved choice back. Also handles "My photo" import.
 */
(function (PH) {
  'use strict';

  var h = PH.h;

  function choices(hasPhoto) {
    return [
      { bg: 'dynamic', label: 'Dynamic weather', sub: 'Live weather or time of day', thumb: 'dynamic' },
      { bg: 'cinematic', label: 'Cinematic aurora', sub: 'Gently animated', thumb: 'cinematic' }
    ].concat(PH.wallpapers.map(function (w) {
      return { bg: 'scenic', id: w.id, label: w.name, sub: w.credit || 'Original artwork', src: w.thumb };
    })).concat([
      { bg: 'photo', label: hasPhoto ? 'My photo' : 'Add my photo', sub: hasPhoto ? 'Stored on this device' : 'JPEG, PNG or WebP', thumb: hasPhoto ? 'photo' : 'add' },
      { bg: 'minimal', label: 'Minimal black', sub: 'Darkest, least OLED wear', thumb: 'minimal' }
    ]);
  }

  function isFavourite(ch) {
    return ch.bg === 'scenic' && PH.state.config.wallpaper.favoriteIds.indexOf(ch.id) >= 0;
  }

  function isCurrent(ch) {
    var c = PH.state.config;
    return ch.bg === c.appearance.background && (ch.bg !== 'scenic' || ch.id === c.wallpaper.scenicId);
  }

  function apply(ch, entry) {
    entry.close();
    PH.backdrop.setPreview(null);
    PH.backdrop.chosen(ch.bg === 'scenic' ? ch.id : null);
    PH.app.update(function (c) {
      c.appearance.background = ch.bg;
      if (ch.id) c.wallpaper.scenicId = ch.id;
      return c;
    });
    PH.ui.toast(ch.label + ' applied');
  }

  function pickPhoto(onDone) {
    var input = document.getElementById('photo-file');
    input.value = '';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      PH.ui.toast('Preparing your photo…');
      PH.photo.save(file).then(function (rec) {
        knownPhoto = true;
        PH.backdrop.chosen();
        PH.app.update(function (c) { c.appearance.background = 'photo'; return c; });
        PH.ui.toast('Photo saved on this device (' + rec.width + ' × ' + rec.height + ')');
        if (onDone) onDone(true);
      }, function (e) {
        PH.ui.menu({ title: 'Couldn\'t use that picture', message: e.message + '\nNothing was changed.', items: [{ label: 'OK' }] });
        if (onDone) onDone(false);
      });
    };
    input.click();
  }

  function removePhoto() {
    PH.ui.confirm({ title: 'Remove your photo?', message: 'It is deleted from this device. Bundled wallpapers are not affected.', confirmLabel: 'Remove photo' })
      .then(function (ok) {
        if (!ok) return;
        PH.photo.remove().then(function () {
          knownPhoto = false;
          PH.app.update(function (c) { if (c.appearance.background === 'photo') c.appearance.background = 'scenic'; return c; });
          PH.ui.toast('Photo removed');
        });
      });
  }

  function thumb(ch) {
    if (ch.src) return h('img', { class: 'gal-thumb', src: ch.src, alt: '', draggable: 'false', decoding: 'async' });
    var el = h('div', { class: 'gal-thumb gal-' + ch.thumb }, ch.thumb === 'add' ? '+' : null);
    if (ch.thumb === 'photo') {
      PH.photo.url().then(function (u) { if (u) el.style.backgroundImage = 'url("' + u + '")'; });
    }
    return el;
  }

  // Opens at once; whether a photo is stored is known from the last check and refreshed in the
  // background (IndexedDB can be slow on a TV).
  var knownPhoto = false;
  function open() {
    build(knownPhoto);
    PH.photo.get().then(function (rec) {
      if (!!rec === knownPhoto) return;
      knownPhoto = !!rec;
      if (PH.ui.dialogOpen() && document.querySelector('.gal-sheet')) { PH.ui.closeTopDialog(); build(knownPhoto); }
    });
  }

  function build(hasPhoto) {
    var entry;
    var list = choices(hasPhoto);
    var start = Math.max(0, list.findIndex(isCurrent));
    var cards = list.map(function (ch, i) {
      var el = h('div', {
        class: 'gal-card' + (isCurrent(ch) ? ' is-current' : ''),
        'data-key': 'gal:' + ch.bg + (ch.id ? ':' + ch.id : ''), 'data-group': 'gallery', 'data-hint': 'gallery'
      }, [thumb(ch), h('div', { class: 'gal-label' }, (isFavourite(ch) ? '★ ' : '') + ch.label), h('div', { class: 'gal-sub' }, isCurrent(ch) ? 'Current' : ch.sub)]);
      el._onFocus = function () {
        if (ch.bg === 'photo' && !hasPhoto) return;
        PH.backdrop.setPreview({ background: ch.bg, scenicId: ch.id });
      };
      el._activate = function () {
        if (ch.bg === 'photo' && !hasPhoto) {
          entry.close();
          PH.backdrop.setPreview(null);
          pickPhoto();
          return;
        }
        apply(ch, entry);
      };
      if (ch.bg === 'scenic') {
        el._options = function () {
          var fav = isFavourite(ch);
          PH.ui.menu({ title: ch.label, message: 'Favourites can be the only wallpapers daily rotation uses (Settings › Wallpaper & theme › Daily from).', items: [
            { label: 'Use this wallpaper', onSelect: function () { apply(ch, entry); } },
            { label: fav ? 'Remove from favourites' : 'Add to favourites', onSelect: function () {
              PH.app.update(function (c) {
                var ids = c.wallpaper.favoriteIds.filter(function (x) { return x !== ch.id; });
                if (!fav) ids.push(ch.id);
                c.wallpaper.favoriteIds = ids;
                return c;
              });
              el.querySelector('.gal-label').textContent = (fav ? '' : '★ ') + ch.label;
              PH.ui.toast(fav ? ch.label + ' removed from favourites' : ch.label + ' added to favourites');
            } }
          ] });
        };
      }
      if (ch.bg === 'photo' && hasPhoto) {
        el._options = function () {
          PH.ui.menu({ title: 'My photo', items: [
            { label: 'Use my photo', onSelect: function () { apply(ch, entry); } },
            { label: 'Replace with another picture', onSelect: function () { entry.close(); PH.backdrop.setPreview(null); pickPhoto(); } },
            { label: 'Remove my photo', danger: true, onSelect: function () { entry.close(); PH.backdrop.setPreview(null); removePhoto(); } }
          ] });
        };
      }
      return el;
    });
    var row = h('div', { class: 'row gal-row', 'data-scroll': 'x' }, h('div', { class: 'track' }, cards));
    var sheet = h('div', { class: 'gal-sheet glass', role: 'dialog', 'aria-label': 'Wallpaper' }, [
      h('div', { class: 'gal-head' }, [
        h('h2', { class: 'dialog-title' }, 'Wallpaper'),
        h('div', { class: 'gal-note' }, 'Licensed landscape photos, original artwork and your own photo, all stored on this TV. Nothing is downloaded.')
      ]),
      row
    ]);
    var L = PH.platform.label;
    entry = PH.ui.layer(h('div', { class: 'dialog-backdrop gal-backdrop' }, sheet), {
      focusIndex: start,
      onCancel: function () { PH.backdrop.setPreview(null); },
      hints: [['◀ ▶', 'Preview'], [L('enter'), 'Apply'], [L('options'), 'Favourite'], [L('back'), 'Cancel']]
    });
  }

  PH.gallery = { open: open, pickPhoto: pickPhoto, removePhoto: removePhoto };
})(window.PH = window.PH || {});
