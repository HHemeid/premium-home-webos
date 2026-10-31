// helper-entry.js (SAM entry) under fakes; adapted from upstream tests/helper-entry.cjs.
'use strict';
const assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm'), path = require('path');
const APP = path.join(__dirname, '../native/app');
const ROOT = '/media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper';
let pass = 0, fail = 0;
function test(n, f) { try { f(); pass++; console.log('PASS ' + n); } catch (e) { fail++; console.log('FAIL ' + n + '\n  ' + e.stack); } }
function run(params, detachExit, disabled) {
  const calls = [], spawns = []; let exit, unref = false, onExit;
  const config = require(path.join(APP, 'config.js'));
  const context = { JSON, require(name) {
    if (name === './config') return config;
    if (name === 'fs') return { existsSync: p => !!disabled && p === config.disabled };
    if (name === 'child_process') return {
      execFile: (file, args, options, cb) => { assert.equal(file, '/usr/bin/luna-send-pub'); assert.equal(options.timeout, 5000); calls.push({ uri: args[2], p: JSON.parse(args[3]) }); cb(null); },
      spawn: (file, args, o) => { spawns.push({ file, args: JSON.parse(JSON.stringify(args)), o: JSON.parse(JSON.stringify(o)) }); return { unref() { unref = true; }, on(ev, f) { if (ev === 'exit') onExit = f; } }; } };
    if (name === '/usr/lib/node_modules/webos-service') throw Error('entry must not register an LS2 name');
    throw Error(name); },
    process: { argv: ['node', 'entry', typeof params === 'string' ? params : JSON.stringify(params)], exit: c => { exit = c; } } };
  vm.runInNewContext(fs.readFileSync(path.join(APP, 'helper-entry.js'), 'utf8'), context);
  if (onExit && detachExit !== undefined) onExit(detachExit);
  return { calls, spawns, exit, unref };
}
test('boot tick {nativeHomeAuto:true}: spawns detach --controller (auto), detached, no Luna call', () => {
  const r = run({ nativeHomeAuto: true });
  assert.equal(r.spawns.length, 1); assert.equal(r.spawns[0].file, ROOT + '/detach');
  assert.deepEqual(r.spawns[0].args, ['{"nativeHomeAuto":true}', '--controller']);
  assert.equal(r.spawns[0].o.detached, true); assert.equal(r.unref, true); assert.equal(r.calls.length, 0);
});
test('tile tap {}: manual controller start; nothing else when controller started (detach exit 0)', () => {
  const r = run({}, 0);
  assert.deepEqual(r.spawns[0].args, ['{"nativeHomeAuto":false}', '--controller']); assert.equal(r.calls.length, 0); assert.equal(r.exit, 0);
});
test('tile tap while controller already running (detach exit 4): opens Premium Home with {premiumHome:"start"}', () => {
  const r = run({}, 4);
  assert.deepEqual(r.calls, [{ uri: 'luna://com.webos.applicationManager/launch', p: { id: 'local.lgc4.premiumhome', params: { premiumHome: 'start' } } }]);
  assert.equal(r.exit, 0);
});
test('non-boolean nativeHomeAuto and invalid JSON are treated as a manual start, never auto', () => {
  assert.equal(JSON.parse(run({ nativeHomeAuto: 'true' }, 0).spawns[0].args[0]).nativeHomeAuto, false);
  assert.equal(JSON.parse(run('not json', 0).spawns[0].args[0]).nativeHomeAuto, false);
});
test('upstream {showHelper:true} relaunch is gone (would toggle Ambient)', () => {
  for (const p of [{}, { nativeHomeStart: true }]) for (const code of [0, 4]) assert(!JSON.stringify(run(p, code).calls).includes('showHelper'));
});
test('owner revert switch: disable latch set + boot tick -> nothing spawned, no Luna call, exit 0', () => {
  const r = run({ nativeHomeAuto: true }, undefined, true);
  assert.equal(r.spawns.length, 0, 'controller must not be started while disabled');
  assert.equal(r.calls.length, 0); assert.equal(r.exit, 0);
});
test('owner revert switch: disable latch set + tile tap -> opens Premium Home, never starts the controller', () => {
  const r = run({}, undefined, true);
  assert.equal(r.spawns.length, 0, 'tile tap must not start the controller while disabled');
  assert.deepEqual(r.calls, [{ uri: 'luna://com.webos.applicationManager/launch', p: { id: 'local.lgc4.premiumhome', params: { premiumHome: 'start' } } }]);
  assert.equal(r.exit, 0);
});
console.log(`helper-entry: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
