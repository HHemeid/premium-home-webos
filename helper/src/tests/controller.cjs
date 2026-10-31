// Controller (native.js) behaviour under the fake-TV harness. Each case prints PASS/FAIL.
'use strict';
const assert = require('node:assert/strict');
const { createTV, STATE } = require('./fake-tv.cjs');
const TARGET = 'local.lgc4.premiumhome';
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + (e && e.stack || e)); }
}
function booted(opts) { const tv = createTV(opts).run(); tv.advance(0); tv.emit('READY'); return tv; }
const nonP = tv => tv.commands.filter(c => c !== 'P');

test('boot start: first launch is target with {premiumHome:"start"}, relay spawned only after success', () => {
  const tv = createTV().run();
  assert.equal(tv.serviceName, 'com.local.premiumhome.homehelper');
  assert.equal(tv.spawns.length, 0, 'relay must not start before target launch reply');
  tv.advance(0);
  assert.deepEqual(tv.launches()[0], { id: TARGET, params: { premiumHome: 'start' } });
  assert.equal(tv.spawns.length, 1);
  assert.match(tv.spawns[0].file, /com\.local\.premiumhome\.homehelper\/relay$/);
});
test('manual (tile) start waits 1 s, clears the emergency-stop latch, launches with premiumHome:start', () => {
  const tv = createTV({ params: {}, blocked: true }).run();
  assert(!tv.files.has(STATE + '/blocked'));
  tv.advance(999); assert.equal(tv.launches().length, 0);
  tv.advance(1); assert.deepEqual(tv.launches()[0], { id: TARGET, params: { premiumHome: 'start' } });
});
test('automatic start with latch present exits 0 without launching or grabbing', () => {
  const tv = createTV({ blocked: true }).run();
  assert.equal(tv.exitCode, 0); assert.equal(tv.calls.length, 0); assert.equal(tv.spawns.length, 0);
});
test('owner revert switch: disable latch stops the controller arming (boot start exits 0, no relay)', () => {
  const tv = createTV({ disabled: true }).run();
  assert.equal(tv.exitCode, 0); assert.equal(tv.calls.length, 0); assert.equal(tv.spawns.length, 0);
  assert(tv.files.has(STATE + '/disabled'), 'disable latch is not removed by the controller');
});
test('owner revert switch: disable latch stops a MANUAL (tile) start too, and is NOT cleared', () => {
  const tv = createTV({ params: {}, disabled: true }).run();
  assert.equal(tv.exitCode, 0); assert.equal(tv.spawns.length, 0);
  assert(tv.files.has(STATE + '/disabled'), 'a tile start must not clear the disable latch');
});
test('guard liveness beat: a changing "<pid> <ms>" token is rewritten inside state/ every heartbeat', () => {
  const tv = booted(); tv.advance(400);
  const first = tv.files.get(STATE + '/relay.beat');
  assert(/^\d+ \d+$/.test(first.trim()), 'beat is "<pid> <ms>" ' + JSON.stringify(first));
  tv.advance(400);
  const second = tv.files.get(STATE + '/relay.beat');
  assert(first !== second, 'token must change each tick so the guard measures staleness by its own clock');
});
test('filter Home->launch: HOME line launches target with no params (so a relaunch can toggle Ambient)', () => {
  const tv = booted(); tv.advance(2000);
  tv.emit('HOME');
  assert.deepEqual(tv.launches().at(-1), { id: TARGET });
  assert.equal(tv.ended, 0, 'successful launch keeps relay running');
});
test('duplicate Home during in-flight launch is suppressed (one launch)', () => {
  const tv = booted(); tv.advance(2000); tv.launchMode = 'hang';
  tv.emit('HOME'); tv.advance(1000); tv.emit('HOME'); tv.advance(500); tv.emit('HOME');
  assert.equal(tv.launches().length, 2, 'boot + exactly one Home launch');
  assert.equal(tv.logs.filter(l => l.event === 'home-suppressed' && l.reason === 'in-flight').length, 2);
  tv.answer(); tv.advance(2000); tv.launchMode = 'ok'; tv.emit('HOME');
  assert.equal(tv.launches().length, 3, 'next Home after reply launches again');
});
test('burst suppression: Home presses <800 ms apart are one launch; a later press launches again', () => {
  const tv = booted(); tv.advance(2000);
  tv.emit('HOME'); tv.advance(300); tv.emit('HOME'); tv.advance(400); tv.emit('HOME');
  assert.equal(tv.launches().length, 2, 'boot + one');
  tv.advance(900); tv.emit('HOME');
  assert.equal(tv.launches().length, 3);
  tv.advance(799); tv.emit('HOME'); assert.equal(tv.launches().length, 3, '799 ms is still a burst');
  tv.advance(800); tv.emit('HOME'); assert.equal(tv.launches().length, 4, '800 ms is a new press');
});
test('triple-Home stop: 3 HOME + relay exit 27 -> one launch, latch written, cleanup run, controller exits 27', () => {
  const tv = booted(); tv.advance(2000);
  tv.emit('HOME'); tv.advance(300); tv.emit('HOME'); tv.advance(300); tv.emit('HOME');
  tv.exitWorker(27); tv.advance(0);
  assert.equal(tv.launches().length, 2, 'boot + one launch for the whole triple press');
  assert.equal(tv.files.get(STATE + '/blocked'), 'stopped');
  assert.deepEqual(tv.spawns.at(-1).args, ['cleanup']);
  assert.equal(tv.exitCode, 27);
  assert(!tv.files.has(STATE + '/controller.pid'));
});
test('device HUP (standby, exit 25) stops without the latch', () => {
  const tv = booted(); tv.exitWorker(25); tv.advance(0);
  assert(!tv.files.has(STATE + '/blocked')); assert.equal(tv.exitCode, 25);
});
test('launch timeout: Home launch without reply for 3 s ends relay stdin (fail-open)', () => {
  const tv = booted(); tv.advance(2000); tv.launchMode = 'hang'; tv.emit('HOME');
  tv.advance(2999); assert.equal(tv.ended, 0);
  tv.advance(1); assert.equal(tv.ended, 1);
  assert(tv.logs.some(l => l.event === 'launch-timeout' && l.id === TARGET));
});
test('Home launch failure (target removed later) ends relay stdin', () => {
  const tv = booted(); tv.advance(2000); tv.launchMode = 'missing'; tv.emit('HOME');
  assert.equal(tv.ended, 1); assert(tv.logs.some(l => l.event === 'home-launch-failed-stopping'));
});
test('missing target app at start: latch + exit 3, relay never spawned', () => {
  const tv = createTV({ launchMode: 'missing' }).run(); tv.advance(0);
  assert.equal(tv.exitCode, 3); assert.equal(tv.spawns.length, 0);
  assert.equal(tv.files.get(STATE + '/blocked'), 'stopped');
  assert(tv.logs.some(l => l.event === 'target-launch-failed'));
});
test('start launch timeout: exit 3 after 3 s, relay never spawned', () => {
  const tv = createTV({ launchMode: 'hang' }).run(); tv.advance(2999); assert.equal(tv.exitCode, undefined);
  tv.advance(1); assert.equal(tv.exitCode, 3); assert.equal(tv.spawns.length, 0);
});
test('bootstrap failure (webos-service missing): latch, exit 2 after 2.5 s, relay never spawned', () => {
  const tv = createTV({ noService: true }).run();
  assert.equal(tv.files.get(STATE + '/blocked'), 'stopped');
  tv.advance(2500); assert.equal(tv.exitCode, 2); assert.equal(tv.spawns.length, 0);
});
test('heartbeat P every 400 ms; watchdog SIGKILLs a relay silent for >2.5 s', () => {
  const tv = booted();
  tv.advance(4000); assert.equal(tv.commands.filter(c => c === 'P').length, 10); assert.equal(tv.kills.length, 0, 'acking relay is never killed');
  tv.stalled = true; // relay SIGSTOPped: no more acks after t=4000
  tv.advance(2400); assert.equal(tv.kills.length, 0, '2.4 s silence tolerated');
  tv.advance(400); assert.deepEqual(tv.kills, ['SIGKILL'], 'killed at 2.8 s silence (first tick after 2.5 s)');
  tv.exitWorker(null, 'SIGKILL'); tv.advance(0);
  assert.equal(tv.files.get(STATE + '/blocked'), 'stopped'); assert.deepEqual(tv.spawns.at(-1).args, ['cleanup']);
  assert.equal(tv.exitCode, 0);
});
test('long Back: LGHOME opens LG Home once and does not stop the relay', () => {
  const tv = booted(); tv.advance(2000); tv.emit('LGHOME');
  assert.deepEqual(tv.launches().at(-1), { id: 'com.webos.app.home' }); assert.equal(tv.ended, 0);
});
test('long Back disabled by config: LGHOME ignored', () => {
  const tv = booted({ config: { longBackOpensLGHome: false } }); tv.advance(2000); tv.emit('LGHOME');
  assert.equal(tv.launches().length, 1);
});
test('Back down/up lines are only logged (Back itself is forwarded by the relay)', () => {
  const tv = booted(); tv.advance(2000); tv.emit('BACK_DOWN'); tv.emit('BACK_UP');
  assert.equal(tv.launches().length, 1); assert.equal(tv.ended, 0);
});
test('package removed (appinfo.json gone): relay told to quit within one heartbeat', () => {
  const tv = booted(); tv.files.delete(tv.ROOT + '/appinfo.json'); tv.advance(400);
  assert.deepEqual(nonP(tv), ['Q']); assert(tv.logs.some(l => l.event === 'package-removed'));
});
test('SIGTERM: graceful Q, then SIGKILL fallback after 2 s', () => {
  const tv = booted(); tv.handlers.SIGTERM(); assert.deepEqual(nonP(tv), ['Q']);
  tv.advance(2000); assert.deepEqual(tv.kills, ['SIGKILL']);
});
test('uncaught exception: latch, relay stdin ended, exit 2', () => {
  const tv = booted(); try { tv.handlers.uncaughtException(new Error('boom')); } catch (e) { if (!(e instanceof tv.Exit)) throw e; }
  assert.equal(tv.files.get(STATE + '/blocked'), 'stopped'); assert.equal(tv.ended, 1);
  tv.advance(2500); assert.equal(tv.exitCode, 2);
});
test('boot activity armed once: status -> enable -> activitymanager/create for the new ids', () => {
  const tv = booted();
  const create = tv.calls.find(c => c.uri === 'luna://com.palm.activitymanager/create');
  assert(create, 'activity created');
  assert.equal(create.p.activity.name, 'com.local.premiumhome.homehelper.boot');
  assert.equal(create.p.activity.callback.method, 'luna://com.local.premiumhome.homehelper.service/tick');
  const armed = booted({ armed: true });
  assert(!armed.calls.some(c => c.uri === 'luna://com.palm.activitymanager/create'), 'already armed: no re-create');
});
test('only new ids are ever launched; no showHelper, no SSAP, all writes inside state dir', () => {
  const tv = booted(); tv.advance(2000); tv.emit('HOME'); tv.advance(1000); tv.emit('LGHOME'); tv.advance(4000);
  for (const p of tv.launches()) assert(['local.lgc4.premiumhome', 'com.webos.app.home'].includes(p.id), p.id);
  assert(!JSON.stringify(tv.calls).includes('showHelper'));
  assert(!JSON.stringify(tv.calls).includes('gathin'));
  assert(!tv.calls.some(c => /ssap|3001|com\.webos\.service\.tv/.test(c.uri)));
  for (const w of tv.writes) assert(w.startsWith(STATE + '/'), w);
});
console.log(`controller: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
