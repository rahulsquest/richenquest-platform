#!/bin/zsh
# platform-health.sh — one command, whole-platform health.
#
# Reports: API quota · deployed functions · workflow rules · schedules ·
#          watch subscriptions · custom modules · dashboards · regression run
#
# TRANSPORT
#   Zoho's settings APIs need an authenticated CRM session. Today that comes
#   from a logged-in Chrome tab on crm.zoho.in (see docs/19 §2b) because no
#   client-side OAuth token exists in this environment. The transport is
#   deliberately isolated in zcall() below: give the platform an OAuth token
#   and zcall becomes a two-line curl, with nothing else in this script changing.
#
# USAGE   ./scripts/platform-health.sh [--no-regression]
#         --no-regression skips verifyPlatform (which writes and deletes probe
#         records). Use it for a read-only check.

set -u
ORG="60074018310"
RUN_REGRESSION=1
[ "${1:-}" = "--no-regression" ] && RUN_REGRESSION=0

zcall () {  # zcall <METHOD> <PATH> -> "<status> <body>"
  local M="$1" P="$2"
  osascript >/dev/null 2>&1 <<AS
tell application "Google Chrome"
  set t to active tab of front window
  execute t javascript "window.__ph=null; (function(){var c=(document.cookie.match(/(?:^|;\\\\s*)crmcsr=([^;]+)/)||[])[1]||''; fetch('$P',{credentials:'include',method:'$M',headers:{'X-ZCSRF-TOKEN':'crmcsrfparam='+c,'X-CRM-ORG':'$ORG','Content-Type':'application/json'}}).then(function(r){return r.text().then(function(x){window.__ph=r.status+' '+x})}).catch(function(e){window.__ph='ERR '+e.message});})()"
end tell
AS
  local i R
  for i in $(seq 1 15); do
    R=$(osascript -e 'tell application "Google Chrome" to execute active tab of front window javascript "window.__ph"' 2>/dev/null)
    if [ -n "$R" ] && [ "$R" != "missing value" ]; then print -r -- "$R"; return 0; fi
    /bin/sleep 2
  done
  print -r -- "TIMEOUT"
}

jparse () { python3 -c "$1" 2>/dev/null || echo "  (unreadable)"; }

echo "═══════════════════════════════════════════════════════════════"
echo " RichenQuest platform health — $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════"

echo "\n▸ API QUOTA"
zcall GET "/crm/v8/__limits?feature=API" | jparse "
import sys,json
r=sys.stdin.read(); j=json.loads(r.split(' ',1)[1],strict=False)
l=j['__limits'][0]; used=l['consumed_limit']; cap=l['allowed_limit']
pct=100.0*used/cap
flag='OK' if pct<50 else ('WARN' if pct<80 else 'CRITICAL')
print('  %s / %s (%.1f%%)  [%s]' % (used,cap,pct,flag))
print('  ADR-009 trigger: read model becomes required above 50%')
"

echo "\n▸ DEPLOYED FUNCTIONS"
zcall GET "/crm/v2/settings/functions?type=org&start=1&limit=200" | jparse "
import sys,json
r=sys.stdin.read()
if r.startswith('204'): print('  none'); raise SystemExit
j=json.loads(r.split(' ',1)[1],strict=False)
fs=sorted(j['functions'],key=lambda x:x['display_name'])
print('  count: %d' % len(fs))
for f in fs:
    rest=[x['type'] for x in f.get('rest_api',[]) if x.get('active')]
    print('    %-28s REST=%s' % (f['display_name'], ','.join(rest) or 'OFF'))
"

echo "\n▸ WORKFLOW RULES"
for M in Leads Accounts Deals Tasks Contacts; do
  zcall GET "/crm/v8/settings/automation/workflow_rules?module=$M" | jparse "
import sys,json
r=sys.stdin.read()
if r.startswith('204'): raise SystemExit
j=json.loads(r.split(' ',1)[1],strict=False)
for w in j.get('workflow_rules',[]):
    print('    %-10s %-28s %-18s active=%s' % ('$M', w['name'], w['execute_when']['type'], w['status']['active']))
"
done

echo "\n▸ SCHEDULES"
zcall GET "/crm/v9/settings/automation/schedules?page=1&per_page=50" | jparse "
import sys,json
r=sys.stdin.read(); j=json.loads(r.split(' ',1)[1],strict=False)
s=j.get('schedules',[])
print('  defined: %d / capacity 50' % len(s))
for x in s: print('    %-32s %-8s next=%s' % (x.get('name'), (x.get('frequency') or {}).get('type'), x.get('next_execution_time')))
if not s: print('  NOTE: no schedules defined')
"

echo "\n▸ WATCH SUBSCRIPTIONS  (event backbone)"
zcall GET "/crm/v8/actions/watch" | jparse "
import sys,json
r=sys.stdin.read()
if r.startswith('204'):
    print('  none subscribed')
    print('  NOTE: no event consumers exist yet — expected (File 26 G-7)')
    raise SystemExit
j=json.loads(r.split(' ',1)[1],strict=False)
for w in j.get('watch',[]):
    print('   ', w.get('channel_id'), w.get('events'), 'expires', w.get('channel_expiry'))
print('  CHECK EXPIRY: a lapsed channel stops events SILENTLY (File 26 G-7)')
"

echo "\n▸ CUSTOM MODULES"
zcall GET "/crm/v8/settings/modules" | jparse "
import sys,json
r=sys.stdin.read(); j=json.loads(r.split(' ',1)[1],strict=False)
c=[m['api_name'] for m in j['modules'] if m.get('generated_type')=='custom']
print('  %s' % (c if c else 'none — Application module not yet created (File 25 G-5)'))
"

echo "\n▸ DASHBOARDS"
zcall GET "/crm/v2.2/Analytics?category=everything&per_page=50" | jparse "
import sys,json
r=sys.stdin.read(); j=json.loads(r.split(' ',1)[1],strict=False)
for d in j.get('Analytics',[]): print('    %s' % d.get('name'))
"

if [ "$RUN_REGRESSION" = "1" ]; then
  echo "\n▸ REGRESSION SUITE  (creates and deletes probe records)"
  zcall POST "/crm/v7/functions/verifyplatform/actions/execute?auth_type=oauth" | jparse "
import sys,json,re,codecs
r=sys.stdin.read()
m=re.search(r'\"output\":\"(.*?)\",\"output_type\"',r,re.S)
if not m: print('  could not run:', r[:200]); raise SystemExit
j=json.loads(codecs.decode(m.group(1),'unicode_escape'),strict=False)
print('  PASS %s  FAIL %s  ok=%s  (%s)' % (j['pass'],j['fail'],j['ok'],j['run_at']))
for c in j['checks']:
    if c['status']!='PASS': print('    [FAIL] %s -> %s' % (c['name'], str(c.get('detail'))[:120]))
if j['cleanup']['leaked']: print('    LEAKED PROBES:', j['cleanup']['leaked'])
else: print('  probes cleaned: %d' % len(j['cleanup']['deleted']))
"
else
  echo "\n▸ REGRESSION SUITE  skipped (--no-regression)"
fi

echo "\n═══════════════════════════════════════════════════════════════"
