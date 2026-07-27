/**
 * Student Dashboard — entry point.
 *
 * Wiring only. Every decision worth reviewing lives in the module it belongs to.
 *
 * ORDER MATTERS
 *   1. is the API configured?      → otherwise say so; never invent a record
 *   2. adopt a token from the link → and erase it from the address bar at once
 *   3. is the session usable?      → otherwise gate, with the actual reason
 *   4. only then render anything
 *
 * The dashboard has no offline mode and no sample data. If the Record cannot be
 * reached, it says so. A student cannot tell invented history from real history,
 * which makes a plausible fake strictly worse than an honest failure.
 */

import { readSettings } from "./app/config.js";
import { createRecordApi } from "./app/api.js";
import {
  captureFromLocation, clearToken, currentSession, expiresInMs, reasonText,
} from "./app/session.js";
import { createRouter } from "./app/router.js";
import { app, show, replace, el } from "./app/dom.js";
import { formatDuration } from "./app/format.js";
import { buildNotifications, unreadCount } from "./app/derive.js";
import { renderTimeline } from "./app/views/timeline.js";
import { renderRecord } from "./app/views/record.js";
import { renderEvidence } from "./app/views/evidence.js";
import { renderNotifications } from "./app/views/notifications.js";
import { renderProfile } from "./app/views/profile.js";
import { renderSettings, applyMotionPref } from "./app/views/settings.js";

const LAST_SEEN_KEY = "rq.dash.seen";

/* --------------------------------------------------------------- gating --- */

const GATES = ["gate-unconfigured", "gate-signin", "gate-error"];

function showOnly(which) {
  for (const gate of GATES) show(app(gate), gate === which);
  show(app("shell"), which === null);
  show(app("nav"), which === null);
  show(app("session-box"), which === null);
  show(app("record-badge"), which === null);
}

function gateSignIn(reason, settings) {
  const message = app("signin-reason");
  if (message) message.textContent = reasonText(reason);
  const link = app("signin-link");
  if (link && settings?.signInUrl) link.href = settings.signInUrl;
  showOnly("gate-signin");
}

/* ---------------------------------------------------------------- boot ----- */

function boot() {
  const settings = readSettings();
  applyMotionPref();

  if (!settings.apiConfigured) {
    showOnly("gate-unconfigured");
    if (settings.apiRejected) {
      // A configured-but-invalid origin is a build mistake, not a pending
      // deployment. Say which it is rather than showing the same screen for both.
      console.error(
        "[dashboard] record_api.base_url is set but was rejected: it must be an https origin " +
          "(or http://localhost) with no path, query or fragment."
      );
    }
    return;
  }

  // Adopt before reading: a fresh link must win over whatever this tab held.
  captureFromLocation();

  const session = currentSession();
  if (!session.ok) {
    gateSignIn(session.reason, settings);
    return;
  }

  start(session, settings);
}

/* ----------------------------------------------------------------- app ---- */

function start(session, settings) {
  const { claims, subjectId } = session;

  const api = createRecordApi({
    baseUrl: settings.apiBaseUrl,
    timeoutMs: settings.timeoutMs,
    getToken: () => currentSession().token,
    onUnauthorized: () => {
      // The server is the authority. Whatever this tab believed about the token,
      // a 401 ends the session.
      clearToken();
      gateSignIn("expired", settings);
    },
  });

  /* per-load cache: one timeline fetch serves four views ------------------- */
  const cache = new Map();
  let verification = null;

  const ctx = {
    api,
    subjectId,
    session: claims,
    settings,

    cached(key, producer) {
      if (!cache.has(key)) {
        // The promise is cached, not the value, so concurrent views never
        // duplicate a request — and a rejection is not cached as a result.
        cache.set(key, Promise.resolve().then(producer).catch((err) => {
          cache.delete(key);
          throw err;
        }));
      }
      return cache.get(key);
    },
    invalidate() {
      cache.clear();
    },

    setVerification(result) {
      verification = result;
      refreshBadge();
    },
    getVerification: () => verification,

    getLastSeen() {
      try {
        return localStorage.getItem(LAST_SEEN_KEY);
      } catch {
        return null;
      }
    },
    setLastSeen(iso) {
      try {
        localStorage.setItem(LAST_SEEN_KEY, iso);
      } catch {
        /* the marker is a convenience; the dashboard works without it */
      }
    },

    toast,
    refreshBadge: () => refreshBadge(),
    signOut() {
      clearToken();
      cache.clear();
      gateSignIn("revoked", settings);
    },
  };

  /* chrome ---------------------------------------------------------------- */
  const idNode = app("subject-id");
  if (idNode) idNode.textContent = subjectId;

  app("sign-out")?.addEventListener("click", () => ctx.signOut());
  app("retry")?.addEventListener("click", () => {
    ctx.invalidate();
    showOnly(null);
    router.dispatch();
  });

  /* session countdown ------------------------------------------------------ */
  const expiryNode = app("expiry");
  const tick = () => {
    const live = currentSession();
    if (!live.ok) {
      clearInterval(timer);
      gateSignIn(live.reason === "absent" ? "expired" : live.reason, settings);
      return;
    }
    const remaining = expiresInMs(live.claims);
    if (expiryNode) {
      expiryNode.textContent = `Session ends in ${formatDuration(remaining)}`;
      expiryNode.classList.toggle("is-warning", remaining <= settings.warnBeforeExpiryMs);
    }
  };
  const timer = setInterval(tick, 1000);
  tick();

  /* updates badge ---------------------------------------------------------- */
  async function refreshBadge() {
    const badge = app("unread-count");
    if (!badge) return;
    try {
      const data = await ctx.cached("timeline", () => api.getTimeline(subjectId));
      const count = unreadCount(
        buildNotifications({
          entries: data.entries ?? [],
          verification,
          lastSeen: ctx.getLastSeen(),
          withheld: data.withheld ?? 0,
        })
      );
      badge.textContent = String(count);
      badge.hidden = count === 0;
    } catch {
      // A badge is not worth a visible error; the view itself will report it.
      badge.hidden = true;
    }
  }

  /* routing ---------------------------------------------------------------- */
  const views = {
    timeline: renderTimeline,
    record: renderRecord,
    evidence: renderEvidence,
    notifications: renderNotifications,
    profile: renderProfile,
    settings: renderSettings,
  };

  const containers = new Map(
    Object.keys(views).map((name) => [name, document.querySelector(`[data-app-view="${name}"]`)])
  );

  const routes = Object.fromEntries(
    Object.entries(views).map(([name, render]) => [
      name,
      async (params) => {
        for (const [other, node] of containers) show(node, other === name);
        for (const link of document.querySelectorAll("[data-app-route]")) {
          link.classList.toggle("is-current", link.dataset.appRoute === name);
          if (link.dataset.appRoute === name) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        }
        show(app("loading"), false);
        const container = containers.get(name);
        if (!container) return;
        await render(container, { ...ctx, params });
        if (params?.focus) focusEntry(container, params.focus);
      },
    ])
  );

  const router = createRouter({ routes, fallback: "timeline" });

  showOnly(null);
  router.start();
  refreshBadge();
}

/** Scroll a linked entry into view and mark it, for #/timeline?focus=<event_id>. */
function focusEntry(container, eventId) {
  const target = container.querySelector(`[data-event-id="${CSS.escape(eventId)}"]`);
  if (!target) return;
  target.classList.add("is-focused");
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

/* ---------------------------------------------------------------- toast ---- */

let toastTimer = null;
function toast(message, kind = "ok") {
  const node = app("toast");
  if (!node) return;
  replace(node, el("span", { text: message }));
  node.className = `app-toast app-toast--${kind}`;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 6000);
}

/* ----------------------------------------------------------------- run ----- */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
