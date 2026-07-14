import { collectRefs, bindIfPresent } from './uiUtils.js';

const REF_IDS = {
  overlayFileInput: 'overlay-file',
  overlayBrowseBtn: 'overlay-browse',
  overlayClearBtn: 'overlay-clear',
  overlayShowCheck: 'overlay-show',
  overlayOpacitySlider: 'overlay-opacity',
  overlayPathText: 'overlay-path',
};

/**
 * Owns the overlay sidebar: image browse/clear, visibility toggle, opacity.
 */
export function setupOverlayPanel({ store, documentObj = globalThis.document }) {
  const refs = collectRefs(documentObj, REF_IDS);

  function updateOverlaySidebar() {
    const src = store.get('overlayImageSrc');
    const visible = store.get('overlayVisible');
    const opacity = store.get('overlayOpacity');
    if (refs.overlayPathText) refs.overlayPathText.value = src ? 'Image loaded' : 'No image selected';
    if (refs.overlayShowCheck) refs.overlayShowCheck.checked = visible;
    if (refs.overlayOpacitySlider) refs.overlayOpacitySlider.value = Math.round((opacity ?? 0.5) * 100);
  }

  bindIfPresent(refs.overlayBrowseBtn, 'click', () => refs.overlayFileInput?.click());
  bindIfPresent(refs.overlayFileInput, 'change', () => {
    const file = refs.overlayFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      store.set('overlayImageSrc', e.target.result);
      store.set('overlayVisible', true);
    };
    reader.readAsDataURL(file);
  });

  bindIfPresent(refs.overlayClearBtn, 'click', () => {
    store.set('overlayImageSrc', null);
    store.set('overlayVisible', false);
    if (refs.overlayFileInput) refs.overlayFileInput.value = '';
  });

  bindIfPresent(refs.overlayShowCheck, 'change', () => {
    store.set('overlayVisible', refs.overlayShowCheck.checked);
  });

  bindIfPresent(refs.overlayOpacitySlider, 'input', () => {
    store.set('overlayOpacity', Number(refs.overlayOpacitySlider.value) / 100);
  });

  store.subscribe((path) => {
    if (
      path === 'overlayImageSrc' ||
      path === 'overlayVisible' ||
      path === 'overlayOpacity'
    ) {
      updateOverlaySidebar();
    }
  });

  return { updateOverlaySidebar };
}
