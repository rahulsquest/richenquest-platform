/**
 * Site entry point. Each module's init exits silently when its markup is absent (File 10 §5),
 * so this file stays a plain, safe list of initializers as the site grows.
 */
import { initNav } from "./modules/nav.js";

initNav();
