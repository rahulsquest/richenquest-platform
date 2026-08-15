#!/bin/zsh
# verify-backup.sh — prove a backup is actually restorable.
#
# WHY
#   An unverified backup is not a backup. This opens every archive, parses the
#   CSV, counts data rows, and reconciles them against the manifest the export
#   wrote. A file that exists but is empty, truncated or unreadable FAILS here
#   rather than during an incident.
#
# USAGE
#   ./scripts/verify-backup.sh              # most recent backup
#   ./scripts/verify-backup.sh 2026-08-15   # a specific one
#
# EXIT
#   0 = restorable   1 = do not rely on it

set -u
ROOT="${0:A:h}/.."
DATE="${1:-}"
[ -z "$DATE" ] && DATE=$(ls -1 "$ROOT/backups" 2>/dev/null | sort | tail -1)
DIR="$ROOT/backups/$DATE"

[ -d "$DIR" ] || { echo "✗ no backup at $DIR"; exit 1; }
[ -f "$DIR/manifest.json" ] || { echo "✗ no manifest in $DIR — cannot verify what it should contain"; exit 1; }

echo "═══ verifying backup $DATE ═══"
echo "dir: $DIR\n"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
FAILED=0

python3 - "$DIR" "$TMP" <<'PY'
import json,sys,os,zipfile,csv,io
d,tmp=sys.argv[1],sys.argv[2]
man=json.load(open(os.path.join(d,'manifest.json')))
mods=man.get('modules',[])
if not mods:
    print('  ✗ manifest lists NO modules — nothing was exported'); sys.exit(1)
bad=0
for m in mods:
    name=m['module']; expect=m.get('records'); z=os.path.join(d,name+'.zip')
    if not os.path.exists(z):
        print('  ✗ %-10s archive missing' % name); bad=1; continue
    try:
        zf=zipfile.ZipFile(z)
    except Exception as e:
        print('  ✗ %-10s not a readable zip: %s' % (name,e)); bad=1; continue
    names=zf.namelist()
    if not names:
        print('  ✗ %-10s archive is empty' % name); bad=1; continue
    raw=zf.read(names[0]).decode('utf-8-sig',errors='replace')
    rows=list(csv.reader(io.StringIO(raw)))
    if not rows:
        print('  ✗ %-10s CSV has no content' % name); bad=1; continue
    header,data=rows[0],rows[1:]
    if 'Id' not in header and 'id' not in header:
        print('  ✗ %-10s CSV has no Id column — not restorable' % name); bad=1; continue
    n=len(data)
    ok = (expect in (None,'') ) or (str(n)==str(expect))
    mark='✓' if ok else '✗'
    if not ok: bad=1
    print('  %s %-10s %4d rows (manifest: %s) · %d columns · %s' % (mark,name,n,expect,len(header),names[0]))
print()
sys.exit(1 if bad else 0)
PY
[ $? -ne 0 ] && FAILED=1

echo "─── restore-readiness checklist ───"
CK () { printf '  [%s] %s\n' "$1" "$2"; }
[ "$FAILED" = "0" ] && CK "x" "every archive opens and parses as CSV" || CK " " "every archive opens and parses as CSV"
[ "$FAILED" = "0" ] && CK "x" "row counts reconcile with the manifest" || CK " " "row counts reconcile with the manifest"
[ "$FAILED" = "0" ] && CK "x" "every file carries an Id column (required to re-key on import)" || CK " " "Id column present"
CK " " "OFF-MACHINE COPY — this backup lives only on this laptop until you copy it"
CK " " "restore rehearsed into a sandbox — never yet done (docs/28 R-5, R-1)"

echo
if [ "$FAILED" = "0" ]; then
  echo "✓ backup $DATE is internally consistent and restorable in principle."
  echo "  It is NOT proven until a restore has been rehearsed, and it is NOT safe"
  echo "  until a copy exists off this machine."
  exit 0
else
  echo "✗ backup $DATE FAILED verification — do not rely on it."
  exit 1
fi
