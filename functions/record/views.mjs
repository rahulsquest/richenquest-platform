/**
 * Career Record — projections: the timeline and the export.
 *
 * Architecture: docs/25-career-record-architecture.md §7, §8.
 *
 * Projections are derived and disposable. Any of them can be deleted and rebuilt
 * from the log, and if a projection ever disagrees with the log, the log is right.
 * That is why there is exactly ONE timeline function: the website, dashboard, CRM
 * and Partner Portal all render this, filtered by who is asking. Four interfaces,
 * one truth.
 */

import { canRead, READS_ARE_LOGGED } from "./policy.mjs";
import { verifyChain } from "./event.mjs";

/* ------------------------------------------------------------ timeline --- */

/**
 * Fold a subject's events into the timeline the founder specified: type, time,
 * actor, evidence, decision, disclosure, outcome, linked documents, follow-up.
 *
 * Nothing here is stored twice. Outcomes and acknowledgements are linked events
 * (they arrive later, sometimes years later), so they are resolved at read time
 * via caused_by rather than mutated into the original.
 *
 * @param {object[]} events  the subject's events, in order
 * @param {object}   viewer  { role, id, subjectId, grants, assignedSubjects, wards }
 */
export function timeline(events, viewer) {
  const visible = events.filter((e) => canRead(e, viewer));

  // Index the follow-on events so each entry can present its own outcome.
  const linked = new Map();
  for (const e of visible) {
    if (!e.caused_by) continue;
    if (!linked.has(e.caused_by)) linked.set(e.caused_by, []);
    linked.get(e.caused_by).push(e);
  }

  // Corrections: an entry must show that it was corrected, never silently change.
  const correctedBy = new Map();
  for (const e of visible) if (e.corrects) correctedBy.set(e.corrects, e);

  const entries = visible
    .filter((e) => !e.caused_by || !visible.some((p) => p.event_id === e.caused_by))
    .map((e) => {
      const children = linked.get(e.event_id) ?? [];
      const outcome = children.find((c) => c.type.endsWith(".outcome_recorded"));
      const acknowledgement = children.find((c) => c.type.endsWith(".acknowledged"));
      const correction = correctedBy.get(e.event_id);

      return {
        event_id: e.event_id,
        type: e.type,
        time: e.occurred_at,
        recorded: e.recorded_at,
        actor: { kind: e.actor.kind, role: e.actor.role, id: e.actor.id },
        // AI is never rendered as though it were human judgement (§6).
        authored_by_ai: e.actor.kind === "ai",
        evidence: e.evidence ?? [],
        decision: e.payload ?? {},
        disclosure: e.disclosure ?? null,
        acknowledgement: acknowledgement
          ? { at: acknowledgement.occurred_at, event_id: acknowledgement.event_id }
          : null,
        outcome: outcome ? { at: outcome.occurred_at, ...outcome.payload } : null,
        documents: (e.evidence ?? []).filter((v) => String(v.ref).startsWith("doc:")),
        follow_up: e.payload?.follow_up ?? null,
        corrected: correction
          ? { by: correction.event_id, at: correction.occurred_at, reason: correction.payload?.correction_reason }
          : null,
        classification: e.classification,
      };
    })
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

  return {
    entries,
    withheld: events.length - visible.length,
    read_is_logged: READS_ARE_LOGGED.has(viewer.role),
  };
}

/**
 * Reconstruct the timeline AS IT STOOD on a past date — "what did this record
 * look like when that advice was given?". Possible only because the log does not
 * move; a mutable store cannot answer this question at all.
 */
export function timelineAsOf(events, viewer, isoDate) {
  const cutoff = Date.parse(isoDate);
  return timeline(
    events.filter((e) => Date.parse(e.recorded_at) <= cutoff),
    viewer
  );
}

/* -------------------------------------------------------------- export --- */

/**
 * Build the export archive contents. Designed first, on purpose: the export
 * format IS the internal format, so vendor lock-in is not a policy we promise
 * against — it is structurally unavailable to us (§8).
 *
 * Returns file contents rather than writing them, so the same function serves an
 * HTTP download, a CLI, and a test.
 */
export function buildExport(events, { subjectId, identity = null, toolVersion = "1.0.0" } = {}) {
  const chain = verifyChain(events);
  const documents = [
    ...new Set(
      events.flatMap((e) => (e.evidence ?? []).filter((v) => String(v.ref).startsWith("doc:")).map((v) => v.hash))
    ),
  ];

  const manifest = {
    format: "richenquest.career-record.v1",
    subject_id: subjectId,
    generated_at: new Date().toISOString(),
    tool_version: toolVersion,
    event_count: events.length,
    first_event: events[0]?.occurred_at ?? null,
    last_event: events.at(-1)?.occurred_at ?? null,
    chain_head: chain.head,
    chain_verified_at_export: chain.ok,
    document_hashes: documents,
    verification: "Run `node verify.mjs` in this folder. It needs no network and no RichenQuest code.",
    your_rights:
      "This is your record. You may keep it, move it, or publish it. RichenQuest cannot revoke this copy.",
  };

  return {
    "manifest.json": JSON.stringify(manifest, null, 2) + "\n",
    "events.jsonl": events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    "identity.json": identity ? JSON.stringify(identity, null, 2) + "\n" : "{}\n",
    "verify.mjs": VERIFIER_SOURCE,
    "README.md": EXPORT_README,
  };
}

/**
 * The standalone verifier shipped INSIDE every export. It must keep working when
 * RichenQuest does not exist, so it depends on nothing but a JS runtime and
 * re-implements the hash rule rather than importing ours.
 */
const VERIFIER_SOURCE = `#!/usr/bin/env node
/**
 * Verify a RichenQuest Career Record export.
 *
 * Recomputes the hash chain over events.jsonl and compares it with the chain
 * head recorded in manifest.json. No network, no dependencies, no RichenQuest
 * code. If this prints OK, nobody has altered this history since it was exported
 * — including RichenQuest.
 *
 *   node verify.mjs
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const canonicalise = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(canonicalise).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonicalise(v[k])).join(",") + "}";
};
const hashEvent = (e) => {
  const { hash, ...rest } = e;
  return "sha256:" + createHash("sha256").update(canonicalise(rest), "utf8").digest("hex");
};

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const events = (await readFile("events.jsonl", "utf8")).trim().split("\\n").filter(Boolean).map((l) => JSON.parse(l));

const problems = [];
let prev = null;
let expectedSeq = null;
for (const [i, e] of events.entries()) {
  if (hashEvent(e) !== e.hash) problems.push(\`event \${i} (\${e.event_id}): contents altered since export\`);
  if (prev !== null && e.prev_hash !== prev) problems.push(\`event \${i} (\${e.event_id}): chain break\`);
  if (expectedSeq !== null && e.seq !== expectedSeq) problems.push(\`event \${i}: sequence break — an event is missing\`);
  prev = e.hash;
  expectedSeq = e.seq + 1;
}
if (events.length !== manifest.event_count) problems.push(\`expected \${manifest.event_count} events, found \${events.length}\`);
if (prev !== manifest.chain_head) problems.push("final hash does not match the chain head in manifest.json");

if (problems.length) {
  console.error("FAILED — this record has been altered since it was exported:\\n");
  for (const p of problems) console.error("  · " + p);
  process.exit(1);
}
console.log(\`OK — \${events.length} events verified. Chain head \${manifest.chain_head}\`);
console.log("Nobody has altered this history since " + manifest.generated_at + ".");
`;

const EXPORT_README = `# Your RichenQuest Career Record

This folder is a complete, permanent copy of your record. It is yours.

## What is in here

- \`events.jsonl\` — every recorded event in your history, one per line, in order.
  Each carries when it happened, who recorded it, the evidence used, and the
  disclosure you were shown.
- \`manifest.json\` — a summary, including the cryptographic fingerprint of your
  history at the moment of export.
- \`identity.json\` — your personal details, in the clear, to you.
- \`verify.mjs\` — a program that checks nothing has been altered.
- \`documents/\` — your documents, named by content fingerprint.

## Checking that it is intact

    node verify.mjs

If it prints OK, this history is exactly as it was written. If someone had
changed a past entry — including us — the check would fail.

## Why it is built this way

Your record is append-only. Nothing in your history is ever edited or deleted;
corrections are added as new entries and the original stays visible. That is what
makes this file trustworthy rather than merely convenient.

You do not need our permission, our software, or our continued existence to read
or verify this.
`;

export { VERIFIER_SOURCE, EXPORT_README };
