/**
 * Evidence viewer.
 *
 * Every reference cited anywhere in the record, and what each one is being used
 * to justify. The question this answers is the one that matters when advice
 * rests on a document: "what is this being used to support?"
 *
 * HONEST LIMIT, SHOWN RATHER THAN HIDDEN
 * The API resolves `claim:` references against the Verified Claims register. The
 * other kinds — documents, destination data, people, institutions — are accepted
 * structurally and marked `unresolved_by_design` because their owning services do
 * not exist yet (service.mjs resolveEvidence). The dashboard says exactly that
 * instead of rendering a reference as though it had been checked. Evidence that
 * points at nothing is worse than no evidence, because it reads as diligence.
 */

import { el, replace, viewHeader, emptyState, errorState, loadingState } from "../dom.js";
import { evidenceIndex } from "../derive.js";
import { eventLabel, evidenceKind, evidenceId, formatDate } from "../format.js";

export async function renderEvidence(container, ctx) {
  replace(container, loadingState("Collecting the evidence cited in your record…"));

  let data;
  try {
    data = await ctx.cached("timeline", () => ctx.api.getTimeline(ctx.subjectId));
  } catch (err) {
    replace(container, [
      viewHeader("view-evidence-title", "Evidence"),
      errorState(err.userMessage ?? err.message, () => renderEvidence(container, ctx)),
    ]);
    return;
  }

  const index = evidenceIndex(data.entries ?? []);
  const unresolvable = index.filter((r) => !evidenceKind(r.ref).resolvable).length;

  replace(container, [
    viewHeader(
      "view-evidence-title",
      "Evidence",
      "Everything your record cites, and what each reference is used to support."
    ),

    index.length
      ? el("div", { class: "app-evidence" },
          index.map((item) => {
            const meta = evidenceKind(item.ref);
            return el("article", { class: `evidence${meta.resolvable ? "" : " evidence--unresolved"}` }, [
              el("header", { class: "evidence__head" }, [
                el("span", { class: "evidence__kind", text: meta.label }),
                el("code", { class: "evidence__ref", text: evidenceId(item.ref), title: item.ref }),
              ]),

              el("p", {
                class: "evidence__status",
                text: meta.resolvable
                  ? "Checked against our verified claims register."
                  : "Recorded as a reference. The service that would resolve this kind is not built yet, so we do not claim it has been checked.",
              }),

              el("p", { class: "evidence__count", text: `Cited by ${item.citations.length} entr${item.citations.length === 1 ? "y" : "ies"}` }),

              el("ul", { class: "evidence__citations" },
                item.citations.map((c) =>
                  el("li", { class: "evidence__citation" }, [
                    el("a", {
                      class: "evidence__citation-link",
                      href: `#/timeline?focus=${encodeURIComponent(c.event_id)}`,
                      text: eventLabel(c.type),
                    }),
                    el("span", { class: "evidence__citation-time", text: ` — ${formatDate(c.time)}` }),
                  ])
                )
              ),
            ]);
          })
        )
      : emptyState(
          "No evidence is cited yet",
          "When a recommendation or a verified document is added to your record, the evidence behind it is listed here."
        ),

    index.length
      ? el("div", { class: "app-note" }, [
          el("p", {
            class: "app-note__line",
            text: `${index.length} distinct reference${index.length === 1 ? "" : "s"} cited across your record.`,
          }),
          unresolvable > 0
            ? el("p", {
                class: "app-note__line",
                text:
                  `${unresolvable} of them point at services we have not built yet. They are shown as unresolved ` +
                  "rather than presented as verified.",
              })
            : null,
        ])
      : null,
  ]);
}
