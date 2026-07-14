/**
 * Shared DOM helpers used by all panel controllers.
 *
 * Extracted from mainUi.js so each panel controller can bind elements
 * and toggle active state without duplicating boilerplate.
 */

export function getElement(documentObj, id) {
  return documentObj?.getElementById?.(id) ?? null;
}

export function bindIfPresent(element, eventName, handler) {
  if (!element) return;
  element.addEventListener(eventName, handler);
}

export function toggleActive(element, active) {
  if (!element) return;
  element.classList.toggle('button-primary', !!active);
}

/**
 * Collects multiple DOM elements by ID into a refs object.
 *
 * @param {Document} documentObj
 * @param {Record<string, string>} ids - map of ref name → element ID
 * @returns {Record<string, HTMLElement|null>}
 */
export function collectRefs(documentObj, ids) {
  const refs = {};
  for (const [name, id] of Object.entries(ids)) {
    refs[name] = getElement(documentObj, id);
  }
  return refs;
}
