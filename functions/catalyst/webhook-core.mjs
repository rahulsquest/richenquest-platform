/**
 * Webhook logic, framework-agnostic and fully testable without Express or the
 * Catalyst SDK. The CJS handler shell (handler.js) is a thin adapter that wires
 * the platform request/response and Data Store into this core.
 *
 * The one correctness property this encodes and tests: **acknowledge first,
 * process asynchronously.** Zoho's retry behaviour is undocumented (ADR-006),
 * so the webhook must return 200 immediately; correctness comes from
 * reconciliation, not from holding the HTTP connection open. A malformed body
 * is acked with 202 (accepted, ignored) so Zoho never retries junk at us.
 */

export function createWebhookCore({ parse, buildRuntime, makeStore, automationUserId, webhookSecret }) {
  /**
   * @param {object} args
   * @param {object} args.body     parsed JSON POST body
   * @param {*}      args.initArg  platform handle for the Data Store (req/context)
   * @param {(status:number, json:object)=>void} args.respond
   * @returns {Promise<{acked:number, dispatched:boolean}>}
   */
  return async function handle({ body, initArg, respond }) {
    const parsed = parse(body);
    if (!parsed.ok) {
      respond(202, { ignored: parsed.reason }); // ack, never retried
      return { acked: 202, dispatched: false };
    }

    // Ack BEFORE any processing — the response must not wait on the engine.
    respond(200, { received: true });

    try {
      const store = makeStore(initArg);
      const { engine } = await buildRuntime({ store, automationUserId, webhookSecret });
      await engine.handle(parsed.notification, { source: "event" });
      return { acked: 200, dispatched: true };
    } catch (err) {
      // Already acked; the engine logs, reconciliation backstops. Never throw
      // out of the handler — a thrown error here cannot un-send the 200.
      console.error(JSON.stringify({ level: "error", msg: "webhook dispatch failed", error: err.message }));
      return { acked: 200, dispatched: false };
    }
  };
}
