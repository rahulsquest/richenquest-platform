/**
 * Daily digest tests.
 *
 * The digest is a commitment made against ourselves. These tests check the two
 * things that make it worth publishing: that it reveals nothing about anyone, and
 * that it actually detects a rewritten past.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { memoryStore, appendEvent } from "./log.mjs";
import {
  buildDigest,
  verifyDigest,
  verifyDigestSeries,
  merkleRoot,
  digestLeaf,
  inclusionProof,
  verifyInclusion,
} from "./digest.mjs";

const COUNSELLOR = { kind: "human", id: "usr_kunal", role: "counsellor" };

async function storeWith(subjects) {
  const store = memoryStore();
  for (const [subjectId, count] of Object.entries(subjects)) {
    for (let i = 0; i < count; i++) {
      await appendEvent(store, {
        subjectId,
        type: "counselling.note_added",
        actor: COUNSELLOR,
        payload: { note: `sensitive detail about ${subjectId} number ${i}`, passport: "X1234567" },
      });
    }
  }
  return store;
}

/* ------------------------------------------------------------ privacy --- */

test("the digest contains no personal data of any kind", async () => {
  const store = await storeWith({ sub_aarav: 3, sub_priya: 2 });
  const digest = buildDigest(await store.chainHeads());
  const serialised = JSON.stringify(digest);

  // Nothing identifying, and not even the plaintext record ids — otherwise the
  // digest becomes a way to confirm whether a named person is a client.
  for (const forbidden of ["sub_aarav", "sub_priya", "passport", "X1234567", "sensitive detail", "counselling"]) {
    assert.doesNotMatch(serialised, new RegExp(forbidden, "i"), `digest must not contain "${forbidden}"`);
  }

  assert.deepEqual(Object.keys(digest).sort(), [
    "algorithm", "date", "digest", "event_count", "merkle_root",
    "notice", "prev_digest", "salts", "subject_count",
  ]);
  assert.equal(digest.subject_count, 2);
  assert.equal(digest.event_count, 5);
});

test("a record id cannot be confirmed from the digest without the whole leaf set", async () => {
  const store = await storeWith({ sub_aarav: 1 });
  const heads = await store.chainHeads();
  const digest = buildDigest(heads);

  // Guessing the subject id is not enough: the leaf also commits to seq and head.
  const guessOnly = digestLeaf({ subject_id: "sub_aarav", seq: 999, head: "sha256:guess" });
  assert.notEqual(guessOnly, digestLeaf(heads[0]));
  assert.doesNotMatch(JSON.stringify(digest), /sub_aarav/);
});

/* ------------------------------------------------------------- merkle --- */

test("merkle root is stable, order-independent, and changes when any leaf changes", () => {
  const a = ["h1", "h2", "h3"];
  assert.equal(merkleRoot(a), merkleRoot([...a].reverse()), "leaves are sorted, so input order is irrelevant");
  assert.notEqual(merkleRoot(a), merkleRoot(["h1", "h2", "h4"]));
  assert.equal(merkleRoot([]), merkleRoot([]), "the empty case is defined");
  assert.notEqual(merkleRoot([]), merkleRoot(["h1"]));
});

test("an odd leaf is promoted, not duplicated", () => {
  // Duplicating the last leaf admits two different leaf sets hashing to the same
  // root — the second-preimage flaw that has bitten other Merkle designs.
  const three = merkleRoot(["a", "b", "c"]);
  const fourWithDupe = merkleRoot(["a", "b", "c", "c"]);
  assert.notEqual(three, fourWithDupe, "3 leaves must not equal 4 leaves where the last is duplicated");
});

/* -------------------------------------------------------- reproducible --- */

test("a published digest is internally reproducible from the chain heads", async () => {
  const store = await storeWith({ sub_a: 2, sub_b: 1 });
  const heads = await store.chainHeads();
  const published = buildDigest(heads, { date: "2026-07-25" });

  const check = verifyDigest(published, heads);
  assert.equal(check.ok, true, JSON.stringify(check.failures));
});

test("verifyDigest fails if the chain heads no longer match what was published", async () => {
  const store = await storeWith({ sub_a: 2 });
  const heads = await store.chainHeads();
  const published = buildDigest(heads, { date: "2026-07-25" });

  // Someone rebuilt the database and recomputed every hash. The chain still
  // verifies internally — but it no longer matches the published commitment.
  const rewritten = heads.map((h) => ({ ...h, head: "sha256:rebuilt_history" }));
  const check = verifyDigest(published, rewritten);
  assert.equal(check.ok, false, "a rebuilt history must not match yesterday's digest");
  assert.ok(check.failures.some((f) => /merkle_root/.test(f)));
});

/* ------------------------------------------------- the series is a chain --- */

test("the published series links day to day, so an altered past digest is detectable", async () => {
  const s1 = await storeWith({ sub_a: 1 });
  const d1 = buildDigest(await s1.chainHeads(), { date: "2026-07-23" });

  const s2 = await storeWith({ sub_a: 2, sub_b: 1 });
  const d2 = buildDigest(await s2.chainHeads(), { date: "2026-07-24", prevDigest: d1.digest });

  const s3 = await storeWith({ sub_a: 3, sub_b: 2 });
  const d3 = buildDigest(await s3.chainHeads(), { date: "2026-07-25", prevDigest: d2.digest });

  assert.equal(verifyDigestSeries([d1, d2, d3]).ok, true);

  // Tamper with the middle day. Every later link breaks.
  const forged = { ...d2, merkle_root: "sha256:forged", digest: "sha256:forged_digest" };
  const broken = verifyDigestSeries([d1, forged, d3]);
  assert.equal(broken.ok, false);
  assert.ok(broken.failures.some((f) => /does not link/.test(f)));
});

test("an append-only log cannot shrink, and the series says so", async () => {
  const big = buildDigest(await (await storeWith({ sub_a: 5 })).chainHeads(), { date: "2026-07-24" });
  const small = buildDigest(await (await storeWith({ sub_a: 2 })).chainHeads(), {
    date: "2026-07-25",
    prevDigest: big.digest,
  });

  const result = verifyDigestSeries([big, small]);
  assert.equal(result.ok, false, "events disappearing must be flagged");
  assert.ok(result.failures.some((f) => /cannot shrink/.test(f)));
});

/* ---------------------------------------------------- inclusion proof --- */

test("an individual can prove their record was in a published digest, revealing nobody else", async () => {
  const store = await storeWith({ sub_a: 2, sub_b: 1, sub_c: 4, sub_d: 3 });
  const heads = await store.chainHeads();
  const digest = buildDigest(heads);

  const proof = inclusionProof(heads, "sub_c");
  assert.ok(proof, "a proof must exist for a record that is present");
  assert.equal(proof.root, digest.merkle_root, "the proof must reconstruct the published root");
  assert.equal(verifyInclusion(proof), true);

  // The proof is hashes only — no other person's identifier is exposed.
  const serialised = JSON.stringify(proof);
  for (const other of ["sub_a", "sub_b", "sub_d"]) {
    assert.doesNotMatch(serialised, new RegExp(other), `the proof must not reveal ${other}`);
  }
});

test("a forged inclusion proof does not verify", async () => {
  const store = await storeWith({ sub_a: 1, sub_b: 1, sub_c: 1 });
  const heads = await store.chainHeads();
  const proof = inclusionProof(heads, "sub_b");

  assert.equal(verifyInclusion({ ...proof, leaf: "sha256:not_my_leaf" }), false);
  assert.equal(verifyInclusion({ ...proof, root: "sha256:not_the_root" }), false);
});

test("a record absent from the digest has no proof", async () => {
  const store = await storeWith({ sub_a: 1 });
  assert.equal(inclusionProof(await store.chainHeads(), "sub_never_existed"), null);
});

/* ---------------------------------------------------- end-to-end shape --- */

test("digest built from a real store round-trips through publication", async () => {
  const store = memoryStore();
  await appendEvent(store, {
    subjectId: "sub_e2e",
    type: "recommendation.issued",
    actor: COUNSELLOR,
    evidence: [{ ref: "dest:germany@2026-07-19", kind: "published_data", hash: "sha256:9f2c" }],
    disclosure: { shown: true, register_version: "2026-07-25", statements: ["none"] },
    payload: { recommended: [{ option: "dest:germany", rank: 1 }], criteria_version: "matcher@1.3.0" },
  });

  const heads = await store.chainHeads();
  const published = JSON.parse(JSON.stringify(buildDigest(heads, { date: "2026-07-25" })));

  assert.equal(verifyDigest(published, heads).ok, true, "publication must survive serialisation");
  assert.equal(published.algorithm, "sha256/merkle-v1");
  assert.match(published.notice, /no personal data/i);
  assert.ok(published.salts.leaf && published.salts.node, "salts are published so outsiders can reproduce it");
});
