// Every JS file that ships to the TV must parse as ES5 (Node 0.12 floor, as upstream
// requires) and must not use post-ES5 runtime APIs that Node 0.12 lacks.
'use strict';
const fs = require('fs'), path = require('path');
let acorn; try { acorn = require('acorn'); } catch (e) { acorn = require('/usr/share/nodejs/acorn'); }
const files = ['native/app/native.js', 'native/app/helper-entry.js', 'native/app/config.js', 'native/app/runtime-policy.js', 'native/service/service.js', 'native/service/boot-state.js'];
const banned = [/Object\.assign/, /\bPromise\b/, /=>/, /\blet\s/, /\bconst\s/, /`/, /\.includes\(/, /Buffer\.(from|alloc)/, /\.padStart\(/, /\bclass\s/, /\.\.\.[a-zA-Z]/];
let fail = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  try { acorn.parse(src, { ecmaVersion: 5, sourceType: 'script' }); } catch (e) { fail++; console.log('FAIL ES5 parse ' + f + ': ' + e.message); continue; }
  const hit = banned.filter(r => r.test(src.replace(/\/\/.*$/gm, '')));
  if (hit.length) { fail++; console.log('FAIL post-ES5 API in ' + f + ': ' + hit.join(' ')); } else console.log('PASS ES5 ' + f);
}
console.log(`es5-check: ${files.length - fail} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
