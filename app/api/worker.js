/**
 * RichenQuest SaaS API gateway  (Cloudflare Worker)
 *
 * WHY THIS EXISTS
 *   The intelligence layer is ~50 Deluge functions inside Zoho CRM. They are the
 *   source of truth and they are NOT reimplemented here — this worker only
 *   authenticates a student, decides WHICH record they may read, and forwards to
 *   the engine that already knows the answer.
 *
 *   No scoring, no ranking, no eligibility logic lives in this file or in the
 *   browser. If a number appears in the UI, an engine produced it.
 *
 * THE ONE SECURITY PROPERTY THAT MATTERS
 *   The student never tells us who they are. The session cookie carries a
 *   server-signed lead_id, and every engine call uses THAT id — never an id from
 *   the request. A student cannot read another student's file by changing a
 *   parameter, because there is no parameter to change.
 *
 * DEPLOY
 *   wrangler secret put ZOHO_CLIENT_ID
 *   wrangler secret put ZOHO_CLIENT_SECRET
 *   wrangler secret put ZOHO_REFRESH_TOKEN
 *   wrangler secret put SESSION_SECRET      # 32+ random bytes, HMAC key
 *   wrangler deploy
 *
 * STATUS 2026-08-25: NOT DEPLOYED. No Zoho OAuth credential exists yet, so the
 *   app has no live backend. Every route below is written against payload shapes
 *   captured from real engine runs (docs/API-CONTRACT.md), not invented.
 */

const ACCOUNTS = "https://accounts.zoho.in";
const API      = "https://www.zohoapis.in";
const ORIGIN   = "https://app.richenquest.com";   // fail closed; never "*"
const SESSION_TTL = 60 * 60 * 12;                 // 12h
const OTP_TTL     = 60 * 10;                      // 10 min

const cors = o => ({
  "Access-Control-Allow-Origin": o === ORIGIN ? o : ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true",
  "Vary": "Origin"
});
const json = (o, s = 200, extra = {}) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { ...cors(ORIGIN), "Content-Type": "application/json",
               "Cache-Control": "no-store", ...extra }
  });

/* ── session tokens ───────────────────────────────────────────────────────
   HMAC-signed, not encrypted — the payload is not secret, but it must be
   unforgeable. localStorage is deliberately not involved: a value the browser
   can edit is a claim, not an identity. */
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b)))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64u = s => Uint8Array.from(
  atob(s.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sign(payload, secret) {
  const body = b64u(new TextEncoder().encode(JSON.stringify(payload)));
  const sig  = b64u(await crypto.subtle.sign("HMAC", await hmacKey(secret),
                    new TextEncoder().encode(body)));
  return `${body}.${sig}`;
}
async function verify(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret),
               unb64u(sig), new TextEncoder().encode(body)).catch(() => false);
  if (!ok) return null;
  let p; try { p = JSON.parse(new TextDecoder().decode(unb64u(body))); }
  catch { return null; }
  return (p.exp && p.exp > Math.floor(Date.now() / 1000)) ? p : null;
}
const readCookie = (req, name) => {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
};

/* ── Zoho ─────────────────────────────────────────────────────────────── */
let tokenCache = { value: null, expires: 0 };
async function accessToken(env) {
  if (tokenCache.value && Date.now() < tokenCache.expires - 60_000) return tokenCache.value;
  const r = await fetch(`${ACCOUNTS}/oauth/v2/token`, {
    method: "POST",
    body: new URLSearchParams({
      refresh_token: env.ZOHO_REFRESH_TOKEN, client_id: env.ZOHO_CLIENT_ID,
      client_secret: env.ZOHO_CLIENT_SECRET, grant_type: "refresh_token" })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token refresh failed");
  tokenCache = { value: j.access_token, expires: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

/* Calls one Deluge engine. The engine's own JSON is returned untouched — this
 * gateway never reshapes a payload, because a reshape is where a second,
 * divergent version of the truth starts. */
async function engine(env, name, args) {
  const token = await accessToken(env);
  const qs = new URLSearchParams({ auth_type: "oauth", ...args });
  const r = await fetch(`${API}/crm/v7/functions/${name}/actions/execute?${qs}`,
    { method: "POST", headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const j = await r.json();
  let out = j?.details?.output;
  if (typeof out === "string") { try { out = JSON.parse(out); } catch {} }
  if (!out) throw new Error(`engine ${name} returned nothing`);
  return out;
}

/* Audit trail for anything that reads or changes a student's file. Sensitive
 * actions that leave no trace are indistinguishable from ones that never
 * happened. Failure to log must never fail the request the student made. */
async function audit(env, leadId, action, detail) {
  try {
    await engine(env, "generateauditlog", {
      module_name: "Leads", record_id: String(leadId),
      action, detail: String(detail).slice(0, 400) });
  } catch (e) { console.error("audit failed", action, e.message); }
}

/* ── routes ───────────────────────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS")
      return new Response(null, { headers: cors(request.headers.get("Origin")) });

    try {
      /* ── auth: request a one-time code ──────────────────────────────
         Always answers identically whether or not the email is known. A
         different response for an unknown address turns this endpoint into a
         way to ask "is this person a RichenQuest student?" */
      if (p === "/auth/request-code" && request.method === "POST") {
        const { email } = await request.json().catch(() => ({}));
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
          return json({ ok: false, error: "a valid email is required" }, 400);

        const found = await engine(env, "resolvestudent",
          { full_name: "", email, phone: "" }).catch(() => null);

        if (found?.lead_id) {
          const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, "0");
          const codeToken = await sign(
            { e: email, c: code, exp: Math.floor(Date.now()/1000) + OTP_TTL },
            env.SESSION_SECRET);
          await engine(env, "sendplatformalert", {
            subject: `RichenQuest sign-in code: ${code}`,
            body: `Your RichenQuest sign-in code is ${code}. It expires in 10 minutes.
If you did not ask to sign in, ignore this message — nothing has changed on your file.`
          }).catch(e => console.error("code send failed", e.message));
          return json({ ok: true, sent: true }, 200, {
            "Set-Cookie": `rq_chal=${codeToken}; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=${OTP_TTL}`
          });
        }
        return json({ ok: true, sent: true });   // identical shape, deliberately
      }

      /* ── auth: exchange the code for a session ────────────────────── */
      if (p === "/auth/verify" && request.method === "POST") {
        const { email, code } = await request.json().catch(() => ({}));
        const chal = await verify(readCookie(request, "rq_chal"), env.SESSION_SECRET);
        if (!chal || chal.e !== email || chal.c !== String(code || ""))
          return json({ ok: false, error: "that code is not valid or has expired" }, 401);

        const found = await engine(env, "resolvestudent", { full_name: "", email, phone: "" });
        if (!found?.lead_id) return json({ ok: false, error: "no file found" }, 401);

        const session = await sign({
          lead_id: String(found.lead_id), module: found.module || "Leads",
          role: "student", exp: Math.floor(Date.now()/1000) + SESSION_TTL
        }, env.SESSION_SECRET);
        await audit(env, found.lead_id, "PORTAL_LOGIN", `student signed in as ${email}`);
        return json({ ok: true }, 200, {
          "Set-Cookie": `rq_sess=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}`
        });
      }

      if (p === "/auth/logout" && request.method === "POST")
        return json({ ok: true }, 200, {
          "Set-Cookie": "rq_sess=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" });

      /* ── everything past here needs a valid session ────────────────── */
      const sess = await verify(readCookie(request, "rq_sess"), env.SESSION_SECRET);
      if (!sess) return json({ ok: false, error: "not signed in" }, 401);

      /* The identity used for every engine call. Note it comes from the signed
       * session, never from the URL or body — there is no id parameter to
       * tamper with anywhere in this file. */
      const who = { record_id: sess.lead_id, module: sess.module };
      const asMatch = { lead_or_contact_id: sess.lead_id, module: sess.module };

      const READ = {
        "/home":          () => engine(env, "studentdashboard",    who),
        "/profile":       () => engine(env, "studentintelligence", who),
        "/opportunities": () => engine(env, "matchopportunities",  asMatch),
        "/roadmap":       () => engine(env, "studentroadmap",      who),
        "/report":        () => engine(env, "studentreport",       who),
        "/mentor":        () => engine(env, "matchmentor",         who)
      };
      if (READ[p] && request.method === "GET") return json(await READ[p]());

      /* ── profile edit ───────────────────────────────────────────────
         An allowlist, not a passthrough. Anything not named here cannot be
         written from the browser at all — scores, verification state and
         counsellor fields are engine-owned and must never be student-writable. */
      if (p === "/profile" && request.method === "POST") {
        const EDITABLE = new Set([
          "First_Name","Last_Name","Phone","City","Current_Education",
          "Academic_Percentage","Backlogs","Study_Gap_Years","Work_Experience_Years",
          "English_Status","Passport_Status","Budget_Range","Interested_Level",
          "Interested_Country","Intended_Intake","Career_Goal","Preferred_Domain",
          "Skills","Interests","Project_Count","Projects_Detail","Achievement_Level",
          "Achievements_Detail","Extracurriculars","Languages_Spoken",
          "Funding_Source","Accommodation_Preference"
        ]);
        const body = await request.json().catch(() => ({}));
        const clean = {}; const rejected = [];
        for (const [k, v] of Object.entries(body))
          (EDITABLE.has(k) ? clean[k] = v : rejected.push(k));
        if (!Object.keys(clean).length)
          return json({ ok: false, error: "nothing editable was submitted", rejected }, 400);

        const token = await accessToken(env);
        const r = await fetch(`${API}/crm/v8/Leads/${sess.lead_id}`, {
          method: "PATCH",
          headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ data: [clean] })
        });
        const j = await r.json();
        const ok = j?.data?.[0]?.code === "SUCCESS";
        await audit(env, sess.lead_id, "PROFILE_EDIT", `fields: ${Object.keys(clean).join(",")}`);
        return json({ ok, updated: Object.keys(clean), rejected, detail: ok ? undefined : j },
                    ok ? 200 : 502);
      }

      /* ── request a counsellor review / mentor ──────────────────────── */
      if (p === "/request" && request.method === "POST") {
        const { kind, note } = await request.json().catch(() => ({}));
        const KINDS = { counsellor_review: "Counsellor review requested",
                        mentor: "Mentor requested" };
        if (!KINDS[kind]) return json({ ok: false, error: "unknown request type" }, 400);
        const out = await engine(env, "createfollowuptasks", {
          module_name: "Leads", record_id: sess.lead_id,
          spec_json: JSON.stringify([{ subject: KINDS[kind], due_in_days: 2,
                                       priority: "High", note: String(note || "").slice(0, 500) }])
        });
        await audit(env, sess.lead_id, "STUDENT_REQUEST", kind);
        return json({ ok: true, kind, result: out });
      }

      return json({ ok: false, error: "not found" }, 404);

    } catch (e) {
      /* A student must never see a stack trace, and the log must never be the
       * only place the failure is visible to us. */
      console.error("gateway error", p, e.message);
      return json({ ok: false, error: "we could not complete that right now" }, 502);
    }
  }
};
