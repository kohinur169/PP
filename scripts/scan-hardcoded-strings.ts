// path: scripts/scan-hardcoded-strings.ts
import fs from 'fs';
import path from 'path';

interface ScanViolation {
  file: string;
  line: number;
  snippet: string;
  reason: string;
}

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', 'plan_generator']);
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

function scanFile(filePath: string): ScanViolation[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: ScanViolation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check 1: Non-English characters (strict English-only rule)
    // Non-ASCII characters (e.g. non-English scripts), allowing standard typographical symbols like bullet
    const sanitizedLine = line.replace(/[•©®™“”‘’—–]/g, '');
    const nonAsciiMatch = sanitizedLine.match(/[^\x00-\x7F]/);
    if (nonAsciiMatch && !filePath.includes('tests/')) {
      // Check if it's outside comments or in UI strings
      if (!line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        violations.push({
          file: filePath,
          line: i + 1,
          snippet: line.trim(),
          reason: 'Non-English character detected. All text must be strictly in English.',
        });
      }
    }
  }

  return violations;
}

function traverseDirectory(dir: string, violations: ScanViolation[] = []): ScanViolation[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      traverseDirectory(fullPath, violations);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      violations.push(...scanFile(fullPath));
    }
  }

  return violations;
}

function run() {
  const rootDir = process.cwd();
  console.log(`[i18n-scanner] Scanning source files for English-only compliance...`);
  const violations = traverseDirectory(path.join(rootDir, 'app'))
    .concat(traverseDirectory(path.join(rootDir, 'components')))
    .concat(traverseDirectory(path.join(rootDir, 'lib')));

  if (violations.length > 0) {
    console.error(`[i18n-scanner] Found ${violations.length} violations:`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} - ${v.reason}\n    Snippet: ${v.snippet}`);
    }
    process.exit(1);
  }

  console.log(`[i18n-scanner] Clean! 100% of scanned source files comply with English-only rules.`);
}

run();
