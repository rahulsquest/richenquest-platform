/**
 * Zoho SalesIQ live chat (and, later, the AI answer bot).
 *
 * Two independent gates, both required:
 *   1. a widget_code in integrations.json (Zoho org activated), and
 *   2. explicit visitor consent for non-essential cookies (DPDP/GDPR).
 *
 * SalesIQ sets tracking cookies, so loading it before consent would be a
 * compliance breach. With no consent banner shipped yet, this stays off —
 * the correct default. When the banner lands it only has to write the consent
 * value and dispatch `rq:consent-granted`; chat then loads without a rebuild.
 *
 * Loading is deferred to first interaction or idle so chat never competes
 * with first paint (facade pattern, File 09 §3.5).
 */
import { getConfig, hasAnalyticsConsent } from "./config.js";

let started = false;

function loadSalesIq(widgetCode, domain) {
  if (started) return;
  started = true;

  const host = /^[a-z0-9.-]+\.zoho(public)?\.(com|in|eu)$/i.test(domain)
    ? domain
    : "salesiq.zohopublic.in";

  window.$zoho = window.$zoho || {};
  window.$zoho.salesiq = window.$zoho.salesiq || { ready: () => {} };

  const script = document.createElement("script");
  script.id = "zsiqscript";
  script.src = `https://${host}/widget?wc=${encodeURIComponent(widgetCode)}`;
  script.defer = true;
  document.body.appendChild(script);
}

export function initZohoSalesIq() {
  const { salesiq } = getConfig();
  const widgetCode = salesiq?.widgetCode;
  if (!widgetCode) return; // dormant: Zoho org not activated yet

  const start = () => loadSalesIq(widgetCode, salesiq.domain);

  const startWhenIdle = () => {
    const events = ["pointerdown", "keydown", "scroll"];
    const onFirst = () => {
      for (const e of events) window.removeEventListener(e, onFirst);
      start();
    };
    for (const e of events) window.addEventListener(e, onFirst, { once: true, passive: true });
    if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 8000 });
    else setTimeout(start, 6000);
  };

  if (hasAnalyticsConsent()) {
    startWhenIdle();
    return;
  }

  // Consent may arrive later in the session (banner writes it and fires this).
  window.addEventListener("rq:consent-granted", startWhenIdle, { once: true });
}
