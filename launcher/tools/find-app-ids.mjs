// Read-only: list the TV's installed apps (id + title) through LG's own network control API
// (SSAP, the interface LG's ThinQ phone app uses), to find webOS app IDs such as Tubi's.
//
// - The TV shows an "Allow this device?" prompt; the owner must accept it with the remote.
// - Asks only for READ_INSTALLED_APPS. Nothing is launched or changed.
// - The pairing key the TV returns is NOT saved anywhere; the TV's address is read from LG's
//   CLI settings (~/.webos), never from this project.
// - TLS stays fully verified: webOS 25 serves SSAP only on wss://<tv>:3001 with LG's own
//   certificate chain ("LGE TV SSG" ← "LGE SSG Intermediate CA"). Pass that chain (PEM, fetched
//   once from the TV) and its leaf SHA-256 fingerprint; the connection is accepted only if the
//   chain verifies against it AND the leaf matches the pinned fingerprint.
//
// usage: node tools/find-app-ids.mjs <chain.pem> <sha256-fingerprint> [filter]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import crypto from 'node:crypto';

const [pemFile, pin, filterArg] = process.argv.slice(2);
if (!pemFile || !pin) { console.error('usage: node tools/find-app-ids.mjs <chain.pem> <sha256-fingerprint> [filter]'); process.exit(1); }
const filter = (filterArg || '').toLowerCase();
const devices = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.webos/tv/novacom-devices.json'), 'utf8'));
const DEVICE = process.env.TV_DEVICE || 'tv';   // the name you gave ares-setup-device
const tv = devices.find((d) => d.name === DEVICE);
if (!tv) { console.error('No "' + DEVICE + '" device in LG CLI settings (set TV_DEVICE=<name>).'); process.exit(1); }

const manifest = { manifestVersion: 1, appVersion: '1.0', permissions: ['READ_INSTALLED_APPS'],
  signed: { appId: 'local.lgc4.premiumhome.appid-finder', vendorId: 'local', created: '20261027', serial: 'local',
    localizedAppNames: { '': 'Premium Home app-ID finder' }, localizedVendorNames: { '': 'Premium Home' },
    permissions: ['READ_INSTALLED_APPS'] }, signatures: [] };
const timer = setTimeout(() => { console.error('Timed out (no answer to the prompt within 90 s).'); process.exit(2); }, 90000);
const norm = (f) => f.replace(/:/g, '').toUpperCase();

const sock = tls.connect({
  host: tv.host, port: 3001, ca: fs.readFileSync(pemFile), allowPartialTrustChain: true,
  // The certificate names LG, not this IP address, so identity is checked by the pinned fingerprint.
  checkServerIdentity: (host, cert) => (norm(cert.fingerprint256) === norm(pin) ? undefined : new Error('TV certificate does not match the pinned fingerprint'))
}, () => {
  const key = crypto.randomBytes(16).toString('base64');
  sock.write('GET / HTTP/1.1\r\nHost: ' + tv.host + ':3001\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
});

// Minimal WebSocket client: masked text frames out, unmasked (possibly long) text frames in.
function send(obj) {
  const data = Buffer.from(JSON.stringify(obj)), mask = crypto.randomBytes(4);
  const head = data.length < 126 ? Buffer.from([0x81, 0x80 | data.length])
    : Buffer.concat([Buffer.from([0x81, 0x80 | 126]), Buffer.from([data.length >> 8, data.length & 255])]);
  const body = Buffer.from(data.map((b, i) => b ^ mask[i % 4]));
  sock.write(Buffer.concat([head, mask, body]));
}
function pong(data) {
  const mask = crypto.randomBytes(4);
  sock.write(Buffer.concat([Buffer.from([0x8a, 0x80 | data.length]), mask, Buffer.from(data.map((x, i) => x ^ mask[i % 4]))]));
}
let buf = Buffer.alloc(0), upgraded = false, message = '';
sock.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  if (!upgraded) {
    const end = buf.indexOf('\r\n\r\n');
    if (end < 0) return;
    if (!/^HTTP\/1\.1 101/.test(buf.slice(0, end).toString())) { console.error('Upgrade refused:', buf.slice(0, end).toString().split('\r\n')[0]); process.exit(1); }
    upgraded = true; buf = buf.slice(end + 4);
    console.log('Connected to the TV (certificate verified). Waiting for you to accept the prompt…');
    send({ type: 'register', id: 'reg', payload: { forcePairing: false, pairingType: 'PROMPT', manifest } });
  }
  for (;;) {
    if (buf.length < 2) return;
    let len = buf[1] & 127, off = 2;
    if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    if (buf.length < off + len) return;
    const fin = buf[0] & 0x80, opcode = buf[0] & 0x0f, payload = buf.slice(off, off + len);
    buf = buf.slice(off + len);
    if (opcode === 0x8) { console.error('The TV closed the connection' + (payload.length > 2 ? ': ' + payload.slice(2).toString() : '.')); process.exit(3); }
    if (opcode === 0x9) { pong(payload); continue; }           // keep-alive ping
    if (opcode !== 0x1 && opcode !== 0x0) continue;             // ignore pongs and binary
    message += payload.toString();
    if (fin && message) { handle(JSON.parse(message)); message = ''; }
  }
});

function handle(d) {
  if (d.id === 'reg' && d.type === 'registered') {
    send({ type: 'request', id: 'apps', uri: 'ssap://com.webos.applicationManager/listApps' });
  } else if (d.id === 'reg' && d.type === 'error') {
    console.error('Pairing refused:', d.error); process.exit(3);
  } else if (d.id === 'apps') {
    clearTimeout(timer);
    const apps = (d.payload && d.payload.apps) || [];
    if (!apps.length) console.error('No app list returned:', JSON.stringify(d.payload || d).slice(0, 300));
    apps.filter((a) => !filter || (a.id + ' ' + a.title).toLowerCase().includes(filter))
      .sort((a, b) => String(a.title).localeCompare(String(b.title)))
      .forEach((a) => console.log(String(a.id).padEnd(44), a.title));
    sock.end(); setTimeout(() => process.exit(0), 50);
  }
}
sock.on('error', (e) => { console.error('Connection failed:', e.message); process.exit(1); });
