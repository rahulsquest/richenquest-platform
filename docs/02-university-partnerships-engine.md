# File 02 — University Partnership Engine
Your B2B revenue system: research → outreach → pipeline → signed agreement

---

## 0. Honest strategy note (founder to founder)

Most universities don't sign agents from a cold email alone — but cold email **starts the conversation**, and the money is in the *follow-up system*, which is exactly what we automate. Also know the two-track reality:

- **Direct agreements** (university signs you as a recruitment agent, pays 10–20% of first-year tuition commission). Slower, needs credibility (track record, sometimes AIRC/ICEF/British Council certification), highest margin.
- **Aggregator platforms** (ApplyBoard, Adventus, KC Overseas / other master agents) give you instant access to hundreds of universities at a shared commission. **Start recruiting students through aggregators in Week 1 while the direct-partnership engine works in the background.** Direct deals then replace aggregator deals university-by-university as your volume proves itself.

Quality guardrail: we send **personalized, researched, low-volume** outreach (25–40/week), never mass spam. Universities blacklist spammers; reputation is the asset.

---

## 1. CRM setup (30 min)

Create custom module: Setup → Customization → Modules → **New Module** → name it `University Partnerships`.

**Fields:**
| Field | Type | Options |
|---|---|---|
| University Name | Single line | |
| Country | Pick list | your targets |
| Ranking Tier | Pick list | Top 200, 200–500, 500–1000, Other |
| Relevant Programs | Multi-line | |
| Intl. Office Contact Name | Single line | |
| Contact Title | Single line | |
| Contact Email | Email | |
| LinkedIn URL | URL | |
| Agent Application URL | URL | many universities have an online agent-application form |
| Route | Pick list | Direct, Via Aggregator, Regional Rep |
| Stage | Pick list | Research, Contact Found, Email 1 Sent, Engaged/Replied, Call Scheduled, Application Submitted, Agreement in Review, **Partner — Signed**, Dormant |
| Commission Terms | Single line | |
| Next Follow-up Date | Date | |
| Notes / Personalization Angle | Multi-line | |

**Automations (same pattern as file 01 §5):**
- Stage = "Email 1 Sent" → auto-create follow-up tasks at +4, +9, +16 days (emails 2–4 below)
- Stage = "Engaged/Replied" → Cliq alert to you + task "reply within 4 hours"
- Next Follow-up Date arrives → task + reminder
- Stage = "Partner — Signed" → 🎉 `#wins` post + task "add university to course database + announce to counselors"
- No activity 30 days after Email 4 → auto-move to "Dormant" (we re-touch dormants quarterly with a news-triggered email)

---

## 2. Research engine — how we find universities & contacts

This is where **I do the heavy lifting with you, weekly, in this chat**:

**The Monday routine (20 min of your time):**
1. You message me: "Partnership research: [country], [level/field], batch of 15."
2. I research live (web search) and return a filled table: university, why it fits your students, international/agent office contact page, named contact where publicly listed, agent-application URL, and a **personalization angle** for each (recent India recruitment activity, new programs, existing agent network signals).
3. You paste/import the table into the University Partnerships module (I'll format it as import-ready CSV so it's Upload → Done).

**Prioritization logic I'll apply:** universities that (a) already work with agents in India, (b) match your students' budget/score profile, (c) have Jan+Sep intakes, (d) are actively expanding international recruitment. Tier-2/3 universities in your target countries convert far better than famous names — they *need* recruitment partners.

**Contact-finding rules:** we use official channels first — the university's "International partnerships / Agents / Representatives" page (most have one, often with a form or named regional manager for South Asia). LinkedIn for the person's name and title. If no contact is public, the agent-application form *is* the channel. No scraped/purchased email lists — they poison deliverability and reputation.

---

## 3. The outreach sequences (copy into Zoho CRM email templates)

Send from a real person's address (you), not info@. Setup → Templates → Email Templates → module: University Partnerships.

### Email 1 — Day 0 (personalized opener)
**Subject:** Student recruitment partnership — [University] × RichenQuest (India)

Dear [Name / International Partnerships Team],

I'm [Your Name], founder of RichenQuest, an education consultancy based in [City], India. We currently counsel [N] students per intake targeting [Country], primarily for [programs] — a strong match for [University]'s [specific program/school — THE PERSONALIZATION ANGLE GOES HERE].

We'd like to explore representing [University] in India as an official recruitment partner. In our current pipeline, [X] students fit your typical entry profile for the [intake] intake.

About us: [YEARS] years in operation · [STUDENTS PLACED] students placed · offices in [CITIES] · full pre-departure and compliance support, including thorough document verification before any application reaches your admissions team.

Could you share your agent application process, or would a short call suit better? I'm happy to work around your time zone.

Warm regards,
[Name, title, phone, website, WhatsApp]

### Email 2 — Day 4 (value add)
**Subject:** Re: partnership — India market snapshot for [University]

A quick addition to my note last week: [one-line insight — e.g., "demand from our students for {field} programs in {country} is up sharply this intake, and {University}'s {program} sits exactly in the fee band our students target (₹X–Y)."]

If useful, I can send a one-page profile of the student segments we'd realistically recruit for you this intake. Who is the right person if not yourself?

### Email 3 — Day 9 (proof + easy yes)
**Subject:** Re: partnership — 15-minute call?

I appreciate international offices receive many agency requests, so briefly, what makes us worth 15 minutes: [strongest proof point — placement numbers, visa success rate, certification, or a named partner institution]. Would a 15-minute intro call this or next week work? Booking link: [Zoho Bookings link]. If there's an agent application form you'd prefer I complete first, point me to it and I'll submit this week.

### Email 4 — Day 16 (graceful close, door open)
**Subject:** Re: partnership — closing the loop

I'll assume the timing isn't right and won't email again on this. If your India recruitment plans change, we'd welcome the conversation — we'll be recruiting for [Country] every intake regardless, and we'd rather send [University] well-prepared applicants directly. Best wishes for the [intake] cycle.

*(This email gets the most replies of the four. Every professional sequence works this way.)*

**After signing:** I'll draft your onboarding checklist per partner (commission agreement filed in WorkDrive+Vault, programs loaded into your course database, counselor briefing note, co-branded promo request).

---

## 4. What I need from you to finalize the sequences
1. The proof points: years active, students placed, visa success rate, any certifications (ICEF/British Council/AIRC?), any existing university/aggregator relationships I can name.
2. First research target: which country + study level first?
3. Whether you're open to the aggregator fast-track in parallel (recommended — revenue in weeks, not months).

## 5. Weekly cadence once live
- Mon: research batch with me (15 new universities) → import
- Tue–Thu: send ~8 Email-1s/day (personalized — the angle field makes this a 3-min edit each, not a rewrite)
- Automations handle every follow-up task; you only write replies to engaged universities
- Fri: 5-min pipeline review — you paste me the stage counts, I flag what to push

**Realistic targets:** 150 universities contacted in month 1–2 → 15–25 replies → 5–10 calls → 2–5 agreements or portal approvals. Compounds every month because nothing ever falls through the cracks — the CRM remembers forever.
