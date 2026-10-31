#!/usr/bin/python3 -I
"""Virtual-remote simulation for com.local.premiumhome.homehelper.

Runs INSIDE a privileged Linux container (Docker Desktop linuxkit VM kernel).
Creates two uinput devices named exactly "LGE M-RCU - Builtin [0]" and "[1]",
installs the real controller JS + arm64 relay/detach at the real TV path, and
replaces only Luna (fake webos-service / fake-luna / fake luna-send-pub).
Grab state is verified independently of the relay: a probe process tries
EVIOCGRAB on [0] (EBUSY == grabbed), a passive reader on [0] receives nothing
while grabbed, and `evtest --grab` reports the grab.

Home is KEY_HOMEPAGE (172) here because the stock kernel rejects codes above
KEY_MAX (767); the relay under test is built with -DHELPER_HOME_CODE=172.
"""
import errno, json, os, shutil, signal, subprocess, sys, time, traceback
from evdev import UInput, InputDevice, ecodes as E, AbsInfo

APP = '/media/developer/apps/usr/palm/applications/com.local.premiumhome.homehelper'
STATE = APP + '/state'
TARGET = 'local.lgc4.premiumhome'
HOME, BACK = 172, 412
SRC = os.environ.get('SIM_SRC', '/work/src')
BIN = os.environ.get('SIM_BIN', '/work/build/arm64-sim')
NOECHO_BIN = os.environ.get('SIM_NOECHO_BIN', '/work/build/arm64-sim-noecho')
KEYS = [E.KEY_UP, E.KEY_DOWN, E.KEY_LEFT, E.KEY_RIGHT, E.KEY_ENTER, E.KEY_VOLUMEUP, E.KEY_VOLUMEDOWN,
        E.KEY_MUTE, E.KEY_1, E.KEY_2, E.KEY_RED, E.KEY_GREEN, HOME, BACK, E.BTN_LEFT]
CAPS = {E.EV_KEY: KEYS, E.EV_REL: [E.REL_X, E.REL_Y, E.REL_WHEEL],
        E.EV_ABS: [(E.ABS_X, AbsInfo(0, 0, 1920, 0, 0, 0)), (E.ABS_Y, AbsInfo(0, 0, 1080, 0, 0, 0))]}
RESULTS = []
CUR = {'name': ''}


def log(*a):
    print('   ', *a, flush=True)


def check(desc, cond, detail=''):
    RESULTS.append((CUR['name'], desc, bool(cond)))
    print(('   ok   ' if cond else '   FAIL ') + desc + (('  [' + str(detail) + ']') if detail != '' else ''), flush=True)
    return cond


def wait_until(fn, timeout, step=0.01):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        if fn():
            return time.monotonic() - t0
        time.sleep(step)
    return None


# ---------- virtual remote ----------
class Remote:
    def __init__(self, caps0=CAPS, caps1=CAPS, which=(0, 1)):
        self.u = {}
        for i in which:
            self.u[i] = UInput(caps0 if i == 0 else caps1, name='LGE M-RCU - Builtin [%d]' % i, vendor=0x1d1f, product=0x0001)
        time.sleep(0.15)

    def path(self, i):
        return self.u[i].device.path

    def key(self, code, value, dev=0):
        self.u[dev].write(E.EV_KEY, code, value); self.u[dev].syn()

    def tap(self, code, hold=0.12, dev=0):
        self.key(code, 1, dev); time.sleep(hold); self.key(code, 0, dev)

    def rel(self, dx, dy):
        self.u[0].write(E.EV_REL, E.REL_X, dx); self.u[0].write(E.EV_REL, E.REL_Y, dy); self.u[0].syn()

    def abs(self, x, y):
        self.u[0].write(E.EV_ABS, E.ABS_X, x); self.u[0].write(E.EV_ABS, E.ABS_Y, y); self.u[0].syn()

    def close(self, which=None):
        for i in list(self.u) if which is None else which:
            try:
                self.u[i].close()
            except Exception:
                pass
            del self.u[i]
        time.sleep(0.15)


class Reader:
    """Passive (non-grabbing) evdev reader."""
    def __init__(self, path):
        self.d = InputDevice(path)
        self.drain()

    def drain(self):
        out = []
        while True:
            try:
                for ev in self.d.read():
                    if ev.type != E.EV_SYN:
                        out.append((ev.type, ev.code, ev.value))
            except (BlockingIOError, OSError):
                return out

    def close(self):
        try:
            self.d.close()
        except Exception:
            pass


def grabbed(path):
    """Independent probe: True if another process holds EVIOCGRAB on path."""
    d = InputDevice(path)
    try:
        d.grab()
    except OSError as ex:
        d.close()
        if ex.errno == errno.EBUSY:
            return True
        raise
    d.ungrab(); d.close()
    return False


def evtest_says_grabbed(path):
    r = subprocess.run(['timeout', '1', 'evtest', '--grab', path], capture_output=True, text=True)
    return 'grabbed by another process' in r.stdout


# ---------- helper install / control ----------
def sh(*cmd, check_rc=False):
    return subprocess.run(list(cmd), capture_output=True, text=True, check=check_rc)


def install(bin_dir=BIN):
    kill_all()
    if os.path.exists(APP):
        shutil.rmtree(APP)
    os.makedirs(STATE)
    for f in ('native.js', 'helper-entry.js', 'config.js', 'runtime-policy.js', 'appinfo.json'):
        shutil.copy(os.path.join(SRC, 'native/app', f), APP)
    for f in ('relay', 'detach', 'guard'):
        shutil.copy(os.path.join(bin_dir, f), APP); os.chmod(os.path.join(APP, f), 0o755)
    os.makedirs('/sim', exist_ok=True)
    for f in ('/sim/luna.log', '/sim/luna-send-pub.log'):
        open(f, 'w').close()
    mode('ok')


def mode(m):
    with open('/sim/launch-mode', 'w') as f:
        f.write(m)


def pgrep(pattern):
    r = sh('pgrep', '-f', pattern)
    return [int(x) for x in r.stdout.split()]


def relay_pids():
    return pgrep('^' + APP + '/relay$')


def controller_pids():
    return pgrep('node ' + APP + '/native.js')


def guard_pids():
    return pgrep('^' + APP + '/guard$')


def kill_all():
    for p in relay_pids() + controller_pids() + guard_pids() + pgrep(APP + '/helper-entry.js'):
        try:
            os.kill(p, signal.SIGCONT)   # unfreeze first so SIGKILL is reaped promptly
            os.kill(p, signal.SIGKILL)
        except ProcessLookupError:
            pass
    wait_until(lambda: not relay_pids() and not controller_pids() and not guard_pids(), 3)


def clog():
    try:
        return [json.loads(l) for l in open(STATE + '/controller.log') if l.strip()]
    except FileNotFoundError:
        return []


def luna(kind='launch'):
    out = []
    for l in open('/sim/luna.log'):
        x = json.loads(l)
        if kind == 'launch' and x['uri'] == 'luna://com.webos.applicationManager/launch':
            out.append(x['args'])
    return out


def worker_exit():
    for x in clog():
        if x.get('event') == 'worker-exit':
            return x.get('code'), x.get('signal')
    return None


def ready():
    return any(x.get('event') == 'worker' and x.get('message') == 'READY' for x in clog())


def start(params='{"nativeHomeAuto":true}', wait_ready=True, timeout=6):
    """Start exactly as SAM would: exec the app's `main` (detach) with the launch params."""
    try:
        os.remove(STATE + '/controller.log')   # so READY/exit are read from this run only
    except FileNotFoundError:
        pass
    r = sh(APP + '/detach', params)
    if wait_ready:
        t = wait_until(ready, timeout)
        if t is None:
            log('controller.log:', clog()[-6:])
        return t
    return r.returncode


def scenario(fn):
    def run():
        CUR['name'] = fn.__name__
        print('\n## ' + fn.__name__ + ': ' + (fn.__doc__ or '').strip(), flush=True)
        try:
            fn()
        except Exception:
            traceback.print_exc()
            check('scenario raised no exception', False)
        finally:
            kill_all()
    run.__name__ = fn.__name__
    return run


SCENARIOS = []


def sc(fn):
    SCENARIOS.append(scenario(fn)); return fn


# ---------- scenarios ----------
@sc
def s01_start_and_grab():
    """SAM-style start (detach {nativeHomeAuto:true}) -> boot launch with premiumHome:start -> [0] grabbed"""
    rem = Remote(); install()
    check('[0] not grabbed before start', not grabbed(rem.path(0)))
    t = start()
    check('relay READY', t is not None, '%.3fs after detach' % (t or -1))
    check('exactly one relay and one controller process', len(relay_pids()) == 1 and len(controller_pids()) == 1, (relay_pids(), controller_pids()))
    check('exactly one independent guard process (sibling of relay+controller)', len(guard_pids()) == 1, guard_pids())
    l = luna()
    check('first launch = target with {"premiumHome":"start"}', l and l[0] == {'id': TARGET, 'params': {'premiumHome': 'start'}}, l[:1])
    check('probe: EVIOCGRAB on [0] -> EBUSY (grabbed)', grabbed(rem.path(0)))
    check('evtest --grab reports [0] grabbed by another process', evtest_says_grabbed(rem.path(0)))
    check('[1] is NOT grabbed', not grabbed(rem.path(1)))
    r0 = Reader(rem.path(0)); rem.tap(E.KEY_UP); time.sleep(0.1)
    check('passive reader on [0] receives nothing while grabbed', r0.drain() == [])
    r0.close(); rem.close()


@sc
def s02_passthrough():
    """non-Home keys, Back, pointer REL/ABS appear on [1] unchanged and in order"""
    rem = Remote(); install(); start(); r1 = Reader(rem.path(1))
    sent = []
    for code in (E.KEY_UP, E.KEY_DOWN, E.KEY_LEFT, E.KEY_RIGHT, E.KEY_ENTER, E.KEY_VOLUMEUP, E.KEY_VOLUMEDOWN, E.KEY_MUTE, E.KEY_1, E.KEY_RED, BACK):
        rem.tap(code, 0.05); sent += [(E.EV_KEY, code, 1), (E.EV_KEY, code, 0)]
    rem.rel(5, -3); sent += [(E.EV_REL, E.REL_X, 5), (E.EV_REL, E.REL_Y, -3)]
    rem.abs(960, 540); sent += [(E.EV_ABS, E.ABS_X, 960), (E.EV_ABS, E.ABS_Y, 540)]
    time.sleep(0.2)
    got = r1.drain()
    check('all %d events forwarded to [1] identically and in order' % len(sent), got == sent, '' if got == sent else (got[:6], sent[:6]))
    # burst
    got = []
    for _ in range(10):
        for i in range(10):
            rem.key(E.KEY_DOWN, 1); rem.key(E.KEY_DOWN, 0)
        time.sleep(0.05); got += r1.drain()
    time.sleep(0.2); got += r1.drain()
    check('burst of 200 key events forwarded without loss', got == [(E.EV_KEY, E.KEY_DOWN, v) for _ in range(100) for v in (1, 0)], len(got))
    check('relay still running, no extra launches', len(relay_pids()) == 1 and len(luna()) == 1)
    r1.close(); rem.close()


@sc
def s03_home_launches():
    """Home tap: not forwarded to [1], triggers exactly one launch of the target (no params)"""
    rem = Remote(); install(); start(); r1 = Reader(rem.path(1))
    t0 = time.time(); rem.tap(HOME)
    ok = wait_until(lambda: len(luna()) == 2, 2)
    l = luna()
    check('Home -> launch {"id":"%s"} (no params, so Premium Home may toggle Ambient)' % TARGET, ok is not None and l[1] == {'id': TARGET}, l)
    check('Home key events absent from [1]', all(c != HOME for _, c, _ in r1.drain()))
    rem.tap(E.KEY_UP, 0.05); time.sleep(0.1)
    check('relay keeps forwarding after Home', r1.drain() == [(1, E.KEY_UP, 1), (1, E.KEY_UP, 0)])
    time.sleep(1.0); rem.tap(HOME); wait_until(lambda: len(luna()) == 3, 2)
    check('second Home 1 s later -> second launch (Home again -> Ambient handled by Premium Home)', len(luna()) == 3)
    r1.close(); rem.close()


@sc
def s04_long_back():
    """long Back (1.3 s) -> Back still forwarded, LG Home launched once"""
    rem = Remote(); install(); start(); r1 = Reader(rem.path(1))
    rem.tap(BACK, 1.3); time.sleep(0.3)
    check('Back down+up forwarded to [1]', r1.drain() == [(1, BACK, 1), (1, BACK, 0)])
    l = luna()
    check('exactly one launch of com.webos.app.home', [x for x in l if x.get('id') == 'com.webos.app.home'] == [{'id': 'com.webos.app.home'}], l)
    rem.tap(BACK, 0.2); time.sleep(0.2)
    check('short Back launches nothing', len(luna()) == len(l))
    r1.close(); rem.close()


@sc
def s05_inflight_and_burst():
    """duplicate Home during an in-flight launch and Home bursts give one launch"""
    rem = Remote(); install(); start(); mode('delay:2000')
    # Two presses (a third inside 2 s would be the triple-Home emergency stop).
    rem.tap(HOME); time.sleep(1.0); rem.tap(HOME)
    time.sleep(0.2)
    check('2nd Home 1 s later, while the first launch is still in flight (2 s) -> still 1 launch', len(luna()) == 2, luna())
    check('controller logged in-flight suppression', any(x.get('event') == 'home-suppressed' and x.get('reason') == 'in-flight' for x in clog()))
    mode('ok'); time.sleep(2.5)
    rem.tap(HOME); time.sleep(0.3); rem.tap(HOME)  # 420 ms apart
    time.sleep(0.5)
    check('2 Home presses 420 ms apart -> 1 launch (burst)', len(luna()) == 3, len(luna()))
    check('relay still grabbing', grabbed(rem.path(0)))
    if os.environ.get('SIM_DEBUG'):
        log(json.dumps(clog()[-15:], indent=0))
    rem.close()


@sc
def s06_triple_home_release():
    """triple Home (120 ms taps, 300 ms gaps) -> relay exits 27, [0] released, latch set"""
    rem = Remote(); install(); start(); r1 = Reader(rem.path(1))
    for i in range(3):
        rem.key(HOME, 1); time.sleep(0.12)
        if i == 2:
            t_up = time.monotonic()
        rem.key(HOME, 0)
        if i < 2:
            time.sleep(0.3)
    t = wait_until(lambda: not grabbed(rem.path(0)), 2)
    check('[0] released after third key-up', t is not None, '%.0f ms' % ((time.monotonic() - t_up) * 1000) if t is not None else 'still grabbed')
    wait_until(lambda: not controller_pids() and not relay_pids(), 4)
    check('relay exit code 27 (RELEASE)', worker_exit() == (27, None), worker_exit())
    check('controller and relay gone', not controller_pids() and not relay_pids())
    check('emergency-stop latch state/blocked written', os.path.exists(STATE + '/blocked'))
    check('only one Home launch for the whole triple press', len([x for x in luna() if x == {'id': TARGET}]) == 1, luna())
    check('no Home event leaked to [1]', all(c != HOME for _, c, _ in r1.drain()))
    r0 = Reader(rem.path(0)); rem.tap(E.KEY_UP, 0.05); time.sleep(0.1)
    check('after release keys reach [0] natively and are no longer copied to [1]', r0.drain() == [(1, E.KEY_UP, 1), (1, E.KEY_UP, 0)] and r1.drain() == [])
    # latch behaviour
    rc = start('{"nativeHomeAuto":true}', wait_ready=False); time.sleep(1.0)
    check('boot start with latch present: no controller stays, [0] stays free', not controller_pids() and not relay_pids() and not grabbed(rem.path(0)))
    t = start('{}', timeout=5)
    check('tile tap (manual start) clears latch and grabs again', t is not None and not os.path.exists(STATE + '/blocked') and grabbed(rem.path(0)), t)
    r0.close(); r1.close(); rem.close()


@sc
def s07_kill_controller():
    """SIGKILL controller -> relay sees stdin EOF -> [0] released"""
    rem = Remote(); install(); start()
    c = controller_pids()[0]; t0 = time.monotonic(); os.kill(c, signal.SIGKILL)
    t = wait_until(lambda: not grabbed(rem.path(0)), 3)
    check('[0] released after controller SIGKILL', t is not None, '%.0f ms' % (t * 1000) if t is not None else 'still grabbed')
    check('released well within the 2 s watchdog', t is not None and t < 2.0)
    wait_until(lambda: not relay_pids(), 2)
    check('relay exited', not relay_pids())
    check('relay wrote latch (exit 24, not device loss)', os.path.exists(STATE + '/blocked'))
    rem.close()


@sc
def s08_stop_controller():
    """SIGSTOP controller -> relay heartbeat watchdog (2 s) -> [0] released"""
    rem = Remote(); install(); start()
    c = controller_pids()[0]; os.kill(c, signal.SIGSTOP)
    t = wait_until(lambda: not grabbed(rem.path(0)), 5)
    check('[0] released after controller SIGSTOP', t is not None, '%.0f ms' % (t * 1000) if t is not None else 'still grabbed')
    check('release time 1.9-2.6 s (2 s relay watchdog)', t is not None and 1.9 <= t <= 2.6, t)
    check('relay exited', wait_until(lambda: not relay_pids(), 1) is not None)
    os.kill(c, signal.SIGCONT)
    check('controller exits after SIGCONT (sees relay exit 20)', wait_until(lambda: not controller_pids(), 5) is not None)
    check('relay exit code 20 (heartbeat lost)', worker_exit() == (20, None), worker_exit())
    rem.close()


@sc
def s09_kill_relay():
    """SIGKILL relay -> kernel drops the grab with the fd; controller cleans up and exits"""
    rem = Remote(); install(); start()
    rem.key(E.KEY_UP, 1); time.sleep(0.05)   # leave a key held on [1]
    os.kill(relay_pids()[0], signal.SIGKILL)
    t = wait_until(lambda: not grabbed(rem.path(0)), 2)
    check('[0] released immediately after relay SIGKILL', t is not None and t < 0.5, '%.0f ms' % (t * 1000) if t is not None else 'still grabbed')
    check('controller exits', wait_until(lambda: not controller_pids(), 4) is not None)
    check('controller logged worker-exit SIGKILL and ran relay cleanup', worker_exit() == (None, 'SIGKILL') and any(x.get('event') == 'cleanup' for x in clog()), (worker_exit(), [x for x in clog() if x.get('event') == 'cleanup']))
    st = InputDevice(rem.path(1)).active_keys()
    check('cleanup released the key left down on [1]', E.KEY_UP not in st, st)
    check('latch written', os.path.exists(STATE + '/blocked'))
    rem.key(E.KEY_UP, 0); rem.close()


@sc
def s10_stop_relay():
    """SIGSTOP relay -> controller watchdog (2.5 s) SIGKILLs it -> [0] released"""
    rem = Remote(); install(); start()
    os.kill(relay_pids()[0], signal.SIGSTOP)
    t = wait_until(lambda: not grabbed(rem.path(0)), 5)
    check('[0] released after relay SIGSTOP', t is not None, '%.0f ms' % (t * 1000) if t is not None else 'still grabbed')
    check('release time 2.4-3.2 s (2.5 s controller watchdog + 400 ms tick)', t is not None and 2.4 <= t <= 3.2, t)
    check('controller logged worker-watchdog', wait_until(lambda: any(x.get('event') == 'worker-watchdog' for x in clog()), 1) is not None)
    check('controller exits', wait_until(lambda: not controller_pids(), 4) is not None)
    rem.close()


@sc
def s11_stop_both_guard_releases():
    """FIXED by guard: SIGSTOP of BOTH relay and controller -> the independent guard SIGKILLs the frozen relay"""
    rem = Remote(); install(); start()
    check('independent guard running before the freeze', len(guard_pids()) == 1, guard_pids())
    r, c = relay_pids()[0], controller_pids()[0]
    t0 = time.monotonic(); os.kill(c, signal.SIGSTOP); os.kill(r, signal.SIGSTOP)
    t = wait_until(lambda: not grabbed(rem.path(0)), 6)
    el = (time.monotonic() - t0)
    check('[0] released after BOTH frozen (was residual s11; guard now kills the relay)', t is not None, '%.0f ms' % (el * 1000) if t is not None else 'STILL GRABBED')
    check('release time ~2.5 s (2.5 s guard stall threshold + poll)', t is not None and 2.0 <= el <= 3.6, el)
    check('guard exits after it has killed the relay (no relaunch)', wait_until(lambda: not guard_pids(), 2) is not None)
    try: os.kill(c, signal.SIGCONT)
    except ProcessLookupError: pass
    rem.close()


@sc
def s12_stop_relay_kill_controller_guard_releases():
    """FIXED by guard: relay SIGSTOPped, controller SIGKILLed before its watchdog -> guard SIGKILLs the frozen relay"""
    rem = Remote(); install(); start()
    r, c = relay_pids()[0], controller_pids()[0]
    t0 = time.monotonic(); os.kill(r, signal.SIGSTOP); time.sleep(0.3); os.kill(c, signal.SIGKILL)
    t = wait_until(lambda: not grabbed(rem.path(0)), 6)
    el = (time.monotonic() - t0)
    check('[0] released though the controller is dead and the relay frozen (was residual s12)', t is not None, '%.0f ms' % (el * 1000) if t is not None else 'STILL GRABBED')
    check('release within ~3.6 s of the stop (guard 2.5 s + 0.3 s offset + poll)', t is not None and el <= 3.8, el)
    check('guard exits after acting', wait_until(lambda: not guard_pids(), 2) is not None)
    rem.close()


@sc
def s13_sigterm():
    """SIGTERM to relay or controller -> graceful release"""
    rem = Remote(); install(); start()
    os.kill(relay_pids()[0], signal.SIGTERM)
    t = wait_until(lambda: not grabbed(rem.path(0)), 2)
    check('relay SIGTERM -> [0] released', t is not None and t < 0.5, t)
    wait_until(lambda: not controller_pids(), 4)
    check('relay exit 0, controller gone', worker_exit() == (0, None) and not controller_pids(), worker_exit())
    install(); start()
    os.kill(controller_pids()[0], signal.SIGTERM)
    t = wait_until(lambda: not grabbed(rem.path(0)), 3)
    check('controller SIGTERM -> Q -> [0] released', t is not None and t < 0.5, t)
    check('controller exits', wait_until(lambda: not controller_pids(), 4) is not None)
    rem.close()


@sc
def s14_missing_target_at_start():
    """target app missing at start -> controller exits 3, relay never started, [0] never grabbed"""
    rem = Remote(); install(); mode('missing')
    start(wait_ready=False)
    seen = False; t0 = time.monotonic()
    while time.monotonic() - t0 < 3:
        seen = seen or grabbed(rem.path(0)) or bool(relay_pids()); time.sleep(0.05)
    check('[0] never grabbed and relay never spawned during 3 s', not seen)
    check('controller gone', not controller_pids())
    check('controller logged target-launch-failed with the Luna error', any(x.get('event') == 'target-launch-failed' for x in clog()) and any(x.get('event') == 'launch' and not x.get('ok') and 'not found' in json.dumps(x.get('result')) for x in clog()))
    check('latch written (boot ticks will not retry)', os.path.exists(STATE + '/blocked'))
    rem.close()


@sc
def s15_target_removed_later():
    """target disappears while running -> next Home fails -> relay stopped, [0] released"""
    rem = Remote(); install(); start(); mode('missing')
    rem.tap(HOME)
    t = wait_until(lambda: not grabbed(rem.path(0)), 3)
    check('[0] released after failed Home launch', t is not None, t)
    wait_until(lambda: not controller_pids(), 4)
    check('relay exit 24 (stdin closed by controller)', worker_exit() == (24, None), worker_exit())
    rem.close()


@sc
def s16_launch_timeout():
    """Home launch never answered -> 3 s timeout -> relay stopped, [0] released"""
    rem = Remote(); install(); start(); mode('hang')
    t0 = time.monotonic(); rem.tap(HOME)
    t = wait_until(lambda: not grabbed(rem.path(0)), 5)
    check('[0] released after launch timeout', t is not None, t)
    check('release 2.9-3.6 s after key-up (3 s launch timeout counted from key-down)', t is not None and 2.9 <= t <= 3.6, t)
    check('controller logged launch-timeout', any(x.get('event') == 'launch-timeout' for x in clog()))
    rem.close()


@sc
def s17_bootstrap_failures():
    """bootstrap failures never grab: no webos-service, no node, no relay binary, key held, wrong devices"""
    rem = Remote(); install()
    os.rename('/usr/lib/node_modules/webos-service', '/usr/lib/node_modules/webos-service.off')
    try:
        start(wait_ready=False); time.sleep(3.2)
        check('webos-service missing: no relay, [0] free, controller exited', not relay_pids() and not grabbed(rem.path(0)) and not controller_pids())
        check('webos-service missing: error logged + latch', any('webos-service' in json.dumps(x) for x in clog()) and os.path.exists(STATE + '/blocked'))
    finally:
        os.rename('/usr/lib/node_modules/webos-service.off', '/usr/lib/node_modules/webos-service')
    install(); os.rename('/usr/bin/node', '/usr/bin/node.off')
    try:
        rc = start(wait_ready=False); time.sleep(1)
        check('node missing: detach returns, nothing running, [0] free', not controller_pids() and not relay_pids() and not grabbed(rem.path(0)), rc)
    finally:
        os.rename('/usr/bin/node.off', '/usr/bin/node')
    install(); os.remove(APP + '/relay')
    start(wait_ready=False); time.sleep(2)
    check('relay binary missing: controller exits, [0] free', not controller_pids() and not grabbed(rem.path(0)), [x for x in clog() if 'error' in x][:1])
    install(); rem.key(E.KEY_ENTER, 1)
    start(wait_ready=False); time.sleep(1)
    check('key held at start: relay waits without grabbing', relay_pids() and not grabbed(rem.path(0)))
    wait_until(lambda: not controller_pids(), 7)
    check('key held 5 s: relay gives up with exit 14 (source-held), never grabbed', worker_exit() == (14, None) and not grabbed(rem.path(0)), worker_exit())
    rem.key(E.KEY_ENTER, 0); rem.close()
    install(); start(wait_ready=False); time.sleep(1.5)
    check('no remote devices at all: relay exit 10, nothing grabbed', worker_exit() == (10, None) and not relay_pids(), worker_exit())
    caps = dict(CAPS); caps[E.EV_KEY] = KEYS[:-3]
    rem = Remote(caps0=CAPS, caps1=caps); install(); start(wait_ready=False); time.sleep(1.5)
    check('[0]/[1] capabilities differ: relay exit 12 (incompatible), [0] free', worker_exit() == (12, None) and not grabbed(rem.path(0)), worker_exit())
    rem.close()


@sc
def s18_standby_devices_vanish():
    """simulated standby: devices disappear and reappear"""
    rem = Remote(); install(); start()
    rem.close()
    check('both devices removed: relay exits', wait_until(lambda: not relay_pids(), 2) is not None)
    wait_until(lambda: not controller_pids(), 4)
    check('exit 25 (input HUP) and NO latch (device loss is not an emergency stop)', worker_exit() == (25, None) and not os.path.exists(STATE + '/blocked'), worker_exit())
    rem = Remote(); time.sleep(0.5)
    check('re-created [0] is not grabbed by anything (fail-open; helper does not re-arm itself)', not grabbed(rem.path(0)))
    r1 = Reader(rem.path(1)); rem.tap(E.KEY_UP, 0.05); time.sleep(0.1)
    check('keys on new [0] are not copied to new [1]', r1.drain() == [])
    r1.close()
    t = start('{}', timeout=5)
    check('tile tap after wake re-arms on the new devices', t is not None and grabbed(rem.path(0)))
    rem.close([1])
    t = wait_until(lambda: not grabbed(rem.path(0)), 2)
    check('only [1] removed: [0] released at once (exit 28)', t is not None and t < 0.5, t)
    wait_until(lambda: not controller_pids(), 4)
    check('exit code 28', worker_exit() == (28, None), worker_exit())
    rem.close()
    rem = Remote(); install(); start(); rem.close([0])
    check('only [0] removed: relay exits 25', wait_until(lambda: not relay_pids(), 2) is not None)
    wait_until(lambda: not controller_pids(), 4)
    check('exit code 25', worker_exit() == (25, None), worker_exit())
    rem.close()


@sc
def s19_package_removed():
    """app removed while running (ares-install --remove / Dev Mode expiry) -> relay told to quit"""
    rem = Remote(); install(); start()
    shutil.rmtree(APP)
    t = wait_until(lambda: not grabbed(rem.path(0)), 3)
    check('[0] released after the package directory disappears', t is not None and t < 1.0, t)
    check('relay and controller exit', wait_until(lambda: not relay_pids() and not controller_pids(), 4) is not None)
    rem.close()


@sc
def s20_destination_grabbed_by_other():
    """[1] grabbed by a third process: injected keys are silently dropped by the kernel"""
    rem = Remote(); install(); start()
    other = InputDevice(rem.path(1)); other.grab()
    rem.tap(E.KEY_UP, 0.05)
    t = wait_until(lambda: not grabbed(rem.path(0)), 2)
    check('delivery check: relay notices missing echo and releases [0]', t is not None and t < 1.0, t)
    wait_until(lambda: not controller_pids(), 4)
    check('exit code 30 (injection-not-delivered), latch written', worker_exit() == (30, None) and os.path.exists(STATE + '/blocked'), worker_exit())
    other.ungrab(); other.close()
    if os.path.exists(NOECHO_BIN):
        install(NOECHO_BIN); start(); other = InputDevice(rem.path(1)); other.grab()
        r1 = Reader(rem.path(1)); rem.tap(E.KEY_UP, 0.05); time.sleep(1.5)
        check('UPSTREAM-EQUIVALENT build (no delivery check): [0] stays grabbed while keys vanish -> remote dead', grabbed(rem.path(0)) and r1.drain() == [] and relay_pids())
        other.ungrab(); other.close(); r1.close()
    rem.close()


@sc
def s21_stuck_key_on_destination():
    """key already down on [1] (stuck state): injected press is dropped -> fail open"""
    rem = Remote(); install(); start()
    rem.key(E.KEY_ENTER, 1, dev=1)     # something else leaves Enter down on [1]
    time.sleep(0.3)                    # (relay consumes that unrelated event first)
    rem.tap(E.KEY_ENTER, 0.05)
    t = wait_until(lambda: not grabbed(rem.path(0)), 2)
    check('relay detects undelivered press and releases [0]', t is not None and t < 1.0, t)
    wait_until(lambda: not controller_pids(), 4)
    check('exit 30', worker_exit() == (30, None), worker_exit())
    st = InputDevice(rem.path(1)).active_keys()
    check('after exit no key is left down on [1]', E.KEY_ENTER not in st, st)
    rem.close()


@sc
def s22_duplicate_start_and_tile():
    """second start while running: single controller/relay; tile tap opens Premium Home with premiumHome:start"""
    rem = Remote(); install(); start()
    rc = start('{"nativeHomeAuto":true}', wait_ready=False); time.sleep(0.8)
    check('second boot-style start: still exactly one controller and one relay', len(controller_pids()) == 1 and len(relay_pids()) == 1, (controller_pids(), relay_pids()))
    start('{}', wait_ready=False); time.sleep(1.0)
    pub = [json.loads(l) for l in open('/sim/luna-send-pub.log') if l.strip()]
    check('tile tap while running -> luna-send-pub launch target {"premiumHome":"start"}', pub and json.loads(pub[-1]['argv'][3]) == {'id': TARGET, 'params': {'premiumHome': 'start'}}, pub)
    check('still one relay, still grabbed', len(relay_pids()) == 1 and grabbed(rem.path(0)))
    rem.close()


@sc
def s23_guard_killed_still_safe():
    """guard SIGKILLed: it held nothing, and the two built-in watchdogs still fail open (single-failure safety intact)"""
    rem = Remote(); install(); start()
    g = guard_pids(); check('guard present before kill', len(g) == 1, g)
    os.kill(g[0], signal.SIGKILL)
    check('killing the guard does NOT disturb the grab (guard never opens/grabs an input device)', grabbed(rem.path(0)))
    check('guard gone', wait_until(lambda: not guard_pids(), 2) is not None)
    # With no guard, a controller freeze must still release via the relay's own 2 s heartbeat watchdog.
    os.kill(controller_pids()[0], signal.SIGSTOP)
    t = wait_until(lambda: not grabbed(rem.path(0)), 4)
    check('with no guard, the relay heartbeat watchdog still releases [0]', t is not None and 1.9 <= t <= 2.6, t)
    try: os.kill(controller_pids()[0], signal.SIGCONT)
    except ProcessLookupError: pass
    rem.close()


@sc
def s24_all_three_frozen_residual():
    """HONEST RESIDUAL: controller, relay AND guard all SIGSTOPped -> nothing is left to act"""
    rem = Remote(); install(); start()
    check('all three present (controller, relay, guard)', len(controller_pids()) == 1 and len(relay_pids()) == 1 and len(guard_pids()) == 1)
    pids = controller_pids() + relay_pids() + guard_pids()
    for p in pids:
        os.kill(p, signal.SIGSTOP)
    time.sleep(5)
    check('RESIDUAL CONFIRMED: [0] still grabbed 5 s after freezing ALL THREE', grabbed(rem.path(0)))
    os.kill(relay_pids()[0], signal.SIGKILL)   # recovery
    check('recovery: SIGKILL on the frozen relay drops the grab at once', wait_until(lambda: not grabbed(rem.path(0)), 1) is not None)
    for p in controller_pids() + guard_pids():
        try: os.kill(p, signal.SIGKILL)
        except ProcessLookupError: pass
    rem.close()


@sc
def s25_disable_latch_revert_switch():
    """owner revert switch (state/disabled): the helper never arms, on boot or tile, and a tile tap does not clear it"""
    rem = Remote(); install()
    open(STATE + '/disabled', 'w').close()
    start('{"nativeHomeAuto":true}', wait_ready=False); time.sleep(1.5)
    check('disable latch set: boot start arms nothing (no controller/relay/guard, [0] free)',
          not grabbed(rem.path(0)) and not controller_pids() and not relay_pids() and not guard_pids())
    start('{}', wait_ready=False); time.sleep(1.5)
    check('disable latch set: tile tap still does NOT arm the grab', not grabbed(rem.path(0)) and not controller_pids())
    pub = [json.loads(l) for l in open('/sim/luna-send-pub.log') if l.strip()]
    check('disable latch set: tile tap still opens Premium Home with premiumHome:start',
          pub and json.loads(pub[-1]['argv'][3]) == {'id': TARGET, 'params': {'premiumHome': 'start'}}, pub[-1] if pub else None)
    check('disable latch is NOT cleared by a tile tap (unlike the emergency-stop latch)', os.path.exists(STATE + '/disabled'))
    os.remove(STATE + '/disabled')   # redeploy/uninstall removes it
    t = start('{}', timeout=5)
    check('after the latch is removed, a tile tap arms again', t is not None and grabbed(rem.path(0)) and len(guard_pids()) == 1)
    rem.close()


def main():
    only = sys.argv[1:]
    for s in SCENARIOS:
        if not only or any(s.__name__.startswith(o) for o in only):
            s()
    print('\n==== SUMMARY ====')
    names = []
    for n, _, _ in RESULTS:
        if n not in names:
            names.append(n)
    tp = tf = 0
    for n in names:
        p = sum(1 for x in RESULTS if x[0] == n and x[2]); f = sum(1 for x in RESULTS if x[0] == n and not x[2])
        tp += p; tf += f
        print('%-36s %2d passed %2d failed' % (n, p, f))
    print('TOTAL checks: %d passed, %d failed' % (tp, tf))
    return 1 if tf else 0


if __name__ == '__main__':
    sys.exit(main())
