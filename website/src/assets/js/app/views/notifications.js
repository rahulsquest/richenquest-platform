/**
 * Updates.
 *
 * There is no push service and no notification store, so nothing here is
 * invented to fill the gap: updates are DERIVED from the timeline the API
 * already returns, against a read marker held on this device. That marker
 * decides what is highlighted, never what may be seen — everything shown here
 * had already passed the permission layer.
 *
 * The ordering is deliberate. A failed integrity check outranks a recommendation
 * waiting on you, which outranks somebody having read your record.
 */

import { el, replace, viewHeader, emptyState, errorState, loadingState } from "../dom.js";
import { buildNotifications, latestRecordedAt } from "../derive.js";
import { eventLabel, formatDateTime, relativeTime } from "../format.js";
import { renderEntry } from "./entry.js";

export async function renderNotifications(container, ctx) {
  replace(container, loadingState("Checking for updates…"));

  let data;
  try {
    data = await ctx.cached("timeline", () => ctx.api.getTimeline(ctx.subjectId));
  } catch (err) {
    replace(container, [
      viewHeader("view-notifications-title", "Updates"),
      errorState(err.userMessage ?? err.message, () => renderNotifications(container, ctx)),
    ]);
    return;
  }

  const entries = data.entries ?? [];
  const lastSeen = ctx.getLastSeen();
  const items = buildNotifications({
    entries,
    verification: ctx.getVerification(),
    lastSeen,
    withheld: data.withheld ?? 0,
  });

  const actionable = items.filter((i) => i.severity !== "info");
  const updates = items.filter((i) => i.severity === "info");

  function markRead() {
    const latest = latestRecordedAt(entries);
    if (latest) ctx.setLastSeen(latest);
    ctx.refreshBadge();
    renderNotifications(container, ctx);
    ctx.toast("Marked as read on this device.");
  }

  replace(container, [
    viewHeader(
      "view-notifications-title",
      "Updates",
      lastSeen ? `Since you last looked, ${formatDateTime(lastSeen)}.` : "Everything currently in your record."
    ),

    actionable.length
      ? el("div", { class: "app-alerts" },
          actionable.map((item) =>
            el("article", { class: `alert alert--${item.severity}`, role: item.severity === "alert" ? "alert" : null }, [
              el("h2", { class: "alert__title", text: item.title }),
              item.detail ? el("p", { class: "alert__detail", text: item.detail }) : null,
              item.event_id
                ? el("p", null, [
                    el("a", {
                      class: "btn btn--ghost btn--sm",
                      href: `#/timeline?focus=${encodeURIComponent(item.event_id)}`,
                      text: "Open in timeline",
                    }),
                  ])
                : null,
            ])
          )
        )
      : null,

    updates.length
      ? el("section", { class: "app-panel" }, [
          el("header", { class: "app-panel__head" }, [
            el("h2", { class: "app-panel__title", text: "New since you last looked" }),
            el("button", { class: "btn btn--ghost btn--sm", type: "button", onClick: markRead, text: "Mark all as read" }),
          ]),
          el("div", { class: "app-entries" },
            updates.map((item) =>
              item.entry
                ? renderEntry(item.entry)
                : el("article", { class: "alert alert--info" }, [
                    el("h3", { class: "alert__title", text: item.title ?? eventLabel(item.type) }),
                    item.detail ? el("p", { class: "alert__detail", text: item.detail }) : null,
                    item.time ? el("p", { class: "alert__time", text: relativeTime(item.time) }) : null,
                  ])
            )
          ),
        ])
      : null,

    !actionable.length && !updates.length
      ? emptyState(
          lastSeen ? "Nothing new" : "Nothing needs your attention",
          lastSeen
            ? "Your record has not changed since you last looked."
            : "When something is added to your record, or a recommendation needs your response, it appears here."
        )
      : null,

    el("div", { class: "app-note" }, [
      el("p", {
        class: "app-note__line",
        text:
          "Updates are worked out on this device from your own timeline. We do not track whether you have read " +
          "anything, and clearing your browser data simply resets what is marked as new.",
      }),
    ]),
  ]);
}
