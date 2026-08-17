/**
 * RichenQuest — application intake proxy (Cloudflare Worker)
 *
 * WHY THIS EXISTS
 *   The portal is a public static page. It can never hold a Zoho credential:
 *   anything shipped to the browser is readable by anyone who opens devtools,
 *   and a leaked CRM token is write access to every student record we hold.
 *   This worker is the only thing that knows the secret.
 *
 * WHY OAUTH AND NOT A ZAPIKEY
 *   Zoho will expose a function on a URL that carries an API key in the query
 *   string. That key is CRM write access in a link — it lands in browser
 *   history, proxy logs and referrer headers. A refresh token held as a Worker
 *   secret is revocable, scoped, and never appears in a URL.
 *
 * DEPLOY
 *   wrangler secret put ZOHO_CLIENT_ID
 *   wrangler secret put ZOHO_CLIENT_SECRET
 *   wrangler secret put ZOHO_REFRESH_TOKEN
 *   wrangler deploy
 *   Then set CFG.ENDPOINT in portal/index.html to this worker's URL.
 *
 * ROUTES
 *   POST /apply            { raw, consent_version, fields } -> { ok, case_no, lead_id, … }
 *   POST /upload?lead=<id> multipart file -> attaches to the Lead, auto-tagged
 *
 * FOUNDER DECISION REQUIRED
 *   ALLOWED_ORIGIN must be set to the real portal domain before launch.
 *   "*" is fine while testing and unacceptable in production — it lets any
 *   site on the internet create Leads in your CRM.
 */

const ZOHO_ACCOUNTS = "https://accounts.zoho.in";
const ZOHO_API      = "https://www.zohoapis.in";
/*  Fail closed. "*" let any site on the internet create Leads in the CRM.
 *  This worker is NOT deployed yet (portal CFG.ENDPOINT is empty and the live
 *  path is the WhatsApp fallback), so no behaviour changes today — but the
 *  unsafe default is removed now rather than remembered at deploy time.
 *  Set this to the real portal origin before running `wrangler deploy`. */
const ALLOWED_ORIGIN = "https://apply.richenquest.com";
const MAX_UPLOAD    = 15 * 1024 * 1024;

/* Documents are tagged from the filename so a counsellor never opens an
 * attachment called "IMG_20260817.jpg" to find out what it is. Order matters:
 * the first match wins, so specific patterns come before general ones. */
const DOC_TAGS = [
  [/passport/i,                    "Passport"],
  [/(marksheet|transcript|marks)/i,"Transcript"],
  [/(degree|provisional|convoc)/i, "Degree certificate"],
  [/(moi|medium.?of.?instruction)/i,"MOI letter"],
  [/(ielts|toefl|pte|duolingo)/i,  "English test"],
  [/(cv|resume)/i,                 "CV"],
  [/(lor|recommend)/i,             "Recommendation letter"],
  [/(sop|statement)/i,             "Statement of purpose"],
  [/(bank|statement|loan|sanction|itr|financial)/i,"Financial document"],
  [/(experience|employment|offer.?letter|payslip)/i,"Work experience"],
  [/(photo|passport.?size)/i,      "Photograph"]
];
const tagFor = n => (DOC_TAGS.find(([re]) => re.test(n)) || [null,"Unclassified"])[1];

const cors = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/* Access tokens last an hour. Cached in module scope so a burst of
 * submissions does not mint a new one per request and hit the rate limit. */
let tokenCache = { value: null, expires: 0 };

async function accessToken(env) {
  if (tokenCache.value && Date.now() < tokenCache.expires - 60_000) return tokenCache.value;
  const body = new URLSearchParams({
    refresh_token: env.ZOHO_REFRESH_TOKEN,
    client_id:     env.ZOHO_CLIENT_ID,
    client_secret: env.ZOHO_CLIENT_SECRET,
    grant_type:    "refresh_token"
  });
  const r = await fetch(`${ZOHO_ACCOUNTS}/oauth/v2/token`, { method: "POST", body });
  const j = await r.json();
  if (!j.access_token) throw new Error("token refresh failed: " + JSON.stringify(j));
  tokenCache = { value: j.access_token, expires: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);

    /* ── POST /apply ─────────────────────────────────────────────────── */
    if (url.pathname === "/apply" && request.method === "POST") {
      let payload;
      try { payload = await request.json(); }
      catch { return json({ ok: false, error: "malformed request" }, 400); }

      const { raw, consent_version, fields = {} } = payload;
      if (!raw || !String(raw).trim())
        return json({ ok: false, error: "empty submission" }, 400);

      /* Consent is refused HERE as well as in Deluge. A client-side tick is a
       * claim, not a control — the browser can be edited. Nothing reaches the
       * CRM without it. */
      if (!consent_version || fields.consent !== "yes")
        return json({ ok: false, error: "consent is required before anything is stored" }, 400);

      try {
        const token = await accessToken(env);
        const qs = new URLSearchParams({
          auth_type:       "oauth",
          raw:             String(raw),
          consent_version: String(consent_version),
          parent_name:     String(fields.parent_name  || ""),
          parent_phone:    String(fields.parent_phone || ""),
          parent_consent:  fields.parent_consent === "yes" ? "yes" : "no"
        });
        const r = await fetch(
          `${ZOHO_API}/crm/v7/functions/submitapplication/actions/execute?${qs}`,
          { method: "POST", headers: { Authorization: `Zoho-oauthtoken ${token}` } }
        );
        const j = await r.json();
        let out = j?.details?.output;
        if (typeof out === "string") { try { out = JSON.parse(out); } catch {} }
        if (!out || out.ok !== true)
          return json({ ok: false, error: out?.error || "submission failed", detail: j }, 502);

        return json({
          ok: true,
          case_no:   out.case_no,
          lead_id:   out.lead_id,
          call_by:   out.call_by,
          checklist: out.checklist,
          passport_urgent: out.passport_urgent
        });
      } catch (e) {
        /* The student must never see a stack trace, and must never be told
         * "try again" for something that will fail identically next time. */
        console.error("apply failed", e);
        return json({ ok: false, error: "we could not save this right now" }, 502);
      }
    }

    /* ── POST /upload?lead=<id> ──────────────────────────────────────── */
    if (url.pathname === "/upload" && request.method === "POST") {
      const lead = url.searchParams.get("lead");
      if (!lead || !/^\d+$/.test(lead)) return json({ ok: false, error: "bad lead id" }, 400);
      try {
        const form = await request.formData();
        const file = form.get("file");
        if (!file || typeof file === "string") return json({ ok: false, error: "no file" }, 400);
        if (file.size > MAX_UPLOAD) return json({ ok: false, error: "file is larger than 15 MB" }, 413);

        const tag = tagFor(file.name);
        /* The tag is prefixed onto the stored filename because CRM attachments
         * carry no custom fields — the name is the only place a label survives. */
        const named = new File([file], `${tag} — ${file.name}`, { type: file.type });
        const fd = new FormData();
        fd.append("file", named);

        const token = await accessToken(env);
        const r = await fetch(`${ZOHO_API}/crm/v8/Leads/${lead}/Attachments`, {
          method: "POST", headers: { Authorization: `Zoho-oauthtoken ${token}` }, body: fd
        });
        const j = await r.json();
        const ok = j?.data?.[0]?.code === "SUCCESS";
        return json({ ok, tag, name: named.name, detail: ok ? undefined : j }, ok ? 200 : 502);
      } catch (e) {
        console.error("upload failed", e);
        return json({ ok: false, error: "upload failed" }, 502);
      }
    }

    return json({ ok: false, error: "not found" }, 404);
  }
};
