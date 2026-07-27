/**
 * One timeline entry, rendered.
 *
 * Shared by the Timeline and the Updates views so an entry looks and reads the
 * same wherever it appears. The founder's specification for a timeline entry is
 * followed literally: type, time, actor, evidence, decision, disclosure, outcome,
 * linked documents, follow-up — plus the two things that make the record
 * trustworthy rather than merely complete: whether it was written by automated
 * assistance, and whether it has since been corrected.
 */

import { el } from "../dom.js";
import {
  actorLabel, eventGroup, eventLabel, formatDate, formatDateTime, formatValue,
  fieldLabel, relativeTime, evidenceKind, evidenceId, CLASSIFICATION_NOTES,
} from "../format.js";

/** Payload keys already surfaced elsewhere on the card. */
const HANDLED_KEYS = new Set(["follow_up", "correction_reason"]);

function evidenceChips(evidence = []) {
  if (!evidence.length) return null;
  return el("div", { class: "entry__evidence" }, [
    el("span", { class: "entry__evidence-label", text: "Evidence" }),
    ...evidence.map((item) => {
      const meta = evidenceKind(item.ref);
      return el("span", {
        class: `chip chip--evidence${meta.resolvable ? "" : " chip--unresolved"}`,
        title: meta.resolvable
          ? `${meta.label}: ${item.ref}`
          : `${meta.label}: ${item.ref} — this deployment cannot resolve references of this kind yet`,
      }, [
        el("span", { class: "chip__kind", text: meta.label }),
        el("code", { class: "chip__id", text: evidenceId(item.ref) }),
      ]);
    }),
  ]);
}

function decisionList(decision = {}) {
  const rows = Object.entries(decision).filter(([k, v]) => !HANDLED_KEYS.has(k) && v !== null && v !== undefined);
  if (!rows.length) return null;
  return el("dl", { class: "entry__decision" },
    rows.flatMap(([key, value]) => [
      el("dt", { class: "entry__decision-key", text: fieldLabel(key) }),
      el("dd", { class: "entry__decision-value", text: formatValue(value) }),
    ])
  );
}

function disclosureBlock(disclosure) {
  if (!disclosure) return null;
  const statements = disclosure.statements ?? [];
  return el("div", { class: "entry__disclosure" }, [
    el("p", { class: "entry__disclosure-head", text: "What we told you about our interests" }),
    el("ul", { class: "entry__disclosure-list" }, statements.map((s) => el("li", { text: s }))),
  ]);
}

/**
 * @param {object} entry     a timeline entry from GET /:subject_id/timeline
 * @param {object} [options] { onAcknowledge, onDecline, busy }
 */
export function renderEntry(entry, options = {}) {
  const { onAcknowledge = null, onDecline = null, busy = false } = options;
  const group = eventGroup(entry.type);
  const isRecommendation = entry.type === "recommendation.issued";
  const needsResponse = isRecommendation && !entry.acknowledgement && !entry.corrected;

  const card = el("article", {
    class: `entry entry--${group}${entry.corrected ? " entry--corrected" : ""}${needsResponse ? " entry--needs-response" : ""}`,
    dataset: { eventId: entry.event_id, type: entry.type },
  });

  /* header ---------------------------------------------------------------- */
  card.append(
    el("header", { class: "entry__head" }, [
      el("h3", { class: "entry__title", text: eventLabel(entry.type) }),
      el("p", { class: "entry__meta" }, [
        el("time", { class: "entry__time", datetime: entry.time ?? "", text: formatDate(entry.time) }),
        el("span", { class: "entry__dot", "aria-hidden": "true", text: "·" }),
        el("span", { class: "entry__ago", text: relativeTime(entry.time) }),
        el("span", { class: "entry__dot", "aria-hidden": "true", text: "·" }),
        el("span", { class: "entry__actor", text: `by ${actorLabel(entry.actor)}` }),
      ]),
      // Automated authorship is never rendered as though it were human judgement.
      entry.authored_by_ai
        ? el("p", { class: "entry__ai", title: "Prepared by automated assistance, not by a person" }, [
            el("span", { class: "entry__ai-mark", "aria-hidden": "true", text: "◆" }),
            el("span", { text: "Prepared by automated assistance for a human adviser" }),
          ])
        : null,
    ])
  );

  /* body ------------------------------------------------------------------ */
  const decision = decisionList(entry.decision);
  if (decision) card.append(decision);

  const evidence = evidenceChips(entry.evidence);
  if (evidence) card.append(evidence);

  const disclosure = disclosureBlock(entry.disclosure);
  if (disclosure) card.append(disclosure);

  if (entry.documents?.length) {
    card.append(
      el("p", { class: "entry__documents" }, [
        el("span", { class: "entry__documents-label", text: "Linked documents: " }),
        el("span", { text: entry.documents.map((d) => evidenceId(d.ref)).join(", ") }),
      ])
    );
  }

  if (entry.follow_up) {
    card.append(
      el("p", { class: "entry__followup" }, [
        el("span", { class: "entry__followup-label", text: "Follow-up: " }),
        el("span", { text: formatValue(entry.follow_up) }),
      ])
    );
  }

  /* linked later events --------------------------------------------------- */
  if (entry.acknowledgement) {
    card.append(
      el("p", { class: "entry__ack", text: `You acknowledged this on ${formatDate(entry.acknowledgement.at)}.` })
    );
  }

  if (entry.outcome) {
    const { at, ...rest } = entry.outcome;
    card.append(
      el("div", { class: "entry__outcome" }, [
        el("p", { class: "entry__outcome-head", text: `Outcome recorded ${formatDate(at)}` }),
        decisionList(rest) ?? null,
      ])
    );
  }

  // A corrected entry must show that it was corrected. It is never rewritten.
  if (entry.corrected) {
    card.append(
      el("div", { class: "entry__correction" }, [
        el("p", { class: "entry__correction-head", text: `Corrected on ${formatDate(entry.corrected.at)}` }),
        entry.corrected.reason ? el("p", { class: "entry__correction-reason", text: entry.corrected.reason }) : null,
        el("p", {
          class: "entry__correction-note",
          text: "The original entry above is kept exactly as it was written. Corrections are added, never applied over the top.",
        }),
      ])
    );
  }

  /* actions --------------------------------------------------------------- */
  if (needsResponse && (onAcknowledge || onDecline)) {
    card.append(
      el("div", { class: "entry__actions" }, [
        el("p", { class: "entry__actions-note", text: "Your response is added to the record and is permanent." }),
        onAcknowledge
          ? el("button", {
              class: "btn btn--primary btn--sm",
              type: "button",
              disabled: busy,
              onClick: () => onAcknowledge(entry),
              text: "Acknowledge",
            })
          : null,
        onDecline
          ? el("button", {
              class: "btn btn--ghost btn--sm",
              type: "button",
              disabled: busy,
              onClick: () => onDecline(entry),
              text: "Decline",
            })
          : null,
      ])
    );
  }

  /* footer ---------------------------------------------------------------- */
  card.append(
    el("footer", { class: "entry__foot" }, [
      entry.classification
        ? el("span", {
            class: "entry__classification",
            title: CLASSIFICATION_NOTES[entry.classification] ?? "",
            text: CLASSIFICATION_NOTES[entry.classification] ?? entry.classification,
          })
        : null,
      el("span", {
        class: "entry__recorded",
        text: `Recorded ${formatDateTime(entry.recorded)}`,
        title: `Event id ${entry.event_id}`,
      }),
    ])
  );

  return card;
}
