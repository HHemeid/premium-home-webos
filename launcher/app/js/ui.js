/* Dialogs (menus, confirmations, text prompts, custom layers), toasts, and the remote-button hint bar. */
(function (PH) {
  'use strict';

  var h = PH.h;
  var stack = []; // open dialogs, topmost last
  var toastTimer = null;

  // Pushes a full-screen layer (element with its own focusables) onto the dialog stack. Back or a
  // click on the backdrop cancels it. opts: { focusIndex, onCancel, hints: [[cap, label]] }.
  function layer(backdrop, opts) {
    opts = opts || {};
    var entry = { hints: opts.hints };
    backdrop._backdrop = true;
    document.getElementById('layer-dialog').appendChild(backdrop);

    function close() {
      if (!backdrop.parentNode) return;
      backdrop.parentNode.removeChild(backdrop);
      stack.splice(stack.indexOf(entry), 1);
      PH.focus.popScope();
      updateHints();
    }
    entry.el = backdrop;
    entry.close = close;
    entry.cancel = function () { close(); if (opts.onCancel) opts.onCancel(); };
    stack.push(entry);
    PH.focus.pushScope(backdrop, opts.focusIndex || 0);
    updateHints();
    return entry;
  }

  // items: [{ label, sub?, swatch?, danger?, onSelect? }]
  function menu(opts) {
    var entry;
    var items = opts.items.map(function (it, i) {
      var el = h('div', { class: 'dialog-item' + (it.danger ? ' danger' : ''), 'data-key': 'dlg' + stack.length + ':' + i, 'data-group': 'dialog', 'data-hint': 'dialog' }, [
        it.swatch ? h('span', { class: 'swatch', style: 'background:' + it.swatch }) : null,
        h('span', { class: 'dialog-label' }, it.label),
        it.sub ? h('span', { class: 'dialog-sub' }, it.sub) : null
      ]);
      el._activate = function () { entry.close(); if (it.onSelect) it.onSelect(); };
      return el;
    });

    var scroll = h('div', { class: 'dialog-scroll', 'data-scroll': 'y' }, h('div', { class: 'dialog-list' }, items));
    var backdrop = h('div', { class: 'dialog-backdrop' }, h('div', { class: 'dialog glass' + (opts.wide ? ' dialog-wide' : ''), role: 'dialog', 'aria-label': opts.title }, [
      h('h2', { class: 'dialog-title' }, opts.title),
      opts.message ? h('p', { class: 'dialog-msg' }, opts.message) : null,
      opts.body || null, // optional rich content (non-focusable), e.g. weather details
      scroll
    ]));
    entry = layer(backdrop, { focusIndex: opts.focusIndex, onCancel: opts.onCancel });
    return entry;
  }

  // One-line text entry. On the TV, focusing the field brings up webOS's on-screen keyboard.
  // Resolves the cleaned text, or null when cancelled.
  function prompt(opts) {
    return new Promise(function (resolve) {
      var entry, done = false;
      var input = h('input', { class: 'prompt-input', type: 'text', maxlength: String(opts.maxLength || 60), placeholder: opts.placeholder || '', spellcheck: 'false', autocomplete: 'off' });
      input.value = opts.value || '';
      var field = h('div', { class: 'dialog-item prompt-field', 'data-key': 'prompt:field', 'data-group': 'dialog', 'data-hint': 'input' }, input);
      field._activate = function () { input.focus(); };
      function finish(value) { if (done) return; done = true; entry.close(); resolve(value); }
      var save = h('div', { class: 'dialog-item', 'data-key': 'prompt:save', 'data-group': 'dialog', 'data-hint': 'dialog' }, h('span', { class: 'dialog-label' }, opts.confirmLabel || 'Save'));
      save._activate = function () { finish(PH.cleanLabel(input.value, opts.maxLength || 60)); };
      var cancel = h('div', { class: 'dialog-item', 'data-key': 'prompt:cancel', 'data-group': 'dialog', 'data-hint': 'dialog' }, h('span', { class: 'dialog-label' }, 'Cancel'));
      cancel._activate = function () { finish(null); };
      var backdrop = h('div', { class: 'dialog-backdrop' }, h('div', { class: 'dialog glass', role: 'dialog', 'aria-label': opts.title }, [
        h('h2', { class: 'dialog-title' }, opts.title),
        opts.message ? h('p', { class: 'dialog-msg' }, opts.message) : null,
        h('div', { class: 'dialog-list' }, [field, h('div', { class: 'prompt-actions' }, [save, cancel])])
      ]));
      entry = layer(backdrop, { onCancel: function () { if (!done) { done = true; resolve(null); } } });
    });
  }

  // Resolves true/false. Focus starts on Cancel so a stray OK never confirms.
  function confirm(opts) {
    return new Promise(function (resolve) {
      menu({
        title: opts.title,
        message: opts.message,
        focusIndex: 1,
        items: [
          { label: opts.confirmLabel || 'Confirm', danger: opts.danger !== false, onSelect: function () { resolve(true); } },
          { label: 'Cancel', onSelect: function () { resolve(false); } }
        ],
        onCancel: function () { resolve(false); }
      });
    });
  }

  function closeTopDialog() {
    if (!stack.length) return false;
    stack[stack.length - 1].cancel();
    return true;
  }

  function toast(text) {
    var el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-shown'); }, 2600);
  }

  function updateHints() {
    var bar = document.getElementById('hintbar');
    if (!bar || !PH.state) return;
    var s = PH.state, L = PH.platform.label;
    var el = PH.focus.current();
    var type = el ? el.getAttribute('data-hint') : '';
    var hints;

    if (s.overlay) hints = [[L('enter'), 'Close'], [L('back'), 'Close']];
    else if (s.move) hints = [[s.move.listId === 'apps' ? '◀ ▶ ▲ ▼' : '◀ ▶', 'Move'], [L('enter'), 'Place here'], [L('back'), 'Cancel']];
    else if (stack.length && stack[stack.length - 1].hints) hints = stack[stack.length - 1].hints;
    else if (type === 'input') hints = [[L('enter'), 'Type'], ['▼', 'Save'], [L('back'), 'Cancel']];
    else if (stack.length) hints = [[document.querySelector('.dialog-wide') ? '◀ ▶' : '▲ ▼', 'Choose'], [L('enter'), 'Select'], [L('back'), 'Close']];
    else if (type === 'tile') {
      var editing = s.editMode && el.getAttribute('data-group') === 'apps';
      hints = [[L('enter'), editing ? 'Edit' : 'Open'], [L('options'), 'Options'], [L('back'), 'Back']];
    } else if (type === 'setting') hints = [[L('enter'), 'Change'], [L('back'), 'Back']];
    else if (type === 'weather') hints = [[L('enter'), 'Weather details'], [L('back'), 'Back']];
    else if (type === 'card') hints = [[L('enter'), 'Options'], [L('back'), 'Back']];
    else if (type === 'tab' && s.section === 'home') {
      hints = (s.config.appearance.ambient ? [['▲', 'Ambient view']] : []).concat([['◀ ▶', 'Sections'], [L('enter'), 'Select'], [L('back'), 'Exit']]);
    }
    else hints = [[L('enter'), 'Select'], [L('back'), 'Back']];
    // On the Home dock keep the scenic screen quiet: just Open and Quick settings, no version text.
    var dockOnly = s.section === 'home' && !stack.length && !s.overlay && !s.move && type === 'tile' && el && el.getAttribute('data-group') === 'favorites';
    if (dockOnly) hints = [[L('enter'), 'Open'], [L('options'), 'Options']];
    if (!stack.length && !s.overlay && !s.move) hints.push([L('quick'), dockOnly ? 'Settings' : PH.platform.isWebOS ? 'Quick settings, top right' : 'Quick settings']);

    PH.clear(bar);
    hints.forEach(function (pair) {
      bar.appendChild(h('div', { class: 'hint' }, [h('span', { class: 'cap' }, pair[0]), pair[1]]));
    });
    if (dockOnly) return;
    bar.appendChild(h('div', { class: 'hint-right' },
      'v' + PH.VERSION + ' · ' + (PH.platform.isWebOS ? 'webOS' : 'Mac preview · launches are previews')));
  }

  PH.ui = {
    layer: layer,
    menu: menu,
    prompt: prompt,
    confirm: confirm,
    closeTopDialog: closeTopDialog,
    dialogOpen: function () { return stack.length > 0; },
    toast: toast,
    updateHints: updateHints
  };
})(window.PH = window.PH || {});
