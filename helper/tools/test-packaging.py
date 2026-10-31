# Exercises src/packaging/fix-package-data.py on a synthetic ipk (ar + data.tar.gz).
import io, os, subprocess, sys, tarfile, tempfile
def ar(members):
    out = bytearray(b'!<arch>\n')
    for name, data in members:
        h = (name + '/').ljust(16).encode() + '0'.ljust(12).encode() + '0'.ljust(6).encode() + '0'.ljust(6).encode() + '100644'.ljust(8).encode() + str(len(data)).ljust(10).encode() + b'`\n'
        out += h + data + (b'\n' if len(data) & 1 else b'')
    return bytes(out)
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz') as t:
    for d in ['usr/palm/applications/com.local.premiumhome.homehelper/state', 'usr/palm/services/com.local.premiumhome.homehelper.service/state']:
        i = tarfile.TarInfo(d); i.type = tarfile.DIRTYPE; i.mode = 0o755; t.addfile(i)
p = os.path.join(tempfile.mkdtemp(), 'test.ipk')
open(p, 'wb').write(ar([('debian-binary', b'2.0\n'), ('control.tar.gz', b''), ('data.tar.gz', buf.getvalue())]))
r = subprocess.run([sys.executable, '-I', sys.argv[1], p], capture_output=True, text=True); print(r.stdout.strip(), r.stderr.strip())
b = open(p, 'rb').read(); i = b.index(b'data.tar.gz'); size = int(b[i+48:i+58]); data = b[i+60:i+60+size]
with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as t:
    ok = all(m.uid == 5999 and m.gid == 5000 and m.mode == 0o770 for m in t.getmembers())
print('PASS packaging: both state dirs -> prisoner:jailer 0770' if ok and r.returncode == 0 else 'FAIL packaging'); sys.exit(0 if ok else 1)
