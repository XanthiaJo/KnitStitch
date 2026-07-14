let cursorMessageTimeout = null;

export function showCursorMessage(service, message, position) {
  const store = service.store;
  if (cursorMessageTimeout) {
    clearTimeout(cursorMessageTimeout);
  }
  store.set('sketch.cursorMessage', { text: message, position: position ? { ...position } : null });
  cursorMessageTimeout = setTimeout(() => {
    store.set('sketch.cursorMessage', null);
    cursorMessageTimeout = null;
  }, 2000);
}
export function clearCursorMessage(service) {
  if (cursorMessageTimeout) {
    clearTimeout(cursorMessageTimeout);
    cursorMessageTimeout = null;
  }
  service.store.set('sketch.cursorMessage', null);
}