#!/usr/bin/env node
/**
 * Event-subscription config validator (CI gate, zero-dependency) — ADR-006.
 *
 * The invariant that matters most: renewal_hours MUST be shorter than
 * expiry_hours. If a renewal job runs less often than channels expire, the
 * channels lapse and automation stops SILENTLY — no error, events just stop
 * arriving. That failure mode is invisible in production, so it is caught here.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handlerNames } from "../functions/titan/handlers/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (m) => errors.push(m);

const cfg = JSON.parse(readFileSync(path.join(ROOT, "config/automation-events.json"), "utf8"));

// ---- expiry / renewal safety ---------------------------------------------
const expiry = cfg.expiry_hours;
const renewal = cfg.renewal_hours;
if (typeof expiry !== "number" || expiry <= 0) fail(`expiry_hours must be a positive number (got ${expiry})`);
if (typeof renewal !== "number" || renewal <= 0) fail(`renewal_hours must be a positive number (got ${renewal})`);
if (typeof expiry === "number" && typeof renewal === "number") {
  if (renewal >= expiry) {
    fail(`renewal_hours (${renewal}) must be LESS than expiry_hours (${expiry}) — otherwise channels lapse before renewal and automation stops silently`);
  } else if (renewal > expiry / 2) {
    fail(`renewal_hours (${renewal}) should be at most half of expiry_hours (${expiry}) so a single missed run cannot lapse a channel`);
  }
}

// ---- subscriptions --------------------------------------------------------
const subs = cfg.subscriptions ?? [];
if (!subs.length) fail("subscriptions must not be empty");

const VALID_ACTIONS = new Set(["create", "edit", "delete"]);
const ids = new Set();
const names = new Set();

for (const s of subs) {
  const where = s.name ?? s.channel_id ?? "(unnamed)";
  if (!s.name) fail(`${where}: missing name`);
  if (!s.channel_id) fail(`${where}: missing channel_id`);
  if (!s.handler) fail(`${where}: missing handler — a subscription with no handler silently discards events`);

  if (s.channel_id != null) {
    const id = String(s.channel_id);
    if (ids.has(id)) fail(`duplicate channel_id "${id}" — Zoho keys channels by id, so a duplicate would overwrite the other subscription`);
    ids.add(id);
  }
  if (s.name) {
    if (names.has(s.name)) fail(`duplicate subscription name "${s.name}"`);
    names.add(s.name);
  }

  if (!Array.isArray(s.events) || s.events.length === 0) {
    fail(`${where}: events must be a non-empty array`);
    continue;
  }
  for (const e of s.events) {
    const parts = String(e).split(".");
    if (parts.length !== 2) { fail(`${where}: event "${e}" must be "Module.action"`); continue; }
    if (!VALID_ACTIONS.has(parts[1])) fail(`${where}: event "${e}" has invalid action "${parts[1]}" (expected ${[...VALID_ACTIONS].join("/")})`);
  }
}

// ---- handlers must actually exist ----------------------------------------
// A subscription naming a handler that is not registered would silently
// discard every event it receives, which is invisible in production.
// Only ENABLED subscriptions must have a working handler — a disabled one is a
// declared-but-not-yet-built future channel and is never provisioned.
const registered = new Set(handlerNames);
const enabledMissing = subs.filter((s) => s.enabled !== false && s.handler && !registered.has(s.handler)).map((s) => `${s.name}→${s.handler}`);
const disabledPending = subs.filter((s) => s.enabled === false).map((s) => s.name);

// An ENABLED subscription with no handler is a hard error — it would provision
// a live channel that silently discards every event it receives.
if (enabledMissing.length) fail(`enabled subscription(s) have no registered handler: ${enabledMissing.join(", ")} (handlers: ${handlerNames.join(", ") || "none"})`);

if (errors.length) {
  console.error("✗ automation-events.json invalid:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ automation-events.json: valid (${subs.length} subscriptions, renew every ${renewal}h vs ${expiry}h expiry)`);
if (disabledPending.length) {
  console.log(`  ℹ ${disabledPending.length} subscription(s) declared but disabled (handler pending, not provisioned): ${disabledPending.join(", ")}`);
}
