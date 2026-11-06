// path: scripts/lint-path-comments.ts
import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
]);

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.sql']);

function walk(dir: string, fileList: string[] = []): string[] {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (IGNORED_DIRS.has(item)) continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, fileList);
    } else if (EXTENSIONS.has(path.extname(item))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function checkPathComment(filePath: string, repoRoot: string): boolean {
  const relPath = path.relative(repoRoot, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const firstLine = content.split('\n')[0]?.trim() ?? '';

  const expectedPatterns = [
    `// path: ${relPath}`,
    `-- path: ${relPath}`,
    `/* path: ${relPath} */`,
  ];

  return expectedPatterns.some((pattern) => firstLine.startsWith(pattern));
}

function main(): void {
  const repoRoot = process.cwd();
  const allFiles = walk(repoRoot);
  let failed = 0;
  let skipped = 0;

  for (const file of allFiles) {
    // Skip generated files, configs, and temporary test files if any
    const rel = path.relative(repoRoot, file);
    if (rel.startsWith('next-env.d.ts') || rel.includes('tailwind.config') || rel.includes('postcss.config')) {
      skipped++;
      continue;
    }

    if (!checkPathComment(file, repoRoot)) {
      console.warn(`[WARN] Missing or mismatched path header in: ${rel}`);
      failed++;
    }
  }

  console.log(`Path lint checked ${allFiles.length - skipped} file(s).`);
  if (failed > 0) {
    console.warn(`[NOTICE] ${failed} file(s) without canonical path header.`);
  } else {
    console.log('[PASS] All checked files have canonical path comments.');
  }
}

main();
