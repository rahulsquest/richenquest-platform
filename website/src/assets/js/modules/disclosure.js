/** Generic disclosure: any [data-disclosure="targetId"] button toggles the
 *  `hidden` attribute on its target and keeps aria-expanded in sync.
 *  Powers nav dropdowns and any future expand/collapse UI. Only one
 *  disclosure inside the same [data-disclosure-group] stays open at a time.
 *  Open disclosures close on Escape and on click outside toggle+panel. */
export function initDisclosures() {
  const toggles = [...document.querySelectorAll("[data-disclosure]")];
  if (toggles.length === 0) return;

  const panelOf = (toggle) => document.getElementById(toggle.dataset.disclosure);

  const setOpen = (toggle, open) => {
    const panel = panelOf(toggle);
    if (!panel) return;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };

  const closeAll = (except) => {
    for (const t of toggles) if (t !== except) setOpen(t, false);
  };

  for (const toggle of toggles) {
    setOpen(toggle, toggle.getAttribute("aria-expanded") === "true");
    toggle.addEventListener("click", () => {
      const willOpen = toggle.getAttribute("aria-expanded") !== "true";
      const group = toggle.closest("[data-disclosure-group]");
      if (willOpen && group) {
        for (const t of toggles) {
          if (t !== toggle && t.closest("[data-disclosure-group]") === group) setOpen(t, false);
        }
      }
      setOpen(toggle, willOpen);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAll();
  });

  document.addEventListener("click", (event) => {
    for (const toggle of toggles) {
      if (toggle.getAttribute("aria-expanded") !== "true") continue;
      const panel = panelOf(toggle);
      if (event.target === toggle || toggle.contains(event.target)) continue;
      if (panel && panel.contains(event.target)) continue;
      setOpen(toggle, false);
    }
  });
}
