#!/bin/bash
#  Guards against unrounded percentage arithmetic in the Deluge engines.
#
#  WHY THIS EXISTS
#    matchOpportunities computed data_completeness as `dc * 100 / 9`. Eight of
#    the ten possible values are repeating decimals, and that number is both
#    the tier-4 ranking comparator AND rendered straight into the student's
#    rank_reason — so a family could read
#      "88.88888888888889% against 100%"
#    studentIntelligence and readinessSweep had the same shape. Fixed by
#    rounding at the source, 2026-09-01.
#
#    Deluge runs inside Zoho and cannot be unit tested from here, so this is a
#    source guard rather than a behavioural test: any new `* 100 /` that is not
#    wrapped in round() fails the build.
#
#  USAGE  bash scripts/check-deluge-rounding.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/functions/src"
fail=0

[ -d "$SRC" ] || { echo "SKIP  no Deluge source at $SRC"; exit 0; }

#  A percentage line is safe when round( appears on it. Comment lines and the
#  string "100%" inside student-facing prose are not arithmetic and are skipped.
while IFS= read -r hit; do
  file="${hit%%:*}"; rest="${hit#*:}"; line="${rest%%:*}"; code="${rest#*:}"
  trimmed="$(printf '%s' "$code" | sed 's/^[[:space:]]*//')"
  case "$trimmed" in
    \*\ *|/\**|//*) continue ;;            # comment bodies
  esac
  if printf '%s' "$code" | grep -q "round("; then
    continue
  fi
  echo "FAIL  $(basename "$file"):$line  unrounded percentage -> $trimmed"
  fail=1
done < <(grep -rn '\* 100 /\|\* 100)[[:space:]]*/\|100 \* ' "$SRC"/*.dg 2>/dev/null)

if [ "$fail" -eq 0 ]; then
  echo "PASS  no unrounded percentage arithmetic in Deluge engines"
  exit 0
fi
echo
echo "Round at the calculation source, e.g.  round(dc * 100 / 9,0)"
echo "A raw float here reaches a student verbatim and is also compared during ranking."
exit 1
