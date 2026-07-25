/**
 * Career Record API — HTTP transport.
 *
 * Two adapters over the same router:
 *   · createServer()    node:http, used in production-shaped runs and in the
 *                       integration tests (a real socket, real headers, real
 *                       body parsing — not a handler called directly);
 *   · catalystHandler() Express-shaped (req, res) for Catalyst Advanced I/O.
 *
 * The transport does transport only: match a route, parse a body, write a
 * response. It contains no authorisation, no validation and no business logic,
 * because anything it decided would be a decision outside the pipeline.
 */

import { createServer as httpCreateServer } from "node:http";
import { securityHeaders, corsHeaders } from "../../platform/security.mjs";

/** Bodies are capped before parsing: an unbounded read is a denial-of-service. */
const MAX_BODY_BYTES = 256 * 1024;

export class Router {
  constructor(routes) {
    this.routes = routes.map((r) => ({ ...r, matcher: compile(r.template) }));
  }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const params = route.matcher(pathname);
      if (params) return { route, params };
    }
    // Distinguish "wrong method on a real path" from "no such path", so a client
    // gets 405 rather than a misleading 404.
    const pathExists = this.routes.some((r) => r.matcher(pathname));
    return pathExists ? { methodNotAllowed: true } : null;
  }

  allowedFor(pathname) {
    return this.routes.filter((r) => r.matcher(pathname)).map((r) => r.method);
  }
}

/** `/v1/x/:id/y` → matcher returning params or null. Static segments must match exactly. */
function compile(template) {
  const parts = template.split("/").filter(Boolean);
  return (pathname) => {
    const got = pathname.split("/").filter(Boolean);
    if (got.length !== parts.length) return null;
    const params = {};
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) {
        const value = decodeURIComponent(got[i]);
        // A path parameter may never contain a separator after decoding — that is
        // how %2F traversal turns one route into another.
        if (value.includes("/") || value.includes("\\") || value.length === 0) return null;
        params[parts[i].slice(1)] = value;
      } else if (parts[i] !== got[i]) {
        return null;
      }
    }
    return params;
  };
}

/* ------------------------------------------------------------ body read --- */

export async function readBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error(`request body exceeds ${maxBytes} bytes`);
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (size === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    const parsed = JSON.parse(raw);
    // A JSON body must be an object: an array or scalar at the top level would
    // bypass the field-level schemas entirely.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      const err = new Error("request body must be a JSON object");
      err.statusCode = 400;
      throw err;
    }
    return parsed;
  } catch (err) {
    if (err.statusCode) throw err;
    const bad = new Error("request body is not valid JSON");
    bad.statusCode = 400;
    throw bad;
  }
}

/* --------------------------------------------------------------- serve --- */

function jsonError(res, status, code, message, headers = {}) {
  const body = JSON.stringify({ error: { code, message, retryable: status >= 500 || status === 429 } });
  res.writeHead(status, { ...securityHeaders({ isApi: true }), ...headers, "content-length": Buffer.byteLength(body) });
  res.end(body);
}

/**
 * @param {Router} router
 * @param {object} deps  passed through to every endpoint handler
 */
export function createServer(router, deps = {}) {
  return httpCreateServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    } catch {
      return jsonError(res, 400, "BAD_REQUEST", "The request was not valid.");
    }

    const cors = corsHeaders(req.headers.origin, deps.cors ?? {});

    // Preflight is answered by the transport: there is no principal to authorise
    // yet, and CORS is a browser contract rather than an application decision.
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...securityHeaders({ isApi: true }), ...cors, "content-length": "0" });
      return res.end();
    }

    const matched = router.match(req.method, url.pathname);
    if (!matched) return jsonError(res, 404, "NOT_FOUND", "Not found.", cors);
    if (matched.methodNotAllowed) {
      return jsonError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.", {
        ...cors,
        allow: router.allowedFor(url.pathname).join(", "),
      });
    }

    let body = {};
    if (req.method !== "GET" && req.method !== "HEAD") {
      const type = String(req.headers["content-type"] ?? "");
      if (type && !type.includes("application/json")) {
        return jsonError(res, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.", cors);
      }
      try {
        body = await readBody(req);
      } catch (err) {
        return jsonError(
          res,
          err.statusCode ?? 400,
          err.statusCode === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
          err.statusCode === 413 ? "The request body is too large." : "The request was not valid.",
          cors
        );
      }
    }

    const request = {
      headers: req.headers,
      params: matched.params,
      query: Object.fromEntries(url.searchParams),
      body,
      ip: req.socket?.remoteAddress ?? null,
      method: req.method,
      path: url.pathname,
    };

    try {
      const result = await matched.route.handler(request, deps);
      const payload = serialise(result.body);
      res.writeHead(result.status, { ...result.headers, "content-length": Buffer.byteLength(payload) });
      res.end(payload);
    } catch (err) {
      // The pipeline maps its own errors. Reaching here means the pipeline itself
      // failed, so nothing about it is trusted for the response.
      deps.logger?.error("transport.unhandled", { error: String(err?.message ?? err) });
      jsonError(res, 500, "INTERNAL", "Something went wrong on our side.", cors);
    }
  });
}

/** Export archives contain file bodies; everything else is a plain view model. */
function serialise(body) {
  return JSON.stringify(body ?? {});
}

/* ------------------------------------------------- Catalyst Advanced I/O --- */

/**
 * Express-shaped adapter for Catalyst Advanced I/O.
 *
 * NOT integration-tested: no Catalyst deployment is reachable from this
 * environment. The node:http path above is, and both call the identical router
 * and pipeline, so the untested surface is only this mapping. Recorded as debt.
 */
export function catalystHandler(router, deps = {}) {
  return async function handler(req, res) {
    const pathname = (req.path ?? req.url ?? "/").split("?")[0];
    const cors = corsHeaders(req.headers?.origin, deps.cors ?? {});

    if (req.method === "OPTIONS") {
      return res.status(204).set({ ...securityHeaders({ isApi: true }), ...cors }).end();
    }

    const matched = router.match(req.method, pathname);
    if (!matched || matched.methodNotAllowed) {
      const status = matched?.methodNotAllowed ? 405 : 404;
      return res
        .status(status)
        .set({ ...securityHeaders({ isApi: true }), ...cors })
        .json({ error: { code: status === 405 ? "METHOD_NOT_ALLOWED" : "NOT_FOUND", message: "Not found.", retryable: false } });
    }

    const result = await matched.route.handler(
      {
        headers: req.headers ?? {},
        params: matched.params,
        // Catalyst/Express parses the body before we see it.
        query: req.query ?? {},
        body: req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {},
        ip: req.ip ?? null,
        method: req.method,
        path: pathname,
      },
      deps
    );

    return res.status(result.status).set(result.headers).json(result.body);
  };
}
