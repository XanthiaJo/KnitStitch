const fs = require('node:fs');
const path = require('node:path');

function sanitize(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim() || 'unnamed';
}

function projectBaseDir(projectName) {
  if (projectName === 'craftcms') {
    return 'CraftCms.Tests';
  }
  if (projectName.startsWith('knitstitch')) {
    return 'KnitStitch.Tests';
  }
  return '.';
}

class FlatArtifactReporter {
  constructor(options = {}) {
    this.tracesDir = options.tracesDir;
    this.screenshotsDir = options.screenshotsDir;
  }

  onTestEnd(test, result) {
    const projectName = test.parent.project().name;
    const baseDir = projectBaseDir(projectName);

    const fileName = path.basename(test.location.file, path.extname(test.location.file));
    const testName = `${fileName}-${sanitize(test.title)}`;

    const traceAttachment = result.attachments.find(
      (attachment) => attachment.name === 'trace' && attachment.contentType === 'application/zip'
    );
    if (traceAttachment?.path && fs.existsSync(traceAttachment.path)) {
      const tracesDir = path.resolve(this.tracesDir || path.join(baseDir, 'traces'));
      fs.mkdirSync(tracesDir, { recursive: true });
      fs.copyFileSync(traceAttachment.path, path.join(tracesDir, `${testName}.zip`));
    }

    const screenshotAttachment = result.attachments.find(
      (attachment) => attachment.name === 'screenshot' && attachment.contentType === 'image/png'
    );
    if (screenshotAttachment?.path && fs.existsSync(screenshotAttachment.path)) {
      const screenshotsDir = path.resolve(this.screenshotsDir || path.join(baseDir, 'screenshots'));
      fs.mkdirSync(screenshotsDir, { recursive: true });
      fs.copyFileSync(screenshotAttachment.path, path.join(screenshotsDir, `${testName}.png`));
    }
  }
}

module.exports = FlatArtifactReporter;
