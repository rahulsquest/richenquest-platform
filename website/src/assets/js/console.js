/**
 * Founder Operations console — entry point.
 *
 * Wiring only. Order matters, and mirrors the student dashboard deliberately —
 * two surfaces that boot differently are two surfaces that fail differently:
 *
 *   1. is the operations API configured?  → otherwise say so; never invent data
 *   2. adopt a token from the link        → and erase it from the address bar
 *   3. is the session usable?             → otherwise gate, with the real reason
 *   4. ask the server what this operator may do  → render only that
 *   5. only then render anything
 *
 * Step 4 is what makes the console work unchanged for the whole team. The nav and
 * every action are built from the server's capability manifest, so a counsellor
 * signing in for the first time sees a correct console without a line changing —
 * and a hidden button is a courtesy, never a control, because every endpoint
 * enforces independently.
 */

import { readSettings } from "./app/config.js";
import { createOpsApi } from "./console/api.js";
import { captureFromLocation, clearToken, currentSession, expiresInMs, reasonText } from "./console/session.js";
import { createRouter } from "./app/router.js";
import { app, show, replace, el } from "./app/dom.js";
import { formatDuration } from "./app/format.js";
import { renderDashboard, renderLeads, renderTasks, renderAnalytics, renderStudents, renderCollaboration } from "./console/views.js";

const GATES = ["gate-unconfigured", "gate-signin"];

/** Nav entries, each gated on a capability the server reports. */
const SECTIONS = [
  { name: "today", label: "Today", capability: "dashboard:read", render: renderDashboard },
  { name: "leads", label: "Leads", capability: "leads:read", render: renderLeads },
  { name: "students", label: "Students", capability: "students:read", render: renderStudents },
  { name: "collaboration", label: "Collaboration", capability: "collaboration:read", render: renderCollaboration },
  { name: "tasks", label: "Tasks", capability: "tasks:read", render: renderTasks },
  { name: "analytics", label: "Analytics", capability: "analytics:read", render: renderAnalytics },
];

function showOnly(which) {
  for (const gate of GATES) show(app(gate), gate === which);
  show(app("shell"), which === null);
  show(app("nav"), which === null);
  show(app("session-box"), which === null);
  show(app("operator-badge"), which === null);
}

function gateSignIn(reason) {
  const message = app("signin-reason");
  if (message) message.textContent = reasonText(reason);
  showOnly("gate-signin");
}

async function boot() {
  const settings = readSettings();

  if (!settings.opsConfigured) {
    showOnly("gate-unconfigured");
    if (settings.opsRejected) {
      console.error(
        "[console] ops_api.base_url is set but was rejected: it must be an https origin " +
          "(or http://localhost) with no path, query or fragment."
      );
    }
    return;
  }

  captureFromLocation();
  const session = currentSession();
  if (!session.ok) return gateSignIn(session.reason);

  const api = createOpsApi({
    baseUrl: settings.opsBaseUrl,
    timeoutMs: settings.timeoutMs,
    getToken: () => currentSession().token,
    onUnauthorized: () => {
      clearToken();
      gateSignIn("expired");
    },
  });

  // The server decides what this operator may do. Asking first means the console
  // never renders a section the API would refuse.
  let manifest;
  try {
    manifest = await api.me();
  } catch (err) {
    if (err.status === 403) return gateSignIn("not_an_operator");
    const gate = app("signin-reason");
    if (gate) gate.textContent = err.userMessage ?? err.message;
    return showOnly("gate-signin");
  }

  start({ api, manifest, settings, claims: session.claims });
}

function start({ api, manifest, settings, claims }) {
  const ctx = { api, can: manifest.can, actor: manifest.actor, settings, toast };

  const badge = app("operator-name");
  if (badge) badge.textContent = `${manifest.actor.label}`;

  app("sign-out")?.addEventListener("click", () => {
    clearToken();
    gateSignIn("revoked");
  });

  /* session countdown ------------------------------------------------------ */
  const expiryNode = app("expiry");
  const tick = () => {
    const live = currentSession();
    if (!live.ok) {
      clearInterval(timer);
      gateSignIn(live.reason === "absent" ? "expired" : live.reason);
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

  /* navigation, built from what this operator may actually reach ----------- */
  const permitted = SECTIONS.filter((section) => manifest.can[section.capability]);
  const navList = app("nav-list");
  if (navList) {
    replace(
      navList,
      permitted.map((section) =>
        el("li", null, [
          el("a", { class: "ops-nav__link", href: `#/${section.name}`, dataset: { appRoute: section.name }, text: section.label }),
        ])
      )
    );
  }

  const shell = app("shell");
  const containers = new Map(
    permitted.map((section) => {
      const node = el("section", { class: "ops-view", dataset: { appView: section.name }, hidden: true });
      shell?.append(node);
      return [section.name, node];
    })
  );

  const routes = Object.fromEntries(
    permitted.map((section) => [
      section.name,
      async () => {
        for (const [other, node] of containers) show(node, other === section.name);
        for (const link of document.querySelectorAll("[data-app-route]")) {
          const current = link.dataset.appRoute === section.name;
          link.classList.toggle("is-current", current);
          if (current) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        }
        await section.render(containers.get(section.name), ctx);
      },
    ])
  );

  const fallback = permitted[0]?.name ?? "today";
  const router = createRouter({ routes, fallback });

  showOnly(null);
  router.start();

  void claims;
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
