import assert from 'node:assert/strict';

const bundleUrl = new URL('../dist/extension.cjs', import.meta.url).href;
const bundledModule = await import(bundleUrl);
const factory =
  bundledModule.createZhiyuanEnterpriseExtension ??
  bundledModule.default?.createZhiyuanEnterpriseExtension;

assert.equal(typeof factory, 'function', 'Bundle must export createZhiyuanEnterpriseExtension.');
const extension = await factory();
assert.equal(extension.apiVersion, 1, 'Bundle must implement enterprise extension API v1.');
assert.equal(extension.id, 'zhiyuan.aaas', 'Bundle must expose the stable extension ID.');

await extension.initialize({
  apiVersion: 1,
  appVersion: 'verification',
  isPackaged: true,
  platform: process.platform,
  paths: { resources: process.cwd(), userData: process.cwd() },
});
await extension.dispose();
