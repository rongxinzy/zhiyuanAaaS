import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await fs.readFile(new URL('package.json', root), 'utf8'));
const manifest = JSON.parse(
  await fs.readFile(new URL('build/build-manifest.json', root), 'utf8'),
);
const ciWorkflow = await fs.readFile(new URL('.github/workflows/ci.yml', root), 'utf8');
const packageWorkflow = await fs.readFile(new URL('.github/workflows/package-windows.yml', root), 'utf8');
const agentControlVerifier = await fs.readFile(new URL('scripts/verify-agent-control-e2e.mjs', root), 'utf8');
const adminRealVerifier = await fs.readFile(new URL('scripts/verify-admin-real-e2e.mjs', root), 'utf8');

assert.equal(packageJson.private, true, 'Enterprise package must remain private.');
assert.equal(packageJson.license, 'UNLICENSED', 'Enterprise package must remain unlicensed.');
assert.equal(manifest.extension.version, packageJson.version, 'Extension versions must match.');
assert.equal(
  manifest.renderer.sessionGate,
  'dist/ui/index.html',
  'Renderer session gate must use the stable build output.',
);
assert.equal(
  manifest.renderer.packagedDirectory,
  'zhiyuan-enterprise/ui',
  'Renderer package directory must match the host-scoped resource path.',
);
assert.equal(manifest.adminConsole.artifact, 'dist/admin');
assert.equal(manifest.adminConsole.packagedDirectory, 'zhiyuan-enterprise/admin');
assert.deepEqual(
  manifest.renderer.settingsPages,
  [
    { id: 'account', entrypoint: 'dist/ui/index.html' },
    { id: 'models', entrypoint: 'dist/ui/index.html' },
  ],
  'Renderer settings pages must use stable IDs and build output.',
);
assert.match(manifest.zhiyuanCore.commit, /^[0-9a-f]{40}$/, 'Core commit must be immutable.');
assert.match(manifest.aepProtocol.commit, /^[0-9a-f]{40}$/, 'AEP commit must be immutable.');
assert.match(manifest.aepSdk.sha256, /^[0-9a-f]{64}$/, 'SDK digest must be SHA-256.');
assert.ok(ciWorkflow.includes('ref: ${{ steps.manifest.outputs.aep_commit }}'), 'CI must checkout the manifest-pinned AEP commit.');
assert.ok(!ciWorkflow.includes('ref: main'), 'CI must not execute a mutable AEP branch.');
assert.ok(ciWorkflow.includes('npm run verify:admin:real-e2e'), 'CI must exercise the Admin Console against the pinned AEP service.');
for (const workflow of [ciWorkflow, packageWorkflow]) {
  for (const [, action] of workflow.matchAll(/uses:\s*([^\s#]+)/g)) {
    assert.match(action, /^[^@\s]+@[0-9a-f]{40}$/, `GitHub Action must be pinned to a full commit SHA: ${action}`);
  }
}
for (const verifier of [agentControlVerifier, adminRealVerifier]) {
  assert.ok(verifier.includes("requiredEnvironment('ZHIYUAN_AEP_ADMIN_PASSWORD')"), 'Real-service E2E must require an explicit administrator password.');
  assert.ok(!/roleIds:\s*\[\s*['\"]admin['\"]\s*\]/.test(verifier), 'Disposable E2E users must not receive the administrator role.');
}

const sdkDependency = packageJson.dependencies['@aep/sdk-node'];
assert.ok(
  sdkDependency.endsWith(`/${manifest.aepSdk.releaseTag}/${manifest.aepSdk.asset}`),
  'SDK dependency must resolve from the pinned Release asset.',
);
