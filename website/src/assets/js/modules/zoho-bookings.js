/**
 * Zoho Bookings embed — self-serve consultation scheduling.
 *
 * Dormant until integrations.json carries a consultation_url; the fallback
 * (WhatsApp scheduling) stays in place meanwhile. Lazy-loaded like Forms.
 */
import { getConfig, isAllowedZohoUrl, whenVisible } from "./config.js";

export function initZohoBookings() {
  const slots = document.querySelectorAll("[data-zoho-bookings]");
  if (slots.length === 0) return;

  const { bookings } = getConfig();
  const url = bookings?.consultationUrl;
  if (!isAllowedZohoUrl(url)) return; // stay dormant, keep fallback

  for (const slot of slots) {
    whenVisible(slot, () => {
      const frame = document.createElement("iframe");
      frame.src = url;
      frame.title = "Book a free 30-minute consultation";
      frame.loading = "lazy";
      frame.className = "embed__frame";
      frame.style.height = `${parseInt(bookings.height, 10) || 700}px`;
      frame.setAttribute("aria-label", "Book a free 30-minute consultation");
      slot.replaceChildren(frame);
      slot.dataset.zohoBookingsState = "loaded";
    });
  }
}
