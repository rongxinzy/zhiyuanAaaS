#!/usr/bin/env node
/** Cheap guard against accidental large binaries in git (screenshots allowlisted). */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWLIST_PREFIXES = ['docs/screenshots/'];

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

function allowed(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return ALLOWLIST_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

for (const file of trackedFiles()) {
  if (allowed(file)) continue;
  const size = Number(execFileSync('git', ['cat-file', '-s', `HEAD:${file}`], { encoding: 'utf8' }).trim());
  if (size > MAX_BYTES) {
    console.error(
      `::error file=${file}::${(size / (1024 * 1024)).toFixed(2)} MiB exceeds ${MAX_BYTES / (1024 * 1024)} MiB`,
    );
    process.exit(1);
  }
}
