# File 04 — AI Chatbot + Starter SOPs

---

## 1. Website chatbot (Zoho SalesIQ) — live in ~2 hours

### Setup
1. SalesIQ → Settings → Brands → Add your website → copy the embed snippet → paste into your site (send me your platform and I'll give exact steps; WordPress = 2-minute plugin).
2. Settings → Business Hours: 10:00–19:00 IST. In-hours: bot qualifies then offers human chat. Off-hours: bot answers + captures lead + books sessions.
3. **Answer Bot:** Settings → Bots → Answer Bot → point it at your **Resources** (FAQs + Articles). It answers from ONLY that knowledge — build the knowledge below first, then enable. Unanswered questions → auto-collect contact + create CRM lead + Cliq alert.

### Guided flow (Codeless Bot Builder — drag & drop)
Welcome → "What brings you here today?" with buttons:
- **🎓 Study abroad** → Which country? → Which level? → When do you plan to start? → "Great — let's get you a free counseling session" → name/phone/email → pushes Lead to CRM (fields mapped) → shows Bookings calendar inline
- **📋 I'm an existing client** → "Your counselor will help you directly" → captures name+phone → creates CRM task for the counselor + Cliq alert (status questions go to humans until the portal exists)
- **💰 Fees** → package overview card → booking CTA
- **🏛️ University partnership inquiry** → captures details → creates University Partnerships record → DM to you
- **Anything typed** → Answer Bot tries; below confidence → "Let me connect you to our team" → lead capture

### FAQ knowledge to load (I've drafted these — EDIT THE FACTS, keep the tone)
Write each as a Resource article. Placeholders need your real data:

1. **What does RichenQuest do?** — services in 3 sentences + cities + booking link
2. **What are your fees?** — package names + price ranges + what's included + "counseling session is free"
3. **Which countries do you work with?** — list + one-line strength per country
4. **How long does the process take?** — typical timeline from counseling to visa per country
5. **What documents will I need?** — the generic checklist + "your counselor gives you the exact list"
6. **Do you help with education loans?** — your actual answer
7. **What are your visa success rates?** — only claims you can substantiate
8. **Can my parents join the counseling call?** — yes + how
9. **Do you help after the visa?** (pre-departure, accommodation) — your actual answer
10. **Where are your offices / timings?**

**Safety rules (already reflected in the flow):** the bot never predicts visa outcomes, never gives case-specific immigration advice, never quotes exact university admission chances — those always route to a human counselor. This is both an ethics line and a legal-exposure line for an immigration business.

### Phase 2 upgrades (ask me when Phase 1 is stable)
- Same knowledge base powering the WhatsApp bot via your BSP
- OpenAI/Claude-powered Zobot for natural conversation (SalesIQ supports LLM plugs) with the same guardrails
- Client status self-service once the Creator student portal exists

---

## 2. Starter SOPs (load into Zoho Learn as courses; every new hire completes them)

I've written the skeletons — you fill company-specific facts, I'll polish any of them on request.

### SOP-01: New Lead Handling
Purpose: no lead waits more than 5 minutes in office hours.
1. Cliq alert or task fires → open lead in CRM (mobile app fine)
2. Call within 5 min. No answer → WhatsApp template `welcome_inquiry` + retry after 2h → schedule next-day attempt
3. During call: fill Country, Level, Intake, Budget on the lead — these fields drive every later automation
4. Outcome: book counseling in Bookings (never verbal promises) OR mark Not Eligible with reason OR mark Nurture
5. NEVER: quote guaranteed admission or visa outcomes; discuss fees beyond the published packages without manager approval

### SOP-02: Counseling Session
Prep (10 min): review lead record; check university options for their profile. Session (30–45 min): profile → goals → realistic options (3 universities: ambitious/match/safe) → costs honestly → our service & fees → next step = agreement. After: log summary in CRM (or record + paste to Claude for a structured summary), move stage, send agreement same day.

### SOP-03: Document Collection & Verification
1. At Agreement Signed: copy WorkDrive template folder, send Day-0 onboarding email with checklist
2. Every document verified against: name matches passport exactly · dates consistent · validity/expiry · legibility · completeness
3. Verification is **two-eyes**: collector marks "Uploaded", a second person marks "Verified" — the field in CRM tracks this
4. Discrepancy → task + WhatsApp `document_request` with the specific fix
5. NEVER submit an application with unverified documents; NEVER advise altering any document (instant termination offense — this protects the company's license to operate)

### SOP-04: Application Submission
Pre-submission checklist (all Document Status = Verified, program/intake confirmed in writing with student, fees ready) → submit on university/aggregator portal → save confirmation PDF to folder 05 → log application ID in CRM → stage to Applications Submitted (triggers client update automatically).

### SOP-05: Payment & Refund Handling
Invoices only from Books (never WhatsApp amounts without invoice) · payment links only via Books/Razorpay · refund/discount requests go through CRM approval process — no verbal commitments · receipts are automatic, never manual.

### SOP-06: University Partnership Replies
Reply within 4 hours in office hours · always answer their specific question first · call scheduling via your Bookings link · commission terms: only you negotiate; team forwards to you · every touch logged on the Partnership record.

### SOP-07: Escalation Matrix
Client angry / threatens complaint → Manager same-day · visa refusal → counselor + you notified, empathy call within 24h (template response: I'll draft it) · press/legal/regulator contact → you only · data breach suspicion → freeze, tell Automation Owner + you immediately.

---

## 3. Living-document rule
Every SOP ends with: "If reality differs from this SOP twice in a week, tell the Automation Owner — we change the SOP or the automation, not the habit of following it."
