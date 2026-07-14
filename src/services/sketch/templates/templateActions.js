export function applyTemplate(service, templateId) {
    service._templateTool.generate(templateId);
}
export function regenerateTemplate(service, measurements) {
    service._templateTool.regenerate(measurements);
}