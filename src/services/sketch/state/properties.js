import { SketchTool } from '../constants.js';

export function getIsActive(service) {
  return service.store.get('sketch.isActive');
}

export function setIsActive(service, value) {
  service.store.set('sketch.isActive', value);
  if (!value) service.cancelCurrentLine();
}

export function getActiveTool(service) {
  return service.store.get('sketch.activeTool');
}

export function setActiveTool(service, value) {
  service.store.set('sketch.activeTool', value);
  // Fill tool enables cell-fill mode; any other tool disables it
  service.store.set('cellFillEnabled', value === SketchTool.Fill);
  // main.js already kicks off the solver load shortly after boot, but
  // trigger it here too (ensureSolver() is idempotent) as a fallback in
  // case that hasn't started yet, so it's loading by the time the user
  // completes a constraint/dimension action.
  if (value === SketchTool.Constraint || value === SketchTool.Dimension
      || value === SketchTool.Rectangle || value === SketchTool.Circle) {
    service.ensureSolver();
  }
  service.cancelCurrentLine();
}

export function getConstraintSubMode(service) {
  return service.store.get('sketch.constraintSubMode');
}

export function setConstraintSubMode(service, value) {
  service.store.set('sketch.constraintSubMode', value);
}

export function getStrokeColor(service) {
  return service.store.get('sketch.strokeColor');
}

export function setStrokeColor(service, value) {
  service.store.set('sketch.strokeColor', value);
}

export function getStrokeThickness(service) {
  return service.store.get('sketch.strokeThickness');
}

export function setStrokeThickness(service, value) {
  service.store.set('sketch.strokeThickness', value);
}

export function getPendingStart(service) {
  return service._lineTool.pendingStart;
}

export function setPendingStart(service, value) {
  service._lineTool.pendingStart = value;
}

export function getTemplates(service) {
  return service._templateTool.templates;
}
