/**
 * Settings.
 *
 * Consent changes here are real writes to the record: each one becomes a
 * permanent, attributed entry via POST /:subject_id/events. There is no local
 * "preference" copy of consent, because a consent state that lives anywhere
 * except the log is a consent state we could later disagree with.
 *
 * WITHDRAWAL IS NEVER HARDER THAN GRANTING — but one consequence has to be said
 * out loud rather than discovered: the append endpoint itself is gated on the
 * `advisory` purpose. Withdrawing advisory therefore closes the dashboard's own
 * ability to write, including its ability to grant consent back. The student is
 * told this before they act, and told how to reverse it.
 */

import { el, replace, viewHeader, errorState, loadingState } from "../dom.js";
import { consentFromTimeline, CONSENT_PURPOSES } from "../derive.js";
import { formatDate, formatDuration } from "../format.js";
import { expiresInMs } from "../session.js";
import { exportAndDownload, exportSummaryText } from "./export.js";

const PREF_KEY = "rq.dash.motion";

const readMotionPref = () => {
  try {
    return localStorage.getItem(PREF_KEY) === "reduced";
  } catch {
    return false;
  }
};

export function applyMotionPref() {
  document.documentElement.classList.toggle("motion-reduced", readMotionPref());
}

export async function renderSettings(container, ctx) {
  replace(container, loadingState("Loading your settings…"));

  let timeline;
  try {
    timeline = await ctx.cached("timeline", () => ctx.api.getTimeline(ctx.subjectId));
  } catch (err) {
    replace(container, [
      viewHeader("view-settings-title", "Settings"),
      errorState(err.userMessage ?? err.message, () => renderSettings(container, ctx)),
    ]);
    return;
  }

  const consent = consentFromTimeline(timeline.entries ?? []);
  const consentMount = el("div", { class: "app-consent__result" });
  const exportMount = el("div", { class: "app-export__result" });
  let busy = false;

  async function writeConsent(purposeId, grant) {
    if (busy) return;
    const purpose = CONSENT_PURPOSES.find((p) => p.id === purposeId);

    if (!grant && purpose?.essential) {
      const proceed = globalThis.confirm(
        "Withdrawing consent for counselling and recommendations also stops this dashboard from writing to your " +
          "record at all — including granting consent again. Your record stays visible and downloadable, but " +
          "restoring this consent will need your counsellor.\n\nWithdraw anyway?"
      );
      if (!proceed) return;
    }

    busy = true;
    replace(consentMount, loadingState(grant ? "Recording your consent…" : "Recording your withdrawal…"));
    try {
      await ctx.api.appendEvent(ctx.subjectId, {
        type: grant ? "consent.given" : "consent.withdrawn",
        payload: { purposes: [purposeId] },
        idempotency_key: `consent:${grant ? "give" : "withdraw"}:${purposeId}:${Date.now()}`,
      });
      ctx.invalidate();
      ctx.toast(grant ? "Consent recorded." : "Withdrawal recorded.");
      await renderSettings(container, ctx);
    } catch (err) {
      replace(consentMount, errorState(err.userMessage ?? err.message));
    } finally {
      busy = false;
    }
  }

  async function runExport() {
    replace(exportMount, loadingState("Preparing your record…"));
    try {
      const result = await exportAndDownload(ctx);
      replace(exportMount, el("p", { class: "app-export__ok", role: "status", text: exportSummaryText(result) }));
    } catch (err) {
      replace(exportMount, errorState(err.userMessage ?? err.message, runExport));
    }
  }

  replace(container, [
    viewHeader("view-settings-title", "Settings", "What you allow, and how this session behaves."),

    /* consent -------------------------------------------------------------- */
    el("section", { class: "app-panel" }, [
      el("h2", { class: "app-panel__title", text: "What you consent to" }),
      el("p", {
        class: "app-panel__lede",
        text: "Every change here is written to your record as its own entry, with the date and who made it. Including this one.",
      }),

      el("ul", { class: "app-consent" },
        CONSENT_PURPOSES.map((purpose) => {
          const state = consent.purposes[purpose.id];
          const granted = Boolean(state?.granted);
          return el("li", { class: "app-consent__row" }, [
            el("div", { class: "app-consent__text" }, [
              el("p", { class: "app-consent__name", text: purpose.label }),
              el("p", {
                class: "app-consent__status",
                text: state
                  ? granted
                    ? `Given ${formatDate(state.at)}`
                    : `Withdrawn ${formatDate(state.withdrawn_at)}`
                  : "Never given",
              }),
              purpose.essential
                ? el("p", {
                    class: "app-consent__essential",
                    text: "Needed for counselling — and for this dashboard to write anything to your record.",
                  })
                : null,
            ]),
            el("button", {
              class: `btn btn--sm ${granted ? "btn--ghost" : "btn--primary"}`,
              type: "button",
              onClick: () => writeConsent(purpose.id, !granted),
              text: granted ? "Withdraw" : "Give consent",
            }),
          ]);
        })
      ),
      consentMount,
      !consent.known
        ? el("p", {
            class: "app-panel__note",
            text: "No consent entries are visible in your timeline yet, so the states above may be incomplete.",
          })
        : null,
    ]),

    /* your data ------------------------------------------------------------ */
    el("section", { class: "app-panel" }, [
      el("h2", { class: "app-panel__title", text: "Your data" }),
      el("p", { class: "app-panel__lede", text: "The export is the record itself, in the format we store it in." }),
      el("p", { class: "app-panel__warn", text: "Exporting adds a “Record exported” entry to your timeline." }),
      el("p", null, [
        el("button", { class: "btn btn--primary btn--sm", type: "button", onClick: runExport, text: "Download my record" }),
      ]),
      exportMount,
      el("p", {
        class: "app-panel__note",
        text:
          "To have your personal details erased, ask us. Erasure destroys the key your data is encrypted with, so " +
          "the content becomes unrecoverable while the shape of the history remains auditable. It cannot be undone.",
      }),
    ]),

    /* session -------------------------------------------------------------- */
    el("section", { class: "app-panel" }, [
      el("h2", { class: "app-panel__title", text: "This session" }),
      el("dl", { class: "app-data" }, [
        el("div", { class: "app-data__row" }, [
          el("dt", { class: "app-data__label", text: "Signed in as" }),
          el("dd", { class: "app-data__value", text: ctx.session.role === "guardian" ? "Guardian" : "Student" }),
        ]),
        el("div", { class: "app-data__row" }, [
          el("dt", { class: "app-data__label", text: "Session ends in" }),
          el("dd", { class: "app-data__value", text: formatDuration(expiresInMs(ctx.session)) }),
        ]),
      ]),
      el("p", {
        class: "app-panel__note",
        text:
          "Sessions are short and expire on their own. Signing out clears this device immediately; it does not " +
          "revoke a link that is still valid elsewhere, so tell us if you think a link has been seen by someone else.",
      }),
      el("p", null, [
        el("button", { class: "btn btn--ghost btn--sm", type: "button", onClick: () => ctx.signOut(), text: "Sign out" }),
      ]),
    ]),

    /* display -------------------------------------------------------------- */
    el("section", { class: "app-panel" }, [
      el("h2", { class: "app-panel__title", text: "Display" }),
      el("label", { class: "app-toggle" }, [
        el("input", {
          type: "checkbox",
          checked: readMotionPref(),
          onChange: (event) => {
            try {
              localStorage.setItem(PREF_KEY, event.target.checked ? "reduced" : "full");
            } catch {
              /* preference is not essential; the dashboard works without it */
            }
            applyMotionPref();
          },
        }),
        el("span", { text: "Reduce motion and animation" }),
      ]),
      el("p", { class: "app-panel__note", text: "Kept on this device only. It is not part of your record." }),
    ]),
  ]);
}
