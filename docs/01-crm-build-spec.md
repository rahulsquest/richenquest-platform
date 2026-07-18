# File 01 — CRM Build Spec (build this exactly as written)
Zoho CRM · budget 3–4 hours · everything is click-by-click

---

## 1. One-time setup
1. Open Zoho CRM → Setup (gear icon, top right).
2. **Company Details:** name, logo, time zone Asia/Kolkata, currency INR.
3. **Users & Roles:** Roles = CEO → Manager → Counselor / Operations / Finance. Data sharing: "Private" with role hierarchy (counselors see their own records; managers see their team; you see all).

## 2. Modules we use
- **Leads** — every new inquiry (not yet paying)
- **Contacts** — converted students + parents
- **Deals** — renamed to **"Student Cases"** (Setup → Customization → Modules → Deals → rename). One Deal = one student's journey.
- Later (Week 4): a new custom module **"University Partnerships"** (file 02)

## 3. Custom fields to create
Setup → Customization → Modules and Fields → pick module → Create Field.

**Leads:**
| Field | Type | Options |
|---|---|---|
| Lead Source Detail | Pick list | Website Form, WhatsApp, Instagram, Facebook, Google Ads, Walk-in, Referral, Education Fair, Other |
| Interested Country | Multi-select | [YOUR TOP COUNTRIES] |
| Interested Level | Pick list | Bachelor's, Master's, Diploma, PhD, PR/Immigration, Other |
| Intended Intake | Pick list | Jan 2027, May 2027, Sep 2027, 2028, Undecided |
| Budget Range | Pick list | <10L, 10–20L, 20–35L, 35L+ |
| Preferred Language | Pick list | English, Hindi, [regional] |
| WhatsApp Number | Phone | |

**Student Cases (Deals):**
| Field | Type |
|---|---|
| Destination Country | Pick list |
| Course & University (final) | Single line |
| Assigned Counselor | User lookup |
| Service Package | Pick list (your services) |
| Document Status | Pick list: Not Started, Collecting, AI Pre-checked, Verified, Complete |
| Visa Status | Pick list: N/A, Preparing, Lodged, Biometrics Done, Approved, Refused |
| Next Deadline | Date |

## 4. Pipeline stages (Student Cases)
Setup → Modules → Deals → Stage-Probability mapping. Replace defaults with:

1. New Inquiry (10%)
2. Counseling Booked (20%)
3. Counseling Done (30%)
4. Agreement Sent (40%)
5. **Agreement Signed — CLIENT** (60%)
6. Documents in Progress (65%)
7. Applications Submitted (70%)
8. Offer Received (80%)
9. Visa Filed (90%)
10. Visa Approved — Won (100%)
11. Closed Lost (0%) — with mandatory "Lost Reason" pick list: Went Silent, Chose Competitor, Budget, Not Eligible, Postponed, Visa Refused

> After the basics run smoothly (Week 3+), upgrade this to a **Blueprint** (Setup → Process Management → Blueprint) which physically blocks stage-skipping and forces required fields at each transition. Ask me when ready — I'll spec each transition.

## 5. Automations (Workflow Rules)
Setup → Automation → Workflow Rules → Create Rule. Build these five:

### 5.1 Instant lead response (speed-to-lead — your #1 conversion lever)
- **Module:** Leads · **When:** On Create
- **Actions:** ① Send email — template "Welcome – 60 Second Reply" (copy in file 03 §3.1) ② Create Task "Call new lead" due **today**, assigned to lead owner, priority Highest ③ Cliq notification to `#leads` channel: "🔔 New lead: ${Leads.Last Name} — ${Leads.Interested Country} — call within 5 minutes"
- **Assignment:** Setup → Automation → Assignment Rules → round-robin among counselors (or by Interested Country once team specializes).

### 5.2 Stale lead rescue
- **Module:** Leads · **When:** Date/time based — Lead Status is "Contacted" AND no activity for 3 days
- **Actions:** email template "Checking in" + task for owner + after 7 days total silence, move Status to "Nurture" (drops into the long-term email drip, file 03 §3.3). Leads are never deleted — nurture forever.

### 5.3 Stage-triggered client updates
- **Module:** Deals · **When:** Stage changes
- On *Agreement Sent* → email with signing link + task "follow up if unsigned in 48h"
- On *Agreement Signed* → welcome/onboarding email (file 03 §3.2), Cliq post to `#wins`, task for Operations "Create document checklist + WorkDrive folder", and (Week 3+) auto-invoice via Books integration
- On *Offer Received* / *Visa Approved* → congratulation email + WhatsApp template + `#wins` post

### 5.4 Overdue task escalation (the "nobody chases anyone" system)
- **Module:** Tasks · **When:** Date-based, Due Date is 1 day past & Status ≠ Completed → email reminder to owner
- Second rule at 3 days past → notify owner's manager via Cliq + email
- This means managers only ever see *exceptions*, and no human plays follow-up police.

### 5.5 Deadline guardian
- **Module:** Deals · **When:** "Next Deadline" is 7 days away → task for counselor + Cliq alert; again at 2 days with priority Highest.

## 6. WorkDrive structure (create once, template forever)
Team Folder `Students` → subfolder template per student:
```
{Student Name – Case ID}/
  01-Identity (passport, photos)
  02-Academic (transcripts, degrees, IELTS)
  03-Financial (bank statements, loan letters)
  04-SOP-LOR
  05-Applications & Offers
  06-Visa
  07-Agreements & Invoices
```
Manual for MVP: Operations copies this template folder at "Agreement Signed" (the 5.3 task reminds them). We automate folder creation via Deluge in Phase 2.

## 7. Website forms → CRM
1. **Zoho Forms** → New Form: Name, Email, Phone/WhatsApp, Interested Country, Level, Intake, Message.
2. In the form builder → **Integrations → Zoho CRM** → map every field to the Lead fields above, set Lead Source = "Website Form".
3. Share → Embed → copy the iframe code → paste into your website page (send me your website platform — WordPress/Wix/other — and I'll give exact paste instructions).
4. Repeat for a short "Book Free Counseling" form that redirects to your Zoho Bookings page after submit.
5. Facebook/Instagram lead ads: Setup → Marketplace → install "Facebook Lead Ads" extension → connect your page → map fields. Every ad lead lands in CRM in seconds with source tagged.

## 8. Dashboards (Zoho Analytics)
Open Analytics → it auto-syncs CRM + Books. Create two dashboards; add widgets via "Ask Zia" by typing these questions, then pin each result:

**Founder dashboard (your Monday 7):** ① Leads this week vs last ② Leads by source ③ Lead→Agreement conversion % ④ Pipeline value by stage ⑤ Revenue collected this month (Books) ⑥ Outstanding invoices ⑦ Overdue tasks by owner

**Manager dashboard:** leads by counselor, avg first-response time, counseling sessions held, stalled deals (no activity 5+ days), tasks overdue by person, lost reasons this month.

## 9. Basic finance (Zoho Books)
1. Books → Settings → Taxes: add your GST details.
2. Items: create one item per service package with fee.
3. Settings → Online Payments → connect **Razorpay** (create free Razorpay account first — needs PAN, bank account, ~1 day approval).
4. Settings → Reminders: enable auto payment reminders at due−3, due date, due+3, due+7.
5. MVP invoicing flow: when a deal hits "Agreement Signed", the workflow task tells Finance to raise the invoice in Books (2 clicks, payment link auto-included). Full auto-invoice sync comes in Phase 2 once packages stabilize.

## 10. Approvals
Setup → Process Management → **Approval Processes**: create "Discount Approval" — if Deal field "Discount %" > 10, record locks until CEO approves in one click (mobile app included). Same pattern later for refunds and expenses (Zoho Expense has built-in approval chains — turn on when you enable Expense).
