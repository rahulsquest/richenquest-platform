/**
 * DOM construction helpers.
 *
 * Everything is built as nodes and inserted with textContent. innerHTML is not
 * used anywhere in the dashboard, on purpose: this surface renders payloads
 * written by counsellors, partners and automated suggestions, and a record that
 * can execute what it contains is not a record.
 */

/**
 * el("div", { class: "x", dataset: { app: "y" } }, [child, "text"])
 * Attribute values of null/undefined/false are skipped, so callers can write
 * conditionals inline without building attribute objects by hand.
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "dataset") {
      for (const [dk, dv] of Object.entries(value)) {
        if (dv !== null && dv !== undefined) node.dataset[dk] = String(dv);
      }
    } else if (key === "class") {
      node.className = String(value);
    } else if (key === "text") {
      node.textContent = String(value);
    } else if (key === "html") {
      throw new Error("el(): raw HTML is not permitted in the dashboard");
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(value));
    }
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
};

export function replace(node, children) {
  clear(node);
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const show = (node, visible = true) => {
  if (node) node.hidden = !visible;
  return node;
};

export const qs = (selector, root = document) => root.querySelector(selector);
export const app = (name, root = document) => root.querySelector(`[data-app="${name}"]`);

/* ------------------------------------------------------------- fragments --- */

/** Section heading with a stable id the view container labels itself with. */
export function viewHeader(id, title, lede = null) {
  return el("header", { class: "app-view__head" }, [
    el("h1", { class: "app-view__title", id, text: title }),
    lede ? el("p", { class: "app-view__lede", text: lede }) : null,
  ]);
}

export function emptyState(title, detail) {
  return el("div", { class: "app-empty" }, [
    el("p", { class: "app-empty__title", text: title }),
    detail ? el("p", { class: "app-empty__detail", text: detail }) : null,
  ]);
}

export function errorState(message, onRetry = null) {
  return el("div", { class: "app-error", role: "alert" }, [
    el("p", { class: "app-error__message", text: message }),
    el("p", { class: "app-error__note", text: "Nothing was changed. Your record is unaffected." }),
    onRetry ? el("button", { class: "btn btn--ghost btn--sm", type: "button", onClick: onRetry, text: "Try again" }) : null,
  ]);
}

export const loadingState = (label = "Loading…") =>
  el("p", { class: "app-loading", role: "status", text: label });

/** Definition row used by the record, profile and event panels. */
export function dataRow(label, value, { mono = false } = {}) {
  return el("div", { class: "app-data__row" }, [
    el("dt", { class: "app-data__label", text: label }),
    el("dd", { class: `app-data__value${mono ? " app-data__value--mono" : ""}`, text: value }),
  ]);
}
