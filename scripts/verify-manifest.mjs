import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await fs.readFile(new URL('package.json', root), 'utf8'));
const manifest = JSON.parse(
  await fs.readFile(new URL('build/build-manifest.json', root), 'utf8'),
);

assert.equal(packageJson.private, true, 'Enterprise package must remain private.');
assert.equal(packageJson.license, 'UNLICENSED', 'Enterprise package must remain unlicensed.');
assert.equal(manifest.extension.version, packageJson.version, 'Extension versions must match.');
assert.match(manifest.zhiyuanCore.commit, /^[0-9a-f]{40}$/, 'Core commit must be immutable.');
assert.match(manifest.aepSdk.sha256, /^[0-9a-f]{64}$/, 'SDK digest must be SHA-256.');

const sdkDependency = packageJson.dependencies['@aep/sdk-node'];
assert.ok(
  sdkDependency.endsWith(`/${manifest.aepSdk.releaseTag}/${manifest.aepSdk.asset}`),
  'SDK dependency must resolve from the pinned Release asset.',
);
