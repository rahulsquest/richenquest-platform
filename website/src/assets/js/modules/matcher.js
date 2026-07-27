/**
 * Destination matcher — a real, working tool. No AI, no backend, no network.
 *
 * It ranks destinations by comparing the student's answers against the SAME
 * verified facts published on each destination page (tuition, living cost,
 * intakes, work rights, post-study stay). Deterministic and explainable: every
 * result shows the reasoning that produced it.
 *
 * We deliberately do NOT call this AI. It is a transparent rules engine, and
 * saying otherwise would be the kind of claim this site exists to avoid.
 *
 * DATA CONTRACT: DESTINATIONS below mirrors the `match` block of
 * src/data/destinations/<slug>.json. scripts/validate-matcher-data.mjs fails
 * CI if the two ever drift, so the JSON stays the single source of truth.
 * `poststudy_months: null` means the source does not state a duration — it is
 * scored neutrally rather than guessed.
 */

const DESTINATIONS = [
  { slug: "germany", name: "Germany", flag: "🇩🇪", hook: "Europe's engineering powerhouse",
    tuition_eur_year: [0, 3000], living_eur_month: [850, 1200], intake_months: [10, 4],
    work_hours_week: 20, poststudy_months: 18, english: "wide" },
  { slug: "france", name: "France", flag: "🇫🇷", hook: "Culture, business schools and momentum",
    tuition_eur_year: [3000, 4000], living_eur_month: [800, 1400], intake_months: [9, 1],
    work_hours_week: 20, poststudy_months: null, english: "moderate" },
  { slug: "hungary", name: "Hungary", flag: "🇭🇺", hook: "The budget-smart EU route",
    tuition_eur_year: [1500, 8000], living_eur_month: [500, 900], intake_months: [9, 2],
    work_hours_week: 24, poststudy_months: null, english: "moderate" },
  { slug: "ireland", name: "Ireland", flag: "🇮🇪", hook: "English-speaking, industry-connected",
    tuition_eur_year: [10000, 25000], living_eur_month: [1000, 1500], intake_months: [9, 1],
    work_hours_week: 20, poststudy_months: 24, english: "native" },
  { slug: "italy", name: "Italy", flag: "🇮🇹", hook: "The most underrated destination in Europe",
    tuition_eur_year: [150, 4000], living_eur_month: [700, 1200], intake_months: [9, 10],
    work_hours_week: 20, poststudy_months: 12, english: "moderate" },
  { slug: "japan", name: "Japan", flag: "🇯🇵", hook: "Asia's quality-plus-opportunity corridor",
    tuition_eur_year: [3300, 3300], living_eur_month: [620, 930], intake_months: [4, 9],
    work_hours_week: 28, poststudy_months: 12, english: "moderate" },
  { slug: "netherlands", name: "Netherlands", flag: "🇳🇱", hook: "English-taught breadth, EU career doors",
    tuition_eur_year: [8000, 20000], living_eur_month: [900, 1400], intake_months: [9, 2],
    work_hours_week: 16, poststudy_months: 12, english: "wide" },
];

/**
 * DISCLOSURE — Constitution Article 5.4.
 *
 * Every recommendation carries its disclosure at the point it is made, not in a
 * policy page elsewhere. This mirrors src/data/disclosure.json; the register is
 * the source of truth and `scripts/validate-disclosure-data.mjs` fails CI if
 * these drift.
 *
 * `RELATED` is empty because RichenQuest currently holds no signed commercial
 * agreement with any institution. That is a fact about today, not a permanent
 * state — the moment an agreement is added to the register and to this list,
 * every result involving it starts disclosing automatically. Nothing about the
 * rendering needs to change, which is the point: disclosure is not a feature
 * someone remembers to add.
 */
const DISCLOSURE = {
  none: "We hold no commercial relationship with this destination or any institution in it.",
  prefix: "Disclosure: we hold a commercial relationship with",
};

/** Destination slugs where a disclosable relationship exists. Empty today. */
const RELATED = Object.freeze({});

/** The disclosure line for a destination — never optional, never omitted. */
export function disclosureFor(slug) {
  const rel = RELATED[slug];
  return rel ? `${DISCLOSURE.prefix} ${rel}.` : DISCLOSURE.none;
}

/** Budget bands in EUR per year, all-in (tuition + 12 months of living). */
const BUDGET_BANDS = {
  low: { max: 12000, label: "under €12,000" },
  mid: { max: 20000, label: "€12,000–20,000" },
  high: { max: 30000, label: "€20,000–30,000" },
  open: { max: Infinity, label: "over €30,000" },
};

const INTAKE_GROUPS = {
  autumn: [9, 10],
  winter: [1, 2],
  spring: [4],
  any: [],
};

const ENGLISH_RANK = { native: 3, wide: 2, moderate: 1 };

/** Lowest plausible all-in annual cost, and the typical (upper) figure. */
function annualCost(d) {
  const low = d.tuition_eur_year[0] + d.living_eur_month[0] * 12;
  const high = d.tuition_eur_year[1] + d.living_eur_month[1] * 12;
  return { low, high };
}

const money = (n) => "€" + Math.round(n).toLocaleString("en-IE");

/**
 * Score one destination against the answers. Returns a 0–100 fit plus the
 * human-readable reasons behind it. Weights are explicit so the ranking can
 * always be justified to a student.
 */
export function scoreDestination(d, answers) {
  const { budget = "open", intake = "any", priority = "cost" } = answers;
  const cost = annualCost(d);
  const cap = BUDGET_BANDS[budget]?.max ?? Infinity;

  let score = 0;
  const reasons = [];
  const cautions = [];

  // --- Budget (weight 40) — the single biggest real-world constraint. ---
  if (cost.low <= cap) {
    // Full marks when even the typical (upper) cost fits; partial when only
    // the lean end does, because that requires a cheaper city or a scholarship.
    if (cost.high <= cap) {
      score += 40;
      reasons.push(`Fits your budget — about ${money(cost.low)}–${money(cost.high)} a year all-in`);
    } else {
      score += 26;
      reasons.push(`Possible on your budget from about ${money(cost.low)} a year`);
      cautions.push(`Typical cost runs to ${money(cost.high)} — you would need a lower-cost city or funding`);
    }
  } else {
    reasons.push(`Costs about ${money(cost.low)}–${money(cost.high)} a year`);
    cautions.push("Above the budget you selected");
  }

  // --- Intake timing (weight 20) ---
  const wanted = INTAKE_GROUPS[intake] ?? [];
  if (!wanted.length) {
    score += 20;
  } else if (d.intake_months.some((m) => wanted.includes(m))) {
    score += 20;
    reasons.push("Has an intake in the window you want");
  } else {
    cautions.push("Main intake falls outside your preferred window");
  }

  // --- Stated priority (weight 30) ---
  if (priority === "cost") {
    const cheapness = Math.max(0, 1 - cost.low / 30000);
    score += Math.round(cheapness * 30);
    if (cost.low < 12000) reasons.push("One of the lowest total costs we cover");
  } else if (priority === "english") {
    score += ENGLISH_RANK[d.english] * 10;
    if (d.english === "native") reasons.push("English-speaking country — no language barrier");
    else if (d.english === "wide") reasons.push("Wide range of English-taught programs");
  } else if (priority === "work") {
    score += Math.min(30, Math.round((d.work_hours_week / 28) * 30));
    reasons.push(`You can work about ${d.work_hours_week} hours a week during term`);
  } else if (priority === "stay") {
    if (d.poststudy_months) {
      score += Math.min(30, Math.round((d.poststudy_months / 24) * 30));
      reasons.push(`${d.poststudy_months} months to look for work after you graduate`);
    } else {
      score += 15; // neutral — the source does not state a duration
      cautions.push("Post-study stay exists but the duration is not fixed in our data");
    }
  }

  // --- Origin nuance (weight 10) — sourced, not invented. ---
  if (answers.origin === "nepal" && d.slug === "japan") {
    score += 10;
    reasons.push("The most popular destination for Nepali students");
  } else {
    score += 5;
  }

  return {
    ...d,
    score: Math.max(0, Math.min(100, score)),
    reasons,
    cautions,
    costLow: cost.low,
    costHigh: cost.high,
  };
}

export function rankDestinations(answers, list = DESTINATIONS) {
  return list
    .map((d) => scoreDestination(d, answers))
    .sort((a, b) => b.score - a.score || a.costLow - b.costLow);
}

const fitLabel = (score) =>
  score >= 78 ? "Strong fit" : score >= 58 ? "Good fit" : score >= 38 ? "Possible" : "Stretch";

const fitClass = (score) =>
  score >= 78 ? "is-strong" : score >= 58 ? "is-good" : score >= 38 ? "is-possible" : "is-stretch";

/** Escape anything interpolated into markup — data is ours, but this keeps
 *  the rule "never build HTML from unescaped values" unconditional. */
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

function resultMarkup(d, index) {
  const reasons = d.reasons.map((r) => `<li>${esc(r)}</li>`).join("");
  const cautions = d.cautions.length
    ? `<ul class="match-result__cautions">${d.cautions.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`
    : "";
  return `
    <article class="match-result ${fitClass(d.score)}" style="--i:${index}">
      <div class="match-result__head">
        <span class="match-result__flag" aria-hidden="true">${esc(d.flag)}</span>
        <div>
          <h3 class="match-result__name">${esc(d.name)}</h3>
          <p class="match-result__hook">${esc(d.hook)}</p>
        </div>
        <span class="match-result__fit">${esc(fitLabel(d.score))}</span>
      </div>
      <ul class="match-result__reasons">${reasons}</ul>
      ${cautions}
      <p class="match-result__disclosure">
        <svg class="icon icon--sm" aria-hidden="true"><use href="/assets/img/icons.svg#icon-shield"></use></svg>
        <span>${esc(disclosureFor(d.slug))}</span>
      </p>
      <a class="btn btn--ghost btn--sm" href="/destinations/${esc(d.slug)}/">
        Full ${esc(d.name)} guide
      </a>
    </article>`;
}

/**
 * Wire the form. Exits silently when the markup is absent (File 10 §5), and
 * the page stays fully useful without JS — the no-script list is the fallback.
 */
export function initMatcher() {
  const form = document.querySelector("[data-matcher]");
  if (!form) return;

  const output = form.querySelector("[data-matcher-results]");
  const list = form.querySelector("[data-matcher-list]");
  const summary = form.querySelector("[data-matcher-summary]");
  const fallback = document.querySelector("[data-matcher-fallback]");
  if (!output || !list) return;

  // JS is available: retire the no-JS list so results are not duplicated.
  if (fallback) fallback.hidden = true;

  const run = (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const answers = {
      budget: data.get("budget") || "open",
      intake: data.get("intake") || "any",
      priority: data.get("priority") || "cost",
      origin: data.get("origin") || "india",
    };

    const ranked = rankDestinations(answers);
    list.innerHTML = ranked.map(resultMarkup).join("");

    if (summary) {
      const band = BUDGET_BANDS[answers.budget]?.label ?? "any budget";
      summary.textContent =
        `${ranked.length} destinations ranked for a budget of ${band} a year. ` +
        `Top match: ${ranked[0].name}.`;
    }

    output.hidden = false;
    // Move focus to the results so keyboard and screen-reader users land there.
    output.setAttribute("tabindex", "-1");
    output.focus({ preventScroll: true });
    output.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  form.addEventListener("submit", run);
  form.addEventListener("reset", () => {
    output.hidden = true;
    list.innerHTML = "";
  });
}

export { DESTINATIONS, BUDGET_BANDS, annualCost };
