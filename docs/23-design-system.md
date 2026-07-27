# RichenQuest Design System

**Version 1.0 · 2026-07-25 · Phase 2 of the execution roadmap**
Implements [the Brand System](22-brand-system.md), governed by [the Constitution](20-constitution.md).

**Success test for this document:** a hundred pages can be built from it without
inventing anything new. If a page needs a component that is not here, that is a gap in
the system — add it here first, then use it.

**The recognisability test.** Every element in this system must pass:

> *If someone removed the RichenQuest logo, would they still recognise this as RichenQuest?*

Decoration cannot pass that test, because decoration belongs to everyone.

---

## 1. THE ORGANISING IDEA

**RichenQuest keeps a record, not a brochure.**

Records have ruled lines, aligned figures, citations, margin notes, and deliberate
separations. That vocabulary renders our philosophy directly — clarity, evidence,
structure, calm, human judgement — and it is ownable in this category because a
competitor cannot adopt it without being able to back it up.

Everything below is either **signature** (ours, recognisable, five elements only) or
**plumbing** (necessary, unremarkable, deliberately invisible).

### 1.1 The banned list — permanent

These are not stylistic preferences. They are the visual language of everyone else.

| Banned | Why |
|---|---|
| Gradients as surfaces / full-bleed washes | Belongs to every 2020s software company |
| Glass cards, frosted panels as decoration | Ubiquitous; signifies nothing |
| Coloured glows, neon edges | Flashy; the opposite of calm |
| Orbit graphics, spinning globes | The single most generic image in study-abroad |
| World maps with pins or arcs | Same |
| Floating circles, blurred blobs | Filler where a decision should be |
| Isometric illustration, flat faceless people | Stock aesthetic, no information |
| Rockets, lightbulbs, handshakes | Cliché |
| "AI aesthetics" — nodes, neural filigree, particle fields | We are not selling the technology |

**Glass is retained in exactly one place** — the interior of the deep hero surface, where
translucency conveys depth of a real layered surface. It is never a card treatment.

---

## 2. THE FIVE SIGNATURE ELEMENTS

Implemented in `website/src/assets/css/components/record.css`.

---

### 2.1 The Rule — `.rule`

A full-width hairline whose first 2.5rem carries the brand ramp. **The smallest possible
expression of the logo**, and the element that makes a page recognisable without one.

| | |
|---|---|
| **Purpose** | Marks the start of a section or a record block |
| **Usage** | At most **one per visual group**. Above a section heading, or at the top of a record |
| **Spacing** | `--space-6` below; never adjacent to another rule |
| **Responsive** | Unchanged at all widths. The gradient segment stays 2.5rem — it is a mark, not a proportion |
| **Accessibility** | `<hr class="rule">` when it separates content; `aria-hidden` if purely ornamental |
| **Motion** | None. It does not draw itself in |
| **Copy** | n/a |
| **Variant** | `.rule--center` centres the gradient segment, for centred section heads |

**Example**
```html
<hr class="rule">
<p class="kicker">How our advice is protected</p>
<h2>Independent by structure, not by promise</h2>
```

**Anti-examples**
- ❌ Three rules stacked as decoration.
- ❌ A rule with no heading following it — it marks something, or it is noise.
- ❌ Recolouring the gradient segment, or lengthening it to span the whole line. At full
  width it becomes a gradient surface, which is banned (§1.1).

---

### 2.2 The Provenance Mark — `.fact` / `.fact__src`

**The most important device in the system.** Every published figure carries a visible
link to its evidence. This is Constitution 6.3 rendered as a UI element: a claim and its
source are one object, not a claim with a disclaimer somewhere else.

| | |
|---|---|
| **Purpose** | Makes every number auditable at the point it is read |
| **Usage** | On **every** published figure about the company or a destination |
| **Spacing** | Inline; the mark sits as a superscript with `0.15em` lead |
| **Responsive** | Never hidden. A figure without its source is a different claim |
| **Accessibility** | The link needs a `visually-hidden` label ("Source for this figure"). Target ≥24px on coarse pointers |
| **Motion** | Colour change on hover/focus only |
| **Copy** | The linked target must state where the number comes from and when it was last verified |
| **Variant** | `.fact--unverified` (dashed underline, `?` mark) for figures we publish but cannot yet fully evidence |

**Example**
```html
<span class="fact">1,000+<a class="fact__src" href="/standards/#guided">
  <span class="visually-hidden">Source for this figure</span></a></span>
students guided since 2024
```

**THE COPY RULE — absolute:** *if a number cannot take a `.fact__src`, it may not be
published.* This is the mechanism that makes Article 6.3 structural rather than aspirational.

**Anti-examples**
- ❌ A headline statistic with no provenance mark.
- ❌ Using the mark decoratively on a number that has no source page.
- ❌ Hiding the mark on mobile to "reduce clutter" — the clutter is the point.

---

### 2.3 The Ledger — `.ledger`

Figures presented as a record: label left, value right, dotted leader between, tabular
numerals so columns align optically.

| | |
|---|---|
| **Purpose** | Any set of comparable facts — costs, deadlines, requirements, disclosure entries, pricing |
| **Usage** | Replaces every "spec grid" and definition list. 3–8 rows; beyond that, group |
| **Spacing** | `--space-3` row padding; hairline between rows; no border after the last |
| **Responsive** | Below 40em the leader is dropped and the value moves under the label — a 30px leader is noise, not structure |
| **Accessibility** | `<dl>` with `<dt>`/`<dd>`, or a table when there are real columns. The leader is decorative and `aria-hidden` |
| **Motion** | None |
| **Copy** | Labels are nouns, not sentences. Values are exact, with units. Never "varies" alone — give the range |

**Example**
```html
<dl class="ledger">
  <div class="ledger__row">
    <dt class="ledger__label">Tuition</dt>
    <span class="ledger__leader" aria-hidden="true"></span>
    <dd class="ledger__value">€0–3,000/yr</dd>
  </div>
</dl>
```

**Anti-examples**
- ❌ "Affordable" in a value cell. Values are figures (Brand System §2.1 rule 2).
- ❌ Centre-aligned values — they stop being comparable.
- ❌ Proportional numerals in a column of figures.

---

### 2.4 The Separation — `.separated`

**Constitution Article 5.2 made visible.** Wherever advisory content and commercial
content appear together, a labelled dashed hairline separates them. **The gap is the
message.**

| | |
|---|---|
| **Purpose** | Show, structurally, that commercial relationships sit outside the decision path |
| **Usage** | The Independence Diagram, the Disclosure Register, any page where a partner is named alongside a recommendation |
| **Spacing** | `--space-8` between lanes on desktop; `--space-6` stacked |
| **Responsive** | The divider rotates to horizontal below 64em. **It is never dropped** — without it the layout says the opposite of what it means |
| **Accessibility** | Lanes get real headings. The divider is decorative |
| **Motion** | None. This element must never look playful |
| **Copy** | The commercial lane is stated plainly and without apology. We are not embarrassed by partnerships; we are precise about them |

**Anti-examples**
- ❌ Drawing an arrow across the divider.
- ❌ Softening the divider to a faint tint "for elegance" — the emphasis is the content.
- ❌ Collapsing to a single column on mobile without the horizontal divider.

---

### 2.5 Marginalia — `.note`

Where uncertainty lives. Serif italic, left rule, muted. The brand's second voice, used
only here and in pull-quotes.

| | |
|---|---|
| **Purpose** | Caveats, limits, and what we do not yet know (Constitution 6.3, 24.3) |
| **Usage** | Adjacent to the claim it qualifies — never in a footer, never in small print |
| **Spacing** | `--space-4` inline-start padding; `--space-4` above |
| **Responsive** | Unchanged; max 46ch |
| **Accessibility** | Normal prose. Never below 14px, never below 4.5:1 |
| **Motion** | None |
| **Copy** | First person, present tense, specific. *"We have not measured this yet"* — not *"data may vary"* |
| **Variant** | `.note--uncertain` uses the accent rule, for explicit unknowns |

**Anti-examples**
- ❌ Using it for marketing asides. It is reserved for limits; diluting it destroys its signal.
- ❌ Vague hedging ("results may vary"). State what is unknown and why.

---

## 3. THE INDEPENDENCE DIAGRAM

`components/diagram-independence.html` · `components/independence.css`

**Treated with the same seriousness as the logo.** One job: make a reader understand in
under fifteen seconds that commercial relationships exist, are disclosed, and never enter
the decision path.

**Design constraints, in priority order:**
1. The **gap** between the lanes is the most obvious thing in the image.
2. Legible in under fifteen seconds — one path, one firewall, one aside. No arrows across, no secondary annotation.
3. Survives a 360px phone without becoming a diagram of nothing.
4. Readable with CSS disabled (it is an ordered list plus an aside, and reads correctly as prose).

**Why HTML and not a flat SVG:** the decision path *is* an ordered list. Assistive
technology gets real semantics, the text stays selectable and translatable, it reflows
instead of shrinking, and it recolours from tokens.

**Emphasis by exception:** the brand ramp appears on exactly two nodes — *Independent
evaluation* and *Evidence*. Those are the two steps that carry the argument.

**Anti-examples**
- ❌ Adding a dotted arrow from the commercial lane to the recommendation "to show the relationship". That is the opposite of the diagram's meaning.
- ❌ Animating the path as a "journey".
- ❌ Rendering it as an image file. It must stay text.
- ❌ Placing it on a dark, aurora-washed surface. **The diagram sits on paper, where a record belongs.**

---

## 4. PLUMBING — deliberately unremarkable

These exist, they are documented in `/styleguide/`, and they are not signature. Do not
try to make them distinctive.

| Component | Purpose | Key rule |
|---|---|---|
| `.btn` (+ `--primary/--ghost/--sm/--lg`) | Actions | One primary action per view. 44px min on coarse pointers |
| `.card` | Content collections | Hairline border, generous padding, one hover lift |
| `.tile` / `.bento` | Asymmetric feature layouts | Composition declared in markup, never guessed |
| `.pill` | Status and category labels | Never a fake button |
| `.rail` | Numbered sequences | Not for non-sequential content |
| `.stat` | Headline figures | **Must carry a provenance mark** (§2.2) |
| `.quote` | Pull-quotes | Serif voice; one per page |
| `.section` / `.section__head` | Rhythm | `--section-y`; one deep surface per page maximum |
| `.kicker` | Section eyebrow | Uppercase, tracked, with the gradient tick |
| `.checklist` | Verified lists | Not for marketing bullets |

---

## 5. LAYOUT AND RHYTHM

- **Containers:** `--container-max` 75rem default · `--container-wide` 84rem showcase · `--container-narrow` 46rem prose.
- **Section rhythm:** `--section-y` (clamped 4rem → 8.5rem). Consecutive sections never share a background unless deliberately grouped.
- **Measure:** body copy ≤ 65ch; notes ≤ 46ch; headings ≤ 24ch.
- **Grid:** mobile is one column, always. Multi-column starts at 40em; six-column bento at 64em.
- **Alternation:** paper → alt → paper. **At most one deep surface per page.**

---

## 6. MOTION

> **Motion confirms, never performs.**

| Allowed | Banned |
|---|---|
| Scroll reveal: opacity + ≤28px rise, completes early | Anything that continuously loops |
| Hover feedback on interactive elements | Shimmer, pulse, drift, parallax-for-its-own-sake |
| State transitions that show what changed | Animated gradients or text |
| Progress reflecting real work | Motion the reader must wait for |

**Hard rules:** every animation respects `prefers-reduced-motion`. Scroll reveals use
`cover`-based ranges only — an `entry`-based range never completes for elements taller
than the viewport and strands content invisible. Nothing decorative may animate
indefinitely; it costs compositor time on a mid-range phone for as long as the page is
open (Constitution 17.7).

---

## 7. ACCESSIBILITY — non-negotiable floor

1. AA contrast on every text/background pair. `--brand-cyan` and `--brand-sky` never carry text on light surfaces.
2. Visible focus on every interactive element (3px, 2px offset).
3. 44px minimum touch targets on coarse pointers.
4. One `<h1>` per page; heading levels never skipped.
5. Decorative SVG is `aria-hidden`; meaningful SVG has a label.
6. Keyboard reachable in DOM order. `.split__visual--first` reorders visually only.
7. Results and dynamic content move focus and announce via `role="status"`.
8. Nothing conveyed by colour alone.

---

## 8. THE DECISION PROCEDURE

Before adding anything, in order:

1. **Does an existing component do this?** Use it. Novelty is not a goal.
2. **Is this signature or plumbing?** If signature, it must pass the recognisability test and there must be room — five is the budget.
3. **Does it increase trust, or does it look impressive?** Trust wins every tie.
4. **Is it on the banned list?** (§1.1) Then no, regardless of how well it is executed.
5. **Document it here first** — purpose, usage, spacing, responsive, a11y, motion, copy, anti-examples — then build it.

If a page still feels wrong after this, the problem is almost always **too many elements
and not enough space** (Brand System §3.1 principle 4).

---

*Phase 2 of 8. Next: Phase 3 — the website, built entirely from this system.*
