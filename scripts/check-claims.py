#!/usr/bin/env python3
"""
Scans the Deluge engine for BARE probability claims.

Written because an ad-hoc grep gave a false FAIL three times running:
  - a 16-char capture window truncated "never estimates a probability"
  - "\bnot\b" does not match inside the word "Nothing"
  - Zoho's Deal "Probability" field is a CRM concept, not a claim

A claim is BARE only if it is not negated, not the qualityGate banned-phrase
list, and not a reference to the CRM field.
"""
import re, glob, sys

NEG = re.compile(r'\b(no|not|never|neither|cannot|nobody|nothing|without)\b|\bNothing\b', re.I)
hits, bare = [], []
for f in sorted(glob.glob('functions/src/*.dg')):
    for i, line in enumerate(open(f), 1):
        for m in re.finditer(r'probability', line, re.I):
            pre = line[max(0, m.start() - 70):m.start()]
            word = line[m.start():m.start() + 11]
            if 'compliance = {' in line:
                v = 'BANNED-LIST'
            elif word == 'Probability' and 'Deal' in line or 'corrupt Probability' in line:
                v = 'CRM-FIELD'
            elif NEG.search(pre):
                v = 'DISCLAIMER'
            else:
                v = 'BARE'
                bare.append((f, i, line.strip()[:90]))
            hits.append(v)

print(f"probability occurrences: {len(hits)}")
for v in ('DISCLAIMER', 'BANNED-LIST', 'CRM-FIELD', 'BARE'):
    print(f"  {v:<12} {hits.count(v)}")
if bare:
    print("\nBARE CLAIMS:")
    for f, i, t in bare:
        print(f"  {f}:{i}  {t}")
    sys.exit(1)
print("\nPASS - no bare probability claims")
