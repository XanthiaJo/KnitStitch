// sketchStageEvents.js — Konva stage event wiring for the sketch layer.
//
// Extracted from SketchLayer so the layer stays a thin orchestrator. This
// module owns the click/mousedown/mouseup/contextmenu dispatch and the
// native mousemove listener on the stage content (used to update the cursor
// and forward pointer moves to the active tool).
//
// `hitTest` is injected so this module stays decoupled from the hit-testing
// implementation (see sketchHitTest.js). Returns a `destroy()` that removes
// the native listener; Konva stage listeners are cleaned up with the stage.

/**
 * Wires up all sketch stage events.
 *
 * @param {Konva.Stage} stage
 * @param {{ get: (path: string) => any }} store
 * @param {object} service - SketchService
 * @param {(pos: { x: number, y: number }) => any} hitTest
 * @returns {{ destroy: () => void }}
 */
export function setupSketchStageEvents(stage, store, service, hitTest) {
  const stageContent = stage.content;

  const onNativeMouseMove = (event) => {
    stage.setPointersPositions(event);
    handlePointerMove(stage, event);
  };
  stageContent.addEventListener('mousemove', onNativeMouseMove);

  stage.on('click tap', (e) => {
    if (!store.get('sketch.isActive') || store.get('cellFillEnabled')) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    const target = hitTest(pos);
    if (target?.dimension) {
      if (e.evt.detail === 2) service._openDimEdit(target.dimension);
      return;
    }
    if (target?.constraint) {
      service.selectConstraint(target.constraint, e.evt.ctrlKey);
      return;
    }
    if (target?.point) {
      service.onPointClick(target.point, pos, { snapEnabled: !e.evt.ctrlKey, multiSelect: e.evt.ctrlKey });
      return;
    }
    if (target?.line) {
      service.onLineClick(target.line, pos, { snapEnabled: !e.evt.ctrlKey, multiSelect: e.evt.ctrlKey });
      return;
    }
    if (target?.circle) {
      service.selectCircle(target.circle, e.evt.ctrlKey);
      return;
    }
    service.onCanvasClick(pos, { snapEnabled: !e.evt.ctrlKey });
  });

  stage.on('mousedown', (e) => {
    if (!store.get('sketch.isActive')) return;
    if (e.evt.button === 2) {
      service.onRightMouseDown();
      return;
    }
    if (e.evt.button === 1) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos || store.get('cellFillEnabled')) return;
    const target = hitTest(pos);
    if (target?.dimension) {
      service.selectDimension(target.dimension, e.evt.ctrlKey);
      return;
    }
    if (target?.constraint) {
      service.selectConstraint(target.constraint, e.evt.ctrlKey);
      return;
    }
    service.onCanvasMouseDown(pos, { snapEnabled: !e.evt.ctrlKey });
  });

  stage.on('mouseup', () => {
    if (!store.get('sketch.isActive')) return;
    service.onCanvasMouseUp();
    document.body.style.cursor = 'default';
  });

  // Right-click cancels current action and returns to Select tool
  stage.on('contextmenu', (e) => {
    if (!store.get('sketch.isActive')) return;
    e.evt.preventDefault();
    service.exitToSelect();
  });

  function handlePointerMove(stage, event) {
    if (!store.get('sketch.isActive')) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    const target = hitTest(pos);
    document.body.style.cursor = target ? 'pointer' : 'default';
    service.onCanvasMouseMove(pos, { snapEnabled: !event.ctrlKey });
  }

  return {
    destroy() {
      stageContent.removeEventListener('mousemove', onNativeMouseMove);
    },
  };
}
