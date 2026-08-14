/**
 * Site entry point. Each module's init exits silently when its markup is absent
 * (File 10 §5), so this file stays a plain, safe list of initializers.
 */
import { initNav } from "./modules/nav.js";
import { initDisclosures } from "./modules/disclosure.js";
import { initReveal } from "./modules/reveal.js";
import { initUtm } from "./modules/utm.js";

initNav();
initDisclosures();
initReveal();
initUtm();
