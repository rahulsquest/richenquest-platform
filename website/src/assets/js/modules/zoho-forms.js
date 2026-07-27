/**
 * Zoho Forms embed — the consultation request form (Forms → CRM Leads).
 *
 * Dormant until integrations.json carries a consultation_url. While dormant the
 * component's fallback (real WhatsApp/email CTAs) stays in place — we never
 * show a form that cannot submit (founder decision 8).
 *
 * Lazy: the iframe is created only when the slot scrolls near the viewport,
 * so Zoho's payload never competes with first paint.
 */
import { getConfig, isAllowedZohoUrl, whenVisible } from "./config.js";

export function initZohoForms() {
  const slots = document.querySelectorAll("[data-zoho-form]");
  if (slots.length === 0) return;

  const { forms } = getConfig();
  const url = forms?.consultationUrl;
  if (!isAllowedZohoUrl(url)) return; // stay dormant, keep fallback

  for (const slot of slots) {
    whenVisible(slot, () => {
      const frame = document.createElement("iframe");
      frame.src = url;
      frame.title = "Free consultation request form";
      frame.loading = "lazy";
      frame.className = "embed__frame";
      frame.style.height = `${parseInt(forms.height, 10) || 820}px`;
      frame.setAttribute("aria-label", "Free consultation request form");
      slot.replaceChildren(frame);
      slot.dataset.zohoFormState = "loaded";
    });
  }
}
