# FOUNDER-OUTREACH-SYSTEM.md — 2026-08-23
*Copy-paste ready. Nothing here needs adapting before it is sent.*

## Daily activity — 2 hours, non-negotiable

| Block | Time | Activity | Target/day |
|---|---|---|---|
| Morning | 45 min | **New node conversations** (teachers, coaching centres, college staff) | **5** |
| Morning | 15 min | Student follow-ups from yesterday | all |
| Afternoon | 30 min | Student conversations / counselling | 1–2 |
| Afternoon | 20 min | Partner conversations | 1 |
| Evening | 10 min | Log everything · write tomorrow's 5 names | — |

**The morning block is the company.** It has been outstanding for several cycles. Everything
else on this page supports it.

---

## The 10 scripts

### 1 · Teacher / coaching-centre owner — cold WhatsApp
> Respected {{name}}, I'm Rahul Kumar from RichenQuest in Patna. We help students apply to English-taught degrees in Europe.
>
> I'm not asking you to recommend us. I'm asking whether I can send you one thing: a written breakdown of what a European degree actually costs an Indian family in the first year — tuition, rent, insurance, visa, the residence permit, flights. With the source of every figure.
>
> Your students get quoted a tuition fee and find out about the rest in November. If it's useful, share it. If it isn't, tell me why and I'll fix it.

### 2 · Teacher — the follow-up that earns the relationship *(day 3)*
> {{name}}, one thing from that breakdown worth knowing even if you never send anyone to us:
>
> Italy has a regional scholarship worth €14,000–16,000 a year that non-EU students can get. But the scholarship deadline closes **before** the university's application deadline. Students apply "on time", get admitted, and lose the funding — because they were tracking the wrong date.
>
> If any of your students are looking at Italy, that's the thing to check.

### 3 · Teacher — the ask, only after value has landed
> {{name}}, if any student asks you about Europe this year, this link gives them a free written cost breakdown and an honest read on whether their budget reaches: {{PORTAL_URL}}
>
> If they mention your name I'll tell you how they get on. No commission, nothing to sign — I just think you should know when a student you sent somewhere does well.

### 4 · Student — first contact
> Hi {{name}}, this is Rahul from RichenQuest in Patna.
>
> Quick question before anything else: has anyone given you a **total** number for studying in Europe — including rent, insurance, the visa and the residence permit? Or just a tuition fee?
>
> Most students only ever see the tuition. It's usually about a fifth of the real cost. I can send you the full breakdown, free, no sign-up.

### 5 · Student — the honest disqualification
> {{name}}, I've looked at your numbers and I want to be straight with you rather than take your file.
>
> With a total budget under ₹10 lakh, an English-taught European degree with living costs isn't realistic for year one. I'd rather tell you now than in November after you've spent money on applications.
>
> Two things that would change this: a sanctioned education loan, or Italy's regional scholarship for a **September** intake — which is a longer game but can bring the cost down enormously. Happy to explain either.

### 6 · Parent — first contact
> Namaste {{name}}, this is Rahul Kumar from RichenQuest, Patna.
>
> {{student}} has been asking about studying in Europe. Before anything else I'd like you to have the number, because you're the one who has to arrange it — not a tuition fee, the whole first-year figure including rent, insurance, visa and flights.
>
> No obligation and nothing to pay. If it's useful we can talk; if not, you still have the number.

### 7 · Parent — the trust line
> One thing I say to every family: we will not guarantee admission or a visa, because nobody can. A university decides one and a government decides the other.
>
> What we do promise is that every figure we give you says where it came from and when we checked it — and that if the timing stops working, you'll hear it from us early, while there's still a next intake.

### 8 · College representative / placement officer
> Respected {{name}}, I'm Rahul Kumar from RichenQuest, Patna.
>
> Would your department find a 30-minute session useful — "what a European degree actually costs, and the four ways families lose money"? No selling from the stage, no sign-ups at the venue. Every figure sourced on the slide.
>
> If it's useful, we do it again. If not, you've lost half an hour.

### 9 · Student community / group admin
> Hi {{name}}, I run RichenQuest, a study-abroad consultancy in Patna.
>
> I'd like to share one thing with your group, not promote anything: a breakdown of what a European degree actually costs an Indian family, with sources. Free, no sign-up, no DMs to your members.
>
> If you'd rather I didn't, that's completely fine — just tell me and I won't ask again.

### 10 · University / partner — factual, never a pitch
> Dear {{office}},
>
> We are an education consultancy in Patna, India advising students on English-taught programmes in {{country}}. We cite institutions directly rather than estimating, so we would like to confirm {{specific fields}}.
>
> {{numbered questions — only what is genuinely missing}}
>
> We will use this only for accurate student guidance.

**Why this one works:** all 6 emails sent so far asked only for missing facts. A factual
question is lower-friction than a partnership request and produces something usable either
way.

---

## CRM pipeline — maps to existing fields, no new schema

| Stage | `Lead_Status` | Also set |
|---|---|---|
| New conversation | `Not Contacted` | `Lead_Type`, `Market`, `Lead_Source` |
| Interested | `Contacted` | `Lead_Source_Detail` = channel |
| Qualified | `Pre-Qualified` | budget · intake · passport · parent all captured |
| Counselling booked | `Contacted` + a **Task** | Task = the booking; there is no picklist value for it |
| Application / service | convert → **Contact + Deal** | `Stage` takes over |
| Converted | `Deals.Stage` | — |
| Outcome tracked | `Case_Events` | 21 event types |
| Lost | `Lost Lead` / `Not Qualified` | reason in Description |

**Two honest gaps:**
1. **"Counselling booked" has no picklist value.** Use a Task rather than inventing one —
   adding a value changes reporting for a stage that lasts days.
2. **A node conversation is not a student lead.** Use `Lead_Type = Organization` with the
   coaching centre as the name. Not perfect; better than a spreadsheet nobody opens.

## Required fields on every conversation
`Last_Name` · `Phone` · `Lead_Type` · `Market` · `Lead_Source` · `Lead_Status` ·
**`Referred_By_Name`** *(pending the fix in `FOUNDING-50.md`)* · `Description` = what they
actually said, verbatim.

**Verbatim matters.** Paraphrase loses the objection, and the objections are the data.
