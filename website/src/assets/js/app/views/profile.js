/**
 * Profile.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * There is no "edit profile" form, because there is no update operation anywhere
 * in this system. A change of name or date of birth is a new entry authored by
 * someone accountable for it, not a field overwritten in place.
 *
 * Nor is identity data displayed inline. Name, date of birth and documents live
 * encrypted in the vault, separately from the record, and the API releases them
 * to the student through one route only: an export, which is itself recorded.
 * Rendering them on a dashboard would have quietly created a second, unlogged
 * release path — which is precisely the hole the vault exists to close.
 */

import { el, replace, viewHeader, errorState, loadingState, dataRow, emptyState } from "../dom.js";
import { formatDateTime, relativeTime, eventLabel, formatDate } from "../format.js";
import { consentFromTimeline, CONSENT_PURPOSES } from "../derive.js";
import { exportAndDownload, exportSummaryText } from "./export.js";

const PROFILE_TYPES = new Set(["profile.created", "profile.updated", "profile.corrected", "profile.reviewed", "consent.guardian_linked"]);

export async function renderProfile(container, ctx) {
  replace(container, loadingState("Loading your profile…"));

  let record;
  let timeline;
  try {
    [record, timeline] = await Promise.all([
      ctx.cached("record", () => ctx.api.getRecord(ctx.subjectId)),
      ctx.cached("timeline", () => ctx.api.getTimeline(ctx.subjectId)),
    ]);
  } catch (err) {
    replace(container, [
      viewHeader("view-profile-title", "Profile"),
      errorState(err.userMessage ?? err.message, () => renderProfile(container, ctx)),
    ]);
    return;
  }

  const entries = timeline.entries ?? [];
  const profileEntries = entries.filter((e) => PROFILE_TYPES.has(e.type)).reverse();
  const consent = consentFromTimeline(entries);
  const exportMount = el("div", { class: "app-export__result" });

  async function runExport() {
    replace(exportMount, loadingState("Preparing your record…"));
    try {
      const result = await exportAndDownload(ctx);
      replace(exportMount, [
        el("p", { class: "app-export__ok", role: "status", text: exportSummaryText(result) }),
        el("p", {
          class: "app-export__note",
          text: "A “Record exported” entry has been added to your timeline, as promised.",
        }),
      ]);
    } catch (err) {
      replace(exportMount, errorState(err.userMessage ?? err.message, runExport));
    }
  }

  replace(container, [
    viewHeader("view-profile-title", "Profile", "Who this record belongs to, and what we hold about you."),

    el("section", { class: "app-panel" }, [
      el("h2", { class: "app-panel__title", text: "Identity" }),
      el("dl", { class: "app-data" }, [
        dataRow("Record id", record.subject_id, { mono: true }),
        dataRow("Signed in as", ctx.session.role === "guardian" ? "Guardian of this record" : "The person this record is about"),
        record.consent?.is_minor ? dataRow("Age status", "Under 18 — additional protections apply") : null,
        dataRow("Record opened", profileEntries.length ? formatDate(profileEntries[profileEntries.length - 1].time) : "—"),
        dataRow(
          "Last activity",
          record.last_event_at ? `${formatDateTime(record.last_event_at)} (${relativeTime(record.last_event_at)})` : "—"
        ),
      ]),
      el("p", {
        class: "app-panel__note",
        text:
          "Your name, date of birth and documents are held encrypted and separately from this record, under a key " +
          "that belongs to you alone. That is what makes erasure real: destroy the key and the data is gone for " +
          "good, without tearing a hole in the history.",
      }),
    ]),

    el("section", { class: "app-panel" }, [
      el("h2", { class: "app-panel__title", text: "Consent on file" }),
      consent.known
        ? el("ul", { class: "app-consent__summary" },
            CONSENT_PURPOSES.map((purpose) => {
              const state = consent.purposes[purpose.id];
              const granted = Boolean(state?.granted);
              return el("li", { class: `app-consent__item app-consent__item--${granted ? "on" : "off"}` }, [
                el("span", { class: "app-consent__state", "aria-hidden": "true", text: granted ? "✓" : "—" }),
                el("span", { class: "app-consent__label", text: purpose.label }),
                el("span", {
                  class: "app-consent__meta",
                  text: state
                    ? granted
                      ? `given ${formatDate(state.at)}`
                      : `withdrawn ${formatDate(state.withdrawn_at)}`
                    : "never given",
                }),
              ]);
            })
          )
        : emptyState("No consent entries are visible", "Consent decisions appear here once they are recorded."),
      el("p", null, [el("a", { class: "btn btn--ghost btn--sm", href: "#/settings", text: "Change what you consent to" })]),
    ]),

    el("section", { class: "app-panel" }, [
      el("h2", { class: "app-panel__title", text: "Changes to your details" }),
      profileEntries.length
        ? el("ul", { class: "app-history" },
            profileEntries.map((e) =>
              el("li", { class: "app-history__item" }, [
                el("span", { class: "app-history__label", text: eventLabel(e.type) }),
                el("span", { class: "app-history__time", text: formatDate(e.time) }),
                el("span", { class: "app-history__actor", text: `by ${e.actor?.role ?? "unknown"}` }),
              ])
            )
          )
        : emptyState("No profile changes recorded", "Any change to your details is added here as its own entry."),
      el("p", {
        class: "app-panel__note",
        text:
          "To correct something, tell your counsellor. A correction is added as a new, attributed entry beside the " +
          "original — nothing in your record is ever overwritten, including by us.",
      }),
    ]),

    el("section", { class: "app-panel" }, [
      el("h2", { class: "app-panel__title", text: "Take your record with you" }),
      el("p", {
        class: "app-panel__lede",
        text:
          "You get the record in the same format we store it in, with the fingerprints that let anyone check it " +
          "has not been altered. Nothing about it needs us to read it.",
      }),
      el("p", { class: "app-panel__warn", text: "Exporting adds a “Record exported” entry to your timeline." }),
      el("p", null, [
        el("button", { class: "btn btn--primary", type: "button", onClick: runExport, text: "Download everything we hold" }),
      ]),
      exportMount,
    ]),
  ]);
}
