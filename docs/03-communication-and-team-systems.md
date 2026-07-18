# File 03 — Communication Systems
WhatsApp · Email sequences · Daily team check-ins

---

## 1. WhatsApp automation (start Day 6 — approvals take days)

**Setup path (non-technical):**
1. Create a **Meta Business Manager** account (business.facebook.com) and verify your business (GST certificate / registration doc — verification can take a few days, start now).
2. Sign up with a WhatsApp BSP — AiSensy, Interakt, or WATI (all India-friendly, ~₹1–2.5k/month + Meta's per-conversation fees). They walk you through connecting a **new dedicated number** (don't use your personal WhatsApp number — the API takes over the number completely).
3. In the BSP dashboard → Integrations → Zoho CRM (all three offer native Zoho integration) → connect. Now WhatsApp chats log against CRM leads automatically.
4. Submit the templates below for Meta approval (BSP dashboard → Templates). Approval: minutes to ~2 days each.

**Templates to submit (Meta requires pre-approval for business-initiated messages):**

- **welcome_inquiry** — "Hi {{1}}! Thanks for contacting RichenQuest 🎓 We help students study in {{2}}. A counselor will call you within a few minutes during office hours (10am–7pm). Meanwhile, you can book a free counseling session here: {{3}}"
- **appointment_reminder** — "Hi {{1}}, reminder: your counseling session with {{2}} is tomorrow at {{3}}. Join/location: {{4}}. Reply RESCHEDULE if you need a new time."
- **document_request** — "Hi {{1}}, to move your {{2}} application forward we need: {{3}}. Upload here: {{4}}. Deadline: {{5}}. Reply HELP if you have questions."
- **stage_update** — "Update on your application, {{1}}: {{2}} ✅ Next step: {{3}}. Track everything here: {{4}}"
- **payment_reminder** — "Hi {{1}}, a gentle reminder: invoice {{2}} for ₹{{3}} is due on {{4}}. Pay securely here: {{5}}. Already paid? Please ignore this."
- **offer_congrats** — "🎉 Congratulations {{1}}! You've received an offer from {{2}}! Your counselor {{3}} will call you today about next steps."
- **visa_approved** — "🎉🎉 {{1}}, your {{2}} visa is APPROVED! We're thrilled for you. Your pre-departure checklist is on its way. — Team RichenQuest"

**Wiring:** in your BSP's Zoho integration, map each CRM workflow (file 01 §5.3) to fire the matching template. Your BSP support team will do this mapping with you on a call — tell them "trigger template X on Zoho Deal stage change Y" and show them this list.

**Auto-replies (no approval needed for replies within 24h of a user message):** set keyword rules in the BSP — "fees"→fee overview + booking link, "status"→"checking with your counselor" + creates CRM task, anything else→FAQ menu. (The AI answer bot upgrade comes in file 04.)

---

## 2. Client onboarding sequence (fires at "Agreement Signed")

Set up in Zoho CRM email templates + workflow 5.3, or Zoho Marketing Automation journey later.

- **Day 0 — Welcome:** what happens next (3 steps), counselor's name & direct number, document checklist attached, portal/WorkDrive upload link, WhatsApp opt-in confirmation.
- **Day 2 — Documents guide:** the checklist explained in plain language, common mistakes (name spelling must match passport exactly; bank statement rules), video/PDF guide.
- **Day 7 — Check-in:** "how's document collection going?" + auto-lists what's still pending (counselor fills merge field), reassurance about timeline.
- Thereafter, all communication is **stage-triggered**, not time-triggered — clients hear from you the moment something real happens, which is what kills "any update??" anxiety.

## 3. Lead email sequences

### 3.1 Instant welcome (workflow 5.1)
Subject: **Your study-abroad plan for [Country] — RichenQuest**
"Hi [Name], thanks for reaching out! A counselor will call you shortly (we're fast ⚡). Want to skip ahead? Book your free 30-min counseling session: [Bookings link]. Meanwhile, three things students ask us first: [fees overview link] · [country guide link] · [WhatsApp us] button."

### 3.2 Onboarding — see §2.

### 3.3 Long-term nurture drip (for "Nurture" leads — Zoho Campaigns, monthly)
Rotating value emails: intake deadline calendars, scholarship roundups, visa rule changes, student success story, "costs of studying in X" breakdowns. Each ends with the booking link. Cold leads routinely revive 3–6 months later at intake season — this drip is why they revive with *you*.
**I'll write every one of these** — each month, ask me: "nurture email for [month], audience [country-interest]" and I'll draft it in your voice.

---

## 4. Daily team check-in system (Cliq)

**MVP version — zero code, live in 10 minutes:**
1. Cliq → create channel `#daily-updates`.
2. Cliq → ⚙️ Admin Panel (or bots section) → **Scheduled message** in `#daily-updates`, Mon–Sat 6:00 pm:
   "📝 Daily check-in — reply in thread before 6:30 pm:
   1️⃣ What did you complete today?
   2️⃣ Any blockers?
   3️⃣ Top priority tomorrow?"
3. Team replies in-thread (30 seconds each, phone-friendly).
4. **Your part (2 min/day):** skim threads each evening. Or paste the day's threads to me anytime and I'll produce the summary + flag risks ("Priya has mentioned the same blocker 3 days running").

**Phase 2 upgrade (Week 4+):** a Cliq bot DMs each person individually, writes answers to a table, and an AI summary posts automatically to your management channel at 7 pm. I'll build the bot code when the manual rhythm has stuck — habit first, automation second (automating a habit nobody has yet fails every time).

**Weekly + monthly rollups:** every Friday, ask me: "weekly team summary" and paste the week's checkins + your dashboard numbers — I'll return a one-page founder brief: wins, risks, per-person highlights, and the one thing to fix next week. Same monthly. (Once Cowork/n8n is set up, this becomes fully automatic.)

---

## 5. Internal notification map (so Cliq stays signal, not noise)
| Event | Channel | Who acts |
|---|---|---|
| New lead | #leads | Assigned counselor — 5-min call SLA |
| Agreement signed / offer / visa approved | #wins | Everyone celebrates 🎉 |
| Task 3+ days overdue | DM to manager | Manager |
| Discount/refund approval request | #finance-approvals | You — one-tap approve |
| Payment received (Books) | #finance-approvals | FYI |
| University replied (partnerships) | DM to you | You — 4-hour reply SLA |
| Automation error (Phase 2) | #ops-alerts | Automation Owner |

Everything else stays out of channels. Notification fatigue kills automation systems faster than bugs do.
