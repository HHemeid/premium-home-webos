// Boot service (service.js) under fakes; adapted from upstream tests/helper-runtime.js checkService.
'use strict';
const assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm'), path = require('path');
const SVC = path.join(__dirname, '../native/service');
const APP_STATE = '/media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper/state';
let pass = 0, fail = 0;
function test(n, f) { try { f(); pass++; console.log('PASS ' + n); } catch (e) { fail++; console.log('FAIL ' + n + '\n  ' + e.stack); } }
function load(o) {
  o = o || {}; const files = new Map(o.files || []), methods = {}, calls = [], writes = [];
  let bootId = o.boot || 'boot-a';
  const sfs = {
    readFileSync(f) { if (f === '/proc/sys/kernel/random/boot_id') return bootId + '\n'; if (f === '/proc/stat') return 'cpu 1\nbtime 123\n';
      if (files.has(f)) return files.get(f); const e = Error('absent'); e.code = 'ENOENT'; throw e; },
    writeFileSync(f, s) { writes.push(f); files.set(f, s); }, renameSync(a, b) { writes.push(b); files.set(b, files.get(a)); files.delete(a); },
    statSync(f) { if (files.has(f)) return {}; const e = Error('absent'); e.code = 'ENOENT'; throw e; } };
  function S(name) { this.name = name; S.last = name; this.register = (n, fn) => { methods[n] = fn; };
    this.call = (uri, p, cb) => { calls.push({ uri, p: JSON.parse(JSON.stringify(p)) }); cb({ payload: { returnValue: true } }); };
    this.activityManager = { complete(a, opt, cb) { calls.push({ complete: true }); cb({}); } }; }
  vm.runInNewContext(fs.readFileSync(path.join(SVC, 'service.js'), 'utf8'), { __dirname: SVC, JSON, Date, require(n) {
    if (n === 'fs') return sfs; if (n === 'webos-service') return S; if (n === './boot-state') return require(path.join(SVC, 'boot-state.js')); throw Error(n); } });
  const call = (m, payload) => { let r; methods[m]({ payload: payload || {}, activity: payload && payload.$activity ? {} : undefined, respond: x => { r = JSON.parse(JSON.stringify(x)); } }); return r; };
  return { files, methods, calls, writes, call, S, setBoot: b => { bootId = b; } };
}
test('service registers as com.local.premiumhome.homehelper.service with status/enable/disable/tick only', () => {
  const s = load(); assert.equal(s.S.last, 'com.local.premiumhome.homehelper.service');
  assert.deepEqual(Object.keys(s.methods).sort(), ['disable', 'enable', 'status', 'tick']);
});
test('tick launches the helper once per boot with {nativeHomeAuto:true}; later ticks skip; new boot launches again', () => {
  const s = load(); s.call('enable');
  assert.equal(s.call('tick', { $activity: { activityId: 1 } }).result.skipped, true, 'enable records the current boot as claimed');
  s.setBoot('boot-b');
  s.call('tick', { $activity: { activityId: 1 } });
  const launches = s.calls.filter(c => c.uri === 'luna://com.webos.applicationManager/launch');
  assert.deepEqual(launches.map(c => c.p), [{ id: 'com.local.premiumhome.homehelper', params: { nativeHomeAuto: true } }]);
  assert.equal(s.call('tick', { $activity: { activityId: 1 } }).result.skipped, true);
  assert.equal(s.calls.filter(c => c.uri && c.uri.endsWith('/launch')).length, 1);
});
test('tick does nothing while the emergency-stop latch exists', () => {
  const s = load({ files: [[APP_STATE + '/blocked', 'stopped']] }); s.call('enable'); s.setBoot('boot-z');
  assert.equal(s.call('tick', {}).result.blocked, true); assert.equal(s.calls.filter(c => c.uri && c.uri.endsWith('/launch')).length, 0);
});
test('owner revert switch: tick does nothing while the disable latch exists, and status reports it', () => {
  const s = load({ files: [[APP_STATE + '/disabled', '1']] }); s.call('enable'); s.setBoot('boot-d');
  assert.equal(s.call('tick', {}).result.disabled, true);
  assert.equal(s.calls.filter(c => c.uri && c.uri.endsWith('/launch')).length, 0);
  assert.equal(s.call('status').disabled, true);
});
test('disable cancels the boot activity by its new name', () => {
  const s = load(); s.call('disable');
  assert.deepEqual(s.calls.find(c => c.uri === 'luna://com.palm.activitymanager/cancel').p, { activityName: 'com.local.premiumhome.homehelper.boot' });
});
test('status reports running only for the real controller cmdline; no /tmp writes anywhere', () => {
  const s = load({ files: [[APP_STATE + '/controller.pid', '123'], ['/proc/123/cmdline', 'node\0/media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper/native.js\0{}\0']] });
  const st = s.call('status'); assert.equal(st.running, true); assert.equal(st.blocked, false);
  s.files.set('/proc/123/cmdline', 'node\0/other/native.js\0'); assert.equal(s.call('status').running, false);
  s.call('enable'); s.setBoot('x'); s.call('tick', { $activity: {} });
  for (const w of s.writes) { assert(!w.startsWith('/tmp'), w); assert(w.startsWith(SVC + '/state/'), w); }
});
console.log(`service: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
