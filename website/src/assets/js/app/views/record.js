/**
 * Career Record viewer — the summary, and the integrity check.
 *
 * This is the trust surface. It exists so a student can answer one question for
 * themselves: has anything in my record been changed behind my back? The answer
 * comes from GET /:subject_id/verify, which re-walks the hash chain, and its
 * failures are shown in full rather than as a boolean — a person is entitled to
 * know exactly how their record failed, not merely that it did.
 */

import { el, replace, viewHeader, errorState, loadingState, dataRow } from "../dom.js";
import { formatDateTime, relativeTime } from "../format.js";

const shortHash = (hash) => (typeof hash === "string" && hash.length > 20 ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : hash ?? "—");

export async function renderRecord(container, ctx) {
  replace(container, loadingState("Loading your record…"));

  let record;
  try {
    record = await ctx.cached("record", () => ctx.api.getRecord(ctx.subjectId));
  } catch (err) {
    replace(container, [
      viewHeader("view-record-title", "Your record"),
      errorState(err.userMessage ?? err.message, () => renderRecord(container, ctx)),
    ]);
    return;
  }

  const verifyMount = el("div", { class: "app-verify" });

  async function runVerification() {
    replace(verifyMount, loadingState("Checking every entry against the one before it…"));
    let result;
    try {
      result = await ctx.api.verifyRecord(ctx.subjectId);
    } catch (err) {
      replace(verifyMount, errorState(err.userMessage ?? err.message, runVerification));
      return;
    }

    ctx.setVerification(result);

    replace(verifyMount, [
      el("div", { class: `app-verify__result app-verify__result--${result.verified ? "ok" : "fail"}`, role: "status" }, [
        el("p", { class: "app-verify__headline", text: result.verified ? "This record verifies" : "This record does NOT verify" }),
        el("p", {
          class: "app-verify__detail",
          text: result.verified
            ? `All ${result.events} entries are intact and in order. Nothing has been altered or removed since each was written.`
            : `${result.failures?.length ?? 0} problem(s) were found. Please contact us before relying on this record.`,
        }),
      ]),

      result.failures?.length
        ? el("ul", { class: "app-verify__failures" },
            result.failures.map((f) =>
              el("li", { class: "app-verify__failure" }, [
                el("code", { class: "app-verify__failure-id", text: f.event_id ?? f.seq ?? "—" }),
                el("span", { text: f.reason ?? f.message ?? JSON.stringify(f) }),
              ])
            )
          )
        : null,

      el("dl", { class: "app-data" }, [
        dataRow("Entries checked", String(result.events ?? 0)),
        dataRow("Chain head", shortHash(result.chain_head), { mono: true }),
      ]),
    ]);
  }

  replace(container, [
    viewHeader(
      "view-record-title",
      "Your record",
      "What we hold, and proof that it has not been altered."
    ),

    el("section", { class: "app-panel" }, [
      el("h2", { class: "app-panel__title", text: "Summary" }),
      el("dl", { class: "app-data" }, [
        dataRow("Record id", record.subject_id, { mono: true }),
        dataRow("Entries", String(record.events ?? 0)),
        dataRow(
          "Last activity",
          record.last_event_at ? `${formatDateTime(record.last_event_at)} (${relativeTime(record.last_event_at)})` : "—"
        ),
        dataRow("Chain head", shortHash(record.chain_head), { mono: true }),
        record.consent
          ? dataRow(
              "Consent purposes on file",
              record.consent.purposes?.length ? record.consent.purposes.join(", ") : "none recorded"
            )
          : null,
        record.consent?.is_minor ? dataRow("Age status", "Under 18 — additional protections apply") : null,
      ]),
      el("p", {
        class: "app-panel__note",
        text:
          "Your record id is a pseudonym. Your name, date of birth and documents are held separately and " +
          "encrypted, so this identifier on its own does not identify you.",
      }),
    ]),

    el("section", { class: "app-panel" }, [
      el("h2", { class: "app-panel__title", text: "Integrity check" }),
      el("p", { class: "app-panel__lede" }, [
        el("span", {
          text:
            "Every entry carries a fingerprint of the entry before it. Change one entry and every fingerprint " +
            "after it stops matching — which is what makes tampering detectable rather than a matter of trusting us. ",
        }),
        el("span", { class: "app-panel__emphasis", text: "You can run this check yourself, at any time." }),
      ]),
      el("p", null, [
        el("button", { class: "btn btn--primary", type: "button", onClick: runVerification, text: "Check my record now" }),
      ]),
      verifyMount,
    ]),
  ]);
}
