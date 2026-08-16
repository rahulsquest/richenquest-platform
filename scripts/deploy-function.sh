#!/bin/zsh
# deploy-function.sh — deploy one Deluge function from functions/src into Zoho CRM.
#
#   ./scripts/deploy-function.sh visaOpsPlan case_id:string
#
# Deploy is create-if-absent, then PUT the script (functions/README.md rule 8).
# Creating twice silently produces "<name>1", so the create is only attempted
# when the name is genuinely absent from the deployed list.
#
# TRANSPORT is the same authenticated-Chrome-tab channel as platform-health.sh.
# The JSON body is base64'd before it crosses the AppleScript boundary — the
# alternative is four levels of quote escaping, which is how a deploy script
# silently ships a corrupted payload.

set -u
ORG="60074018310"
NAME="${1:?usage: deploy-function.sh <FunctionName> [param:type ...]}"
shift
SRC="functions/src/${NAME}.dg"
[ -f "$SRC" ] || { print -u2 "no such source: $SRC"; exit 1; }

zjs () {  # zjs <METHOD> <PATH> <BODY_FILE|-> -> "<status> <body>"
  local M="$1" P="$2" B="$3" B64=""
  if [ "$B" != "-" ]; then B64=$(base64 < "$B" | tr -d '\n'); fi
  local JS="window.__dp=null;(function(){var p=document.cookie.split('; ').filter(function(s){return s.indexOf('crmcsr=')===0})[0]||'';var c=p.slice(7);var o={credentials:'include',method:'$M',headers:{'X-ZCSRF-TOKEN':'crmcsrfparam='+c,'X-CRM-ORG':'$ORG','Content-Type':'application/json'}};var b='$B64';if(b.length>0){o.body=atob(b);}fetch('$P',o).then(function(r){return r.text().then(function(x){window.__dp=r.status+' '+x})}).catch(function(e){window.__dp='ERR '+e.message});})()"
  osascript -e "tell application \"Google Chrome\" to execute active tab of front window javascript \"$JS\"" >/dev/null 2>&1
  local i R
  for i in $(seq 1 20); do
    R=$(osascript -e 'tell application "Google Chrome" to execute active tab of front window javascript "window.__dp"' 2>/dev/null)
    if [ -n "$R" ] && [ "$R" != "missing value" ]; then print -r -- "$R"; return 0; fi
    /bin/sleep 2
  done
  print -r -- "TIMEOUT"
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Does it already exist?
LIST=$(zjs GET "/crm/v2/settings/functions?type=org&start=1&limit=200" -)
FID=$(print -r -- "$LIST" | python3 -c "
import sys,json
r=sys.stdin.read()
try: j=json.loads(r.split(' ',1)[1],strict=False)
except Exception: print(''); raise SystemExit
for f in j.get('functions',[]):
    if f.get('display_name')=='$NAME': print(f['id']); break
")

python3 - "$SRC" "$NAME" "$TMP" "$@" <<'PY'
import sys, json, os
src, name, tmp = sys.argv[1], sys.argv[2], sys.argv[3]
params = []
for spec in sys.argv[4:]:
    pn, _, pt = spec.partition(':')
    params.append({"name": pn, "type": pt or "string"})
script = open(src).read()
# CREATE: `name` is what sets api_name. Sending api_name is ignored on create
# and rejected as DUPLICATE_DATA on update, so it is never sent at all.
# CREATE with a STUB script. File 21: posting the real script on create returns
# 500 INTERNAL_ERROR - the create path does not compile reliably. The real script
# goes up on the PUT, which is a proper syntax checker.
sig = script.split("\n")[0]
stub = sig + "\n{\n\treturn \"stub\";\n}\n"
json.dump({"functions": [{"name": name, "display_name": name,
                          "language": "deluge", "category": os.environ.get("CAT","standalone"),
                          "script": stub, "params": params}]},
          open(os.path.join(tmp, "create.json"), "w"))
# UPDATE: identity fields omitted deliberately. rest_api is what turns the
# endpoint on — without it the function deploys and then answers every execute
# call with NOT_ACTIVE. Creating is not the same as exposing.
json.dump({"functions": [{"script": script, "params": params,
                          "rest_api": [{"type": "oauth", "active": True}]}]},
          open(os.path.join(tmp, "update.json"), "w"))
PY

if [ -z "$FID" ]; then
  echo "▸ CREATE $NAME"
  RES=$(zjs POST "/crm/v2/settings/functions?category=${CAT:-standalone}" "$TMP/create.json")
  print -r -- "$RES" | cut -c1-300
  FID=$(zjs GET "/crm/v2/settings/functions?type=org&start=1&limit=200" - | python3 -c "
import sys,json
try: j=json.loads(sys.stdin.read().split(' ',1)[1],strict=False)
except Exception: print(''); raise SystemExit
for f in j.get('functions',[]):
    if f.get('display_name')=='$NAME': print(f['id']); break
")
  [ -z "$FID" ] && { print -u2 'create did not produce an id'; exit 1; }
fi

# Always PUT. On a fresh create this is what turns the REST endpoint on; on an
# existing function it is the actual deploy.
echo "▸ PUT $NAME (id $FID)"
zjs PUT "/crm/v2/settings/functions/$FID?category=${CAT:-standalone}" "$TMP/update.json" | cut -c1-400
