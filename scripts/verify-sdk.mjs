import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await fs.readFile(new URL('package.json', root), 'utf8'));
const manifest = JSON.parse(
  await fs.readFile(new URL('build/build-manifest.json', root), 'utf8'),
);
const sdkUrl = packageJson.dependencies['@aep/sdk-node'];
const response = await downloadWithRetry(sdkUrl);

assert.equal(response.ok, true, `Unable to download pinned AEP SDK: HTTP ${response.status}.`);
const archive = Buffer.from(await response.arrayBuffer());
const digest = createHash('sha256').update(archive).digest('hex');

assert.equal(digest, manifest.aepSdk.sha256, 'Pinned AEP SDK digest does not match the manifest.');

async function downloadWithRetry(url) {
  const failures = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      failures.push(error);
      if (attempt < 3) await delay(attempt * 1_000);
    }
  }
  throw new AggregateError(failures, 'Unable to download the pinned AEP SDK after 3 attempts.');
}
