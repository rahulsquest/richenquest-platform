/**
 * Voice guard — enforces the Brand System's vocabulary rules on the BUILT site.
 *
 * Constitution Article 11.2: "Where a principle can be enforced by a machine,
 * enforce it by a machine. Discipline that depends on memory eventually fails."
 *
 * This is the sibling of scripts/claims-guard.mjs. The division of labour:
 *   · claims-guard  → is this statement TRUE and evidenced?
 *   · voice-guard   → is this how RichenQuest SPEAKS?
 *
 * Rules come from docs/22-brand-system.md §2.2. Changing them requires editing
 * that document first — the doc is the source of truth, this file is the fence.
 *
 * Run: node scripts/voice-guard.mjs   (requires a prior build)
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "website", "dist");

/** True when this file is being run directly rather than imported by a test. */
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && !existsSync(DIST)) {
  console.error("✗ voice-guard: website/dist not found — run `node website/build.mjs` first.");
  process.exit(1);
}

/** Brand System §2.2. Each rule cites the reason so a failure teaches, not just blocks. */
const RULES = [
  {
    id: "overclaim",
    why: "Brand System §2.2 — superlatives we cannot evidence (Constitution 6.3)",
    re: /\b(world[-\s]?class|best[-\s]?in[-\s]?class|premier|unparalleled|revolutionary|cutting[-\s]edge|state[-\s]of[-\s]the[-\s]art)\b/gi,
    // The Standards page's job is to LIST the phrases we refuse to use, so every
    // banned-vocabulary rule must tolerate a denial. An exemption for that page
    // would be a hole; negation-awareness is the general fix.
    allowNegated: true,
  },
  {
    id: "guarantee",
    why: "Brand System §2.2 — we do not guarantee outcomes we do not control",
    re: /\b(guaranteed?|100%\s*(success|approval|visa)|assured\s+(admission|visa))\b/gi,
    // Our most important copy DENIES guarantees ("we cannot guarantee admission",
    // "no guaranteed-visa claims"). Flagging those would train people to delete
    // exactly the disclaimers the Constitution requires (6.3, 13.6).
    allowNegated: true,
  },
  {
    id: "hype",
    why: "Brand System §2.2 — hype language; say the specific thing instead",
    re: /\b(unlock|supercharge|game[-\s]chang(?:ing|er)|life[-\s]changing|dream\s+destination|transform\s+your\s+life)\b/gi,
    // The Standards page's job is to LIST the phrases we refuse to use, so every
    // banned-vocabulary rule must tolerate a denial. An exemption for that page
    // would be a hole; negation-awareness is the general fix.
    allowNegated: true,
  },
  {
    id: "urgency",
    why: "Constitution 6.10 — we do not manufacture urgency or scarcity",
    re: /\b(hurry|act\s+now|limited\s+seats?|don'?t\s+miss\s+out|last\s+chance|only\s+\d+\s+(seats?|spots?|places?)\s+left|book\s+before\s+it'?s\s+too\s+late)\b/gi,
    // The Standards page's job is to LIST the phrases we refuse to use, so every
    // banned-vocabulary rule must tolerate a denial. An exemption for that page
    // would be a hole; negation-awareness is the general fix.
    allowNegated: true,
  },
  {
    id: "vague-scale",
    why: "Brand System §2.3 — give the figure, not an impression of size",
    re: /\b(thousands\s+of\s+(students|people|families)|countless|innumerable|trusted\s+by\s+thousands)\b/gi,
    // The Standards page's job is to LIST the phrases we refuse to use, so every
    // banned-vocabulary rule must tolerate a denial. An exemption for that page
    // would be a hole; negation-awareness is the general fix.
    allowNegated: true,
  },
  {
    id: "unearned-tech",
    why: "Constitution 12.4 — accurate naming; a rules engine is not AI",
    re: /\b(AI[-\s]powered|AI[-\s]driven|powered\s+by\s+AI|smart\s+(matching|counsell?or)|intelligent\s+matching)\b/gi,
  },
  {
    id: "filler",
    why: "Brand System §2.2 — corporate filler; delete or replace with the specific claim",
    re: /\b(seamless(?:ly)?|best[-\s]kept\s+secret|holistic\s+approach|synergy|paradigm\s+shift)\b/gi,
  },
  {
    id: "exclamation",
    why: "Brand System §2.1 rule 6 — no exclamation marks, anywhere",
    // Visible copy only: skip attribute values and entities.
    re: /!(?=(?:[^<>]*)(?:<|$))/g,
    // An exclamation inside a URL/attribute is not visible copy — filtered below.
    visibleOnly: true,
  },
];

/** Strip everything that is not visible prose before testing. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")   // comments are not shipped copy
    .replace(/<[^>]+>/g, " ")           // tags + their attributes
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");
}

const excerpt = (text, index, len) =>
  text.slice(Math.max(0, index - 40), index + len + 40).trim();

/**
 * True when a match is part of a DENIAL rather than a claim — "we cannot
 * guarantee", "no guaranteed-visa claims", "never guaranteed".
 *
 * Scoped to the sentence containing the match, and no further: a denial in a
 * PREVIOUS sentence must not launder a real claim in this one. Tested in
 * voice-guard.test.mjs, because that boundary is the whole correctness of it.
 */
const NEGATION = /\b(no|not|never|cannot|can'?t|don'?t|doesn'?t|without|nobody|neither|nor)\b/i;

export function isNegated(text, index) {
  // Scope to the sentence containing the match: a denial three words earlier
  // and a denial fifteen words earlier are equally a denial ("No statement by
  // any member of our team should be read as such a guarantee").
  const before = text.slice(Math.max(0, index - 300), index);
  const sentenceStart = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("? "),
    before.lastIndexOf("! "),
    before.lastIndexOf(" — ")
  );
  return NEGATION.test(sentenceStart === -1 ? before : before.slice(sentenceStart));
}

if (IS_MAIN) {
  const files = [];
  for (const entry of await readdir(DIST, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(path.join(entry.parentPath, entry.name));
    }
  }

  // Guard against a partially-written dist reporting a false pass.
  const srcPages = [];
  const PAGES = path.join(ROOT, "website", "src", "pages");
  for (const entry of await readdir(PAGES, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) srcPages.push(entry.name);
  }
  if (files.length < srcPages.length) {
    console.error(
      `✗ voice-guard: found ${files.length} built page(s) but ${srcPages.length} source page(s).\n` +
        "  The build output looks incomplete — rebuild before trusting this check."
    );
    process.exit(1);
  }

  const violations = [];

  for (const file of files.sort()) {
    const rel = path.relative(DIST, file);
    const text = visibleText(await readFile(file, "utf8"));

    for (const rule of RULES) {
      for (const m of text.matchAll(rule.re)) {
        if (rule.allowNegated && isNegated(text, m.index)) continue;
        violations.push({ rel, id: rule.id, why: rule.why, at: excerpt(text, m.index, m[0].length) });
      }
    }
  }

  if (violations.length) {
    console.error(`✗ voice-guard: ${violations.length} violation(s) across ${files.length} page(s):\n`);
    for (const v of violations) {
      console.error(`  [${v.id}] ${v.rel}`);
      console.error(`    …${v.at}…`);
      console.error(`    → ${v.why}\n`);
    }
    console.error("  Fix the copy, or amend docs/22-brand-system.md §2.2 first (in that order).");
    process.exit(1);
  }

  console.log(`✓ voice-guard: ${files.length} page(s) speak in the RichenQuest voice`);
}
