/**
 * Operator session handling.
 *
 * Same mechanism as the student dashboard — a signed token from
 * identity/auth.mjs, delivered in the URL fragment and erased on first paint —
 * but a different guest list. The dashboard admits `subject` and `guardian`; this
 * admits staff. Sharing the mechanism keeps one login working across both
 * services; sharing the guest list would let a student's link open the console.
 *
 * The server is the authority regardless: functions/ops/permissions.mjs refuses a
 * non-operator role, so a forged or mis-issued token gets a 403 no matter what
 * this file believes about it. The checks here exist to avoid firing requests that
 * are certain to fail, and to explain the refusal in words.
 */

const STORAGE_KEY = "rq.ops.session.v1";
const TOKEN_PREFIX = "rq1.";

/** Career Record roles that may hold an operations session. */
export const OPERATOR_ROLES = Object.freeze(["administrator", "counsellor", "auditor"]);

let memoryToken = null;

export function looksLikeToken(token) {
  return typeof token === "string" && token.startsWith(TOKEN_PREFIX) && token.split(".").length === 3;
}

/** Decode claims. UNVERIFIED — only the server holds the signing key. */
export function decodeClaims(token) {
  if (!looksLikeToken(token)) return null;
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = typeof atob === "function"
      ? decodeURIComponent(
          atob(padded).split("").map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
        )
      : Buffer.from(padded, "base64").toString("utf8");
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

export function expiresInMs(claims, now = Date.now()) {
  if (!claims || typeof claims.exp !== "number") return 0;
  return Math.max(0, claims.exp * 1000 - now);
}

export const isExpired = (claims, now = Date.now()) => expiresInMs(claims, now) <= 0;

/** Why this token cannot open the console, or null if it can. */
export function sessionProblem(claims, now = Date.now()) {
  if (!claims) return "malformed";
  if (isExpired(claims, now)) return "expired";
  if (!OPERATOR_ROLES.includes(claims.role)) return "not_an_operator";
  return null;
}

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

export function fragmentWithoutToken(hash) {
  if (typeof hash !== "string") return "";
  const raw = hash.replace(/^#/, "");
  const [route, query = ""] = raw.includes("?")
    ? [raw.slice(0, raw.indexOf("?")), raw.slice(raw.indexOf("?") + 1)]
    : [raw, ""];
  if (route.startsWith("/")) return `#${route}`;
  const kept = query.split("&").filter((p) => p && !p.startsWith("token=")).join("&");
  return kept ? `#${kept}` : "";
}

function storage() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function storeToken(token) {
  memoryToken = token;
  try {
    storage()?.setItem(STORAGE_KEY, token);
  } catch {
    /* memory-only session; still usable for this page */
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
    /* the in-memory copy is already gone */
  }
}

/** Adopt a token from the address bar, then erase it from history. */
export function captureFromLocation(win = globalThis) {
  const token = tokenFromFragment(win.location?.hash ?? "");
  if (!token) return null;
  storeToken(token);
  const cleaned = fragmentWithoutToken(win.location.hash);
  try {
    win.history.replaceState(null, "", `${win.location.pathname}${win.location.search}${cleaned}`);
  } catch {
    /* history unavailable; the token is stored either way */
  }
  return token;
}

export function currentSession(now = Date.now()) {
  const token = readToken();
  if (!token) return { ok: false, reason: "absent", token: null, claims: null };
  const claims = decodeClaims(token);
  const problem = sessionProblem(claims, now);
  if (problem) {
    if (problem === "expired" || problem === "malformed") clearToken();
    return { ok: false, reason: problem, token, claims };
  }
  return { ok: true, reason: null, token, claims, operatorId: claims.sub, role: claims.ops_role ?? claims.role };
}

export function reasonText(reason) {
  return {
    absent: "Sign in with the operator link to open the console.",
    expired: "Your session has ended. Sessions are deliberately short — open a new link to continue.",
    malformed: "That sign-in link could not be read. Generate a fresh one.",
    not_an_operator: "That link is not a staff link, so it cannot open the operations console.",
    revoked: "You have been signed out.",
  }[reason] ?? "Sign in with the operator link to open the console.";
}
