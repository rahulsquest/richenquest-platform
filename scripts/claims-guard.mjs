/**
 * Claims-guard — enforces the Verified Claims Library (docs/08, ADR-005) on the BUILT site.
 *
 * Scans website/dist/**\/*.html (what users actually see, post data-injection) and fails with
 * exit code 1 if banned or unverified company claims appear. This is a safety net under human
 * review, not a replacement for it (File 10 §7).
 *
 * Run: node scripts/claims-guard.mjs   (requires a prior build)
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "website", "dist");
const CLAIMS_FILE = path.join(ROOT, "website", "src", "data", "claims.json");

if (!existsSync(DIST)) {
  console.error("✗ claims-guard: website/dist not found — run `node website/build.mjs` first.");
  process.exit(1);
}

const claims = JSON.parse(await readFile(CLAIMS_FILE, "utf8"));
const VERIFIED_COUNT = String(claims.students.verified_placements);
const SIGNED_PARTNERS = (claims.partnerships.signed ?? []).map((p) => p.toLowerCase());
/** Founder-approved public counts, e.g. "1000+" — exact match after stripping commas/spaces. */
const APPROVED_COUNTS = (claims.students.approved_public_counts ?? []).map((s) =>
  String(s).replace(/[\s,]/g, "")
);

const countOk = (num, plus) => {
  // An approved "N+" also covers "over N" / bare-N phrasings of the same figure.
  if (APPROVED_COUNTS.includes(num + (plus ? "+" : "")) || APPROVED_COUNTS.includes(num + "+")) return true;
  return !plus && num === VERIFIED_COUNT;
};

/** Static banned-pattern rules (File 08 Part B, banned list). */
const RULES = [
  {
    id: "inflated-count",
    why: "File 08 bans vague/inflated student counts",
    re: /hundreds of (students|clients)|\b(many|numerous)\s+students\s+placed|\b1000\+\s*students/gi,
  },
  {
    id: "success-rate",
    why: "File 08 bans visa/success percentages until a verified dataset exists",
    re: /\b\d{1,3}(?:\.\d+)?\s*%[^<.!?\n]{0,60}\b(visa|success)|\b(visa|success)[^<.!?\n]{0,60}\b\d{1,3}(?:\.\d+)?\s*%/gi,
  },
  {
    id: "ai-powered",
    why: 'File 08 bans present-tense "AI-powered" until the automation stack is live',
    re: /\bAI[-\s]powered\b/gi,
  },
];

/** Student-count phrases must state a founder-approved figure (File 08: exact verified
 *  figure, no inflating "+", unless explicitly approved in approved_public_counts). */
const COUNT_VERBS = "placed|counsel\\w*|served|helped|guided|supported|assisted|trained";
const COUNT_RES = [
  new RegExp(`\\b(\\d[\\d,]*)\\s*(\\+?)\\s*students?\\s+(?:${COUNT_VERBS})`, "gi"),
  new RegExp(
    `\\b(?:${COUNT_VERBS.replace("counsel\\w*", "counsell?ed")})\\s+(?:over\\s+|more\\s+than\\s+)?(\\d[\\d,]*)\\s*(\\+?)\\s*students?`,
    "gi"
  ),
];

/** Any bare "N+" count of students/universities/partners is an inflation claim
 *  unless founder-approved (File 08 + founder direction 2026-07-19). */
const BARE_PLUS_RE = /\b(\d[\d,]*)\s*(\+)\s*(?:students?|universit(?:y|ies)|partners?)\b/gi;

/** "partner university/institution/college" wording is banned while no agreements are
 *  signed — approved alternatives: "universities we work with", "universities our
 *  students apply to", "destination universities" (founder direction 2026-07-19). */
const PARTNER_UNI_RE = /\bpartner(?:ed|ship)?s?\s+(?:universit|institution|college)/gi;

/** "partner of/with <Institution>" requires that institution in the signed allowlist. */
const PARTNER_RE = /\bpartner(?:ed|ship)?\s+(?:of|with)\s+(?!us\b|you\b|your\b|richenquest\b)([A-Z][A-Za-z&.\- ]{2,50})/g;

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(".html")) out.push(path.join(entry.parentPath, entry.name));
  }
  return out.sort();
}

const excerpt = (text, index, len) =>
  text.slice(Math.max(0, index - 30), index + len + 30).replace(/\s+/g, " ").trim();

const violations = [];
const files = await htmlFiles(DIST);

for (const file of files) {
  const rel = path.relative(DIST, file);
  // Check visible markup; drop script/style bodies (JSON-LD etc. is checked separately if added).
  const html = (await readFile(file, "utf8"))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  for (const rule of RULES) {
    for (const m of html.matchAll(rule.re)) {
      violations.push({ rel, id: rule.id, why: rule.why, at: excerpt(html, m.index, m[0].length) });
    }
  }

  for (const re of COUNT_RES) {
    for (const m of html.matchAll(re)) {
      const num = m[1].replaceAll(",", "");
      if (!countOk(num, m[2] === "+")) {
        violations.push({
          rel,
          id: "unverified-count",
          why: `Student-count claims must use a founder-approved figure (verified: ${VERIFIED_COUNT}; approved: ${APPROVED_COUNTS.join(", ") || "none"})`,
          at: excerpt(html, m.index, m[0].length),
        });
      }
    }
  }

  for (const m of html.matchAll(BARE_PLUS_RE)) {
    const num = m[1].replaceAll(",", "");
    if (!countOk(num, true)) {
      violations.push({
        rel,
        id: "inflated-plus-count",
        why: `"N+" counts are inflation claims unless founder-approved in claims.json approved_public_counts (approved: ${APPROVED_COUNTS.join(", ") || "none"})`,
        at: excerpt(html, m.index, m[0].length),
      });
    }
  }

  if (SIGNED_PARTNERS.length === 0) {
    for (const m of html.matchAll(PARTNER_UNI_RE)) {
      violations.push({
        rel,
        id: "partner-university",
        why: 'No signed partnerships exist — use "universities we work with", "universities our students apply to", or "destination universities" (File 08)',
        at: excerpt(html, m.index, m[0].length),
      });
    }
  }

  for (const m of html.matchAll(PARTNER_RE)) {
    const name = m[1].trim().toLowerCase();
    if (!SIGNED_PARTNERS.some((p) => name.includes(p) || p.includes(name))) {
      violations.push({
        rel,
        id: "unsigned-partner",
        why: 'File 08 bans "partner of X" before a signed agreement (allowlist: claims.json partnerships.signed)',
        at: excerpt(html, m.index, m[0].length),
      });
    }
  }
}

if (violations.length > 0) {
  console.error(`✗ claims-guard: ${violations.length} violation(s) across ${files.length} page(s):\n`);
  for (const v of violations) {
    console.error(`  [${v.id}] ${v.rel}\n    …${v.at}…\n    → ${v.why}\n`);
  }
  console.error("  Fix the copy, or get founder sign-off + update docs/08 and claims.json first (File 10 §7).");
  process.exit(1);
}

console.log(`✓ claims-guard: ${files.length} page(s) clean against the Verified Claims Library`);
