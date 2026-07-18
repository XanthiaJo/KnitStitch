// panelResizer.js - Vertical drag-to-resize for stacked sidebar panels.
//
// Each .workspace-panel is a CSS grid of stacked .container-section--headed
// cards. This module injects a thin .panel-resizer handle between each pair
// of visible cards and lets the user drag it to trade height between the two
// adjacent cards. Heights are stored as fractional (fr) ratios per workspace
// in localStorage, so they scale with the window size.
//
// Cards become independent scroll containers when resizable: the card header
// stays fixed and the .container-section-body scrolls internally (see the
// `.workspace-panel.is-resizable` rules in app.css).
//
// Each workspace is independent (its own persisted ratio set), and workspaces
// with fewer than 2 visible cards are left alone (no resizers injected).

const STORAGE_PREFIX = 'knitstitch.panelRows.';
const RESIZER_CLASS = 'panel-resizer';
const CARD_SELECTOR = '.container-section--headed, .panel';
const MIN_CARD_PX = 80;   // absolute floor for a card track (minmax min)
const MIN_FR = 0.05;      // fractional floor while dragging
const KEYBOARD_STEP = 0.02;

function normalizeRatios(ratios) {
  const sum = ratios.reduce((a, b) => a + b, 0) || 1;
  return ratios.map((r) => r / sum);
}

export function calculatePanelHeights(
  availableHeight,
  ratios,
  minCardHeight = MIN_CARD_PX,
  handleHeight = 14,
) {
  const normalized = normalizeRatios(ratios);
  const handleCount = Math.max(0, normalized.length - 1);
  const flexibleHeight = Math.max(
    0,
    availableHeight - handleCount * handleHeight - normalized.length * minCardHeight,
  );
  return normalized.map((ratio) => minCardHeight + flexibleHeight * ratio);
}

export function clampPanelDragDelta(requestedDelta, leftFlexible, rightFlexible) {
  return Math.max(-leftFlexible, Math.min(rightFlexible, requestedDelta));
}

export function setupPanelResizers({
  documentObj = globalThis.document,
  windowObj = globalThis.window,
} = {}) {
  // panelId -> number[] of fr ratios, one per visible card (in DOM order)
  const ratiosByPanel = new Map();
  let pendingRefresh = null;

  function loadRatios(panelId, count) {
    let ratios = null;
    try {
      const raw = windowObj.localStorage.getItem(STORAGE_PREFIX + panelId);
      if (raw) ratios = JSON.parse(raw);
    } catch {
      ratios = null;
    }
    if (
      !Array.isArray(ratios) ||
      ratios.length !== count ||
      !ratios.every((n) => Number.isFinite(n) && n >= 0)
    ) {
      ratios = new Array(count).fill(1 / count);
    }
    return normalizeRatios(ratios);
  }

  function saveRatios(panelId, ratios) {
    try {
      windowObj.localStorage.setItem(
        STORAGE_PREFIX + panelId,
        JSON.stringify(ratios),
      );
    } catch {
      /* ignore quota / privacy errors */
    }
  }

  function isCardVisible(el) {
    if (!el) return false;
    if (el.style.display === 'none') return false;
    const cs = windowObj.getComputedStyle(el);
    return cs.display !== 'none';
  }

  function allCardChildren(panel) {
    return Array.from(panel.querySelectorAll(`:scope > ${CARD_SELECTOR}`));
  }

  function visibleCards(panel) {
    return allCardChildren(panel).filter(isCardVisible);
  }

  function buildTemplateRows(panel, visibleList) {
    const ratios = ratiosByPanel.get(panel.id);
    const visibleSet = new Set(visibleList);
    const tracks = [];
    let visibleIdx = 0;
    const availableHeight = panel.clientHeight || panel.getBoundingClientRect().height;
    const panelHeights = calculatePanelHeights(availableHeight, ratios);

    // Use explicit pixel tracks for the current layout rather than asking
    // CSS Grid to resolve fr tracks on every pointer event. The ratios are
    // still persisted, but converting them against the panel's actual height
    // makes the rows add up exactly and prevents minmax() from reclaiming
    // space with a visible snap when a card reaches its minimum.
    Array.from(panel.children).forEach((child) => {
      if (child.classList.contains(RESIZER_CLASS)) {
        tracks.push('14px');
        return;
      }
      if (!child.matches(CARD_SELECTOR) || !visibleSet.has(child)) return;
      const height = panelHeights[visibleIdx] ?? MIN_CARD_PX;
      tracks.push(`${height}px`);
      visibleIdx += 1;
    });
    return tracks.join(' ');
  }

  function injectResizers(panel, visibleList) {
    panel.querySelectorAll(`:scope > .${RESIZER_CLASS}`).forEach((r) => r.remove());
    visibleList.forEach((card, i) => {
      if (i === visibleList.length - 1) return;
      const handle = documentObj.createElement('div');
      handle.className = RESIZER_CLASS;
      handle.dataset.left = String(i);
      handle.dataset.right = String(i + 1);
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'horizontal');
      handle.setAttribute('aria-label', 'Resize panels');
      handle.tabIndex = 0;
      card.after(handle);
      wireHandle(panel, handle);
    });
  }

  function refresh(panel) {
    const cards = visibleCards(panel);
    if (cards.length < 2) {
      panel.classList.remove('is-resizable');
      panel.style.gridTemplateRows = '';
      panel.querySelectorAll(`:scope > .${RESIZER_CLASS}`).forEach((r) => r.remove());
      ratiosByPanel.delete(panel.id);
      return;
    }
    const current = ratiosByPanel.get(panel.id);
    if (!current || current.length !== cards.length) {
      ratiosByPanel.set(panel.id, loadRatios(panel.id, cards.length));
    }
    panel.classList.add('is-resizable');
    injectResizers(panel, cards);
    panel.style.gridTemplateRows = buildTemplateRows(panel, cards);
  }

  function refreshAll() {
    documentObj.querySelectorAll('.workspace-panel').forEach(refresh);
  }

  function applyRatios(panel) {
    panel.style.gridTemplateRows = buildTemplateRows(panel, visibleCards(panel));
  }

  function wireHandle(panel, handle) {
    if (handle.dataset.wired) return;
    handle.dataset.wired = '1';
    handle.addEventListener('pointerdown', (e) => onDragStart(panel, handle, e));
    handle.addEventListener('keydown', (e) => onKeydown(panel, handle, e));
  }

  function clampFr(v) {
    return Math.max(MIN_FR, v);
  }

  function adjustPair(ratios, leftIdx, rightIdx, dFr) {
    const next = ratios.slice();
    next[leftIdx] = clampFr(next[leftIdx] + dFr);
    next[rightIdx] = clampFr(next[rightIdx] - dFr);
    if (next[leftIdx] <= MIN_FR || next[rightIdx] <= MIN_FR) return null;
    return next;
  }

  function onKeydown(panel, handle, e) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const leftIdx = Number(handle.dataset.left);
    const rightIdx = Number(handle.dataset.right);
    const ratios = ratiosByPanel.get(panel.id);
    if (!ratios) return;
    const d = e.key === 'ArrowUp' ? KEYBOARD_STEP : -KEYBOARD_STEP;
    const next = adjustPair(ratios, leftIdx, rightIdx, d);
    if (!next) return;
    ratiosByPanel.set(panel.id, next);
    applyRatios(panel);
    saveRatios(panel.id, next);
  }

  function onDragStart(panel, handle, e) {
    e.preventDefault();
    const leftIdx = Number(handle.dataset.left);
    const rightIdx = Number(handle.dataset.right);
    const ratios = ratiosByPanel.get(panel.id);
    const cards = visibleCards(panel);
    if (!ratios || !cards[leftIdx] || !cards[rightIdx]) return;

    // Drag in the same units the CSS grid is actually using. Each card has
    // an 80px minimum, so only the portion above that minimum is flexible.
    // Measuring the current cards avoids converting against the panel's full
    // height (which includes handles and minimum tracks) and prevents a
    // sudden jump when either neighbour reaches its minimum.
    const startFlex = cards.map((card) =>
      Math.max(0, card.getBoundingClientRect().height - MIN_CARD_PX),
    );
    if (startFlex[leftIdx] + startFlex[rightIdx] <= 0) return;

    const startY = e.clientY;
    const startRatios = ratios.slice();

    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture can throw if the pointer was already released */
    }
    handle.classList.add('is-active');
    documentObj.body.classList.add('is-panel-resizing');

    const onMove = (ev) => {
      const requestedDelta = ev.clientY - startY;
      const delta = clampPanelDragDelta(
        requestedDelta,
        startFlex[leftIdx],
        startFlex[rightIdx],
      );
      const nextFlex = startFlex.slice();
      nextFlex[leftIdx] += delta;
      nextFlex[rightIdx] -= delta;

      // Ratios may legitimately reach zero: CSS minmax() still keeps the
      // corresponding card at MIN_CARD_PX, and allowing zero means the
      // pointer can stop exactly at the boundary without oscillating.
      const next = normalize(nextFlex);
      ratiosByPanel.set(panel.id, next);
      applyRatios(panel);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      handle.classList.remove('is-active');
      documentObj.body.classList.remove('is-panel-resizing');
      saveRatios(panel.id, ratiosByPanel.get(panel.id));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  // Observe each workspace for card add/remove or display toggles (e.g. the
  // Templates Measurements panel) so the resizer layout re-runs automatically.
  // Mutations caused by our own resizer injection / grid-template-rows writes
  // are filtered out to avoid feedback loops.
  function observe(panel) {
    const obs = new windowObj.MutationObserver((muts) => {
      if (pendingRefresh) return;
      const significant = muts.some((m) => {
        if (m.type === 'childList') {
          const added = Array.from(m.addedNodes).some(
            (n) => n.nodeType === 1 && !n.classList.contains(RESIZER_CLASS),
          );
          const removed = Array.from(m.removedNodes).some(
            (n) => n.nodeType === 1 && !n.classList.contains(RESIZER_CLASS),
          );
          return added || removed;
        }
        if (m.type === 'attributes' && m.attributeName === 'style') {
          // Ignore our own grid-template-rows write on the panel itself.
          if (m.target === panel) return false;
          // A card's inline display toggling is significant.
          return true;
        }
        return false;
      });
      if (!significant) return;
      pendingRefresh = true;
      windowObj.requestAnimationFrame(() => {
        pendingRefresh = false;
        refresh(panel);
      });
    });
    obs.observe(panel, {
      childList: true,
      subtree: false,
      attributes: true,
      attributeFilter: ['style'],
    });
  }

  function init() {
    documentObj.querySelectorAll('.workspace-panel').forEach((panel) => {
      observe(panel);
      refresh(panel);
    });
    // fr ratios scale with the container, so resize mostly re-clamps mins.
    let resizeTimer = null;
    windowObj.addEventListener('resize', () => {
      if (resizeTimer) windowObj.clearTimeout(resizeTimer);
      resizeTimer = windowObj.setTimeout(refreshAll, 80);
    });
  }

  init();

  return {
    refresh,
    refreshAll,
  };
}
