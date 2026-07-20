/**
 * Integration configuration reader + safety helpers.
 *
 * Config is published as inert JSON by components/integrations-config.html,
 * sourced from data/integrations.json. Nothing here hard-codes an ID or URL.
 */

let cached = null;

/** Returns the integrations config object; {} if absent or malformed. */
export function getConfig() {
  if (cached) return cached;
  const node = document.getElementById("rq-integrations");
  if (!node) return (cached = {});
  try {
    cached = JSON.parse(node.textContent) ?? {};
  } catch {
    cached = {};
  }
  return cached;
}

/**
 * Defence in depth: only ever embed https URLs on Zoho-owned hosts, even
 * though config is repo-controlled. A misconfiguration must not become an
 * injection vector.
 */
const ALLOWED_HOST = /(^|\.)(zoho\.(com|in|eu)|zohopublic\.(com|in|eu)|zohobookings\.(com|in))$/i;

export function isAllowedZohoUrl(value) {
  if (!value) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && ALLOWED_HOST.test(url.hostname);
}

/**
 * Non-essential-cookie consent (DPDP/GDPR). Returns true only on an explicit
 * stored grant. The consent banner that writes this value lands with the
 * analytics work; until then this is always false, so consent-gated
 * integrations stay off — the correct default.
 */
export function hasAnalyticsConsent() {
  try {
    return localStorage.getItem("rq-consent-analytics") === "granted";
  } catch {
    return false;
  }
}

/** Loads an element into view once, then runs `onVisible` (lazy embeds). */
export function whenVisible(element, onVisible) {
  if (!("IntersectionObserver" in window)) {
    onVisible();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.disconnect();
        onVisible();
      }
    },
    { rootMargin: "200px" }
  );
  observer.observe(element);
}
