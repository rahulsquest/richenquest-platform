# File 35 — University research log & outreach assets

**Rule applied throughout: an email address is recorded only if I read it on the institution's own
page.** No pattern-guessing (`partnerships@<domain>`), no search-snippet transcription, no
inference. Every record carries its source URL in `Description`, so any entry can be re-checked.

---

## 1. Research results

**Contactability: 1/17 → 5/17 (6% → 29%)**, verified live on the founder dashboard.

### Verified and imported

| University | Address | Type | Source |
|---|---|---|---|
| IU International University | `partners@iu.org` | **Partnerships** | [iu.org/about/our-partners](https://www.iu.org/about/our-partners/) — "If you are interested in a partnership with us, please contact" |
| Gisma University | `partners@gisma.com` | **Partnerships** | [gisma.com/contact-us](https://www.gisma.com/contact-us) — labelled "partnership enquiries" |
| University of Europe (UE) | `partners@ue-germany.com` | **Agencies** | [ue-germany.com/contact](https://www.ue-germany.com/contact) — labelled "Educational agencies and career consultants" |
| Wittenborg University | `admission@wittenborg.nl` | Admissions | [wittenborg.eu/contact.htm](https://www.wittenborg.eu/contact.htm) — the only address published |
| Berlin School of Business & Innovation | `info@berlinsbi.com` | **General only** | [berlinsbi.com/about-us/contact-us](https://www.berlinsbi.com/about-us/contact-us) |

**The type column matters.** Three are genuine partnership channels. Wittenborg's is admissions and
BSBI's is a general inbox — both are recorded as such in `Description` so nobody assumes a
partnership route exists where it does not. A partnership pitch to an admissions inbox is a
different email from one to a partnerships desk.

### Blocked, with the reason

| University | Obstacle |
|---|---|
| **SRH Berlin** | Emails are **obfuscated** on-page (rendered as `[email protected]`). A search snippet suggested `info.hsbe@srh.de`; **not recorded** — snippets are not verification |
| **National College of Ireland** | Contact page publishes **no email at all**; contact form only |
| **Dublin Business School** | HTTP 403 to automated fetch |
| **Macromedia** | HTTP 403 |
| **Munich Business School** | HTTP 404 on the contact path tried |
| Constructor Bremen, CBS International, Arden Berlin, Griffith College, Vistula Warsaw | Not yet attempted |
| Fintiba, Expatrio | Service providers, not universities — **deliberately out of scope** for partnership outreach |

**12 of 17 still have no address.** Five are blocked by anti-bot measures or absent publication —
those need a human with a browser, which is minutes of work each. The remaining five simply have not
been reached yet.

### How to continue this research

For each remaining institution, in order of reliability:

1. Find the **"Agents / Representatives / Partners"** page — universities that recruit through agents
   almost always have one, and it is the correct channel.
2. Failing that, the **International Office** page.
3. Failing that, the **agent application form** — File 02 §2 is right that the form *is* the channel.
4. **Never infer an address from a domain.** A bounced first contact is worse than no contact.

Record the source URL in `Description`. That convention is what makes this auditable.

---

## 2. Data quality after import

| Field | Before | After |
|---|---:|---:|
| `International_Office_Email` | 1/17 (6%) | **5/17 (29%)** |
| `Website` | 2/17 (12%) | **6/17 (35%)** |
| `Account_Name` · `Partnership_Stage` · `Partnership_Type` · `Agreement_Status` | 17/17 | 17/17 |
| Duplicates | 0 | **0** |
| Orphans | 0 | **0** |

**Stages deliberately left at `Identified`.** Finding a published address is not outreach. Moving a
university to `Contacted` fires the day 4/9/16 cadence and starts a clock that nothing has actually
started — and, per File 16 §7, it would overstate the pipeline to anyone reading the CRM.

**Leads unchanged: still 4 stale test records, still recommended for deletion** (File 33 F-1). Not
done unilaterally; they are the module's entire contents.

---

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
