#!/usr/bin/env node
/**
 * Hand-written sources must stay ≤1000 lines unless listed in the baseline cap
 * file. Baseline entries ratchet down (lines must match cap until under 1000).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MAX_LINES = 1000;
const BASELINE_PATH = '.github/source-line-baseline.json';
const SOURCE_SUFFIXES = new Set(['.ts', '.tsx', '.mjs', '.cjs', '.py', '.css']);
const IGNORE_PREFIXES = ['node_modules/', 'dist/', 'coverage/', '.git/'];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function isSource(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  if (IGNORE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  const ext = path.extname(normalized);
  if (!SOURCE_SUFFIXES.has(ext)) return false;
  if (normalized.endsWith('.lock') || normalized.includes('snapshots')) return false;
  return true;
}

function lineCount(relativePath) {
  const out = execFileSync('wc', ['-l', relativePath], { encoding: 'utf8' }).trim();
  return Number(out.split(/\s+/)[0]);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const caps = baseline.caps ?? {};
let failed = false;

for (const file of trackedFiles().filter(isSource).sort()) {
  const lines = lineCount(file);
  const cap = caps[file];

  if (cap === undefined) {
    if (lines > MAX_LINES) {
      console.error(
        `::error file=${file}::${lines} lines (limit ${MAX_LINES} for new sources). Split the file or add a temporary cap in ${BASELINE_PATH} only for legacy oversize files.`,
      );
      failed = true;
    }
    continue;
  }

  if (lines > cap) {
    console.error(
      `::error file=${file}::${lines} lines exceeds baseline cap ${cap}; remove lines instead of growing legacy files.`,
    );
    failed = true;
    continue;
  }

  if (lines < MAX_LINES) {
    console.error(
      `::error file=${file}::${lines} lines is under ${MAX_LINES}; delete its entry from ${BASELINE_PATH}.`,
    );
    failed = true;
    continue;
  }

  if (lines < cap) {
    console.error(
      `::error file=${file}::${lines} lines; ratchet ${BASELINE_PATH} cap down from ${cap} to ${lines} in this change.`,
    );
    failed = true;
  }
}

for (const file of Object.keys(caps).sort()) {
  if (!trackedFiles().includes(file)) {
    console.error(`::error file=${file}::Listed in ${BASELINE_PATH} but not tracked; remove the entry.`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(
  `PASS: source line limits (${Object.keys(caps).length} baseline caps, ${MAX_LINES}-line ceiling for everything else).`,
);
