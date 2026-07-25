# RichenQuest Brand Assets — the drop-in contract

**Nothing in the codebase needs to change when the real logo arrives.** The site renders a
typographic wordmark today and switches to the artwork automatically the moment the files below
exist at these exact paths.

Governed by [docs/22-brand-system.md](../docs/22-brand-system.md) §3.4.

---

## 1. What to put here

Use these **exact filenames**. The build and the `brand-logo` component look for them by name.

| File | What it is | Format | Notes |
|---|---|---|---|
| `logo-source.svg` | **Preferred.** The original vector | SVG | Outlined text, no external fonts |
| `logo-source.ai` / `.eps` | Acceptable original | Vector | We will export the SVG from it |
| `logo-source.png` | Fallback only | PNG, ≥ 2000px wide, transparent | Last resort — see §4 |
| `logo-mark.svg` | Globe-and-arrow mark alone | SVG | For favicon, avatars, app icon |
| `logo-standard.svg` | Mark + wordmark, no tagline | SVG | The everyday lockup |
| `logo-full.svg` | Mark + wordmark + tagline | SVG | Large sizes only |
| `logo-onDark.svg` | Variant for the deep surface | SVG | If the standard mark loses legibility on `#0b1226` |

Once `logo-standard.svg` exists, the header uses it. No code change, no redesign.

---

## 2. Why the vector matters (please read before sending a PNG)

The file supplied so far is a **presentation mockup**: the mark sits on a grey gradient with a
3D bevel and a drop shadow baked into the pixels.

Cutting the subject out of that render permanently bakes in:

- a fake bevel that will look dated within two years,
- soft, semi-transparent edges that fringe against any background that is not the original grey,
- a fixed resolution that degrades on large screens and in print.

A vector gives us, from one file and for free: crisp reproduction at every size, a favicon, an
app icon, a dark-surface variant, print, signage, and embroidery.

**If the original vector exists anywhere — with the designer, in the original brief, in an
email attachment — it is worth more than a week of engineering.**

---

## 3. Usage rules (Brand System §3.4)

- **Clear space:** on all four sides, equal to the height of the globe mark. Nothing enters it —
  not text, not a border, not a photo edge.
- **Minimum size:** standard lockup 140px wide; mark alone 24px. Below that, use the mark.
- **Backgrounds:** white, or the deep surface `#0b1226`. Never on a photograph, a busy pattern,
  or a mid-tone colour.
- **Never:** stretch or squash · rotate · recolour · outline · add shadow or glow · re-typeset
  the tagline · animate · place inside a shape that crops it · recreate the mockup bevel.
- **The tagline** ("Where Ambitions Meet Opportunities") appears **only** inside `logo-full.svg`.
  It is never set as page text — see Brand System §1.1.

---

## 4. If only a raster mockup is ever available

We will, in this order:
1. Extract the subject at maximum resolution and remove the background losslessly.
2. **Redraw the mark as clean vector** from the extraction — the globe, meridians and arrow are
   geometric and can be reconstructed accurately.
3. Re-set the wordmark in a matched typeface, and the tagline in the brand serif.
4. Send both back for approval before anything ships.

This is a redraw, not a trace, and it needs founder sign-off because it changes the artwork.

---

## 5. Other assets to drop here when they exist

Named so they can be wired without a redesign (Constitution: build around missing assets).

```
brand/
  logo-*.svg              see §1
  founder/
    rahul-portrait.jpg    environmental portrait, ≥2000px, see Brand System §3.5
  team/
    <firstname>.jpg       consistent framing, same direction
  office/
    patna-*.jpg           the real workspace — documentary, not staged
  media/
    <outlet>-<slug>.*     only once genuinely published
```

**Photography direction is in Brand System §3.5.** Read it before commissioning anything — it
rules out most of what a stock brief would produce.

---

## 6. The swap procedure (the only code change ever needed)

Every page reaches the brand through one component, so the artwork replaces the wordmark in a
single edit. **No page, layout, or stylesheet changes.**

1. Put `logo-standard.svg` in this folder (see §1).
2. Copy it to `website/src/public/logo.svg` — everything in `src/public/` is served from the
   site root.
3. In `website/src/components/brand-logo.html`, replace the `<span class="brand__wordmark">`,
   `<span class="brand__rule">` and `<span class="brand__descriptor">` elements with a single
   image: an `<img>` with class `brand__mark`, `src` of `/logo.svg`, explicit `width` and
   `height` attributes, `alt` set to the company name, and `decoding="async"`.
4. Rebuild and run the gates.

`components/brand.css` already sizes `.brand__mark` to the same optical weight as the wordmark
and handles the deep-surface inversion, so the lockup lands correctly at every breakpoint on
first build.

**Why the instructions live here and not in the component:** HTML comments ship to the browser
on all 20 pages, and a comment containing an example `src` is picked up by the internal link
checker as a real reference. Instructions belong in the asset contract; markup ships markup.
