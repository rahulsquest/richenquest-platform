/**
 * Student session handling.
 *
 * WHERE THE TOKEN COMES FROM
 * The Career Record API deliberately holds no passwords and implements no
 * credential flow (functions/record/identity/auth.mjs, SCOPE). Tokens are minted
 * server-side by issueToken() and delivered to the student as a link carrying the
 * token in the URL **fragment**:
 *
 *     https://…/dashboard/#token=rq1.<payload>.<mac>
 *
 * The fragment is chosen over a query string on purpose: it is never sent to a
 * server, never lands in an access log, and is not included in a Referer header.
 * It is consumed and erased from the address bar on first paint.
 *
 * WHAT THIS MODULE DOES NOT DO
 * It does not verify the token. Only the API can — the signing key lives there.
 * Claims are decoded here purely to render the session and to avoid firing
 * requests that are already certain to fail. Every authorisation decision that
 * matters is the server's, and a forged token gets a 401 no matter what this
 * file believes about it.
 *
 * STORAGE
 * sessionStorage, never localStorage: the token dies with the tab, which matches
 * a 15-minute credential to a shared or borrowed device. It is held in memory
 * too, so a storage-disabled browser still works for the life of the page.
 */

const STORAGE_KEY = "rq.session.v1";
const TOKEN_PREFIX = "rq1.";

/** Roles that may hold a dashboard session. Anything else is refused locally. */
export const DASHBOARD_ROLES = Object.freeze(["subject", "guardian"]);

let memoryToken = null;

/* ------------------------------------------------------------ pure logic --- */

/** Structural check only. Says nothing about authenticity. */
export function looksLikeToken(token) {
  return typeof token === "string" && token.startsWith(TOKEN_PREFIX) && token.split(".").length === 3;
}

/**
 * Decode the claims a token asserts. UNVERIFIED — see the module note.
 * Returns null on anything malformed rather than throwing, because a malformed
 * token is an ordinary "please sign in again", not an exception.
 */
export function decodeClaims(token) {
  if (!looksLikeToken(token)) return null;
  const payload = token.split(".")[1];
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = typeof atob === "function"
      ? decodeURIComponent(
          atob(padded)
            .split("")
            .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
            .join("")
        )
      : Buffer.from(padded, "base64").toString("utf8");
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

/** Milliseconds until expiry; 0 once expired. `exp` is in seconds (auth.mjs). */
export function expiresInMs(claims, now = Date.now()) {
  if (!claims || typeof claims.exp !== "number") return 0;
  return Math.max(0, claims.exp * 1000 - now);
}

export function isExpired(claims, now = Date.now()) {
  return expiresInMs(claims, now) <= 0;
}

/**
 * Is this token usable for a student dashboard session?
 * A subject token must name the record it is bound to — a token without
 * subject_id cannot be checked against anything, so it is refused here as well
 * as on the server.
 */
export function sessionProblem(claims, now = Date.now()) {
  if (!claims) return "malformed";
  if (isExpired(claims, now)) return "expired";
  if (!DASHBOARD_ROLES.includes(claims.role)) return "wrong_role";
  if (!claims.subject_id) return "unbound";
  return null;
}

/**
 * Extract a token from a URL fragment. Accepts `#token=…` and `#/route?token=…`
 * so a link can carry both a destination and a credential.
 */
export function tokenFromFragment(hash) {
  if (typeof hash !== "string" || hash.length < 2) return null;
  const raw = hash.replace(/^#/, "");
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw;
  for (const part of query.split("&")) {
    const [key, value] = part.split("=");
    if (key === "token" && value) {
      const token = decodeURIComponent(value);
      if (looksLikeToken(token)) return token;
    }
  }
  return null;
}

/** The fragment with any token stripped, preserving a route if one was given. */
export function fragmentWithoutToken(hash) {
  if (typeof hash !== "string") return "";
  const raw = hash.replace(/^#/, "");
  const [route, query = ""] = raw.includes("?") ? [raw.slice(0, raw.indexOf("?")), raw.slice(raw.indexOf("?") + 1)] : [raw, ""];
  if (route.startsWith("/")) return `#${route}`;
  // A bare `#token=…` fragment carries no route at all.
  const kept = query
    .split("&")
    .filter((p) => p && !p.startsWith("token="))
    .join("&");
  return kept ? `#${kept}` : "";
}

/* ------------------------------------------------------------- stateful --- */

function storage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    // Storage can throw outright in a partitioned or locked-down context.
    return null;
  }
}

export function storeToken(token) {
  memoryToken = token;
  try {
    storage()?.setItem(STORAGE_KEY, token);
  } catch {
    /* memory-only session; still fully usable for this page */
  }
}

export function readToken() {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export function clearToken() {
  memoryToken = null;
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing more we can do; the in-memory copy is already gone */
  }
}

/**
 * Adopt a token from the address bar, then erase it from history.
 * replaceState rather than pushState so the credential cannot be reached with
 * the back button.
 */
export function captureFromLocation(win = globalThis) {
  const token = tokenFromFragment(win.location?.hash ?? "");
  if (!token) return null;
  storeToken(token);
  const cleaned = fragmentWithoutToken(win.location.hash);
  try {
    win.history.replaceState(null, "", `${win.location.pathname}${win.location.search}${cleaned}`);
  } catch {
    /* history is unavailable; the token is stored either way */
  }
  return token;
}

/** The current session, or a reason there is none. */
export function currentSession(now = Date.now()) {
  const token = readToken();
  if (!token) return { ok: false, reason: "absent", token: null, claims: null };
  const claims = decodeClaims(token);
  const problem = sessionProblem(claims, now);
  if (problem) {
    if (problem === "expired" || problem === "malformed") clearToken();
    return { ok: false, reason: problem, token, claims };
  }
  return { ok: true, reason: null, token, claims, subjectId: claims.subject_id, role: claims.role };
}

/** Human-readable explanation for a sign-in gate. */
export function reasonText(reason) {
  return {
    absent: "Your record is private. Open the secure link we sent you to view it.",
    expired: "Your session has ended. Sessions are deliberately short — open a new link to continue.",
    malformed: "That sign-in link could not be read. Ask us for a fresh one.",
    wrong_role: "That link is not a student link, so it cannot open a student dashboard.",
    unbound: "That link is not tied to a record, so there is nothing it can safely open.",
    revoked: "You have been signed out. Open a new link to continue.",
  }[reason] ?? "Open the secure link we sent you to view your record.";
}
