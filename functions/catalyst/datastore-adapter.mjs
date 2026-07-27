/**
 * Catalyst Data Store adapter — maps the SDK onto the tiny { get,put,delete,
 * append,list } contract that store.mjs → catalystStore expects.
 *
 * Uniform schema across all three Titan tables, so the adapter is generic and
 * the console setup is trivial: every table has two custom columns —
 *   ikey  VARCHAR(512)   the lookup key
 *   ival  TEXT           a JSON-encoded value
 * (plus Catalyst's default ROWID, which is auto-assigned and NOT usable as our
 * string key — hence the separate ikey column, looked up via ZCQL).
 *
 * This is the deploy seam validated live via the webhook /health round-trip.
 */

const esc = (s) => String(s).replace(/'/g, "''"); // ZCQL single-quote escape

export function dataStoreAdapter(catalyst) {
  const ds = catalyst.datastore();
  const zcql = catalyst.zcql();

  const find = async (table, key) => {
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID, ival FROM ${table} WHERE ikey = '${esc(key)}' LIMIT 1`);
    if (!rows || !rows.length) return null;
    const r = rows[0][table];
    return { ROWID: r.ROWID, ival: r.ival };
  };

  return {
    get: async (table, key) => {
      const r = await find(table, key);
      return r ? JSON.parse(r.ival) : null;
    },
    put: async (table, key, value) => {
      const ival = JSON.stringify(value);
      const existing = await find(table, key);
      if (existing) await ds.table(table).updateRow({ ROWID: existing.ROWID, ival });
      else await ds.table(table).insertRow({ ikey: String(key), ival });
    },
    delete: async (table, key) => {
      const r = await find(table, key);
      if (r) await ds.table(table).deleteRow(r.ROWID);
    },
    append: async (table, row) => {
      const ikey = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await ds.table(table).insertRow({ ikey, ival: JSON.stringify(row) });
    },
    list: async (table) => {
      const rows = await zcql.executeZCQLQuery(`SELECT ival FROM ${table} LIMIT 200`);
      return (rows || []).map((r) => JSON.parse(r[table].ival));
    },
  };
}
