/**
 * Timeline — the product.
 *
 * Renders GET /:subject_id/timeline exactly as the API projects it. Two things
 * here are only possible because the store is an append-only log:
 *   · "as it stood on" — reconstructing the record as of a past date, which a
 *     mutable database cannot answer at all;
 *   · corrections shown as additions beside the original, never as edits.
 */

import { el, replace, viewHeader, emptyState, errorState, loadingState } from "../dom.js";
import { eventGroup, formatDate } from "../format.js";
import { renderEntry } from "./entry.js";

const GROUPS = [
  { id: "all", label: "Everything" },
  { id: "guidance", label: "Guidance" },
  { id: "documents", label: "Documents" },
  { id: "applications", label: "Applications" },
  { id: "visa", label: "Visa" },
  { id: "career", label: "Career" },
  { id: "access", label: "Access" },
];

const state = { group: "all", asOf: null, busy: false };

export async function renderTimeline(container, ctx) {
  replace(container, loadingState("Loading your timeline…"));

  let data;
  try {
    data = state.asOf
      ? await ctx.api.getTimeline(ctx.subjectId, { asOf: state.asOf })
      : await ctx.cached("timeline", () => ctx.api.getTimeline(ctx.subjectId));
  } catch (err) {
    replace(container, [
      viewHeader("view-timeline-title", "Your timeline"),
      errorState(err.userMessage ?? err.message, () => renderTimeline(container, ctx)),
    ]);
    return;
  }

  const entries = data.entries ?? [];
  const visible = state.group === "all" ? entries : entries.filter((e) => eventGroup(e.type) === state.group);
  // Newest first: the thing that just happened is the thing being looked for.
  const ordered = [...visible].reverse();

  async function respond(entry, type, label) {
    if (state.busy) return;
    state.busy = true;
    try {
      await ctx.api.appendEvent(ctx.subjectId, {
        type,
        payload: { responded_to: entry.event_id, response: label },
        caused_by: entry.event_id,
        // Derived, not random: a double submission cannot become two entries.
        idempotency_key: `${type}:${entry.event_id}`,
      });
      ctx.toast(`Recorded: ${label}. This is now a permanent part of your record.`);
      ctx.invalidate();
      await renderTimeline(container, ctx);
    } catch (err) {
      ctx.toast(err.userMessage ?? err.message, "error");
    } finally {
      state.busy = false;
    }
  }

  replace(container, [
    viewHeader(
      "view-timeline-title",
      "Your timeline",
      "Every entry states who wrote it, when, and on what evidence."
    ),

    /* filters ------------------------------------------------------------- */
    el("div", { class: "app-filters", role: "group", "aria-label": "Filter entries" },
      GROUPS.map((g) =>
        el("button", {
          class: `chip chip--filter${state.group === g.id ? " is-active" : ""}`,
          type: "button",
          "aria-pressed": String(state.group === g.id),
          onClick: () => {
            state.group = g.id;
            renderTimeline(container, ctx);
          },
          text: g.label,
        })
      )
    ),

    /* as-of ---------------------------------------------------------------- */
    el("div", { class: "app-asof" }, [
      el("label", { class: "app-asof__label", for: "asof-input", text: "See this record as it stood on" }),
      el("input", {
        class: "app-asof__input",
        id: "asof-input",
        type: "date",
        value: state.asOf ? state.asOf.slice(0, 10) : "",
        max: new Date().toISOString().slice(0, 10),
        onChange: (event) => {
          const value = event.target.value;
          state.asOf = value ? new Date(`${value}T23:59:59Z`).toISOString() : null;
          renderTimeline(container, ctx);
        },
      }),
      state.asOf
        ? el("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            onClick: () => {
              state.asOf = null;
              renderTimeline(container, ctx);
            },
            text: "Back to today",
          })
        : null,
      el("p", {
        class: "app-asof__note",
        text: state.asOf
          ? `Showing the record as it was recorded up to ${formatDate(state.asOf)}. Later entries are hidden, not deleted.`
          : "Because your record is a log, it can be replayed to any past date.",
      }),
    ]),

    /* entries -------------------------------------------------------------- */
    ordered.length
      ? el("div", { class: "app-entries" },
          ordered.map((entry) =>
            renderEntry(entry, {
              busy: state.busy,
              onAcknowledge: (e) => respond(e, "recommendation.acknowledged", "acknowledged"),
              onDecline: (e) => respond(e, "recommendation.declined", "declined"),
            })
          )
        )
      : emptyState(
          entries.length ? "Nothing in this filter" : "Your record has no entries yet",
          entries.length
            ? "Try a different filter, or go back to Everything."
            : "When your counsellor records a session, a recommendation or a document, it appears here."
        ),

    /* honesty footer ------------------------------------------------------- */
    el("div", { class: "app-note" }, [
      data.withheld > 0
        ? el("p", {
            class: "app-note__line",
            text:
              `${data.withheld} entr${data.withheld === 1 ? "y is" : "ies are"} held at a classification this ` +
              "session cannot read. They are counted here rather than hidden silently.",
          })
        : null,
      data.read_is_logged
        ? el("p", {
            class: "app-note__line",
            text: "Reads from this session are recorded in the log, the same as any other access.",
          })
        : null,
      el("p", {
        class: "app-note__line",
        text: `${entries.length} entr${entries.length === 1 ? "y" : "ies"} visible to you.`,
      }),
    ]),
  ]);
}
