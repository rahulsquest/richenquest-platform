/**
 * Operations — the CRM port.
 *
 * Zoho CRM is the operational system of record (ADR-003). The operations API
 * depends on THIS INTERFACE, never on Zoho directly, for the same reason the
 * Career Record depends on an EventStore rather than on `pg`: the domain must be
 * testable and the vendor must be replaceable.
 *
 * That matters more here than it looks. Every operations endpoint can therefore be
 * verified over real HTTP against a deterministic in-memory CRM — no network, no
 * credentials, no writing test rows into the production CRM that the founder then
 * has to clean up. The Zoho adapter is a thin translation with no logic in it, so
 * what the tests do not cover is only the HTTP shape, which functions/zoho already
 * exercises against the live org.
 *
 * MODULES are named in RichenQuest terms, not Zoho's. "Student Cases" are stored
 * in Zoho's `Deals` module (a console-only rename, docs/14) — a fact that belongs
 * in the adapter and nowhere else, so no endpoint or view ever says "Deals".
 */

export const MODULES = Object.freeze({
  leads: "Leads",
  students: "Deals", // Student Cases — renamed in the console, still `Deals` in the API
  // Universities and partner institutions share one module: they are the same
  // organisation at different points on one pipeline (see collaboration.mjs).
  collaborators: "Accounts",
  contacts: "Contacts",
  meetings: "Events",
  calls: "Calls",
  // Degrees AND opportunities: one module, one `Product_Category` discriminator.
  // They are the same concept — a thing an institution offers our students.
  offerings: "Products",
  documents: "Attachments",
  tasks: "Tasks",
});

export class CrmError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = "CrmError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/**
 * @typedef {object} CrmPort
 * @property {(module: string, opts?: object) => Promise<object[]>} list
 * @property {(module: string, id: string) => Promise<object|null>} get
 * @property {(module: string, fields: object) => Promise<{id: string}>} create
 * @property {(module: string, id: string, fields: object) => Promise<{id: string}>} update
 * @property {(module: string, id: string) => Promise<object[]>} notes
 * @property {(module: string, id: string, title: string, content: string) => Promise<{id: string}>} addNote
 */

/* ────────────────────────────────────────────────────────── zoho adapter ── */

/**
 * The real port, over the existing functions/zoho service layer.
 *
 * @param {object} crm  the `crm` namespace from functions/zoho/index.mjs (injected,
 *                      so this module imports no OAuth state and stays unit-testable)
 */
export function zohoCrmPort(crm) {
  const required = ["coql", "getRecord", "createRecord", "updateRecord", "listNotes", "addNote"];
  for (const method of required) {
    if (typeof crm?.[method] !== "function") throw new CrmError("BAD_CLIENT", `CRM client is missing ${method}()`);
  }

  /** COQL demands a WHERE clause; `id is not null` is the always-true form. */
  const whereOr = (where) => where && where.trim() ? where : "id is not null";

  return {
    async list(module, { fields = ["id"], where = null, limit = 100, offset = 0, orderBy = null } = {}) {
      const select = fields.join(", ");
      const order = orderBy ? ` order by ${orderBy}` : "";
      const query = `select ${select} from ${module} where ${whereOr(where)}${order} limit ${offset}, ${limit}`;
      try {
        const { data } = await crm.coql(query);
        return data;
      } catch (err) {
        // A COQL syntax error is our bug, not the operator's — surfaced with the
        // query so it is debuggable, but never returned to a browser.
        throw new CrmError("QUERY_FAILED", `CRM query failed for ${module}`, err);
      }
    },

    get: (module, id) => crm.getRecord(module, id),
    create: (module, fields) => crm.createRecord(module, fields),
    update: (module, id, fields) => crm.updateRecord(module, id, fields),
    notes: (module, id) => crm.listNotes(module, id),
    addNote: (module, id, title, content) => crm.addNote(module, id, title, content),
  };
}

/* ───────────────────────────────────────────────────────── memory adapter ── */

/**
 * A deterministic in-memory CRM implementing the same port.
 *
 * Not a mock of the operations API — it is a real, working store that the same
 * endpoints run against unchanged. It supports the subset of COQL the port
 * actually emits (equality, `in`, `is null`, `>=`/`<=` on dates, `and`), which is
 * enough to exercise every query the platform makes, and it fails loudly on
 * anything it does not understand rather than silently returning everything.
 */
export function memoryCrmPort(seed = {}) {
  /**
   * ONE representation of every row, matching how the REST record API stores it:
   * nested (`{ Owner: { id } }`). Dotted keys on the way in — the shape COQL
   * returns and the shape seeds are written in — are expanded on arrival.
   *
   * Without this, a row seeded flat and then updated nested carries BOTH
   * `"Owner.id"` and `Owner.id`, and whichever the reader checks first wins. That
   * is not a test-store curiosity: it silently made a reassignment appear to
   * succeed while the record kept its old owner.
   */
  function normalise(row) {
    const out = {};
    for (const [key, value] of Object.entries(row)) {
      if (!key.includes(".")) { out[key] = value; continue; }
      const parts = key.split(".");
      const leaf = parts.pop();
      let cursor = out;
      for (const part of parts) {
        if (typeof cursor[part] !== "object" || cursor[part] === null) cursor[part] = {};
        cursor = cursor[part];
      }
      cursor[leaf] = value;
    }
    return out;
  }

  /** Merge plain objects one level deep, so writing {Owner:{id}} keeps Owner.name. */
  function mergeInto(row, fields) {
    for (const [key, value] of Object.entries(normalise(fields))) {
      const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
      row[key] = isPlain(value) && isPlain(row[key]) ? { ...row[key], ...value } : value;
    }
    return row;
  }

  const store = new Map(Object.entries(seed).map(([m, rows]) => [m, rows.map((r) => normalise(r))]));
  const rowsOf = (module) => {
    if (!store.has(module)) store.set(module, []);
    return store.get(module);
  };
  let nextId = 1000;

  /**
   * Evaluate the narrow COQL dialect the port emits: parenthesised groups, `and`,
   * `or`, `in (…)`, `is [not] null`, and the comparison operators. Anything else
   * throws rather than quietly matching everything — a query language that
   * silently ignores a filter it did not understand is a data leak, and here it
   * would be a scoping filter it ignored.
   */
  function matches(row, where) {
    if (!where || !where.trim() || where.trim() === "id is not null") return true;
    const p = { s: where, i: 0 };
    const result = parseOr(row, p);
    skipWs(p);
    if (p.i < p.s.length) {
      throw new CrmError("UNSUPPORTED_QUERY", `memoryCrmPort cannot evaluate "${p.s.slice(p.i, p.i + 60)}"`);
    }
    return result;
  }

  const skipWs = (p) => { while (p.i < p.s.length && /\s/.test(p.s[p.i])) p.i += 1; };

  /** Consume a keyword or symbol at the cursor, respecting word boundaries. */
  function eat(p, token) {
    skipWs(p);
    const slice = p.s.slice(p.i, p.i + token.length);
    if (slice.toLowerCase() !== token.toLowerCase()) return false;
    if (/^\w+$/.test(token)) {
      const after = p.s[p.i + token.length];
      if (after !== undefined && /[\w.]/.test(after)) return false;
    }
    p.i += token.length;
    return true;
  }

  function parseOr(row, p) {
    let value = parseAnd(row, p);
    while (eat(p, "or")) value = parseAnd(row, p) || value;
    return value;
  }

  function parseAnd(row, p) {
    let value = parseFactor(row, p);
    while (eat(p, "and")) value = parseFactor(row, p) && value;
    return value;
  }

  function parseFactor(row, p) {
    skipWs(p);
    if (eat(p, "(")) {
      const value = parseOr(row, p);
      if (!eat(p, ")")) throw new CrmError("UNSUPPORTED_QUERY", "unbalanced parenthesis in query");
      return value;
    }
    return parseLeaf(row, p);
  }

  function parseLeaf(row, p) {
    skipWs(p);
    const rest = p.s.slice(p.i);
    let m;

    if ((m = /^([\w.]+)\s+is\s+not\s+null/i.exec(rest))) {
      p.i += m[0].length;
      return present(fieldValue(row, m[1]));
    }
    if ((m = /^([\w.]+)\s+is\s+null/i.exec(rest))) {
      p.i += m[0].length;
      return !present(fieldValue(row, m[1]));
    }
    if ((m = /^([\w.]+)\s+in\s*\(([^)]*)\)/i.exec(rest))) {
      p.i += m[0].length;
      const values = m[2].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
      return values.includes(String(fieldValue(row, m[1]) ?? ""));
    }
    if ((m = /^([\w.]+)\s*(>=|<=|!=|=)\s*'([^']*)'/.exec(rest)) || (m = /^([\w.]+)\s*(>=|<=|!=|=)\s*([^\s)]+)/.exec(rest))) {
      p.i += m[0].length;
      const actual = fieldValue(row, m[1]);
      const expected = m[3];
      if (m[2] === "=") return String(actual ?? "") === expected;
      if (m[2] === "!=") return String(actual ?? "") !== expected;
      if (!present(actual)) return false;
      return m[2] === ">=" ? String(actual) >= expected : String(actual) <= expected;
    }
    throw new CrmError("UNSUPPORTED_QUERY", `memoryCrmPort cannot evaluate "${rest.slice(0, 60)}"`);
  }

  const present = (v) => v !== null && v !== undefined && v !== "";

  /**
   * Resolve a field that may be flat ("Owner.id", as COQL returns it) or nested
   * ({ Owner: { id } }, as the REST record API returns it). Both shapes reach this
   * store, and treating one as absent would make a scoping filter match nothing.
   */
  function fieldValue(row, field) {
    if (row == null) return null;
    if (field in row) return row[field];
    return field.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), row) ?? null;
  }

  return {
    async list(module, { fields = ["id"], where = null, limit = 100, offset = 0, orderBy = null } = {}) {
      let rows = rowsOf(module).filter((r) => matches(r, where));
      if (orderBy) {
        const [field, dir = "asc"] = orderBy.split(/\s+/);
        rows = [...rows].sort((a, b) => {
          const av = String(fieldValue(a, field) ?? "");
          const bv = String(fieldValue(b, field) ?? "");
          return dir.toLowerCase() === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
        });
      }
      // Projected through fieldValue so a record written nested ({Owner:{id}}) and
      // selected flat ("Owner.id") keeps its owner. Dropping it here would silently
      // unassign every record the API itself created.
      return rows.slice(offset, offset + limit).map((r) =>
        fields.includes("*")
          ? { ...r }
          : Object.fromEntries(
              fields.map((f) => [f, fieldValue(r, f)]).filter(([, v]) => v !== undefined)
            )
      );
    },

    async get(module, id) {
      return rowsOf(module).find((r) => r.id === id) ?? null;
    },

    async create(module, fields) {
      const id = String(nextId++);
      rowsOf(module).push(normalise({ id, Created_Time: new Date().toISOString(), ...fields }));
      return { id };
    },

    async update(module, id, fields) {
      const row = rowsOf(module).find((r) => r.id === id);
      if (!row) throw new CrmError("NOT_FOUND", `${module}/${id} does not exist`);
      mergeInto(row, { ...fields, Modified_Time: new Date().toISOString() });
      return { id };
    },

    async notes(module, id) {
      return rowsOf("Notes")
        .filter((n) => n.parent_module === module && n.parent_id === id)
        .sort((a, b) => String(b.Created_Time).localeCompare(String(a.Created_Time)));
    },

    async addNote(module, id, title, content) {
      const noteId = String(nextId++);
      rowsOf("Notes").push({
        id: noteId, parent_module: module, parent_id: id,
        Note_Title: title, Note_Content: content, Created_Time: new Date().toISOString(),
      });
      return { id: noteId };
    },

    _store: store,
  };
}
