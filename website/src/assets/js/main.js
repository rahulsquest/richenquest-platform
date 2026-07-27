/**
 * Site entry point. Each module's init exits silently when its markup is absent
 * (File 10 §5), so this file stays a plain, safe list of initializers.
 *
 * Zoho modules additionally stay dormant until data/integrations.json carries
 * their configuration — see docs/14-zoho-integration.md.
 */
import { initNav } from "./modules/nav.js";
import { initDisclosures } from "./modules/disclosure.js";
import { initReveal } from "./modules/reveal.js";
import { initMatcher } from "./modules/matcher.js";
import { initZohoForms } from "./modules/zoho-forms.js";
import { initZohoBookings } from "./modules/zoho-bookings.js";
import { initZohoSalesIq } from "./modules/zoho-salesiq.js";

initNav();
initDisclosures();
initReveal();
initMatcher();

initZohoForms();
initZohoBookings();
initZohoSalesIq();
