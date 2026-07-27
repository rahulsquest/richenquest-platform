/**
 * Catalyst Advanced I/O entry — lead-intake. DEPLOY SHELL (thin).
 *
 * All logic is in the tested core (lib/catalyst/lead-intake-core.mjs); this file
 * only bridges Catalyst's platform surface into it. The CJS→ESM bridge uses
 * dynamic import(), the compatible path for loading ESM from a CommonJS
 * Catalyst function.
 *
 * Copied to a bundle root by build.mjs, so its imports are LOCAL (./lib/…),
 * never escaping the function directory (Catalyst bundles per-function).
 *
 * THE BODY IS READ AS TEXT, NOT JSON
 * The core enforces the size limit itself and needs the bytes as received to do
 * it, so express.text() hands over the raw string and the core parses. Express's
 * own limit is set slightly higher as a second floor: whichever fires first, an
 * oversized request is refused before any of it is interpreted.
 *
 * ASSEMBLED ONCE, REUSED WHILE WARM
 * The core holds the rate-limit and duplicate-window state, so it is built once
 * at module scope rather than per request — a fresh core on every invocation
 * would forget both and enforce neither. That state is per container by design;
 * see the note in the core.
 */

const express = require("express");

const app = express();
// Text, not JSON — see above. The core owns parsing and the real limit.
app.use(express.text({ type: "*/*", limit: "16kb" }));

let corePromise = null;

/** Build the core once. A rejected promise is cleared so the next call retries. */
function getCore() {
  if (!corePromise) {
    corePromise = (async () => {
      const { createLeadIntakeCore } = await import("./lib/catalyst/lead-intake-core.mjs");
      const { createOrUpdateLead } = await import("./lib/zoho/services/crm.mjs");
      return createLeadIntakeCore({ createOrUpdateLead });
    })().catch((err) => {
      corePromise = null;
      throw err;
    });
  }
  return corePromise;
}

/**
 * The client address, for rate limiting. Catalyst sits behind a proxy, so the
 * first hop in x-forwarded-for is the caller; req.ip would be the proxy and
 * would rate-limit every visitor as one client.
 */
function clientKeyOf(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || "unknown";
}

app.use(async (req, res) => {
  try {
    const handle = await getCore();
    await handle({
      method: req.method,
      origin: req.headers.origin || "",
      rawBody: typeof req.body === "string" ? req.body : "",
      clientKey: clientKeyOf(req),
      respond: (status, body, headers) => {
        if (res.headersSent) return;
        for (const [k, v] of Object.entries(headers || {})) res.setHeader(k, v);
        if (body === null) return res.status(status).end();
        res.status(status).json(body);
      },
    });
  } catch (err) {
    // Never leak the underlying message: it can name hosts and configuration.
    // express.text() rejects an oversized body before the core sees it, so that
    // case is reported as 413 rather than as a generic failure.
    const tooLarge = err && (err.type === "entity.too.large" || err.status === 413);
    console.error(JSON.stringify({
      level: "error", msg: "lead.handler_failed", error: err && err.message,
    }));
    if (!res.headersSent) {
      res.status(tooLarge ? 413 : 500)
        .json({ error: tooLarge ? "payload_too_large" : "internal_error" });
    }
  }
});

module.exports = app;
