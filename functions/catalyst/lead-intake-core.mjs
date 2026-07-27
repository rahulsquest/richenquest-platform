/**
 * Public lead intake, framework-agnostic and fully testable without Express,
 * the Catalyst SDK or a live CRM. The CJS shell (deploy/lead-intake.handler.cjs)
 * is a thin adapter; every rule below is exercised by lead-intake-core.test.mjs.
 *
 * WHY THIS EXISTS
 * The live website's form had `preventDefault()` and a TODO where the network
 * call should be, so it cleared the fields and told the student "your request
 * has been received" while sending nothing anywhere. This is the endpoint that
 * makes that message true.
 *
 * THE ONE PROPERTY THAT OUTRANKS EVERYTHING ELSE: **a valid lead must never be
 * lost.** Where a choice exists between rejecting a submission and accepting it
 * with imperfect data, this accepts it and preserves the raw values in the
 * Description. A counsellor can fix a picklist; nobody can recover a student who
 * was told to go away.
 *
 * WHAT THIS DOES NOT DO
 * It does not call Titan. Creating a CRM Lead fires the `Leads.create` watch
 * channel, which drives titan-webhook exactly as it does today — so automation
 * runs through the existing path and is neither bypassed nor duplicated. It also
 * has nothing to do with the Record API, which serves authenticated students
 * their own career record and is not part of lead intake.
 */

/** Requests larger than this are refused unread. A lead is ~500 bytes. */
export const MAX_BODY_BYTES = 8 * 1024;

/** The ONLY browser origin permitted to call this endpoint. */
export const ALLOWED_ORIGIN = "https://www.richenquest.com";

/** Rate limit: submissions per client per window. */
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX = 5;

/** The same person submitting twice inside this window is one lead, not two. */
export const DUPLICATE_WINDOW_MS = 10 * 60_000;

/** A human cannot complete this form in under three seconds. A script can. */
export const MIN_FILL_MS = 3_000;

/** A page open longer than this submits a stale timestamp; ask for a reload. */
export const MAX_FORM_AGE_MS = 6 * 60 * 60_000;

/**
 * CRM picklist values, VERIFIED against the live org's field metadata
 * (GET /settings/fields?module=Leads) rather than transcribed from a document.
 * A value absent from these lists is rejected by Zoho with INVALID_DATA, which
 * would fail the upsert and lose the lead — hence exact-match-or-"Other".
 */
export const CRM_LEVELS = ["Bachelor's", "Master's", "Diploma", "PhD", "PR/Immigration", "Other"];
export const CRM_DESTINATIONS = [
  "Italy", "Germany", "France", "Spain", "Hungary", "Latvia", "Lithuania", "Ireland",
  "Netherlands", "Malta", "Poland", "Other Schengen", "United Kingdom", "Australia",
  "New Zealand", "Singapore", "Japan", "South Korea", "Other",
];

/**
 * Lead_Source is NOT set by this endpoint.
 *
 * The live org's Lead_Source picklist contains no "Website" value (verified:
 * Advertisement, Cold Call, Employee Referral, … Facebook). Sending one anyway
 * risks INVALID_DATA and a lost lead. `Lead_Source_Detail` DOES contain
 * "Website Form", so that is the field which carries the provenance.
 */
export const CRM_SOURCE_DETAIL = "Website Form";

export const FIELD_LIMITS = { name: 100, email: 254, phone: 32, destination: 64, level: 64, message: 2000 };

/* ------------------------------------------------------------ sanitising --- */

/**
 * Strip control characters, collapse runs of whitespace, trim, clamp length.
 * Applied to EVERY text field before it is looked at, so validation and the CRM
 * see the same bytes.
 */
export function sanitize(value, max) {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Digits, keeping a single leading +. E.164 allows at most 15 digits. */
function normalisePhone(raw) {
  const s = String(raw ?? "").trim();
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  return { digits, e164: (plus ? "+" : "") + digits };
}

// Deliberately permissive: one @, a dot in the domain, no spaces. Stricter
// patterns reject valid addresses, and rejecting a real student is the
// expensive error here.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Split "Ada Lovelace" into First/Last. Last_Name is system-mandatory on Leads,
 * so a single-word name becomes the last name and First_Name is omitted.
 */
export function splitName(full) {
  const parts = full.split(" ").filter(Boolean);
  if (parts.length <= 1) return { first: "", last: parts[0] ?? "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/* ------------------------------------------------------------ validation --- */

/**
 * @returns {{ok: true, value: object} | {ok: false, errors: {field, message}[]}}
 */
export function validateLead(input = {}) {
  const errors = [];
  const name = sanitize(input.name, FIELD_LIMITS.name);
  const email = sanitize(input.email, FIELD_LIMITS.email).toLowerCase();
  const phoneRaw = sanitize(input.phone, FIELD_LIMITS.phone);
  const destination = sanitize(input.destination, FIELD_LIMITS.destination);
  const level = sanitize(input.level, FIELD_LIMITS.level);
  const message = sanitize(input.message, FIELD_LIMITS.message);

  if (name.length < 2) errors.push({ field: "name", message: "Please enter your full name." });
  if (!EMAIL_RE.test(email)) errors.push({ field: "email", message: "Please enter a valid email address." });

  const { digits, e164 } = normalisePhone(phoneRaw);
  if (digits.length < 8 || digits.length > 15) {
    errors.push({ field: "phone", message: "Please enter a valid phone number with country code." });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, email, phone: e164, destination, level, message } };
}

/* --------------------------------------------------------------- mapping --- */

/**
 * Build the CRM Lead payload.
 *
 * Picklists take an exact match or "Other" — never the raw string, which Zoho
 * would reject. The raw values are always written into Description, so a
 * destination the picklist does not yet carry (Austria, Canada, Portugal and 14
 * others, as of this writing) is visible to the counsellor rather than lost.
 */
export function toCrmLead(value) {
  const { first, last } = splitName(value.name);
  const level = CRM_LEVELS.includes(value.level) ? value.level : value.level ? "Other" : "";
  const destination = CRM_DESTINATIONS.includes(value.destination)
    ? value.destination
    : value.destination ? "Other" : "";

  const notes = [
    value.message && `Message: ${value.message}`,
    value.destination && `Preferred destination (as submitted): ${value.destination}`,
    value.level && `Study level (as submitted): ${value.level}`,
    "Submitted via the richenquest.com website form.",
  ].filter(Boolean);

  const fields = {
    Last_Name: last,
    Email: value.email,
    Phone: value.phone,
    Description: notes.join("\n"),
    Lead_Source_Detail: CRM_SOURCE_DETAIL,
    // Explicitly unset: createOrUpdateLead() defaults Lead_Source to "Website",
    // which is not in this org's picklist. `undefined` is dropped by
    // JSON.stringify, so the field is omitted rather than sent invalid.
    Lead_Source: undefined,
  };
  if (first) fields.First_Name = first;
  if (level) fields.Interested_Level = level;
  if (destination) fields.Interested_Country = [destination]; // multiselectpicklist

  return fields;
}

/* ----------------------------------------------------------------- store --- */

/**
 * Rate-limit and duplicate state.
 *
 * In-memory and therefore PER CONTAINER: it throttles a burst from one client
 * against one warm instance, and does not survive a cold start or coordinate
 * across instances. That is a deliberate floor, not the whole defence —
 * authoritative deduplication is the CRM upsert itself, which matches on Email
 * and Phone and updates instead of inserting. Anything stronger needs a shared
 * Data Store table, which cannot be created from the SDK.
 */
export function createMemoryStore() {
  const hits = new Map();
  const seen = new Map();
  const sweep = (map, now) => { for (const [k, v] of map) if (v.expires <= now) map.delete(k); };

  return {
    /** @returns {boolean} true when the caller is over the limit */
    rateLimited(key, now) {
      sweep(hits, now);
      const entry = hits.get(key);
      if (!entry || entry.expires <= now) {
        hits.set(key, { count: 1, expires: now + RATE_LIMIT_WINDOW_MS });
        return false;
      }
      entry.count += 1;
      return entry.count > RATE_LIMIT_MAX;
    },
    /** @returns {string|null} the earlier request id when this is a repeat */
    duplicate(key, now) {
      sweep(seen, now);
      const entry = seen.get(key);
      return entry && entry.expires > now ? entry.requestId : null;
    },
    remember(key, requestId, now) {
      seen.set(key, { requestId, expires: now + DUPLICATE_WINDOW_MS });
    },
  };
}

/* ------------------------------------------------------------------ core --- */

const cors = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "600",
});

/**
 * @param {object} deps
 * @param {(fields:object, opts:object)=>Promise<{action:string,id:string}>} deps.createOrUpdateLead
 * @param {()=>number} [deps.now]
 * @param {object} [deps.store]
 * @param {()=>string} [deps.newRequestId]
 * @param {object} [deps.logger]
 */
export function createLeadIntakeCore({
  createOrUpdateLead,
  now = () => Date.now(),
  store = createMemoryStore(),
  newRequestId = () => `lead_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16)}`,
  logger = console,
} = {}) {
  /**
   * @param {object} args
   * @param {string} args.method
   * @param {string} [args.origin]
   * @param {string} [args.rawBody]  the body as received, for the size check
   * @param {string} [args.clientKey] IP or equivalent, for rate limiting
   * @param {(status:number, body:object|null, headers:object)=>void} args.respond
   */
  return async function handle({ method, origin = "", rawBody = "", clientKey = "unknown", respond }) {
    const requestId = newRequestId();
    const t = now();

    // Origin first: an unapproved caller learns nothing about the endpoint.
    const allowed = origin === ALLOWED_ORIGIN;

    if (method === "OPTIONS") {
      if (!allowed) return respond(403, null, {});
      return respond(204, null, cors(origin));
    }
    if (method !== "POST") {
      return respond(405, { error: "method_not_allowed", request_id: requestId }, allowed ? cors(origin) : {});
    }
    if (!allowed) {
      logger.warn?.(JSON.stringify({ level: "warn", msg: "lead.origin_rejected", request_id: requestId }));
      return respond(403, { error: "forbidden", request_id: requestId }, {});
    }

    const headers = cors(origin);

    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return respond(413, { error: "payload_too_large", request_id: requestId }, headers);
    }

    let body;
    try {
      body = typeof rawBody === "string" ? JSON.parse(rawBody || "{}") : rawBody;
    } catch {
      return respond(400, { error: "invalid_json", request_id: requestId }, headers);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return respond(400, { error: "invalid_body", request_id: requestId }, headers);
    }

    // Honeypot: a field no human sees and no human fills. Answer 200 so the bot
    // records a success and does not adapt; nothing is sent to the CRM.
    if (sanitize(body.website, 100)) {
      logger.info?.(JSON.stringify({ level: "info", msg: "lead.honeypot", request_id: requestId }));
      return respond(200, { ok: true, request_id: requestId }, headers);
    }

    // Timestamp: the page stamps when the form was rendered.
    const ts = Number(body.ts);
    if (!Number.isFinite(ts)) {
      return respond(400, { error: "invalid_timestamp", request_id: requestId }, headers);
    }
    const age = t - ts;
    if (age < MIN_FILL_MS) {
      logger.info?.(JSON.stringify({ level: "info", msg: "lead.too_fast", request_id: requestId, age_ms: age }));
      return respond(200, { ok: true, request_id: requestId }, headers);
    }
    if (age > MAX_FORM_AGE_MS) {
      return respond(400, { error: "stale_form", request_id: requestId }, headers);
    }

    if (store.rateLimited(clientKey, t)) {
      logger.warn?.(JSON.stringify({ level: "warn", msg: "lead.rate_limited", request_id: requestId }));
      return respond(429, { error: "rate_limited", request_id: requestId }, { ...headers, "Retry-After": "60" });
    }

    const check = validateLead(body);
    if (!check.ok) {
      return respond(422, { error: "validation_failed", issues: check.errors, request_id: requestId }, headers);
    }

    // Same person, same window → the earlier submission stands. Returning ok
    // keeps the student's experience identical and creates nothing new.
    const dupKey = `${check.value.email}|${check.value.phone}`;
    const previous = store.duplicate(dupKey, t);
    if (previous) {
      logger.info?.(JSON.stringify({ level: "info", msg: "lead.duplicate_window", request_id: requestId, first_request_id: previous }));
      return respond(200, { ok: true, duplicate: true, request_id: requestId }, headers);
    }

    try {
      const result = await createOrUpdateLead(toCrmLead(check.value), { source: CRM_SOURCE_DETAIL });
      store.remember(dupKey, requestId, t);
      // Never log the address or the number — only whether they were present.
      logger.info?.(JSON.stringify({
        level: "info", msg: "lead.accepted", request_id: requestId,
        crm_action: result?.action ?? null, crm_id: result?.id ?? null,
      }));
      return respond(201, { ok: true, request_id: requestId }, headers);
    } catch (err) {
      // The student must not be told "received" when it was not. 502 lets the
      // page keep their typed data and offer the WhatsApp fallback.
      logger.error?.(JSON.stringify({ level: "error", msg: "lead.crm_failed", request_id: requestId, error: err.message }));
      return respond(502, { error: "crm_unavailable", request_id: requestId }, headers);
    }
  };
}
