/**
 * Hash router.
 *
 * Hash routing rather than the History API because the dashboard is served by a
 * static build (ADR-001/002): a real path like /dashboard/timeline would need a
 * server rewrite that does not exist, and would 404 on refresh. The hash also
 * keeps the route out of every server access log, which suits an authenticated
 * surface holding personal data.
 */

/** Parse "#/timeline?foo=1" into { name, params }. */
export function parseRoute(hash, fallback = "timeline") {
  const raw = String(hash ?? "").replace(/^#/, "");
  if (!raw || !raw.startsWith("/")) return { name: fallback, params: {} };

  const [path, query = ""] = raw.includes("?") ? [raw.slice(0, raw.indexOf("?")), raw.slice(raw.indexOf("?") + 1)] : [raw, ""];
  const name = path.replace(/^\/+/, "").split("/")[0] || fallback;

  const params = {};
  for (const part of query.split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    params[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  // A second path segment addresses one item: #/timeline/evt_123
  const rest = path.replace(/^\/+/, "").split("/").slice(1);
  if (rest.length) params.id = rest.join("/");

  return { name, params };
}

export function createRouter({ routes, fallback = "timeline", win = globalThis }) {
  const known = new Set(Object.keys(routes));
  let current = null;

  async function dispatch() {
    const parsed = parseRoute(win.location.hash, fallback);
    const name = known.has(parsed.name) ? parsed.name : fallback;
    current = name;
    await routes[name](parsed.params);
    return name;
  }

  return {
    start() {
      win.addEventListener("hashchange", () => {
        dispatch();
      });
      return dispatch();
    },
    dispatch,
    go(name, params = {}) {
      const query = new URLSearchParams(params).toString();
      win.location.hash = `#/${name}${query ? `?${query}` : ""}`;
    },
    get current() {
      return current;
    },
  };
}
