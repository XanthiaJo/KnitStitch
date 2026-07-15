/**
 * generate-build-info.mjs — Node.js build info generator.
 *
 * Ported from CraftCMS scripts/GenerateBuildInfo.php.
 *   - Reads git tags and commit history
 *   - Derives a version from conventional commit messages (feat:, fix:, BREAKING CHANGE)
 *   - Non-feat/fix commits increment the revision (4th number)
 *   - Outputs a JS file (window.BUILD_INFO) or markdown changelog
 *
 * Usage:
 *   node scripts/generate-build-info.mjs --root=. --output=src/buildInfo.js --format=js
 *   node scripts/generate-build-info.mjs --root=. --output=CHANGELOG.md --format=md
 *
 * Parameters:
 *   --root     Repository root path (required)
 *   --output   Output file path (required)
 *   --format   Output format: "js" or "md" (default: js)
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      args[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
    }
  }
  return args;
}

function git(root, ...args) {
  try {
    const output = execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return output;
  } catch (e) {
    throw new Error(`git ${args.join(' ')} failed: ${e.message}`);
  }
}

function parseVersion(tagName) {
  const raw = tagName.trim().replace(/^[vV]/, '');
  const parts = raw.split('.');
  if (parts.length < 3) {
    throw new Error(`Tag '${tagName}' is not a valid version`);
  }
  return parts.map((p) => parseInt(p, 10));
}

function formatVersion(version, revision = 0) {
  if (revision > 0) {
    return `v${version[0]}.${version[1]}.${version[2]}.${revision}`;
  }
  return `v${version[0]}.${version[1]}.${version[2]}`;
}

function tryParseTaggedVersion(tagName) {
  const raw = tagName.trim().replace(/^[vV]/, '');
  const parts = raw.split('.');
  if (parts.length < 3) return null;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
  }
  const version = parts.map((p) => parseInt(p, 10));
  if (version.length === 3) version.push(0);
  return version;
}

function getCommitType(subject) {
  if (/BREAKING CHANGE|!:/i.test(subject)) return 'major';
  if (/^feat(\([^)]+\))?:/i.test(subject)) return 'minor';
  if (/^fix(\([^)]+\))?:/i.test(subject)) return 'patch';
  return 'none';
}

function getChangelogGroup(subject) {
  if (/BREAKING CHANGE|!:/i.test(subject)) return 'breaking';
  if (/^feat(\([^)]+\))?:/i.test(subject)) return 'feature';
  if (/^fix(\([^)]+\))?:/i.test(subject)) return 'fix';
  if (/^docs(\([^)]+\))?:/i.test(subject)) return 'docs';
  if (/^refactor(\([^)]+\))?:/i.test(subject)) return 'refactor';
  if (/^test(\([^)]+\))?:/i.test(subject)) return 'test';
  if (/^chore(\([^)]+\))?:/i.test(subject)) return 'chore';
  return 'other';
}

function humanizeCommitSubject(subject) {
  let summary = subject.replace(/^(?:[a-z]+(?:\([^)]+\))?!?:\s*|BREAKING CHANGE:?\s*)/i, '');
  summary = summary.trim();
  if (summary === '') return subject;
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

function cleanCommitDescription(subject, body) {
  body = body.trim();
  if (body === '') return null;

  const lines = body.split(/\r?\n/);

  // Detect bullet-style body lines
  let hasBullets = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || /^(Signed-off-by:|Co-authored-by:|Reviewed-by:|Acked-by:)/i.test(trimmed)) {
      continue;
    }
    if (/^[-*]\s/.test(trimmed)) {
      hasBullets = true;
      break;
    }
  }

  const stripPrefix = (text) => {
    const match = text.match(/^(?:[a-z]+(?:\([^)]+\))?!?:\s*|BREAKING CHANGE:?\s*)/i);
    if (match) {
      const rest = text.slice(match[0].length).trim();
      if (rest !== '') return rest;
    }
    return text;
  };

  const summaryPrefix = subject.replace(/^(?:[a-z]+(?:\([^)]+\))?!?:\s*|BREAKING CHANGE:?\s*)/i, '').trim();

  if (hasBullets) {
    const bullets = [];
    let currentBullet = null;

    const processCurrentBullet = () => {
      if (currentBullet === null) return;
      let trimmed = currentBullet.replace(/\s+/g, ' ').trim();
      if (trimmed === '') {
        currentBullet = null;
        return;
      }
      trimmed = stripPrefix(trimmed);
      if (summaryPrefix !== '' && trimmed.toLowerCase().startsWith(summaryPrefix.toLowerCase())) {
        trimmed = trimmed.slice(summaryPrefix.length).trim();
      }
      if (trimmed !== '') bullets.push(trimmed);
      currentBullet = null;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || /^(Signed-off-by:|Co-authored-by:|Reviewed-by:|Acked-by:)/i.test(trimmed)) {
        processCurrentBullet();
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        processCurrentBullet();
        currentBullet = trimmed.replace(/^[-*]\s+/, '');
      } else if (currentBullet !== null && /^\s+/.test(line)) {
        currentBullet += ' ' + trimmed;
      } else {
        processCurrentBullet();
        currentBullet = trimmed;
      }
    }
    processCurrentBullet();

    return bullets.length > 0 ? bullets : null;
  }

  // Paragraph-style body
  const paragraphs = [];
  let current = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      if (current.length > 0) {
        paragraphs.push(current.join(' '));
        current = [];
      }
      continue;
    }
    if (/^(Signed-off-by:|Co-authored-by:|Reviewed-by:|Acked-by:)/i.test(trimmed)) {
      continue;
    }
    let cleaned = trimmed.replace(/^-\s*/, '').replace(/^\*\s*/, '');
    current.push(cleaned);
  }

  if (current.length > 0) {
    paragraphs.push(current.join(' '));
  }

  for (let paragraph of paragraphs) {
    paragraph = paragraph.replace(/\s+/g, ' ').trim();
    if (paragraph !== '') {
      paragraph = stripPrefix(paragraph);
      if (summaryPrefix !== '' && paragraph.toLowerCase().startsWith(summaryPrefix.toLowerCase())) {
        paragraph = paragraph.slice(summaryPrefix.length).trim();
      }
      if (paragraph === '') continue;
      return paragraph;
    }
  }

  return null;
}

// --- Main ---

const args = parseArgs(process.argv);
const root = args.root ? resolve(args.root) : null;
const outputPath = args.output ? resolve(args.output) : null;
const format = args.format || 'js';

if (!root || !outputPath) {
  console.error('Usage: node scripts/generate-build-info.mjs --root=. --output=src/buildInfo.js --format=js');
  process.exit(1);
}

// Commit count
const commitCount = parseInt(git(root, 'rev-list', '--count', 'HEAD').trim(), 10);

// Tags with object hashes
const tagOutput = git(root, 'tag', '--format=%(objectname)|%(refname:short)');
const taggedVersions = {};
for (const line of tagOutput.split('\n')) {
  if (line.trim() === '') continue;
  const parts = line.split('|', 2);
  if (parts.length !== 2) continue;
  const version = tryParseTaggedVersion(parts[1]);
  if (version !== null) {
    taggedVersions[parts[0]] = version;
  }
}

// Commit log (oldest first), using record separators
const logOutput = git(root, 'log', '--pretty=format:%H%x1f%ad%x1f%s%x1f%B%x1e', '--date=short', '--reverse', '--', '.');
let resolvedVersion = [1, 0, 0, 0];
let revision = 0;
const changeGroups = {
  breaking: [],
  feature: [],
  fix: [],
  docs: [],
  refactor: [],
  test: [],
  chore: [],
  other: [],
};

for (const record of logOutput.split('\x1e')) {
  if (record.trim() === '') continue;
  const parts = record.split('\x1f', 4);
  if (parts.length !== 4) continue;

  const [sha, date, subject, body] = parts;

  if (taggedVersions[sha]) {
    resolvedVersion = taggedVersions[sha];
    if (resolvedVersion.length < 4) resolvedVersion.push(0);
    revision = 0;
    continue;
  }

  const commitType = getCommitType(subject);
  switch (commitType) {
    case 'major':
      resolvedVersion = [resolvedVersion[0] + 1, 0, 0, 0];
      revision = 0;
      break;
    case 'minor':
      resolvedVersion = [resolvedVersion[0], resolvedVersion[1] + 1, 0, 0];
      revision = 0;
      break;
    case 'patch':
      resolvedVersion = [resolvedVersion[0], resolvedVersion[1], resolvedVersion[2] + 1, 0];
      revision = 0;
      break;
    default:
      revision++;
      break;
  }

  const group = getChangelogGroup(subject);
  changeGroups[group].push({
    version: formatVersion(resolvedVersion, revision),
    sha: sha.slice(0, 7),
    date,
    subject: humanizeCommitSubject(subject),
    description: cleanCommitDescription(subject, body),
  });
}

const displayVersion = formatVersion(resolvedVersion, revision);

// Latest tag for production version
let latestTag = '';
try {
  const tagList = git(root, 'tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname').trim();
  if (tagList !== '') {
    latestTag = tagList.split('\n')[0].trim();
  }
} catch (e) {
  latestTag = '';
}

const productionVersion = latestTag !== '' ? formatVersion(parseVersion(latestTag)) : displayVersion;

// Short SHA
const shortSha = git(root, 'rev-parse', '--short', 'HEAD').trim();

// Generate output
let content;
if (format === 'js') {
  content = `window.BUILD_INFO = {
  version: "${displayVersion}",
  productionVersion: "${productionVersion}",
  commit: "${shortSha}",
  commitCount: "${commitCount}"
};
`;
} else if (format === 'md') {
  const groupLabels = {
    breaking: 'Breaking Changes',
    feature: 'Features',
    fix: 'Fixes',
    docs: 'Documentation',
    refactor: 'Refactors',
    test: 'Tests',
    chore: 'Maintenance',
    other: 'Other Changes',
  };

  const lines = [];
  lines.push('# Changelog');
  lines.push('');
  lines.push(`> **Build Snapshot** — Version ${displayVersion} · ${commitCount} commits · ${shortSha}`);
  lines.push('');
  lines.push('> Generated from conventional commits and git tags. The historical');
  lines.push('> changelog from the CraftCMS era is preserved in');
  lines.push('> `docs/craftcms-changelog-history.twig`.');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const [groupKey, groupLabel] of Object.entries(groupLabels)) {
    const items = changeGroups[groupKey];
    if (!items || items.length === 0) continue;

    lines.push(`## ${groupLabel}`);
    lines.push('');

    for (const item of [...items].reverse()) {
      lines.push(`### ${item.subject}`);
      lines.push('');
      lines.push(`**${item.version}** · \`${item.sha}\` · ${item.date}`);
      lines.push('');
      if (item.description) {
        if (Array.isArray(item.description)) {
          for (const bullet of item.description) {
            lines.push(`- ${bullet}`);
          }
        } else {
          lines.push(item.description);
        }
        lines.push('');
      }
    }
  }

  content = lines.join('\n');
} else {
  console.error(`Unknown format: ${format}. Supported formats: js, md`);
  process.exit(1);
}

// Write output
const outputDir = dirname(outputPath);
if (outputDir && !await import('node:fs').then(m => m.existsSync(outputDir))) {
  mkdirSync(outputDir, { recursive: true });
}

writeFileSync(outputPath, content, 'utf8');
console.log(`Generated ${outputPath} (${format}) — version ${displayVersion}, commit ${shortSha}`);
