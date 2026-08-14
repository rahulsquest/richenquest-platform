/** Copies utm_source / utm_medium / utm_campaign from the query string into the
 *  hidden lead-form inputs, so paid-campaign attribution reaches CRM.
 *  Exits silently when no form is present (File 10 §5). The CRM fields exist and
 *  the webform carries them (LEADCF10/11/12, verified 2026-08-15). */
export function initUtm() {
  const targets = document.querySelectorAll("[data-utm]");
  if (targets.length === 0) return;
  const params = new URLSearchParams(window.location.search);
  for (const el of targets) {
    const value = params.get(el.dataset.utm);
    if (value) el.value = value.slice(0, 255);
  }
}
