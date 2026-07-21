# AM0.1 — Zoho One Activation (build-ready runbook)
Milestone: AM0 Foundation · Owner: **Founder (Rahul)** · Effort: ~2h hands-on · File 16 keystone prerequisite.
This is the one item that unblocks everything. It is founder-executed (Zoho console + credentials);
the AI CTO cannot and must not perform account actions.

---

## 0. Why this is first
Nothing in File 16 exists without a live Zoho One org: no CRM spine (AM0.4), no automations (AM1+),
no data for the founder dashboard. The `functions/zoho/` OAuth layer (File 14) is built and waiting —
it needs the org to exist before the refresh token can be generated.

## 1. Pre-flight checks (do these BEFORE clicking "subscribe")

**1a. Confirm current Zoho state — report which case you're in:**
- **Case A:** You already have Zoho One active → skip to §4 (verify) and just confirm the DC.
- **Case B:** You have only a free Zoho account + the `rahulsquest` API-console app → proceed to §3.
- **Case C:** Nothing yet → proceed to §2.

**1b. Credit type & expiry (the gotcha that has burned others — File 13/15).** In Zoho Store /
billing, confirm whether your **₹1.8L credits are promotional or paid wallet**, and their **expiry**.
- Promotional credits **cannot** pay for renewals/add-ons — only new subscriptions/upgrades. If
  promotional, activate the **full Zoho One in one go** (not piecemeal) so the credit applies cleanly.
- Report the credit type + expiry back — it changes how we sequence paid services later.

**1c. Data-centre must match the API app.** The `rahulsquest` OAuth app has a data centre
(`api-console.zoho.in` = India, `.com` = US). **Zoho One MUST be activated in the SAME data centre**
or the OAuth layer can't reach your data. Our default and recommendation is **India (IN)** — matches
File 00, the India audience, and DPDP data-residency. Confirm the app's DC before activating.

## 2. Decisions locked before you click (so there's no rework)
| Decision | Value | Why / irreversibility |
|---|---|---|
| Data centre | **India (IN)** | **Cannot be changed after signup.** Must match the `rahulsquest` app DC and DPDP residency |
| Plan | **Zoho One — All-Employee** | Right container at 5 FTE; credits cover ~2 years (File 08 audit #5) |
| Users | **5** (the full-time core team) | Collaborators use free guest access later, not paid seats |
| Admin | **Rahul as super-admin** | Sole owner of billing + DC + security policy |

## 3. Activation steps (Case B/C)
1. Go to **zoho.com/one** → sign in with the account holding the credits (the same identity as the
   `rahulsquest` app, so everything lives in one org).
2. Subscribe to **Zoho One → All-Employee plan**. When prompted for **data centre, choose India** —
   verify this carefully; it is permanent.
3. Set the number of user licenses to **5**.
4. Apply the credits at checkout; confirm the credit covers the subscription (per §1b).
5. Confirm **Rahul is super-admin** (Admin Panel → Admins).

## 4. Acceptance test (success criteria — File 16 AM0.1)
AM0.1 is "Live" only when ALL are true and reported:
- [ ] Zoho One org is active, **data centre = India** (visible in Admin Panel → org settings).
- [ ] **5 user licenses** available; Rahul is super-admin.
- [ ] The `rahulsquest` API app is in the **same DC** as the org (so File 14's OAuth will work).
- [ ] Credit type + expiry noted (from §1b).
- [ ] You can open **Zoho CRM** from the org app launcher (confirms the app we build on next is provisioned).

## 5. Failure / rollback notes
- **Credits are promotional but won't apply** → do not pay out of pocket; pause and report — we
  confirm the credit program terms before spending.
- **Wrong DC chosen** → data-centre migration is painful; if the org was created in the wrong DC,
  stop and report before adding any data — easier to recreate empty than migrate later.
- No destructive risk here: this creates an org, it touches nothing existing (the live Zoho **Sites**
  website is a separate product and is unaffected).

## 6. What to report back (so I verify and advance to AM0.2)
Reply with: **(1)** which case (A/B/C), **(2)** DC confirmed = India (yes/no), **(3)** 5 users +
super-admin confirmed, **(4)** credit type + expiry, **(5)** the `rahulsquest` app's DC, **(6)** CRM
opens (yes/no). On a clean pass I mark AM0.1 ✅ Live in the AUTOMATION-LOG and issue the AM0.2 spec.

## 7. Start in PARALLEL today (Track B — waits, not work; File 16 §0)
While AM0.1 settles, kick off the long-lead approvals so they cure in the background:
- **AM0.9 WhatsApp BSP + Meta business verification** — the longest pole (days). Pick a BSP
  (AiSensy / WATI / Interakt), start Meta business verification (needs GST/registration doc), request
  a **new dedicated number** (not a personal WhatsApp).
- **AM0.5 Razorpay + GST** — create the Razorpay account (PAN, bank; ~1 day approval); have GST
  details ready for Books.
- **AM0.3 Mail DNS (MX/SPF/DKIM)** — also fixes deliverability for the File 07 partnership emails from
  `official@richenquest.com`. Independent of the website; safe to do now.

These don't block AM0.1's sign-off; they just shouldn't be started *late*.
