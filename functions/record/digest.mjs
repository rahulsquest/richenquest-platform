/**
 * Career Record — the published daily digest.
 *
 * Architecture: docs/25-career-record-architecture.md §5.2.
 *
 * WHAT THIS IS FOR
 * The per-subject hash chain proves nobody altered a record *within* our own
 * database. It cannot prove we did not rebuild the whole database — recomputing
 * every hash — because we hold the keys to everything.
 *
 * The daily digest closes that gap. Each day we compute one Merkle root over
 * every record's current chain head, link it to yesterday's digest, and publish
 * the result. Anyone who kept an old published digest can later prove we have not
 * rewritten history before that date. It is a commitment made *against ourselves*,
 * and it is the strongest trust artifact in the system precisely because it costs
 * us the ability to quietly revise the past.
 *
 * PRIVACY — non-negotiable, and the reason this file is careful
 * The digest is PUBLIC. It therefore contains, by construction:
 *   · no names, no contact details, no payloads, no document contents
 *   · no event types, no classifications
 *   · only: a date, two counts, and cryptographic commitments
 * Subject identifiers are themselves hashed with a published, digest-specific
 * salt, so the digest cannot be used to enumerate who has a record with us — or
 * to confirm a guess about a particular person.
 *
 * This is a trust feature, not a marketing feature. It is only worth anything if
 * it is boring, automatic, and never skipped.
 */

import { createHash } from "node:crypto";

const ALGORITHM = "sha256/merkle-v1";

/**
 * A published, fixed domain-separation salt. Not a secret — publishing it is
 * required for external verification. Its job is to stop the digest doubling as
 * a lookup table: hashing `subject_id` alone would let anyone test whether a
 * given id has a record. Domain separation also stops a leaf being replayed as
 * an internal node.
 */
const LEAF_SALT = "richenquest.career-record.digest.leaf.v1";
const NODE_SALT = "richenquest.career-record.digest.node.v1";

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** A leaf commits to (subject, position, chain head) without revealing the subject. */
export function digestLeaf({ subject_id, seq, head }) {
  return sha(`${LEAF_SALT}\n${sha(`${LEAF_SALT}\n${subject_id}`)}\n${seq}\n${head ?? ""}`);
}

/**
 * Merkle root over sorted leaves.
 *
 * An odd node is promoted rather than duplicated: duplicating the last leaf
 * admits the second-preimage ambiguity that has bitten other Merkle designs,
 * where two different leaf sets produce the same root.
 */
export function merkleRoot(leaves) {
  if (leaves.length === 0) return sha(`${NODE_SALT}\nempty`);
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? sha(`${NODE_SALT}\n${level[i]}\n${level[i + 1]}`) : level[i]);
    }
    level = next;
  }
  return level[0];
}

/**
 * Build the digest for a day.
 *
 * @param {{subject_id:string, seq:number, head:string}[]} chainHeads  from store.chainHeads()
 * @param {{ date?: string, prevDigest?: string|null }} [opts]
 */
export function buildDigest(chainHeads, { date = new Date().toISOString().slice(0, 10), prevDigest = null } = {}) {
  const leaves = chainHeads.map(digestLeaf);
  const root = merkleRoot(leaves);
  const eventCount = chainHeads.reduce((n, h) => n + (h.events ?? h.seq ?? 0), 0);

  // The digest chains to the previous day, so the published series is itself a
  // chain: altering any past digest breaks every later one.
  const digest = sha(
    [ALGORITHM, date, String(chainHeads.length), String(eventCount), root, prevDigest ?? ""].join("\n")
  );

  return {
    algorithm: ALGORITHM,
    date,
    subject_count: chainHeads.length,
    event_count: eventCount,
    merkle_root: root,
    prev_digest: prevDigest ?? null,
    digest,
    // Published so a third party can reproduce the computation exactly.
    salts: { leaf: LEAF_SALT, node: NODE_SALT },
    notice:
      "Cryptographic commitments only. Contains no personal data: no names, no contact details, " +
      "no event contents, and no plaintext record identifiers.",
  };
}

/**
 * Recompute a published digest from chain heads and confirm it matches.
 * Internally reproducible (founder requirement) — this is what an auditor runs.
 */
export function verifyDigest(published, chainHeads) {
  const rebuilt = buildDigest(chainHeads, { date: published.date, prevDigest: published.prev_digest });
  const failures = [];
  if (rebuilt.merkle_root !== published.merkle_root) failures.push("merkle_root does not match the chain heads supplied");
  if (rebuilt.digest !== published.digest) failures.push("digest does not match its own contents");
  if (rebuilt.subject_count !== published.subject_count) failures.push("subject_count differs");
  if (rebuilt.event_count !== published.event_count) failures.push("event_count differs");
  return { ok: failures.length === 0, failures, expected: rebuilt.digest, published: published.digest };
}

/**
 * Verify a published SERIES links correctly day to day. This is the check that
 * detects a rewritten past: a tampered historical digest cannot keep the chain
 * intact, so anyone holding a later digest can prove the earlier ones stand.
 */
export function verifyDigestSeries(series) {
  const failures = [];
  const ordered = [...series].sort((a, b) => (a.date < b.date ? -1 : 1));
  ordered.forEach((d, i) => {
    if (i === 0) return;
    if (d.prev_digest !== ordered[i - 1].digest) {
      failures.push(`${d.date} does not link to ${ordered[i - 1].date} — the published series has been altered`);
    }
    if (d.event_count < ordered[i - 1].event_count) {
      // The log is append-only, so the count can never fall. A drop means events
      // were removed — exactly what this whole mechanism exists to reveal.
      failures.push(`${d.date} reports fewer events than ${ordered[i - 1].date} — an append-only log cannot shrink`);
    }
  });
  return { ok: failures.length === 0, failures, days: ordered.length };
}

/**
 * Prove one record was included in a published digest, without revealing any
 * other record. A student can be handed this and check it themselves.
 */
export function inclusionProof(chainHeads, subjectId) {
  const target = chainHeads.find((h) => h.subject_id === subjectId);
  if (!target) return null;
  const leaf = digestLeaf(target);
  const leaves = chainHeads.map(digestLeaf).sort();

  const path = [];
  let level = leaves;
  let index = level.indexOf(leaf);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : null;
      if (right === null) {
        next.push(left);
        if (i === index) index = next.length - 1;
      } else {
        if (i === index) { path.push({ side: "right", hash: right }); index = next.length; }
        else if (i + 1 === index) { path.push({ side: "left", hash: left }); index = next.length; }
        next.push(sha(`${NODE_SALT}\n${left}\n${right}`));
      }
    }
    level = next;
  }
  return { leaf, path, root: level[0] };
}

/** Check an inclusion proof — the verifier side, needing only the proof and the root. */
export function verifyInclusion({ leaf, path, root }) {
  let acc = leaf;
  for (const step of path) {
    acc = step.side === "right" ? sha(`${NODE_SALT}\n${acc}\n${step.hash}`) : sha(`${NODE_SALT}\n${step.hash}\n${acc}`);
  }
  return acc === root;
}

export { ALGORITHM, LEAF_SALT, NODE_SALT };
