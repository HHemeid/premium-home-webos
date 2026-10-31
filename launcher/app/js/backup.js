/*
 * Export and restore of Premium Home's own configuration (layout + preferences).
 * This is not a TV settings backup and not a firmware backup.
 * Saving files from a webOS app is untested, so export is limited to the Mac preview.
 */
(function (PH) {
  'use strict';

  function fileName(d) { return 'premium-home-config-' + d.toISOString().slice(0, 10) + '.json'; }

  function exportConfig() {
    if (PH.platform.isWebOS) {
      PH.ui.menu({
        title: 'Export not available on the TV yet',
        message: 'Saving a file from a webOS app has not been tested. Export from the Mac preview for now.',
        items: [{ label: 'OK' }]
      });
      return;
    }
    var now = new Date();
    var doc = PH.config.exportDoc(PH.state.config, now);
    var blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = PH.h('a', { href: url, download: fileName(now) });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    PH.ui.toast('Exported ' + fileName(now));
  }

  function importConfig() {
    var input = document.getElementById('import-file');
    input.value = '';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { applyText(String(reader.result)); };
      reader.onerror = function () { report('Could not read that file.'); };
      reader.readAsText(file);
    };
    input.click();
  }

  function report(message) {
    PH.ui.menu({ title: 'Restore failed', message: message + '\nNothing was changed.', items: [{ label: 'OK' }] });
  }

  // Validates first, shows a summary, and changes nothing unless confirmed.
  function applyText(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { report('The file is not valid JSON.'); return; }
    var r = PH.config.validate(parsed);
    if (!r.ok) { report(r.error); return; }

    var lines = [r.config.shortcuts.length + ' shortcuts, ' + r.config.favorites.length + ' on Home.'];
    if (typeof parsed.exportedAt === 'string') lines.push('Exported ' + new Date(parsed.exportedAt).toLocaleString());
    if (r.warnings.length) {
      lines.push('');
      lines.push(r.warnings.length + ' item(s) will be skipped:');
      r.warnings.slice(0, 4).forEach(function (w) { lines.push('• ' + w); });
    }
    PH.ui.confirm({ title: 'Replace the current setup?', message: lines.join('\n'), confirmLabel: 'Restore', danger: false })
      .then(function (ok) {
        if (!ok) return;
        PH.app.update(function () { return r.config; });
        PH.ui.toast('Configuration restored');
      });
  }

  PH.backup = { exportConfig: exportConfig, importConfig: importConfig, applyText: applyText };
})(window.PH = window.PH || {});
