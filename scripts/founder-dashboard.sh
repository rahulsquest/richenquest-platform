#!/bin/zsh
# founder-dashboard.sh — the whole business on one screen.
#
# READ-ONLY. Creates nothing, changes nothing, deletes nothing. Safe to run at
# any time, by anyone, as often as you like.
#
# Every number is derived from system data via COQL. Nothing here is manually
# maintained, so nothing here can quietly go stale or be flattered.
#
# USAGE  ./scripts/founder-dashboard.sh
#
# COST   ~15 API calls per run against the 60,000/day ceiling (ADR-009).

set -u
ORG="60074018310"
ROOT="${0:A:h}/.."

zq () {  # zq "<COQL>"  -> JSON body
  local Q="$1"
  local B64=$(printf '{"select_query":"%s"}' "$Q" | base64 | tr -d '\n')
  osascript >/dev/null 2>&1 <<AS
tell application "Google Chrome"
  set t to active tab of front window
  execute t javascript "window.__fq=null; (function(){var c=(document.cookie.match(/(?:^|;\\\\s*)crmcsr=([^;]+)/)||[])[1]||''; fetch('/crm/v8/coql',{credentials:'include',method:'POST',headers:{'X-ZCSRF-TOKEN':'crmcsrfparam='+c,'X-CRM-ORG':'$ORG','Content-Type':'application/json'},body:decodeURIComponent(escape(atob('$B64')))}).then(function(r){return r.text().then(function(x){window.__fq=r.status+' '+x})}).catch(function(e){window.__fq='ERR '+e.message});})()"
end tell
AS
  local i R
  for i in $(seq 1 15); do
    R=$(osascript -e 'tell application "Google Chrome" to execute active tab of front window javascript "window.__fq"' 2>/dev/null)
    if [ -n "$R" ] && [ "$R" != "missing value" ]; then print -r -- "$R"; return 0; fi
    /bin/sleep 2
  done
  print -r -- "TIMEOUT"
}

zget () {
  local P="$1"
  osascript >/dev/null 2>&1 <<AS
tell application "Google Chrome"
  set t to active tab of front window
  execute t javascript "window.__fg=null; (function(){var c=(document.cookie.match(/(?:^|;\\\\s*)crmcsr=([^;]+)/)||[])[1]||''; fetch('$P',{credentials:'include',headers:{'X-ZCSRF-TOKEN':'crmcsrfparam='+c,'X-CRM-ORG':'$ORG'}}).then(function(r){return r.text().then(function(x){window.__fg=r.status+' '+x})}).catch(function(e){window.__fg='ERR '+e.message});})()"
end tell
AS
  local i R
  for i in $(seq 1 15); do
    R=$(osascript -e 'tell application "Google Chrome" to execute active tab of front window javascript "window.__fg"' 2>/dev/null)
    if [ -n "$R" ] && [ "$R" != "missing value" ]; then print -r -- "$R"; return 0; fi
    /bin/sleep 2
  done
  print -r -- "TIMEOUT"
}

# count "<label>" "<coql>"  — prints label and row count, or a dash when empty
count () {
  local L="$1" Q="$2"
  local N=$(zq "$Q" | python3 -c "
import sys,json
r=sys.stdin.read()
if r.startswith('204'): print(0); raise SystemExit
try:
    j=json.loads(r.split(' ',1)[1],strict=False)
    print(j.get('info',{}).get('count', len(j.get('data',[]))))
except Exception: print('?')
")
  printf '  %-34s %s\n' "$L" "$N"
}

# group "<coql>" "<field>" — prints a value: count breakdown
group () {
  zq "$1" | FIELD="$2" python3 -c "
import sys,json,os
from collections import Counter
r=sys.stdin.read()
if r.startswith('204'): print('    (none)'); raise SystemExit
try: j=json.loads(r.split(' ',1)[1],strict=False)
except Exception: print('    (unreadable)'); raise SystemExit
f=os.environ['FIELD']
rows=j.get('data',[])
if not rows: print('    (none)'); raise SystemExit
c=Counter((row.get(f) if isinstance(row.get(f),str) else (row.get(f) or {}).get('name') if isinstance(row.get(f),dict) else row.get(f)) or '(unset)' for row in rows)
for k,v in c.most_common(): print('    %-30s %d' % (k,v))
"
}

TODAY=$(date '+%Y-%m-%d')
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  RICHENQUEST — FOUNDER DASHBOARD                             ║"
echo "║  $(date '+%Y-%m-%d %H:%M')                                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"

echo "\n━━ PIPELINE ━━"
count "Leads (total)"            "select id from Leads where Last_Name is not null"
count "Leads created today"      "select id from Leads where Created_Time between '${TODAY}T00:00:00+05:30' and '${TODAY}T23:59:59+05:30'"
count "Open student cases"       "select id from Deals where Stage not in ('Visa Approved — Won','Closed Lost')"
count "Won cases"                "select id from Deals where Stage = 'Visa Approved — Won'"
count "Lost cases"               "select id from Deals where Stage = 'Closed Lost'"

echo "\n  Lead status breakdown:"
group "select id, Lead_Status from Leads where Last_Name is not null" "Lead_Status"

echo "\n  Case stage breakdown:"
group "select id, Stage from Deals where Deal_Name is not null" "Stage"

echo "\n━━ STUDENT JOURNEY ━━"
echo "  Post-admission:"
group "select id, Student_Journey_Stage from Deals where Deal_Name is not null" "Student_Journey_Stage"
echo "  Visa status:"
group "select id, Visa_Status from Deals where Deal_Name is not null" "Visa_Status"

echo "\n━━ UNIVERSITY PARTNERSHIPS ━━"
count "Universities (total)"     "select id from Accounts where Account_Name is not null"
count "Contactable (have email)" "select id from Accounts where International_Office_Email is not null"
count "Agreements signed"        "select id from Accounts where Agreement_Status = 'Signed'"
echo "  Partnership stage:"
group "select id, Partnership_Stage from Accounts where Account_Name is not null" "Partnership_Stage"

echo "\n━━ REVENUE PIPELINE ━━"
zq "select id, Amount, Stage from Deals where Deal_Name is not null" | python3 -c "
import sys,json
r=sys.stdin.read()
if r.startswith('204'): print('  no cases — nothing to forecast'); raise SystemExit
try: rows=json.loads(r.split(' ',1)[1],strict=False).get('data',[])
except Exception: print('  (unreadable)'); raise SystemExit
if not rows: print('  no cases — nothing to forecast'); raise SystemExit
tot=sum(float(x.get('Amount') or 0) for x in rows)
won=sum(float(x.get('Amount') or 0) for x in rows if x.get('Stage')=='Visa Approved — Won')
print('  %-34s %.2f' % ('Total pipeline value', tot))
print('  %-34s %.2f' % ('Won', won))
print('  NOTE: Books is in TEST mode — these are CRM intent figures, not revenue (File 25 G-4)')
"

echo "\n━━ WORK ━━"
count "Open tasks"       "select id from Tasks where Status != 'Completed'"
count "Overdue tasks"    "select id from Tasks where Status != 'Completed' and Due_Date < '${TODAY}'"
count "Due today"        "select id from Tasks where Status != 'Completed' and Due_Date = '${TODAY}'"

echo "\n━━ PLATFORM ━━"
zget "/crm/v8/__limits?feature=API" | python3 -c "
import sys,json
r=sys.stdin.read()
try:
    l=json.loads(r.split(' ',1)[1],strict=False)['__limits'][0]
    u,c=l['consumed_limit'],l['allowed_limit']; p=100.0*u/c
    print('  %-34s %s / %s  (%.1f%%)  [%s]' % ('API quota (24h)',u,c,p,'OK' if p<50 else 'WARN' if p<80 else 'CRITICAL'))
except Exception: print('  API quota                          (unreadable)')
"

LAST=$(ls -1 "$ROOT/backups" 2>/dev/null | sort | tail -1)
if [ -n "$LAST" ]; then
  AGE=$(( ( $(date +%s) - $(date -j -f "%Y-%m-%d" "$LAST" +%s 2>/dev/null || echo 0) ) / 86400 ))
  FLAG="OK"; [ "$AGE" -gt 1 ] && FLAG="STALE"
  printf '  %-34s %s (%s days old) [%s]\n' "Last backup" "$LAST" "$AGE" "$FLAG"
else
  printf '  %-34s %s\n' "Last backup" "NONE — run ./scripts/backup-crm.sh"
fi
printf '  %-34s %s\n' "Backup off-machine copy" "NOT VERIFIED — see docs/31 §8"

echo "\n  Health & regression: ./scripts/platform-health.sh"
echo "  (kept separate — it writes probe records; this dashboard never does)"

echo "\n━━ ATTENTION ━━"
zq "select id, Account_Name from Accounts where International_Office_Email is null" | python3 -c "
import sys,json
r=sys.stdin.read()
try: n=json.loads(r.split(' ',1)[1],strict=False).get('info',{}).get('count',0)
except Exception: n=0
if n: print('  • %d universities have no international office email — outreach cannot start for them' % n)
"
zq "select id from Leads where Lead_Status is null" | python3 -c "
import sys,json
r=sys.stdin.read()
try: n=json.loads(r.split(' ',1)[1],strict=False).get('info',{}).get('count',0)
except Exception: n=0
if n: print('  • %d leads have no status — they predate the intake rule and are invisible to every status filter' % n)
"
echo "  • Counselor role has no users — assignCounselor cannot assign (docs/28 R-8)"
echo "  • Books in TEST mode — no real financial data possible (docs/25 G-4)"
echo
