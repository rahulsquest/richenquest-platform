/** Mobile navigation toggle for the header component (hook: [data-nav-toggle]).
 *  Closes on Escape and on click/tap outside the header. */
export function initNav() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };

  toggle.addEventListener("click", () => {
    setOpen(!nav.classList.contains("is-open"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!nav.classList.contains("is-open")) return;
    if (event.target.closest(".site-header")) return;
    setOpen(false);
  });
}
