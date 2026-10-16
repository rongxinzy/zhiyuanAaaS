#!/usr/bin/env node
/**
 * Fail when tracked files exceed the size budget. Screenshots and other
 * documented assets live on the allowlist; everything else must stay small.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWLIST_PREFIXES = ['docs/screenshots/'];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function allowed(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return ALLOWLIST_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
}

const violations = [];
for (const file of trackedFiles()) {
  if (allowed(file)) continue;
  let size;
  try {
    size = execFileSync('git', ['cat-file', '-s', `HEAD:${file}`], { encoding: 'utf8' }).trim();
  } catch {
    continue;
  }
  const bytes = Number(size);
  if (Number.isFinite(bytes) && bytes > MAX_BYTES) {
    violations.push({ file, bytes });
  }
}

if (violations.length) {
  for (const { file, bytes } of violations.sort((a, b) => b.bytes - a.bytes)) {
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    console.error(`::error file=${file}::Tracked file is ${mb} MiB (limit ${MAX_BYTES / (1024 * 1024)} MiB). Shrink it or add a documented allowlist entry in scripts/check-large-files.mjs.`);
  }
  process.exit(1);
}

console.log(`PASS: no tracked files outside the allowlist exceed ${MAX_BYTES / (1024 * 1024)} MiB.`);
