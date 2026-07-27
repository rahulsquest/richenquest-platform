/**
 * Console views.
 *
 * Every view renders from the operations API and nothing else — no sample rows,
 * no optimistic placeholders. An operations tool that shows plausible-but-wrong
 * numbers is worse than one that shows an error, because decisions get made on it.
 *
 * DOM construction is reused from the student dashboard (../app/dom.js), which
 * forbids innerHTML outright. That matters more here than there: this surface
 * renders lead names, emails and notes typed by strangers into a public form.
 */

import { el, replace, viewHeader, emptyState, errorState, loadingState, dataRow } from "../app/dom.js";
import { formatDate, formatDateTime, relativeTime } from "../app/format.js";

/* ─────────────────────────────────────────────────────────────── helpers ── */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** A headline number with a label, and an emphasis when it needs attention. */
function statTile(label, value, { tone = "neutral", hint = null } = {}) {
  return el("div", { class: `ops-stat ops-stat--${tone}` }, [
    el("p", { class: "ops-stat__value", text: String(value) }),
    el("p", { class: "ops-stat__label", text: label }),
    hint ? el("p", { class: "ops-stat__hint", text: hint }) : null,
  ]);
}

/** Wrap a view body so every view handles load and failure identically. */
async function renderWith(container, title, lede, load, build) {
  replace(container, loadingState(`Loading ${title.toLowerCase()}…`));
  let data;
  try {
    data = await load();
  } catch (err) {
    replace(container, [
      viewHeader(`view-${title.toLowerCase()}-title`, title),
      errorState(err.userMessage ?? err.message, () => renderWith(container, title, lede, load, build)),
    ]);
    return;
  }
  replace(container, [viewHeader(`view-${title.toLowerCase()}-title`, title, lede), ...build(data)]);
}

/* ═══════════════════════════════════════════════════════════ dashboard ═══ */

export async function renderDashboard(container, ctx) {
  await renderWith(container, "Today", "What needs you this morning.", () => ctx.api.dashboard(), (data) => {
    const { leads, tasks, students, attention } = data;

    return [
      el("div", { class: "ops-stats" }, [
        statTile("New leads this week", leads.new_this_week),
        statTile("Awaiting first contact", leads.awaiting_first_contact, {
          tone: leads.awaiting_first_contact > 0 ? "action" : "neutral",
          hint: `${leads.sla_target_minutes}-minute promise`,
        }),
        statTile("Past the promise", leads.breached_sla, { tone: leads.breached_sla > 0 ? "alert" : "good" }),
        statTile("Unassigned", leads.unassigned, { tone: leads.unassigned > 0 ? "action" : "good" }),
        statTile("Open tasks", tasks.open, { hint: tasks.overdue > 0 ? `${tasks.overdue} overdue` : "none overdue" }),
        statTile("Active students", students.active),
      ]),

      attention.length
        ? el("section", { class: "ops-panel" }, [
            el("h2", { class: "ops-panel__title", text: "Needs attention" }),
            el("ul", { class: "ops-alerts" },
              attention.map((item) =>
                el("li", { class: `ops-alert ops-alert--${item.severity}` }, [
                  el("p", { class: "ops-alert__title", text: item.title }),
                  el("p", { class: "ops-alert__detail", text: item.detail }),
                  el("a", { class: "btn btn--ghost btn--sm", href: item.link, text: "Open" }),
                ])
              )
            ),
          ])
        : el("section", { class: "ops-panel" }, [
            emptyState("Nothing needs you right now", "Every lead is owned and inside its promise window."),
          ]),

      el("p", { class: "ops-note", text: `Generated ${formatDateTime(data.generated_at)} · ${relativeTime(data.generated_at)}` }),
    ];
  });
}

/* ═══════════════════════════════════════════════════════════════ leads ═══ */

const leadState = { status: "", busy: false };

export async function renderLeads(container, ctx) {
  const load = () => ctx.api.listLeads({ status: leadState.status || null, limit: 100 });

  await renderWith(container, "Leads", "Newest first. The clock starts the moment a lead arrives.", load, (data) => {
    async function act(lead, patch, successText) {
      if (leadState.busy) return;
      leadState.busy = true;
      try {
        await ctx.api.updateLead(lead.id, patch);
        ctx.toast(successText);
        await renderLeads(container, ctx);
      } catch (err) {
        ctx.toast(err.userMessage ?? err.message, "error");
      } finally {
        leadState.busy = false;
      }
    }

    const filters = ["", "New", "Contacted", "Qualified", "Junk Lead"];

    return [
      el("div", { class: "ops-filters", role: "group", "aria-label": "Filter by status" },
        filters.map((status) =>
          el("button", {
            class: `chip chip--filter${leadState.status === status ? " is-active" : ""}`,
            type: "button",
            "aria-pressed": String(leadState.status === status),
            onClick: () => {
              leadState.status = status;
              renderLeads(container, ctx);
            },
            text: status || "All",
          })
        )
      ),

      data.leads.length
        ? el("ul", { class: "ops-list" },
            data.leads.map((lead) =>
              el("li", { class: `ops-row${lead.contacted ? "" : " ops-row--waiting"}`, dataset: { leadId: lead.id } }, [
                el("div", { class: "ops-row__main" }, [
                  el("p", { class: "ops-row__title", text: lead.name }),
                  el("p", { class: "ops-row__meta", text: [lead.email, lead.phone].filter(Boolean).join(" · ") || "No contact details" }),
                  el("p", { class: "ops-row__meta" }, [
                    el("span", { class: "ops-tag", text: lead.status ?? "No status" }),
                    el("span", { text: ` ${lead.source ?? "Unknown source"} · ` }),
                    el("span", {
                      class: lead.contacted ? "" : "ops-waiting",
                      text: lead.contacted
                        ? `contacted · added ${relativeTime(lead.created_at)}`
                        : `waiting ${plural(lead.waiting_minutes ?? 0, "minute", "minutes")}`,
                    }),
                  ]),
                  el("p", { class: "ops-row__meta", text: lead.owner.name ? `Owner: ${lead.owner.name}` : "Unassigned" }),
                ]),
                el("div", { class: "ops-row__actions" },
                  ctx.can["leads:write"] && !lead.contacted
                    ? [el("button", {
                        class: "btn btn--primary btn--sm",
                        type: "button",
                        onClick: () => act(lead, { status: "Contacted", note: "Marked contacted from the console." }, `${lead.name} marked contacted.`),
                        text: "Mark contacted",
                      })]
                    : []
                ),
              ])
            )
          )
        : emptyState(
            leadState.status ? `No leads with status "${leadState.status}"` : "No leads yet",
            "New leads arrive here automatically from the website and WhatsApp."
          ),

      el("p", { class: "ops-note", text: `${plural(data.count, "lead", "leads")} shown.` }),
    ];
  });
}

/* ═══════════════════════════════════════════════════════════════ tasks ═══ */

const taskState = { busy: false };

export async function renderTasks(container, ctx) {
  await renderWith(container, "Tasks", "Open work, soonest due first.", () => ctx.api.listTasks(), (data) => {
    async function complete(task) {
      if (taskState.busy) return;
      taskState.busy = true;
      try {
        await ctx.api.completeTask(task.id);
        ctx.toast(`Completed: ${task.subject}`);
        await renderTasks(container, ctx);
      } catch (err) {
        ctx.toast(err.userMessage ?? err.message, "error");
      } finally {
        taskState.busy = false;
      }
    }

    async function create(event) {
      event.preventDefault();
      if (taskState.busy) return;
      const form = event.target;
      const subject = form.elements.subject.value.trim();
      if (!subject) return;
      taskState.busy = true;
      try {
        await ctx.api.createTask({
          subject,
          due_date: form.elements.due_date.value || undefined,
          priority: form.elements.priority.value,
        });
        ctx.toast("Task added.");
        await renderTasks(container, ctx);
      } catch (err) {
        ctx.toast(err.userMessage ?? err.message, "error");
      } finally {
        taskState.busy = false;
      }
    }

    return [
      ctx.can["tasks:write"]
        ? el("form", { class: "ops-form", onSubmit: create }, [
            el("input", { class: "ops-input", name: "subject", type: "text", placeholder: "What needs doing?", required: true, "aria-label": "Task" }),
            el("input", { class: "ops-input ops-input--date", name: "due_date", type: "date", "aria-label": "Due date" }),
            el("select", { class: "ops-input", name: "priority", "aria-label": "Priority" },
              ["Normal", "High", "Low"].map((p) => el("option", { value: p, text: p }))
            ),
            el("button", { class: "btn btn--primary btn--sm", type: "submit", text: "Add task" }),
          ])
        : null,

      data.tasks.length
        ? el("ul", { class: "ops-list" },
            data.tasks.map((task) =>
              el("li", { class: `ops-row ops-row--${task.priority.toLowerCase()}` }, [
                el("div", { class: "ops-row__main" }, [
                  el("p", { class: "ops-row__title", text: task.subject }),
                  el("p", { class: "ops-row__meta" }, [
                    el("span", { class: "ops-tag", text: task.priority }),
                    el("span", { text: task.due_date ? ` due ${formatDate(task.due_date)}` : " no due date" }),
                    task.owner.name ? el("span", { text: ` · ${task.owner.name}` }) : null,
                  ]),
                ]),
                el("div", { class: "ops-row__actions" },
                  ctx.can["tasks:write"]
                    ? [el("button", { class: "btn btn--ghost btn--sm", type: "button", onClick: () => complete(task), text: "Done" })]
                    : []
                ),
              ])
            )
          )
        : emptyState("Nothing open", "Add a task above, or enjoy the quiet."),

      el("p", { class: "ops-note", text: `${plural(data.open, "open task", "open tasks")}${data.overdue ? ` · ${data.overdue} overdue` : ""}.` }),
    ];
  });
}

/* ═══════════════════════════════════════════════════════════ analytics ═══ */

export async function renderAnalytics(container, ctx) {
  await renderWith(container, "Analytics", "Every rate shown with the numbers behind it.", () => ctx.api.analytics({ days: 30 }), (data) => {
    const conv = data.conversion.leads_to_cases;

    return [
      el("div", { class: "ops-stats" }, [
        statTile("Leads (30 days)", data.leads.total),
        statTile("Student cases", data.pipeline.total),
        statTile(
          "Lead → case",
          conv.rate === null ? "—" : `${Math.round(conv.rate * 100)}%`,
          { hint: `${conv.numerator} of ${conv.denominator}` }
        ),
        statTile("Median response", data.speed_to_lead.median_minutes === null ? "—" : `${data.speed_to_lead.median_minutes}m`, {
          tone: data.speed_to_lead.breached > 0 ? "alert" : "good",
          hint: `${data.speed_to_lead.breached} past the ${data.speed_to_lead.target_minutes}-minute promise`,
        }),
      ]),

      el("section", { class: "ops-panel" }, [
        el("h2", { class: "ops-panel__title", text: "Where leads come from" }),
        Object.keys(data.leads.by_source).length
          ? el("dl", { class: "app-data" },
              Object.entries(data.leads.by_source)
                .sort((a, b) => b[1] - a[1])
                .map(([source, count]) => dataRow(source, String(count)))
            )
          : emptyState("No leads in this window", "Sources appear once leads arrive."),
      ]),

      el("section", { class: "ops-panel" }, [
        el("h2", { class: "ops-panel__title", text: "Pipeline by stage" }),
        Object.keys(data.pipeline.by_stage).length
          ? el("dl", { class: "app-data" },
              Object.entries(data.pipeline.by_stage)
                .sort((a, b) => b[1] - a[1])
                .map(([stage, count]) => dataRow(stage, String(count)))
            )
          : emptyState("No student cases yet", "Cases appear as leads convert."),
      ]),

      el("p", {
        class: "ops-note",
        text: `Window: ${data.window_days} days. Rates are shown as a fraction so they can be checked, never as a bare percentage.`,
      }),
    ];
  });
}

/* ═══════════════════════════════════════════════════ collaboration CRM ═══ */

/** Which institution is open, and the register's filters. Survives re-renders. */
const collabState = { openId: null, type: "", stage: "", busy: false, vocabulary: null };

export async function renderCollaboration(container, ctx) {
  const load = async () => {
    if (collabState.openId) return ctx.api.getCollaborator(collabState.openId);
    // The register and its renewal queue answer one question together — "what is
    // the state of our partnerships, and what needs me" — so they load together.
    const [list, renewals] = await Promise.all([
      ctx.api.listCollaborators({ type: collabState.type || null, stage: collabState.stage || null }),
      ctx.api.collaboratorRenewals().catch(() => null),
    ]);
    return { ...list, renewals };
  };

  const title = collabState.openId ? "Partnership" : "Collaboration";
  const lede = collabState.openId
    ? "Everything recorded about this relationship."
    : "Universities, partners and agents — one register, one pipeline.";

  await renderWith(container, title, lede, load, (data) =>
    collabState.openId ? detail(container, ctx, data) : register(container, ctx, data)
  );
}

/* ── the register ─────────────────────────────────────────────────────────── */

function register(container, ctx, data) {
  const { summary, vocabulary, renewals } = data;
  // Held for the detail view, which is scoped to one relationship and so does not
  // carry the system's vocabulary with it.
  collabState.vocabulary = vocabulary;
  const reload = () => renderCollaboration(container, ctx);

  async function create(event) {
    event.preventDefault();
    if (collabState.busy) return;
    const form = event.target;
    const name = form.elements.name.value.trim();
    if (!name) return;
    collabState.busy = true;
    try {
      await ctx.api.createCollaborator({
        name,
        type: form.elements.type.value,
        country: form.elements.country.value.trim() || undefined,
      });
      ctx.toast(`${name} added to the register.`);
      await reload();
    } catch (err) {
      ctx.toast(err.userMessage ?? err.message, "error");
    } finally {
      collabState.busy = false;
    }
  }

  const filterRow = (label, key, values) =>
    el("div", { class: "ops-filters", role: "group", "aria-label": label },
      ["", ...values].map((value) =>
        el("button", {
          class: `chip chip--filter${collabState[key] === value ? " is-active" : ""}`,
          type: "button",
          "aria-pressed": String(collabState[key] === value),
          onClick: () => {
            collabState[key] = value;
            reload();
          },
          text: value || `All ${label.toLowerCase()}`,
        })
      )
    );

  return [
    el("div", { class: "ops-stats" }, [
      statTile("Institutions", summary.total),
      statTile("Active partnerships", summary.active, { tone: summary.active > 0 ? "good" : "neutral" }),
      statTile("In the pipeline", summary.open),
      statTile("Agreements to renew", renewals?.counts.renewals_due ?? summary.expiring_agreements.length, {
        tone: (renewals?.counts.renewals_due ?? summary.expiring_agreements.length) > 0 ? "alert" : "good",
        hint: "expiring or lapsed",
      }),
      statTile("Missing documents", renewals?.counts.missing_documents ?? 0, {
        tone: (renewals?.counts.missing_documents ?? 0) > 0 ? "alert" : "good",
        hint: "on active partnerships",
      }),
      statTile("Gone quiet", summary.stale.length, {
        tone: summary.stale.length > 0 ? "action" : "good",
        hint: `no contact in ${summary.stale_after_days} days`,
      }),
    ]),

    // Renewal intelligence: one worked queue, severity first. Computed by the
    // API from four failure modes that are each silent on their own.
    renewals?.items?.length
      ? el("section", { class: "ops-panel" }, [
          el("h2", { class: "ops-panel__title", text: `Needs attention (${renewals.counts.total})` }),
          el("ul", { class: "ops-alerts" },
            renewals.items.map((item) =>
              el("li", { class: `ops-alert ops-alert--${item.severity}` }, [
                el("p", { class: "ops-alert__title", text: item.title }),
                el("p", { class: "ops-alert__detail", text: item.detail }),
                el("button", {
                  class: "btn btn--ghost btn--sm",
                  type: "button",
                  onClick: () => open(item.institution.id),
                  text: "Open",
                }),
              ])
            )
          ),
          el("p", {
            class: "ops-note",
            text: `Renewals due ${renewals.counts.renewals_due} · missing documents ${renewals.counts.missing_documents} · ` +
              `unattended ${renewals.counts.sla_breaches} · gone quiet ${renewals.counts.inactive}. ` +
              `An active partnership is expected to be touched every ${renewals.sla_days} days.`,
          }),
        ])
      : renewals
        ? el("section", { class: "ops-panel" }, [
            emptyState("Nothing needs you right now", "Every agreement is in force, documented, and recently touched."),
          ])
        : null,

    ctx.can["collaboration:write"]
      ? el("form", { class: "ops-form", onSubmit: create }, [
          el("input", { class: "ops-input", name: "name", type: "text", placeholder: "Institution name", required: true, "aria-label": "Institution name" }),
          el("select", { class: "ops-input", name: "type", "aria-label": "Type" },
            vocabulary.types.map((type) => el("option", { value: type, text: type }))
          ),
          el("input", { class: "ops-input ops-input--date", name: "country", type: "text", placeholder: "Country", "aria-label": "Country" }),
          el("button", { class: "btn btn--primary btn--sm", type: "submit", text: "Add" }),
        ])
      : null,

    filterRow("Types", "type", vocabulary.types),
    filterRow("Stages", "stage", vocabulary.stages),

    data.collaborators.length
      ? el("ul", { class: "ops-list" },
          data.collaborators.map((inst) =>
            el("li", { class: `ops-row${inst.agreement.expired ? " ops-row--high" : ""}` }, [
              el("div", { class: "ops-row__main" }, [
                el("p", { class: "ops-row__title", text: inst.name }),
                el("p", { class: "ops-row__meta" }, [
                  el("span", { class: "ops-tag", text: inst.stage }),
                  el("span", { text: `${inst.type}${inst.country ? ` · ${inst.country}` : ""}` }),
                ]),
                el("p", { class: "ops-row__meta", text: agreementLine(inst) }),
              ]),
              el("div", { class: "ops-row__actions" }, [
                el("button", { class: "btn btn--ghost btn--sm", type: "button", onClick: () => open(inst.id), text: "Open" }),
              ]),
            ])
          )
        )
      : emptyState(
          collabState.type || collabState.stage ? "Nothing matches this filter" : "The register is empty",
          "Add a university, partner institution or agent above."
        ),

    el("p", { class: "ops-note", text: `${plural(data.count, "institution", "institutions")} shown.` }),
  ];

  function open(id) {
    collabState.openId = id;
    renderCollaboration(container, ctx);
  }
}

/**
 * One panel for programmes and for opportunities. They differ by which kinds they
 * accept, not by how they render — so they share a component rather than a
 * copy of one.
 */
function offeringPanel({ title, offerings, empty, kinds, writable, onAdd, levels }) {
  return el("section", { class: "ops-panel" }, [
    el("h2", { class: "ops-panel__title", text: title }),

    offerings.length
      ? el("ul", { class: "ops-list" },
          offerings.map((o) =>
            el("li", { class: `ops-row${o.deadline_passed ? " ops-row--high" : o.closing_soon ? " ops-row--waiting" : ""}` }, [
              el("div", { class: "ops-row__main" }, [
                el("p", { class: "ops-row__title", text: o.name }),
                el("p", { class: "ops-row__meta" }, [
                  el("span", { class: "ops-tag", text: o.kind }),
                  o.level ? el("span", { text: `${o.level} · ` }) : null,
                  el("span", { text: tuitionLine(o) }),
                ]),
                el("p", { class: "ops-row__meta", text: offeringTiming(o) }),
              ]),
            ])
          )
        )
      : emptyState(empty[0], empty[1]),

    writable
      ? el("form", { class: "ops-form", onSubmit: onAdd }, [
          el("input", { class: "ops-input", name: "name", type: "text", placeholder: "Name", required: true, "aria-label": "Name" }),
          el("select", { class: "ops-input", name: "kind", "aria-label": "Kind" },
            kinds.map((k) => el("option", { value: k, text: k }))
          ),
          levels.length
            ? el("select", { class: "ops-input", name: "level", "aria-label": "Level" },
                [el("option", { value: "", text: "Level" }), ...levels.map((l) => el("option", { value: l, text: l }))]
              )
            : null,
          el("input", { class: "ops-input ops-input--date", name: "tuition", type: "number", min: "0", placeholder: "Tuition", "aria-label": "Tuition" }),
          el("input", { class: "ops-input ops-input--date", name: "currency", type: "text", placeholder: "EUR", "aria-label": "Currency" }),
          el("input", { class: "ops-input", name: "intakes", type: "text", placeholder: "Intakes (comma separated)", "aria-label": "Intakes" }),
          el("input", { class: "ops-input ops-input--date", name: "deadline", type: "date", "aria-label": "Application deadline" }),
          el("button", { class: "btn btn--primary btn--sm", type: "submit", text: "Add" }),
        ])
      : null,
  ]);
}

/** Tuition with its currency, or an honest blank. Never a formatted guess. */
function tuitionLine(o) {
  if (o.tuition === null || o.tuition === undefined) return "Tuition not recorded";
  return `${o.currency ? `${o.currency} ` : ""}${o.tuition.toLocaleString()}${o.duration ? ` · ${o.duration}` : ""}`;
}

function offeringTiming(o) {
  const parts = [];
  if (o.intakes.length) parts.push(`Intakes: ${o.intakes.join(", ")}`);
  if (o.deadline) {
    parts.push(
      o.deadline_passed
        ? `deadline passed (${formatDate(o.deadline)})`
        : `apply by ${formatDate(o.deadline)}${o.closing_soon ? ` — ${o.days_to_deadline} days left` : ""}`
    );
  }
  return parts.join(" · ") || "No intake or deadline recorded";
}

function agreementLine(inst) {
  const a = inst.agreement;
  if (a.status === "None") return "No agreement recorded";
  if (a.expired) return `Agreement ${a.status.toLowerCase()} — expired ${a.expires_on}`;
  if (a.expires_on) return `Agreement ${a.status.toLowerCase()} — until ${formatDate(a.expires_on)}`;
  return `Agreement ${a.status.toLowerCase()}`;
}

/* ── one relationship ─────────────────────────────────────────────────────── */

function detail(container, ctx, data) {
  const { institution, contacts, meetings, documents, timeline, programs, opportunities, required_documents: checklist } = data;
  const reload = () => renderCollaboration(container, ctx);
  const writable = ctx.can["collaboration:write"];

  async function act(patch, message) {
    if (collabState.busy) return;
    collabState.busy = true;
    try {
      await ctx.api.updateCollaborator(institution.id, patch);
      ctx.toast(message);
      await reload();
    } catch (err) {
      ctx.toast(err.userMessage ?? err.message, "error");
    } finally {
      collabState.busy = false;
    }
  }

  async function addContact(event) {
    event.preventDefault();
    const form = event.target;
    const lastName = form.elements.last_name.value.trim();
    if (!lastName) return;
    try {
      await ctx.api.addCollaboratorContact(institution.id, {
        first_name: form.elements.first_name.value.trim() || undefined,
        last_name: lastName,
        email: form.elements.email.value.trim() || undefined,
        title: form.elements.title.value.trim() || undefined,
      });
      ctx.toast("Contact added.");
      await reload();
    } catch (err) {
      ctx.toast(err.userMessage ?? err.message, "error");
    }
  }

  async function addOffering(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.elements.name.value.trim();
    if (!name) return;
    try {
      await ctx.api.addCollaboratorOffering(institution.id, {
        name,
        kind: form.elements.kind.value,
        level: form.elements.level?.value || undefined,
        tuition: form.elements.tuition?.value ? Number(form.elements.tuition.value) : undefined,
        currency: form.elements.currency?.value.trim() || undefined,
        intakes: form.elements.intakes?.value.trim() || undefined,
        deadline: form.elements.deadline?.value || undefined,
      });
      ctx.toast(`${name} added.`);
      await reload();
    } catch (err) {
      ctx.toast(err.userMessage ?? err.message, "error");
    }
  }

  async function addMeeting(event) {
    event.preventDefault();
    const form = event.target;
    const title = form.elements.title.value.trim();
    const startsAt = form.elements.starts_at.value;
    if (!title || !startsAt) return;
    try {
      await ctx.api.addCollaboratorMeeting(institution.id, {
        title,
        starts_at: new Date(startsAt).toISOString(),
        venue: form.elements.venue.value.trim() || undefined,
      });
      ctx.toast("Meeting recorded.");
      await reload();
    } catch (err) {
      ctx.toast(err.userMessage ?? err.message, "error");
    }
  }

  return [
    el("p", null, [
      el("button", {
        class: "btn btn--ghost btn--sm",
        type: "button",
        onClick: () => {
          collabState.openId = null;
          reload();
        },
        text: "← Back to the register",
      }),
    ]),

    /* identity + status ---------------------------------------------------- */
    el("section", { class: "ops-panel" }, [
      el("h2", { class: "ops-panel__title", text: institution.name }),
      el("dl", { class: "app-data" }, [
        dataRow("Type", institution.type),
        dataRow("Partnership", institution.partnership_type),
        dataRow("Stage", institution.stage),
        dataRow("Location", [institution.city, institution.country].filter(Boolean).join(", ") || "—"),
        dataRow("Campuses", institution.campuses.length ? institution.campuses.join(" · ") : "—"),
        dataRow("Accreditation", institution.accreditation ?? "—"),
        dataRow(
          "International office",
          [institution.international_office.contact, institution.international_office.email].filter(Boolean).join(" · ") || "—"
        ),
        dataRow("Website", institution.website ?? "—"),
        dataRow("Agreement", agreementLine(institution)),
        dataRow("Owner", institution.owner.name ?? "Unassigned"),
      ]),

      writable && collabState.vocabulary
        ? el("p", null, [
            el("label", { class: "ops-row__meta", for: "partnership-type", text: "Partnership type " }),
            el("select", {
              class: "ops-input",
              id: "partnership-type",
              "aria-label": "Partnership type",
              onChange: (event) => act({ partnership_type: event.target.value }, `Partnership type set to ${event.target.value}.`),
            },
              collabState.vocabulary.partnership_types.map((type) =>
                el("option", { value: type, text: type, selected: institution.partnership_type === type })
              )
            ),
          ])
        : null,

      writable && collabState.vocabulary
        ? el("div", { class: "ops-filters", role: "group", "aria-label": "Move this partnership" },
            collabState.vocabulary.stages.map((stage) =>
              el("button", {
                class: `chip chip--filter${institution.stage === stage ? " is-active" : ""}`,
                type: "button",
                "aria-pressed": String(institution.stage === stage),
                onClick: () => act({ stage }, `Moved to ${stage}.`),
                text: stage,
              })
            )
          )
        : null,
    ]),

    /* contacts ------------------------------------------------------------- */
    el("section", { class: "ops-panel" }, [
      el("h2", { class: "ops-panel__title", text: `Contacts (${contacts.length})` }),
      contacts.length
        ? el("ul", { class: "ops-list" },
            contacts.map((c) =>
              el("li", { class: "ops-row" }, [
                el("div", { class: "ops-row__main" }, [
                  el("p", { class: "ops-row__title", text: c.name }),
                  el("p", { class: "ops-row__meta", text: [c.title, c.email, c.phone].filter(Boolean).join(" · ") || "No details recorded" }),
                ]),
              ])
            )
          )
        : emptyState("No contacts yet", "A partnership with no named person is a partnership with nobody to call."),
      writable
        ? el("form", { class: "ops-form", onSubmit: addContact }, [
            el("input", { class: "ops-input", name: "first_name", type: "text", placeholder: "First name", "aria-label": "First name" }),
            el("input", { class: "ops-input", name: "last_name", type: "text", placeholder: "Last name", required: true, "aria-label": "Last name" }),
            el("input", { class: "ops-input", name: "email", type: "email", placeholder: "Email", "aria-label": "Email" }),
            el("input", { class: "ops-input", name: "title", type: "text", placeholder: "Role", "aria-label": "Role" }),
            el("button", { class: "btn btn--primary btn--sm", type: "submit", text: "Add contact" }),
          ])
        : null,
    ]),

    /* meetings ------------------------------------------------------------- */
    el("section", { class: "ops-panel" }, [
      el("h2", { class: "ops-panel__title", text: "Meetings" }),
      meetings.upcoming.length
        ? el("ul", { class: "ops-list" },
            meetings.upcoming.map((m) =>
              el("li", { class: "ops-row ops-row--waiting" }, [
                el("div", { class: "ops-row__main" }, [
                  el("p", { class: "ops-row__title", text: m.title }),
                  el("p", { class: "ops-row__meta", text: `in ${plural(m.in_days, "day", "days")} · ${formatDateTime(m.starts_at)}${m.venue ? ` · ${m.venue}` : ""}` }),
                ]),
              ])
            )
          )
        : emptyState("Nothing scheduled", "No next meeting is on the calendar."),
      writable
        ? el("form", { class: "ops-form", onSubmit: addMeeting }, [
            el("input", { class: "ops-input", name: "title", type: "text", placeholder: "Meeting", required: true, "aria-label": "Meeting title" }),
            el("input", { class: "ops-input ops-input--date", name: "starts_at", type: "datetime-local", required: true, "aria-label": "Starts at" }),
            el("input", { class: "ops-input", name: "venue", type: "text", placeholder: "Where", "aria-label": "Venue" }),
            el("button", { class: "btn btn--primary btn--sm", type: "submit", text: "Record" }),
          ])
        : null,
    ]),

    /* documents ------------------------------------------------------------ */
    el("section", { class: "ops-panel" }, [
      el("h2", { class: "ops-panel__title", text: `Documents (${documents.length})` }),
      documents.length
        ? el("ul", { class: "ops-list" },
            documents.map((d) =>
              el("li", { class: "ops-row" }, [
                el("div", { class: "ops-row__main" }, [
                  el("p", { class: "ops-row__title", text: d.name }),
                  el("p", { class: "ops-row__meta", text: `${d.uploaded_at ? formatDate(d.uploaded_at) : "date unknown"}${d.uploaded_by ? ` · ${d.uploaded_by}` : ""}` }),
                ]),
              ])
            )
          )
        : emptyState("No documents", "Agreements and signed papers attached in the CRM appear here."),
    ]),

    /* required documents ---------------------------------------------------- */
    el("section", { class: "ops-panel" }, [
      el("h2", { class: "ops-panel__title", text: "Required documents" }),
      checklist.unenforceable
        ? emptyState(
            "No partnership type set",
            "Set the partnership type to know which documents this relationship requires."
          )
        : el("ul", { class: "ops-list" },
            checklist.items.map((item) =>
              el("li", { class: `ops-row${item.present ? "" : " ops-row--high"}` }, [
                el("div", { class: "ops-row__main" }, [
                  el("p", { class: "ops-row__title", text: item.label }),
                  el("p", { class: "ops-row__meta" }, [
                    el("span", { class: "ops-tag", text: item.present ? "on file" : "missing" }),
                  ]),
                ]),
              ])
            )
          ),
      !checklist.unenforceable && !checklist.complete
        ? el("p", {
            class: "ops-note",
            text: "An agreement we cannot produce is an agreement we cannot enforce. Attach the file in the CRM against this institution.",
          })
        : null,
    ]),

    /* programme catalogue --------------------------------------------------- */
    offeringPanel({
      title: `Programme catalogue (${programs.length})`,
      offerings: programs,
      empty: ["No programmes recorded", "Add the degrees this institution offers our students."],
      kinds: ["Degree"],
      writable,
      onAdd: addOffering,
      levels: collabState.vocabulary?.degree_levels ?? [],
    }),

    /* opportunities --------------------------------------------------------- */
    offeringPanel({
      title: `Opportunities (${opportunities.length})`,
      offerings: opportunities,
      empty: ["No opportunities recorded", "Scholarships, exchanges, research placements and internships appear here."],
      kinds: (collabState.vocabulary?.offering_kinds ?? []).filter((k) => k !== "Degree"),
      writable,
      onAdd: addOffering,
      levels: [],
    }),

    /* timeline ------------------------------------------------------------- */
    el("section", { class: "ops-panel" }, [
      el("h2", { class: "ops-panel__title", text: "History" }),
      timeline.length
        ? el("ul", { class: "ops-list" },
            timeline.map((entry) =>
              el("li", { class: "ops-row" }, [
                el("div", { class: "ops-row__main" }, [
                  el("p", { class: "ops-row__title", text: entry.title }),
                  el("p", { class: "ops-row__meta" }, [
                    el("span", { class: "ops-tag", text: entry.kind.replace(/_/g, " ") }),
                    el("span", { text: `${formatDate(entry.at)} · ${relativeTime(entry.at)}` }),
                  ]),
                  entry.detail ? el("p", { class: "ops-row__meta", text: entry.detail }) : null,
                ]),
              ])
            )
          )
        : emptyState("Nothing recorded yet", "Notes, meetings and agreement milestones appear here as they happen."),
      el("p", {
        class: "ops-note",
        text: "This history is assembled from notes, meetings and agreement dates. It is not stored separately, so it cannot drift from the records it describes.",
      }),
    ]),
  ];
}

/* ════════════════════════════════════════════ student operations ═══ */

/** Which student workspace is open. Survives re-renders, like the collab state. */
const studentState = { openId: null };

export async function renderStudents(container, ctx) {
  if (studentState.openId) return studentWorkspaceView(container, ctx);

  await renderWith(container, "Students", "Active cases, most recently updated first.", () => ctx.api.listStudents({ limit: 100 }), (data) =>
    data.students.length
      ? [
          el("ul", { class: "ops-list" },
            data.students.map((student) =>
              el("li", { class: "ops-row" }, [
                el("div", { class: "ops-row__main" }, [
                  el("p", { class: "ops-row__title", text: student.name }),
                  el("p", { class: "ops-row__meta" }, [
                    el("span", { class: "ops-tag", text: student.stage ?? "No stage" }),
                    student.next_deadline ? el("span", { text: ` next deadline ${formatDate(student.next_deadline)}` }) : null,
                    student.owner.name ? el("span", { text: ` · ${student.owner.name}` }) : null,
                  ]),
                ]),
                el("div", { class: "ops-row__actions" }, [
                  el("button", {
                    class: "btn btn--ghost btn--sm",
                    type: "button",
                    onClick: () => {
                      studentState.openId = student.id;
                      renderStudents(container, ctx);
                    },
                    text: "Open",
                  }),
                ]),
              ])
            )
          ),
          el("p", { class: "ops-note", text: `${plural(data.count, "case", "cases")} shown.` }),
        ]
      : [emptyState("No student cases yet", "A case is created when a lead converts.")]
  );
}

/**
 * The student workspace — six modules over one response.
 *
 * Every panel reuses the same ops-* components as every other surface. Nothing
 * here is student-specific chrome; only the questions differ.
 */
async function studentWorkspaceView(container, ctx) {
  await renderWith(
    container,
    "Student",
    "Everything on this case, from the record and the CRM.",
    () => ctx.api.getStudent(studentState.openId),
    (data) => {
      const { workspace, applications, documents, visa, communication, dashboard } = data;

      return [
        el("p", null, [
          el("button", {
            class: "btn btn--ghost btn--sm",
            type: "button",
            onClick: () => {
              studentState.openId = null;
              renderStudents(container, ctx);
            },
            text: "← Back to students",
          }),
        ]),

        /* dashboard --------------------------------------------------------- */
        el("div", { class: "ops-stats" }, [
          statTile("Applications", applications.counts.total, { hint: `${applications.counts.offers} offer(s)` }),
          statTile("Awaiting decision", applications.counts.awaiting_decision, {
            tone: applications.counts.awaiting_decision > 0 ? "action" : "neutral",
          }),
          statTile("Documents", `${documents.verified_count}/${documents.required_count}`, {
            tone: documents.complete ? "good" : "action",
            hint: documents.missing.length ? `${documents.missing.length} missing` : "all verified",
          }),
          statTile("Visa", visa.status, { tone: visa.status === "Refused" ? "alert" : visa.status === "Granted" ? "good" : "neutral" }),
          statTile("Last contact", communication.days_since_contact === null ? "—" : `${communication.days_since_contact}d`, {
            tone: (communication.days_since_contact ?? 0) >= dashboard.silent_after_days ? "action" : "neutral",
            hint: "days ago",
          }),
        ]),

        dashboard.attention.length
          ? el("section", { class: "ops-panel" }, [
              el("h2", { class: "ops-panel__title", text: `Needs attention (${dashboard.attention.length})` }),
              el("ul", { class: "ops-alerts" },
                dashboard.attention.map((item) =>
                  el("li", { class: `ops-alert ops-alert--${item.severity}` }, [
                    el("p", { class: "ops-alert__title", text: item.title }),
                    el("p", { class: "ops-alert__detail", text: item.detail }),
                  ])
                )
              ),
            ])
          : el("section", { class: "ops-panel" }, [
              emptyState("Nothing needs you on this student", "Documents in hand, applications moving, contact recent."),
            ]),

        /* 1. workspace ------------------------------------------------------ */
        el("section", { class: "ops-panel" }, [
          el("h2", { class: "ops-panel__title", text: workspace.name }),
          el("dl", { class: "app-data" }, [
            dataRow("Stage", workspace.stage ?? "—"),
            dataRow("Counsellor", workspace.counsellor.name ?? "Unassigned"),
            dataRow("Destination", workspace.destination ?? "—"),
            dataRow("Service package", workspace.service_package ?? "—"),
            dataRow(
              "Next deadline",
              workspace.next_deadline
                ? `${formatDate(workspace.next_deadline)}${workspace.deadline_passed ? " — passed" : ` (${workspace.days_to_deadline} days)`}`
                : "—"
            ),
            dataRow("Record", workspace.subject_id ?? "Not linked"),
          ]),
          !data.record_linked
            ? el("p", {
                class: "ops-note",
                text: "This case is not linked to a Career Record, so it has no history yet. The commercial frame above is all we hold.",
              })
            : null,
        ]),

        /* 2. application pipeline ------------------------------------------- */
        el("section", { class: "ops-panel" }, [
          el("h2", { class: "ops-panel__title", text: `Applications (${applications.counts.total})` }),
          applications.applications.length
            ? el("ul", { class: "ops-list" },
                applications.applications.map((app) =>
                  el("li", { class: `ops-row${app.state === "Rejected" ? " ops-row--high" : app.awaiting_decision ? " ops-row--waiting" : ""}` }, [
                    el("div", { class: "ops-row__main" }, [
                      el("p", { class: "ops-row__title", text: app.institution.name ?? "Institution not recorded" }),
                      el("p", { class: "ops-row__meta" }, [
                        el("span", { class: "ops-tag", text: app.state }),
                        app.programme ? el("span", { text: `${app.programme} · ` }) : null,
                        el("span", {
                          text: app.awaiting_decision
                            ? `waiting ${plural(app.waiting_days ?? 0, "day", "days")}`
                            : app.decided_at ? `decided ${formatDate(app.decided_at)}` : "not yet submitted",
                        }),
                      ]),
                    ]),
                  ])
                )
              )
            : emptyState("No applications recorded", "Applications appear here as they are recorded on the student's record."),
        ]),

        /* 3. document centre ------------------------------------------------ */
        el("section", { class: "ops-panel" }, [
          el("h2", { class: "ops-panel__title", text: `Documents (${documents.verified_count} of ${documents.required_count} verified)` }),
          el("ul", { class: "ops-list" },
            documents.checklist.map((item) =>
              el("li", { class: `ops-row${item.verified ? "" : item.present ? " ops-row--waiting" : " ops-row--high"}` }, [
                el("div", { class: "ops-row__main" }, [
                  el("p", { class: "ops-row__title", text: item.label }),
                  el("p", { class: "ops-row__meta" }, [el("span", { class: "ops-tag", text: item.state })]),
                ]),
              ])
            )
          ),
          documents.actions.length
            ? el("p", { class: "ops-note", text: `Next: ${documents.actions.map((a) => a.label).join(" · ")}` })
            : null,
        ]),

        /* 4. visa pipeline -------------------------------------------------- */
        el("section", { class: "ops-panel" }, [
          el("h2", { class: "ops-panel__title", text: `Visa — ${visa.status}` }),
          el("ul", { class: "ops-list" },
            visa.checklist.map((step) =>
              el("li", { class: `ops-row${step.done ? "" : " ops-row--waiting"}` }, [
                el("div", { class: "ops-row__main" }, [
                  el("p", { class: "ops-row__title", text: step.label }),
                  el("p", { class: "ops-row__meta" }, [el("span", { class: "ops-tag", text: step.done ? "done" : "outstanding" })]),
                ]),
              ])
            )
          ),
          visa.waiting_days !== null
            ? el("p", { class: "ops-note", text: `Lodged ${plural(visa.waiting_days, "day", "days")} ago, no decision recorded.` })
            : null,
          visa.diverges_from_crm
            ? el("p", {
                class: "ops-note",
                text: `The CRM says "${visa.crm_status}" while the record says "${visa.status}". Both are shown rather than one quietly winning — reconcile before relying on either.`,
              })
            : null,
        ]),

        /* 5. communication timeline ----------------------------------------- */
        el("section", { class: "ops-panel" }, [
          el("h2", { class: "ops-panel__title", text: `Communication (${communication.counts.total})` }),
          communication.items.length
            ? el("ul", { class: "ops-list" },
                communication.items.map((item) =>
                  el("li", { class: "ops-row" }, [
                    el("div", { class: "ops-row__main" }, [
                      el("p", { class: "ops-row__title", text: item.title }),
                      el("p", { class: "ops-row__meta" }, [
                        el("span", { class: "ops-tag", text: item.kind }),
                        el("span", { text: `${formatDate(item.at)} · ${relativeTime(item.at)}` }),
                        item.actor ? el("span", { text: ` · ${item.actor}` }) : null,
                      ]),
                      item.detail ? el("p", { class: "ops-row__meta", text: item.detail }) : null,
                    ]),
                  ])
                )
              )
            : emptyState("Nothing recorded", "Counselling sessions, notes, calls and meetings appear here."),
          el("p", {
            class: "ops-note",
            text: "Assembled from the Career Record and the CRM. Not stored separately, so it cannot drift from either.",
          }),
        ]),
      ];
    }
  );
}
