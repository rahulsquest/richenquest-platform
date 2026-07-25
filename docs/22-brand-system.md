# RichenQuest Brand System

**Version 1.0 · 2026-07-25 · Phase 1 of the execution roadmap**
Governed by [the Constitution](20-constitution.md). Where this document and the Constitution
disagree, the Constitution wins.

This is a **reference for making things**, not a philosophy document. If you are choosing a
colour, writing a sentence, or placing a logo, the answer should be here.

---

## 1. WHAT WE ARE

**Positioning (internal, never printed):**

> For people building an international career from places where the path is not obvious,
> RichenQuest is the advisory and record platform whose judgement is structurally independent
> of the institutions it recommends — so the advice can be trusted, and the record travels
> with the person.

**Primary public line:**

> **Independent guidance for an international career.**

**Supporting line:**

> We advise the person, not the institution — and we publish how we are paid.

Both are deliberately concrete. Neither claims scale we have not reached. "Independent" is the
category word; "career" (not "study abroad") is what keeps the brand open for Phase 4–8.

### 1.1 The tagline question — settled

The logo artwork carries *"Where Ambitions Meet Opportunities."* That is existing brand equity
and it stays **inside the logo lockup**. It is **never used as a page headline, a section title,
or body copy.** A tagline is a signature; a headline must say something specific.

---

## 2. HOW WE SOUND

**The voice is a very good doctor:** warm, direct, unhurried, precise, and willing to deliver
bad news without flinching.

### 2.1 Rules

1. **Short sentences.** One idea each.
2. **Numbers, not adjectives.** Not "affordable" — "€10,200 a year, excluding flights."
3. **The downside first.** Cost, likelihood and risk before benefits (Constitution 13.2).
4. **Second person.** "You will need…" not "Students are required to…"
5. **Name the uncertainty.** "We don't know yet" is a complete, publishable sentence.
6. **No exclamation marks.** Anywhere. Ever.
7. **Say who is speaking.** Recommendations carry a person's name (Constitution 6.7).
8. **Never sell in a sentence that is answering a question.**

### 2.2 Banned vocabulary

Enforced by `scripts/voice-guard.mjs` at build time.

| Category | Never use |
|---|---|
| Overclaim | *world-class, best-in-class, leading, premier, revolutionary, cutting-edge, unparalleled, guaranteed, 100%* |
| Hype | *unlock, supercharge, game-changing, transform your life, dream destination, life-changing* |
| Urgency | *hurry, act now, limited seats, don't miss out, last chance, only N left* |
| Vague scale | *thousands of students, countless, numerous, many happy* |
| Unearned tech | *AI-powered* (until true — Constitution 12.4), *smart, intelligent* as product adjectives |
| Filler | *seamless, robust, holistic, synergy, leverage* (as a verb), *journey* (as a metaphor for our service) |

### 2.3 Preferred constructions

| Instead of | Write |
|---|---|
| "Affordable tuition" | "€0–3,000 a year at public universities" |
| "High success rate" | "Records available on request" |
| "Trusted by thousands" | "Guided over 1,000 people since 2024" |
| "Our partner universities" | "Universities our members apply to" |
| "AI-powered matching" | "A rules engine that shows its reasoning" |
| "Start your dream journey!" | "See where you fit" |
| "Limited seats available" | "Applications close 15 January" |

### 2.4 Boilerplate

**Short (≤ 100 chars):**
RichenQuest provides independent guidance for people building an international career.

**Medium:**
RichenQuest is an advisory and record platform for people building an international career from
India, Nepal and beyond. Our recommendations are structurally independent of the institutions we
work with, and we publish how we are paid.

**Long:** see the Founder Letter ([docs/21](21-founder-letter.md)).

---

## 3. HOW WE LOOK

### 3.1 The five visual principles

**1. The gradient is a signature, not a surface.**
The cyan→blue→violet ramp comes from the logo and is the brand's fingerprint. It appears at
**small scale and high intent**: the mark, a 2px rule, a single primary action, a focused accent.
It is **never a full-bleed wash behind content.** A brand that gradients everything reads as a
2020s AI startup, not an institution meant to last to 2051.

**2. Ink on paper.**
Default surfaces are near-white; default text is near-black. Colour is used to **mean** something
— an action, a state, a warning — never to decorate.

**3. One deep surface per page, at most.**
A single dark band, used where emphasis genuinely belongs (usually the opening or the close).
Repeated dark bands stop being emphasis and become wallpaper.

**4. Space is the luxury signal.**
Not effects, not gradients, not shadows. If a layout feels cheap, the answer is almost always
more space and fewer elements.

**5. Type does the work.**
Hierarchy, rhythm and restraint carry the premium read. If a page only works because of its
background, the page does not work.

### 3.2 Colour

| Role | Token | Value | Use |
|---|---|---|---|
| Ink | `--color-ink` | `#111827` | Body and headings |
| Ink, secondary | `--color-ink-soft` | `#46536e` | Supporting text |
| Paper | `--color-surface` | `#ffffff` | Default background |
| Paper, alt | `--color-surface-alt` | `#f5f6f8` | Section alternation (near-neutral, not blue) |
| Deep | `--color-inverse-surface` | `#0b1226` | The single dark band |
| Action | `--color-brand` | `#1d4ed8` | Links, primary actions (6.3:1 on white) |
| Accent | `--color-accent` | `#6d28d9` | Sparing emphasis (7.0:1 on white) |
| Signature | `--gradient-brand` | cyan→blue→violet | The mark, rules, one CTA. Never a background wash |

**Contrast law.** `--brand-cyan` and `--brand-sky` are **decorative only** — they never carry text
on light surfaces. Every text/background pair must meet WCAG AA (Constitution 17.6).

**Semantic colour** (success/warning/danger) is reserved for state. Never for decoration.

### 3.3 Typography

System stack — zero webfont bytes, deliberately (Constitution 11.1: the reference user is a
mid-range Android on a congested network). Modern system UI is Roboto or SF Pro; both are
excellent. Premium comes from **scale, tracking and rhythm**, not from a downloaded typeface.

- **Sans:** `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`
- **Serif display:** `"Charter", "Iowan Old Style", Palatino, Georgia, serif` — used **only** for
  a single accent word or a pull-quote. It is the voice of the tagline, used sparingly.
- **Mono:** for figures, IDs, and anything auditable.

**Scale discipline.** Display type tops out at ~3.5rem. Larger is shouting, and shouting is not
calm. Tight tracking on large sizes (`-0.022em`), normal on body.

### 3.4 Logo

Full rules in [`brand/README.md`](../brand/README.md). Summary:

- **Lockups:** full (mark + wordmark + tagline) · standard (mark + wordmark) · mark only.
- **Clear space:** the height of the globe mark on all sides. Nothing enters it.
- **Minimum sizes:** standard lockup 140px wide; mark alone 24px.
- **Never:** stretch, rotate, recolour, add shadows or outlines, re-typeset the tagline, place on
  a busy image, or reproduce the mockup bevel.
- **Placement:** on white or the deep surface only.

### 3.5 Photography — direction for assets that will arrive

**Documentary, not advertising.**

- Real people, real places, available light. No studio gloss.
- Faces at eye level, looking at the camera or at their work — never gazing wistfully into
  the distance.
- Show the actual work: paperwork, screens, a conversation across a desk, an office in Patna.
- Environmental portraits over headshots. Context is credibility.
- Colour grade: neutral and slightly cool. No teal-orange, no heavy filters.

**Never:** campus lawns with diverse smiling groups · graduates throwing caps · aeroplane
windows · passports fanned on a map · globes · handshake stock · anything that could belong to
any company in this sector.

### 3.6 Illustration — direction

**Diagrammatic, not decorative.** An illustration earns its place by explaining something words
would take a paragraph to convey — a process, a structure, a relationship.

- Line-based, built on the 24px icon grid's logic.
- The brand gradient appears as an accent within it, not as its fill.
- One idea per illustration.
- **The recurring illustration we owe the brand:** a clear diagram of *how independence works* —
  the separation of commercial relationships from advisory judgement (Constitution 5.2). That
  diagram is the most important image this company will ever publish.

**Never:** the globe-with-orbits trope · flat-vector people with no faces · isometric cities ·
anything with a rocket.

### 3.7 Iconography

The existing 24px, 2px-stroke, round-cap system. Consistent weight, no fills, no duotone. Icons
support labels; they never replace them.

### 3.8 Motion

**Motion confirms, never performs.**

| Allowed | Banned |
|---|---|
| Quiet entrance on scroll (opacity + small rise) | Animated/shimmering gradient text |
| Precise hover feedback on interactive elements | Pulsing glows |
| State transitions that show what changed | Continuously drifting backgrounds |
| Progress and loading that reflect real work | Parallax for its own sake |

Every motion respects `prefers-reduced-motion`. Nothing animates that the reader must wait for.
Motion that costs load time on a slow connection is a tax paid by the least well-connected
person (Constitution 17.7).

---

## 4. NAMING ARCHITECTURE

**Products are named for what they do.** Descriptive names age well, survive translation, and
cannot overclaim. No invented product brands, no `AI`/`Pro`/`Plus` suffixes.

| Layer | Name | Notes |
|---|---|---|
| Company | **RichenQuest** | Legal: RichenQuest Private Limited |
| Account area | **Your RichenQuest** | Phase 4 |
| Guidance tool | **Match** | Today's live tool. Never "AI Match" |
| The long-lived record | **Career Record** | Phase 5. The strategic asset |
| Documents | **Documents** | Not "Vault" — vault implies we own it |
| Deadlines | **Timeline** | |
| Community | **Alumni Network** | Phase 8 |
| Institutional surface | **Partner Portal** | Phase 7 |
| Public disclosure | **Disclosure Register** | Constitution 5.4 |

**Rule:** if a name requires explanation, it is the wrong name.

---

## 5. THE PROOF SURFACES

Brand-critical pages that exist because of the Constitution. They are **brand assets, not legal
pages**, and must be designed with the same care as the homepage.

| Surface | Constitution | What it proves |
|---|---|---|
| **Disclosure Register** | 5.4 | Who pays us, and on what basis |
| **Pricing** | 19.3 | Published price, and what it excludes |
| **Standards** | 6.3 | What we are not permitted to claim |
| **Steering Audit** | 5.5 | That our recommendations do not drift toward partners |
| **Outcomes** | 30 | Where people actually are, later — including disappointments |

No competitor can copy these without changing their business model. **This is the moat, rendered.**

---

## 6. APPLICATION CHECKLIST

Before anything ships, it must pass:

1. Does it make the reader understand more, or only make us look better? (17.1)
2. Is every number evidenced? (6.3)
3. Is there any urgency, scarcity, or manufactured confidence? (6.10)
4. Does it work on a mid-range Android over a slow connection? (11.1)
5. Does it pass AA contrast, keyboard and screen-reader use? (17.6)
6. Does it say "student" where it should say "the individual"? (Preamble)
7. Would we be comfortable if the reader saw the reasoning behind it? (0.2)

---

*Phase 1 of 8. Next: Visual Design System (Phase 2), which implements this document.*
