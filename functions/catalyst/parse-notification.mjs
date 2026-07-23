/**
 * Pure translation from a Zoho CRM notification HTTP body into the shape the
 * Titan engine expects. Lives on the Catalyst side of the boundary but has zero
 * Catalyst dependency, so it is fully unit-testable now, before the platform
 * exists.
 *
 * Zoho's callback body (docs, v8):
 *   { server_time, query_params, module, resource_uri, ids[],
 *     affected_fields[], operation, channel_id, token }
 *
 * Two normalisations matter:
 *  - The subscription is created with operations create/edit/delete, but the
 *    delivered payload reports insert/update/delete. We map back so idempotency
 *    keys computed at subscribe-time and deliver-time agree.
 *  - channel_id and token are coerced to strings (Zoho sends channel_id as a
 *    number in some payloads, a string in others).
 */

const OPERATION_MAP = { insert: "create", update: "edit", delete: "delete", create: "create", edit: "edit" };

/**
 * @param {object} body  parsed JSON POST body from Zoho
 * @returns {{ok:true, notification:object} | {ok:false, reason:string}}
 */
export function parseZohoNotification(body) {
  if (!body || typeof body !== "object") return { ok: false, reason: "empty_body" };

  const { module, ids, operation, channel_id, token, server_time } = body;
  if (channel_id == null) return { ok: false, reason: "missing_channel_id" };
  if (!module) return { ok: false, reason: "missing_module" };
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, reason: "missing_ids" };

  const normalizedOp = OPERATION_MAP[String(operation ?? "").toLowerCase()];
  if (!normalizedOp) return { ok: false, reason: `unknown_operation:${operation}` };

  return {
    ok: true,
    notification: {
      module: String(module),
      ids: ids.map(String),
      operation: normalizedOp,
      channel_id: String(channel_id),
      token: token == null ? "" : String(token),
      server_time: server_time ?? null,
    },
  };
}
