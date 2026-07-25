/** Scroll reveal for [data-reveal] elements (Animation guidelines, /styleguide/).
 *  Progressive enhancement: content is fully visible without JS; this module
 *  adds .reveal-ready (hides) then .is-revealed (fades in) as elements enter
 *  the viewport. Skips entirely when the user prefers reduced motion. */
export function initReveal() {
  const elements = [...document.querySelectorAll("[data-reveal]")];
  if (elements.length === 0) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;
  // Where the browser supports native scroll-driven animations, components/motion.css
  // owns the reveal outright. Running both would leave two systems writing the same
  // opacity — so this module stands down and becomes the fallback path only.
  if (window.CSS?.supports?.("animation-timeline: view()")) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" }
  );

  for (const el of elements) {
    el.classList.add("reveal-ready");
    observer.observe(el);
  }
}
