/**
 * Durable state for the automation engine: idempotency keys, reconciliation
 * checkpoints, and the dead-letter queue.
 *
 * The interface is deliberately tiny so it can be backed by an in-memory map
 * (tests, local runs) or the Catalyst Data Store (production) without the
 * engine knowing which. Every method is async because the production
 * implementation is remote.
 *
 * ── Fail-closed contract ───────────────────────────────────────────────────
 * If the store is unavailable, the engine MUST defer the event to
 * reconciliation rather than process it. Processing without an idempotency
 * check risks a duplicate side effect (a second welcome email to a student);
 * deferring merely delays it until the next sweep. Delay is recoverable,
 * duplication is not. `seen()` therefore THROWS on backend failure — it never
 * returns false on error.
 */

/** @typedef {{seen(key:string):Promise<boolean>, remember(key:string,ttlMs:number):Promise<void>, getCheckpoint(name:string):Promise<number|null>, setCheckpoint(name:string,value:number):Promise<void>, deadLetter(entry:object):Promise<void>, listDeadLetters():Promise<object[]>}} TitanStore */

/** In-memory store: correct for a single process. Tests and local dry-runs. */
export function memoryStore({ clock = Date.now } = {}) {
  const keys = new Map(); // key -> expiresAt
  const checkpoints = new Map();
  const dead = [];
  const sweep = () => {
    const now = clock();
    for (const [k, exp] of keys) if (exp <= now) keys.delete(k);
  };
  return {
    async seen(key) { sweep(); return keys.has(key); },
    async remember(key, ttlMs) { keys.set(key, clock() + ttlMs); },
    async getCheckpoint(name) { return checkpoints.has(name) ? checkpoints.get(name) : null; },
    async setCheckpoint(name, value) { checkpoints.set(name, value); },
    async deadLetter(entry) { dead.push({ ...entry, at: clock() }); },
    async listDeadLetters() { return dead.slice(); },
    _size: () => keys.size,
  };
}

/**
 * Catalyst Data Store adapter. `client` is the Catalyst SDK segment/table
 * handle, injected so this module has zero hard dependency on the SDK and
 * stays unit-testable.
 *
 * Not exercised until a Catalyst project exists; the contract is pinned by
 * tests against a fake client so the shape cannot drift in the meantime.
 */
export function catalystStore(client, { keyTable = "titan_idempotency", metaTable = "titan_meta", deadTable = "titan_dead_letter" } = {}) {
  return {
    async seen(key) {
      // Throws on backend failure — fail-closed (see file header).
      const row = await client.get(keyTable, key);
      if (!row) return false;
      if (row.expiresAt && row.expiresAt <= Date.now()) { await client.delete(keyTable, key); return false; }
      return true;
    },
    async remember(key, ttlMs) { await client.put(keyTable, key, { expiresAt: Date.now() + ttlMs }); },
    async getCheckpoint(name) { const r = await client.get(metaTable, name); return r?.value ?? null; },
    async setCheckpoint(name, value) { await client.put(metaTable, name, { value }); },
    async deadLetter(entry) { await client.append(deadTable, { ...entry, at: Date.now() }); },
    async listDeadLetters() { return client.list(deadTable); },
  };
}

/**
 * DELIVERY key — identifies one physical notification. Cheap pre-check that
 * catches literal redelivery of the same callback without an API call.
 * Derived from the notification, so it is meaningless across paths.
 */
export function idempotencyKey({ module, id, operation, server_time }) {
  return `${module}:${id}:${operation}:${server_time ?? "0"}`;
}

/**
 * RECORD-VERSION key — identifies one *version of a record*, and is the
 * authoritative dedupe.
 *
 * The event path and the reconciliation path observe the same change through
 * different lenses: an event carries Zoho's `server_time` (when the callback
 * was sent) while a sweep carries the record's `Modified_Time`. Those values
 * never match, so a delivery-keyed check alone would let reconciliation
 * re-process work the event path already did — inflating the `missed` metric
 * that the whole architecture uses to measure delivery loss.
 *
 * Modified_Time is a property of the record itself, so both paths compute an
 * identical key. Operation is deliberately excluded: "create" and "edit" are
 * two names for the same underlying version.
 */
export function recordVersionKey({ module, id, modifiedTime }) {
  // Returns null when the version is unknown. A constant placeholder would
  // make EVERY version of the record share one key, so the first processing
  // would permanently block all later ones — silently freezing that record's
  // automation. Callers must treat null as "cannot version-dedupe" and fall
  // back to the delivery key rather than inventing an identity.
  if (modifiedTime == null || modifiedTime === "") return null;
  return `v:${module}:${id}:${modifiedTime}`;
}
