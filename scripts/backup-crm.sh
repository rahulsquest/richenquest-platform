#!/bin/zsh
# backup-crm.sh — full CRM export to local, versionable files.
#
# WHY THIS EXISTS
#   Platform logic is recoverable from git. Business data was recoverable from
#   nowhere (File 28 R-1). This closes that.
#
# HOW
#   Zoho's Bulk Read API: POST a job per module, poll to COMPLETED, download the
#   zipped CSV. Field lists are discovered dynamically so the backup captures
#   whatever the schema is on the day it runs, not a list that silently goes stale.
#
# OUTPUT
#   backups/<UTC date>/<Module>.zip  + manifest.json + MANIFEST.txt
#
# USAGE
#   ./scripts/backup-crm.sh              # default module set
#   ./scripts/backup-crm.sh Leads Deals  # specific modules
#
# TRANSPORT
#   Same authenticated-Chrome-session transport as platform-health.sh, isolated
#   in zcall()/zdl(). With an OAuth token both become curl and nothing else changes.
#
# KNOWN LIMIT
#   The result is carried back as base64 through an AppleScript string. That is
#   fine for the current data volume (hundreds of KB). For very large exports use
#   RB-09b in docs/29 — navigate Chrome to the download_url and let it save the
#   file directly. The script reports each file's size so growth is visible.

set -u
ORG="60074018310"
ROOT="${0:A:h}/.."
DATE=$(date -u '+%Y-%m-%d')
OUT="$ROOT/backups/$DATE"
if [ $# -gt 0 ]; then MODULES=("$@"); else MODULES=(Leads Contacts Accounts Deals Tasks Notes); fi

mkdir -p "$OUT"

zcall () {  # zcall <METHOD> <PATH> [<json-file>]
  local M="$1" P="$2" BF="${3:-}" B64=""
  [ -n "$BF" ] && B64=$(base64 < "$BF" | tr -d '\n')
  osascript >/dev/null 2>&1 <<AS
tell application "Google Chrome"
  set t to active tab of front window
  execute t javascript "window.__bk=null; (function(){var c=(document.cookie.match(/(?:^|;\\\\s*)crmcsr=([^;]+)/)||[])[1]||''; var o={credentials:'include',method:'$M',headers:{'X-ZCSRF-TOKEN':'crmcsrfparam='+c,'X-CRM-ORG':'$ORG','Content-Type':'application/json'}}; var b='$B64'; if(b){o.body=decodeURIComponent(escape(atob(b)));} fetch('$P',o).then(function(r){return r.text().then(function(x){window.__bk=r.status+' '+x})}).catch(function(e){window.__bk='ERR '+e.message});})()"
end tell
AS
  local i R
  for i in $(seq 1 20); do
    R=$(osascript -e 'tell application "Google Chrome" to execute active tab of front window javascript "window.__bk"' 2>/dev/null)
    if [ -n "$R" ] && [ "$R" != "missing value" ]; then print -r -- "$R"; return 0; fi
    /bin/sleep 2
  done
  print -r -- "TIMEOUT"
}

zdl () {  # zdl <path> <outfile>  — download binary via base64
  local P="$1" F="$2"
  osascript >/dev/null 2>&1 <<AS
tell application "Google Chrome"
  set t to active tab of front window
  execute t javascript "window.__dl=null; (function(){var c=(document.cookie.match(/(?:^|;\\\\s*)crmcsr=([^;]+)/)||[])[1]||''; fetch('$P',{credentials:'include',headers:{'X-ZCSRF-TOKEN':'crmcsrfparam='+c,'X-CRM-ORG':'$ORG'}}).then(function(r){return r.blob()}).then(function(b){var fr=new FileReader(); fr.onload=function(){window.__dl=fr.result.split(',')[1]}; fr.readAsDataURL(b);}).catch(function(e){window.__dl='ERR:'+e.message});})()"
end tell
AS
  local i R
  for i in $(seq 1 40); do
    R=$(osascript -e 'tell application "Google Chrome" to execute active tab of front window javascript "window.__dl"' 2>/dev/null)
    if [ -n "$R" ] && [ "$R" != "missing value" ]; then
      case "$R" in ERR:*) print -r -- "$R"; return 1 ;; esac
      print -r -- "$R" | base64 --decode > "$F" 2>/dev/null && return 0
      return 1
    fi
    /bin/sleep 2
  done
  return 1
}

echo "═══ CRM backup — $DATE (UTC) ═══"
echo "target: $OUT"
MANIFEST="["
FAILED=0

for M in $MODULES; do
  printf '\n▸ %s\n' "$M"

  # 1. discover fields (so the backup never silently goes stale against schema change)
  FLD=$(zcall GET "/crm/v8/settings/fields?module=$M" | python3 -c "
import sys,json
r=sys.stdin.read()
try: j=json.loads(r.split(' ',1)[1],strict=False)
except Exception: print(''); raise SystemExit
skip={'formula','rollup_summary','multiselectlookup','subform'}
f=[x['api_name'] for x in j.get('fields',[]) if x.get('data_type') not in skip]
print(json.dumps(f[:200]))
")
  if [ -z "$FLD" ] || [ "$FLD" = "[]" ]; then echo "  ✗ could not read fields"; FAILED=1; continue; fi
  echo "  fields: $(print -r -- "$FLD" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')"

  # 2. create the job.
  #    Some field types are rejected by Bulk Read even though settings/fields
  #    returns them (Address and Coordinates on Leads, verified 2026-08-15).
  #    Rather than hard-coding an exclusion list that silently goes stale, we
  #    drop whatever field the API names and retry. Self-healing against schema
  #    change, and it reports what it dropped so nothing is lost quietly.
  JOB=""; DROPPED=""
  for attempt in $(seq 1 12); do
    python3 -c "
import json,sys
json.dump({'query':{'module':{'api_name':'$M'},'fields':json.loads(sys.argv[1])}}, open('$OUT/.job.json','w'))
" "$FLD"
    RESP=$(zcall POST '/crm/bulk/v8/read' "$OUT/.job.json")
    JOB=$(print -r -- "$RESP" | python3 -c "
import sys,json
r=sys.stdin.read()
try:
  j=json.loads(r.split(' ',1)[1],strict=False); print(j['data'][0]['details']['id'])
except Exception: print('')
")
    [ -n "$JOB" ] && break
    BAD=$(print -r -- "$RESP" | python3 -c "
import sys,json
r=sys.stdin.read()
try:
  j=json.loads(r.split(' ',1)[1],strict=False)
  print(j.get('details',{}).get('api_name','') if j.get('code')=='FIELD_NOT_SUPPORTED' else '')
except Exception: print('')
")
    [ -z "$BAD" ] && break
    DROPPED="$DROPPED $BAD"
    FLD=$(print -r -- "$FLD" | BAD="$BAD" python3 -c "
import sys,json,os
f=[x for x in json.load(sys.stdin) if x!=os.environ['BAD']]
print(json.dumps(f))
")
  done
  if [ -z "$JOB" ]; then echo "  ✗ job not created"; FAILED=1; continue; fi
  [ -n "$DROPPED" ] && echo "  dropped unsupported:$DROPPED"
  echo "  job:    $JOB"

  # 3. poll
  STATE=""; COUNT=""; URL=""
  for i in $(seq 1 30); do
    RES=$(zcall GET "/crm/bulk/v8/read/$JOB" | python3 -c "
import sys,json
r=sys.stdin.read()
try: j=json.loads(r.split(' ',1)[1],strict=False)['data'][0]
except Exception: print('|||'); raise SystemExit
res=j.get('result') or {}
print('%s|%s|%s' % (j.get('state',''), res.get('count',''), res.get('download_url','')))
")
    STATE="${RES%%|*}"; REST="${RES#*|}"; COUNT="${REST%%|*}"; URL="${REST#*|}"
    [ "$STATE" = "COMPLETED" ] && break
    [ "$STATE" = "FAILURE" ] && break
    /bin/sleep 3
  done
  if [ "$STATE" != "COMPLETED" ]; then echo "  ✗ job state: ${STATE:-unknown}"; FAILED=1; continue; fi
  echo "  records: $COUNT"

  # 4. download
  if zdl "$URL" "$OUT/$M.zip"; then
    SZ=$(wc -c < "$OUT/$M.zip" | tr -d ' ')
    if [ "$SZ" -lt 30 ]; then echo "  ✗ file suspiciously small ($SZ bytes)"; FAILED=1; continue; fi
    echo "  saved:   $M.zip ($SZ bytes)"
    MANIFEST="$MANIFEST{\"module\":\"$M\",\"records\":$COUNT,\"bytes\":$SZ,\"job\":\"$JOB\"},"
  else
    echo "  ✗ download failed"; FAILED=1
  fi
done

rm -f "$OUT/.job.json"
MANIFEST="${MANIFEST%,}]"
print -r -- "{\"backup_date\":\"$DATE\",\"org\":\"$ORG\",\"modules\":$MANIFEST}" > "$OUT/manifest.json"
python3 -m json.tool "$OUT/manifest.json" > "$OUT/MANIFEST.txt" 2>/dev/null || true

echo "\n═══ result ═══"
cat "$OUT/MANIFEST.txt" 2>/dev/null || cat "$OUT/manifest.json"
if [ "$FAILED" = "0" ]; then
  echo "\n✓ backup complete — $OUT"
  echo "  VERIFY IT: ./scripts/verify-backup.sh $DATE"
else
  echo "\n✗ backup INCOMPLETE — do not treat as a restore point"
  exit 1
fi
