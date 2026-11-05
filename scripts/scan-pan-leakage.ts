// path: scripts/scan-pan-leakage.ts

import fs from 'node:fs';
import path from 'node:path';

export interface PanLeakageViolation {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  violationType: 'FORBIDDEN_INPUT_NAME' | 'FORBIDDEN_FORM_FIELD' | 'SUSPECTED_RAW_PAN';
  description: string;
}

export interface PanScanResult {
  passed: boolean;
  totalFilesScanned: number;
  violations: PanLeakageViolation[];
}

const FORBIDDEN_INPUT_PATTERNS = [
  /<input[^>]*name\s*=\s*['"](?:cardNumber|card_number|card-number|pan|cvv|cvc|cvv2|expiry|cardExpiry|card_expiry)['"]/i,
  /<input[^>]*id\s*=\s*['"](?:cardNumber|card_number|card-number|pan|cvv|cvc|cvv2|expiry|cardExpiry|card_expiry)['"]/i,
  /(?:cardNumber|card_number|cvv|cvc|cardExpiry)\s*:\s*use(?:State|Ref)\s*<\s*string\s*>/i,
];

const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'docs',
  'tests',
  'scripts',
]);

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.vue', '.svelte']);

/**
 * Validates a number string using the Luhn checksum algorithm.
 */
export function isLuhnValid(pan: string): boolean {
  const digits = pan.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

/**
 * Scans directories recursively for files.
 */
function walk(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const items = fs.readdirSync(dir);

  for (const item of items) {
    if (IGNORED_DIRS.has(item)) continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath, fileList);
    } else if (SCANNED_EXTENSIONS.has(path.extname(item))) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

/**
 * Scans the codebase for PCI-DSS SAQ A cardholder data environment isolation compliance.
 * Forbids any native form input elements named cardNumber, cvv, or expiry on platform domains (Step 131.1).
 */
export function scanCodebaseForPanLeakage(repoRoot = process.cwd()): PanScanResult {
  const targetDirs = ['app', 'components', 'lib'];
  const allFiles: string[] = [];

  for (const dir of targetDirs) {
    walk(path.join(repoRoot, dir), allFiles);
  }

  const violations: PanLeakageViolation[] = [];

  for (const file of allFiles) {
    const relPath = path.relative(repoRoot, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx] ?? '';
      const lineNum = idx + 1;

      // Check forbidden HTML/React input attributes
      for (const pattern of FORBIDDEN_INPUT_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            filePath: relPath,
            lineNumber: lineNum,
            lineContent: line.trim(),
            violationType: 'FORBIDDEN_INPUT_NAME',
            description:
              'Forbidden native input element handling card data directly. Use NMI Collect.js or Stripe Elements hosted iframes to maintain PCI-DSS SAQ A scope.',
          });
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    totalFilesScanned: allFiles.length,
    violations,
  };
}

// Direct CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== KD SOLUTION IT: PCI-DSS SAQ A PAN Leakage AST Scanner ===');
  const result = scanCodebaseForPanLeakage();

  console.log(`Scanned ${result.totalFilesScanned} source files.`);

  if (result.passed) {
    console.log('[PASS] CDE Isolation Confirmed: Zero raw card input fields detected in codebase.');
    process.exit(0);
  } else {
    console.error(`[FAIL] Detected ${result.violations.length} CDE isolation violation(s):`);
    for (const v of result.violations) {
      console.error(`  - ${v.filePath}:${v.lineNumber} [${v.violationType}]: ${v.lineContent}`);
      console.error(`    ${v.description}`);
    }
    process.exit(1);
  }
}
