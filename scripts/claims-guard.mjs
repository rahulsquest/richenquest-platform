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

/** Placement-count phrases must state exactly the verified figure, with no inflating "+". */
const COUNT_RES = [
  /\b(\d[\d,]*)\s*(\+?)\s*students?\s+(?:placed|counsel\w*|served|helped)/gi,
  /\b(?:placed|counseled|counselled|served|helped)\s+(?:over\s+|more\s+than\s+)?(\d[\d,]*)\s*(\+?)\s*students?/gi,
];

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
      if (num !== VERIFIED_COUNT || m[2] === "+") {
        violations.push({
          rel,
          id: "unverified-count",
          why: `Placement claims must state exactly the verified figure (${VERIFIED_COUNT}), no "+"`,
          at: excerpt(html, m.index, m[0].length),
        });
      }
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
