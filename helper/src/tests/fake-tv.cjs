// Fake-TV harness for the controller (adapted from upstream tests/controller-home.cjs
// and tests/helper-runtime.js): runs the real native.js in a vm context where only
// Luna (webos-service), the relay child process, fs and timers are substituted.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), EventEmitter = require('events');
const APP = path.join(__dirname, '../native/app');
const ROOT = '/media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper';
const STATE = ROOT + '/state';

function createTV(opts) {
  opts = opts || {};
  const tv = { now: 0, timers: [], seq: 0, files: new Map(), calls: [], pending: [], spawns: [], workers: [],
    commands: [], exitCode: undefined, handlers: {}, logs: [], kills: [], ended: 0, launchMode: opts.launchMode || 'ok',
    writes: [] };
  if (opts.blocked) tv.files.set(STATE + '/blocked', 'stopped');
  if (opts.disabled) tv.files.set(STATE + '/disabled', '1');
  tv.files.set(ROOT + '/appinfo.json', '{}');
  class Exit extends Error {}
  tv.Exit = Exit;
  const timer = (fn, ms, repeat) => { const t = { id: ++tv.seq, fn, ms: ms || 0, due: tv.now + (ms || 0), repeat }; tv.timers.push(t); return t.id; };
  const clear = id => { tv.timers = tv.timers.filter(t => t.id !== id); };
  tv.advance = function (ms) {
    const end = tv.now + ms;
    for (;;) {
      tv.timers.sort((a, b) => a.due - b.due || a.id - b.id);
      const t = tv.timers[0];
      if (!t || t.due > end) break;
      tv.now = t.due;
      if (t.repeat) t.due += t.ms; else clear(t.id);
      try { t.fn(); } catch (e) { if (!(e instanceof Exit)) throw e; }
      if (tv.exitCode !== undefined) break;
    }
    if (tv.exitCode === undefined) tv.now = end;
  };
  const fakefs = {
    existsSync: p => tv.files.has(p),
    writeFileSync: (p, s) => { tv.writes.push(p); tv.files.set(p, String(s)); },
    appendFileSync: (p, s) => { tv.writes.push(p); tv.files.set(p, (tv.files.get(p) || '') + s); String(s).split('\n').filter(Boolean).forEach(l => tv.logs.push(JSON.parse(l))); },
    unlinkSync: p => { if (!tv.files.has(p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } tv.files.delete(p); },
    renameSync: (a, b) => { tv.writes.push(b); tv.files.set(b, tv.files.get(a)); tv.files.delete(a); },
    readFileSync: p => { if (tv.files.has(p)) return tv.files.get(p); const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
  };
  function reply(p) {
    if (tv.launchMode === 'ok') return { returnValue: true, processId: '1001' };
    if (tv.launchMode === 'missing') return { returnValue: false, errorCode: -101, errorText: '"' + p.id + '" was not found OR Unsupported Application Type' };
    return null; // hang
  }
  function Service(name) {
    tv.serviceName = name;
    this.activityManager = { create() {} };
    this.call = (uri, p, cb) => {
      tv.calls.push({ uri, p: JSON.parse(JSON.stringify(p)) });
      if (uri === 'luna://com.webos.applicationManager/launch') {
        const r = reply(p);
        if (r) cb({ payload: r }); else tv.pending.push({ p, cb });
        return;
      }
      if (uri.endsWith('/status')) return cb({ payload: { returnValue: true, state: { enabled: !!opts.armed, schema: opts.armed ? 3 : undefined } } });
      cb({ payload: { returnValue: true } });
    };
  }
  const cpFake = {
    spawn(file, args) {
      tv.spawns.push({ file, args: JSON.parse(JSON.stringify(args)) }); // copy out of the vm realm
      const w = new EventEmitter();
      w.pid = 4000 + tv.spawns.length;
      w.stdout = new EventEmitter(); w.stderr = new EventEmitter(); w.stdin = new EventEmitter();
      // A healthy relay answers every heartbeat; tv.stalled simulates SIGSTOP.
      w.stdin.write = c => { tv.commands.push(c); if (c === 'P' && !tv.stalled && args[0] !== 'cleanup') w.stdout.emit('data', Buffer.from('P\n')); };
      w.stdin.end = () => { tv.ended++; };
      w.kill = s => { tv.kills.push(s); };
      if (args[0] !== 'cleanup') tv.workers.push(w);
      else timer(() => w.emit('exit', 0), 0, false);
      return w;
    }
  };
  const config = Object.assign({}, require(path.join(APP, 'config.js')), opts.config || {});
  const context = {
    console: { error() {} },
    require(n) {
      if (n === 'fs') return fakefs;
      if (n === 'child_process') return cpFake;
      if (n === '/usr/lib/node_modules/webos-service') { if (opts.noService) throw new Error("Cannot find module '/usr/lib/node_modules/webos-service'"); return Service; }
      if (n === './config') return config;
      if (n === './runtime-policy') return require(path.join(APP, 'runtime-policy.js'));
      throw new Error('unexpected require ' + n);
    },
    process: {
      argv: ['node', ROOT + '/native.js', JSON.stringify(opts.params || { nativeHomeAuto: true })], pid: 777,
      getuid: () => 5431, hrtime: () => [Math.floor(tv.now / 1000), (tv.now % 1000) * 1e6],
      on(n, f) { tv.handlers[n] = f; },
      exit(c) { tv.exitCode = c; if (tv.handlers.exit) tv.handlers.exit(c); throw new Exit('exit ' + c); }
    },
    setTimeout: (fn, ms) => timer(fn, ms, false), clearTimeout: clear,
    setInterval: (fn, ms) => timer(fn, ms, true), clearInterval: clear, Date, JSON, Math, Object, String, Infinity
  };
  tv.config = config;
  tv.run = function () {
    try { vm.runInNewContext(fs.readFileSync(path.join(APP, 'native.js'), 'utf8'), context, { filename: 'native.js' }); }
    catch (e) { if (!(e instanceof Exit)) { if (tv.handlers.uncaughtException) { try { tv.handlers.uncaughtException(e); } catch (x) { if (!(x instanceof Exit)) throw x; } } else throw e; } }
    return tv;
  };
  tv.worker = () => tv.workers[tv.workers.length - 1];
  tv.emit = line => { try { tv.worker().stdout.emit('data', Buffer.from(line + '\n')); } catch (e) { if (!(e instanceof Exit)) throw e; } };
  tv.exitWorker = (code, signal) => { try { tv.worker().emit('exit', code, signal || null); } catch (e) { if (!(e instanceof Exit)) throw e; } };
  tv.launches = () => tv.calls.filter(c => c.uri === 'luna://com.webos.applicationManager/launch').map(c => JSON.parse(JSON.stringify(c.p)));
  tv.answer = r => { const x = tv.pending.shift(); try { x.cb({ payload: r || { returnValue: true } }); } catch (e) { if (!(e instanceof Exit)) throw e; } };
  tv.ROOT = ROOT; tv.STATE = STATE;
  return tv;
}
module.exports = { createTV, ROOT, STATE };
