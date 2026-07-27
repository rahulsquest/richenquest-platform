/**
 * Webhook authentication token for CRM change-notifications.
 *
 * ── Security finding (self-review, 2026-07-24) ─────────────────────────────
 * The first implementation derived the token as `rq-${subscription.name}`.
 * Subscription names live in config/automation-events.json, which is not
 * secret, so the token was PREDICTABLE: anyone who knew (or guessed) a channel
 * name could forge a notification that passed the token check. The ID-only
 * payload plus CRM re-hydration still prevented data injection (R7), but the
 * token's defence-in-depth value was zero.
 *
 * Fix: the token is now HMAC-SHA256(secret, channel_id), where the secret
 * (TITAN_WEBHOOK_SECRET) never leaves the server. It is unpredictable without
 * the secret, yet stateless — the engine recomputes it per request instead of
 * storing a per-channel secret — and fits Zoho's 50-character token limit.
 */

import { createHmac } from "node:crypto";

const ZOHO_TOKEN_MAX = 50;

/**
 * @param {string|number} channelId
 * @param {string} secret  TITAN_WEBHOOK_SECRET (>= 32 bytes recommended)
 */
export function channelToken(channelId, secret) {
  if (!secret) throw new Error("TITAN_WEBHOOK_SECRET is required to compute a channel token.");
  return createHmac("sha256", secret).update(String(channelId)).digest("hex").slice(0, ZOHO_TOKEN_MAX);
}
