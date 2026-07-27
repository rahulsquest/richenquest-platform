#!/usr/bin/env node
/**
 * Mint a student dashboard link.
 *
 * WHY THIS EXISTS
 * The Career Record API deliberately holds no passwords and implements no
 * credential flow (identity/auth.mjs, SCOPE): identity proofing belongs to an
 * identity provider, and holding password hashes here would add the single
 * highest-consequence liability in the system for no architectural gain.
 *
 * Until a student IdP is chosen (magic-link/OIDC — an open founder decision,
 * docs/STATUS.md BL-6 territory), a session is issued by a person who has
 * already established who the student is, using the real issueToken() the API
 * verifies against. This is the interim flow, not a placeholder: the token is
 * genuine, short-lived, scope-bound and signed with the production secret.
 *
 * THE TOKEN GOES IN THE FRAGMENT
 * `#token=…` is never sent to a server, never lands in an access log, and is not
 * included in a Referer header. The dashboard consumes it on first paint and
 * erases it from the address bar.
 *
 * HANDLING
 * The printed link IS a credential for one person's record. Send it to that
 * person over a channel you trust, and do not paste it into a ticket, a chat
 * channel or a commit. It expires on its own; that is the point of a short TTL.
 *
 * Usage:
 *   node --env-file=.env functions/record/scripts/issue-student-link.mjs \
 *     --subject sub_ab12cd34 --site https://www.richenquest.com [--ttl 900] [--role subject]
 *
 * A guardian link names the guardian as well as the record:
 *   --role guardian --actor usr_someone --subject sub_ab12cd34
 *
 * The ward is always --subject: the record the link opens and the record the
 * guardian is scoped to are the same record, and letting them differ could only
 * ever produce a link that opens something the holder cannot read.
 */

import { issueToken, DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS } from "../identity/auth.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith("--") ? next : "true";
  }
  return args;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const secret = process.env.RECORD_TOKEN_SECRET;

if (!secret) fail("RECORD_TOKEN_SECRET is not set. Run with --env-file=.env, or export it.");
if (Buffer.from(secret).length < 32) fail("RECORD_TOKEN_SECRET must be at least 32 bytes.");

const subjectId = args.subject;
if (!subjectId) fail("--subject is required (the record id, e.g. sub_ab12cd34).");
if (!/^sub_[A-Za-z0-9_-]+$/.test(subjectId)) fail(`--subject "${subjectId}" is not a valid record id.`);

const site = (args.site ?? "").replace(/\/+$/, "");
if (!site) fail("--site is required (the site origin, e.g. https://www.richenquest.com).");
try {
  const url = new URL(site);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    fail("--site must be https (loopback is allowed for local development).");
  }
} catch {
  fail(`--site "${site}" is not a valid URL.`);
}

const role = args.role ?? "subject";
if (!["subject", "guardian"].includes(role)) fail("--role must be subject or guardian.");

const ttlSeconds = Number.parseInt(args.ttl ?? String(DEFAULT_TTL_SECONDS), 10);
if (!Number.isFinite(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > MAX_TTL_SECONDS) {
  fail(`--ttl must be between 60 and ${MAX_TTL_SECONDS} seconds.`);
}

// A guardian acts on behalf of a ward and is a different person from the
// subject, so their token identifies them and scopes them to the ward.
//
// subject_id is carried as well as the ward scope. The API authorises a guardian
// on the scope alone (auth.mjs assertRecordAccess), so this changes nothing
// server-side — but the dashboard needs the token to name the record it should
// open, and refuses a token that names none as "unbound" before it ever issues a
// request. Without this, every guardian link died on the sign-in gate.
const claims =
  role === "guardian"
    ? {
        sub: args.actor ?? fail("--actor is required for a guardian link (the guardian's user id)."),
        role: "guardian",
        subject_id: subjectId,
        scopes: [`ward:${subjectId}`],
      }
    : { sub: subjectId, role: "subject", subject_id: subjectId };

let issued;
try {
  issued = issueToken(claims, secret, { ttlSeconds });
} catch (err) {
  fail(`could not issue a token: ${err.message}`);
}

const link = `${site}/dashboard/#token=${encodeURIComponent(issued.token)}`;
const expiresAt = new Date(issued.claims.exp * 1000).toISOString();

console.log("");
console.log("  ⚠  This link is a credential for one person's record. Send it only to them.");
console.log("");
console.log(`  role       ${role}`);
console.log(`  record     ${subjectId}`);
console.log(`  expires    ${expiresAt}  (${Math.round(ttlSeconds / 60)} min)`);
console.log(`  token id   ${issued.claims.jti}`);
console.log("");
console.log(link);
console.log("");
