# File 35 — University research log & outreach assets

**Rule applied throughout: an email address is recorded only if I read it on the institution's own
page.** No pattern-guessing (`partnerships@<domain>`), no search-snippet transcription, no
inference. Every record carries its source URL in `Description`, so any entry can be re-checked.

---

## 1. Research results — COMPLETE

**Every one of the 17 records now has either a verified contact address or a documented reason it
cannot be obtained automatically.** That was the stopping condition; it is met.

**Contactability: 1/17 → 11/17.** Excluding the two service providers that are out of scope,
**11 of 15 universities (73%) are contactable.**

### Verified contacts — 11

Ranked by channel quality, because a partnerships desk and a general inbox are not the same asset.

| # | University | Address | Channel | Named contact |
|---|---|---|---|---|
| 1 | **CBS International** | `representatives@cbs.de` | **Agent representatives** | Mirjam Zimmermann-Nixdorf, Operational Teamlead International Sales |
| 2 | **Vistula Warsaw** | `cooperation@vistula.edu.pl` | **Educational agency partnerships** | — |
| 3 | **University of Europe** | `partners@ue-germany.com` | **Agencies & career consultants** | — |
| 4 | **IU International** | `partners@iu.org` | **Partnerships** | Partnerships Team |
| 5 | **Gisma** | `partners@gisma.com` | **Partnerships** | — |
| 6 | **Munich Business School** | `incoming@munich-business-school.de` | International Mobility **& Partnership** Coordinator | Sirin Dureidi |
| 7 | Griffith College | `international@griffith.ie` | International / Global Engagement | — |
| 8 | Arden University Berlin | `studyberlin@arden.ac.uk` | Berlin campus | — |
| 9 | Wittenborg | `admission@wittenborg.nl` | Admissions | — |
| 10 | Constructor Bremen | `study@constructor.university` | Admissions / study | — |
| 11 | BSBI | `info@berlinsbi.com` | General inbox only | — |

**Six of these are true partnership channels** (#1–6). The remaining five are admissions or general
inboxes — usable, but they need a different opening line and should not be treated as warm routes.

**The single most important finding is not an address.** CBS's Agent Corner documents its
application requirements: **at least two references from universities already worked with, plus a
business licence.** `claims.json` records `partnerships.signed: []`, so **RichenQuest cannot
complete that application today.** Approach CBS for a conversation, not via the form — and expect
the same prerequisite elsewhere. This is a chicken-and-egg the founder should know about before
being surprised by it.

### Documented as not obtainable — 6

| University | Reason | What unblocks it |
|---|---|---|
| **SRH Berlin** | Every address **obfuscated** on-page as `[email protected]` | A human opening the International Office page in a browser |
| **National College of Ireland** | **No address published** — contact form only | Submit the form manually; the form *is* the channel |
| **Dublin Business School** | **HTTP 403** to automated requests (WAF), two paths tried | A human browser |
| **Macromedia** | **HTTP 403** to automated requests (WAF), two paths tried | A human browser |
| Fintiba | **Out of scope** — blocked-account/insurance provider, not a university | n/a — student-services supplier, different workflow |
| Expatrio | **Out of scope** — same | n/a |

**Only four are genuine gaps**, and all four are ~5 minutes of human browsing each. None is a
research dead end; all are tooling limitations, recorded as such in each record's `Description`.

**A search snippet offered `info.hsbe@srh.de` for SRH. It was not recorded.** A snippet is not
verification, and a bounced first contact costs more than an empty field.

---

## 2. Partnership pipeline — outreach order

All 17 remain at `Partnership_Stage: Identified`. Finding an address is not outreach.

### Recommended sequence

**Wave 1 — true partnership channels (send first, 6 universities)**
CBS · Vistula · University of Europe · IU · Gisma · Munich Business School

These have a desk whose job is exactly this conversation. Highest response probability, and their
replies will teach you what the market asks for before you spend goodwill on the weaker channels.

**Wave 2 — admissions/general inboxes (4)**
Griffith · Arden Berlin · Wittenborg · Constructor

Reaching a person who is not responsible for partnerships. Expect forwarding, or silence. Open by
asking *who* the right person is rather than pitching.

**Wave 3 — BSBI (general inbox only)**
Lowest signal. Worth one attempt after Waves 1–2.

**Wave 4 — the four human-browser cases**
SRH, NCI, DBS, Macromedia. Twenty minutes of manual research converts these into Wave 1 or 2.

### Follow-up schedule

Already automated. `logPartnershipContact(id, "email", "outbound", "<summary>", "4")` writes the
`[contact]` note, moves `Identified → Contacted`, and the **Partnership outreach cadence** rule
raises follow-ups at **day 4, 9 and 16**. An inbound reply logged as `"inbound"` moves the record to
`In Discussion` and raises a **same-day, Highest-priority** reply task.

**Nothing further needs building for outreach tracking.** It exists and is verified.

### Missing-information report

| Field | Coverage (15 universities) | Gap |
|---|---:|---|
| `Website` | **15/15 (100%)** | none |
| `International_Office_Email` | 11/15 (73%) | 4, all human-browser cases |
| `International_Office_Contact` | 3/15 (20%) | named people are rarely published; not a blocker |
| Provenance in `Description` | **17/17 (100%)** | none — every record is now auditable to a source URL |
| `Agreement_*` | 0/15 | expected — no agreements exist |

## 3. Outreach assets — built from verified claims only

File 02 §3's drafts could not be used: they depend on `[YEARS] in operation`, `[STUDENTS PLACED]`,
visa success rate, and "a named partner institution" — none of which exist verifiably.
`claims.json` records `partnerships.signed: []`, and File 08 bans partner language outright.

**What `claims.json` does permit**, and therefore what these emails say:

- operating since **2024**
- **1,000+ students guided** (approved phrasing; the verb must be *guided/supported/assisted*, never *placed*)
- **5 core full-time**, 20–25 extended collaborators
- based in **Patna, Bihar**; reach across Bihar, Jharkhand, eastern Uttar Pradesh and **Nepal**
- services: counseling, admissions, scholarships, documentation, interview prep, visa assistance, accommodation and pre-departure

**What they must never say:** any partnership or representation we do not have, any visa success
rate, any placement count beyond the 15 verified, or any ranking/accreditation claim.

### Email 1 — Day 0 · partnerships desk

> **Subject:** Student recruitment partnership — RichenQuest (India) × {University}
>
> Dear {Name / International Partnerships Team},
>
> I'm Rahul Kumar, founder of RichenQuest, a study-abroad consultancy based in Patna, Bihar. We have
> been guiding students since 2024 and have supported over 1,000 students through counseling,
> admissions, scholarship guidance, documentation and visa preparation. Our students come mainly from
> Bihar, Jharkhand and eastern Uttar Pradesh, and from Nepal — regions with strong demand for
> {country} and comparatively little on-the-ground representation.
>
> We would like to explore representing {University} in India. Before applying formally, two
> questions:
>
> 1. Are you currently accepting new recruitment partners for India and Nepal?
> 2. Is there an agent application process you would like us to complete first?
>
> We are a small team — five full-time counselors and a wider network of about twenty — which means
> every application we send is one we have personally checked. We would rather send you ten
> well-prepared applicants than a hundred speculative ones.
>
> Warm regards,
> Rahul Kumar · Founder, RichenQuest Private Limited
> official@richenquest.com · https://richenquest.com

**Why it reads this way:** it opens with what we *are*, asks a direct qualifying question, and makes
a virtue of being small rather than pretending to be large. It contains no unverifiable claim, so
nothing in it can be contradicted later.

### Email 2 — Day 4 · one useful thing

> **Subject:** Re: partnership — a note on the India/Nepal market for {University}
>
> Following up briefly. One thing that may be useful: the students we work with are typically
> self-funded or family-funded and decide on total cost of study rather than headline tuition, which
> is why {country} features so strongly in our counseling.
>
> If it is helpful, I can send a one-page profile of the student segments we would realistically
> recruit for you — level, field, intake and budget band. Would that be useful, and are you the right
> person for this, or should I write to a colleague?

### Email 3 — Day 9 · make it easy to say yes

> **Subject:** Re: partnership — 15 minutes?
>
> I know international offices receive a lot of agency approaches, so briefly: we are a registered
> Indian company (RichenQuest Private Limited), we have been guiding students since 2024, and we do
> our own document verification before anything reaches your admissions team.
>
> Would a 15-minute call suit? If you would prefer we simply complete your agent application form
> first, point me to it and we will submit this week.

### Email 4 — Day 16 · close the loop

> **Subject:** Re: partnership — closing the loop
>
> I will assume the timing isn't right and won't write again on this. If your India or Nepal plans
> change, we would welcome the conversation — we will be counseling students for {country} every
> intake regardless, and we would rather send {University} well-prepared applicants directly than
> through an aggregator.
>
> Best wishes for the {intake} cycle.

*(The fourth email typically draws the most replies. That is not a trick — it is the only one that
asks for nothing.)*

### How these are sent, and tracked

**Send them by hand.** They are not wired into automation, deliberately: at five contactable
universities the bottleneck is research, not sending, and auto-sending a partnership pitch is how a
consultancy damages a relationship before it exists.

Log each one so the CRM reflects reality:

```
logPartnershipContact(account_id, "email", "outbound", "<summary>", "4")
```

That single call writes the `[contact]` note, moves `Identified → Contacted`, and raises the
follow-up task. The day 4/9/16 cadence then runs on its own.

---

## 4. Operational readiness — the honest bottleneck

**The first 100 students are not blocked by the platform.** They are blocked by four things, none
of which are engineering:

| # | Bottleneck | Consequence | Owner |
|---|---|---|---|
| 1 | **No counselors** | `assignCounselor` refuses; every lead lands on the founder. **This caps throughput at one person** | founder — hire |
| 2 | **12/17 universities uncontactable** | Partnership pipeline cannot move | research, hours not days |
| 3 | **Books in test mode** | No invoicing, no revenue tracking, no financial reporting | founder |
| 4 | **No real leads** | The funnel has never carried live traffic; every stage is theoretically verified but operationally unproven | marketing |

**Capacity estimate.** A counselor can carry roughly 30–40 active cases. 100 students therefore needs
**three counselors plus one operations person** — with the platform unchanged. Nothing in the
architecture needs to change for 100 students; the constraint is entirely people.

**The one platform risk at 100 students:** `assignCounselor`'s assignment branch has **never
executed** (File 28 R-8). The first hire exercises unproven code. RB-03 in File 29 covers verifying
it on day one — do not skip that.

---

## 5. Remaining in this mission

- **Priority 4 — SOP library.** File 04 §2 already drafts SOP-01 to SOP-07. They need updating to
  match the platform as built (functions, stages, journey axis) rather than the original design.
- **Priority 5 — Knowledge base.** `Solutions` is verified available and unused (File 25 §G-6); the
  ingest design exists. Not yet built.
- **Priority 1 continuation** — 12 universities still uncontactable; five of them need a human
  browser because the sites block automated access.
