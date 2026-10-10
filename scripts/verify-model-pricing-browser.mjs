import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AepClient, MemoryTokenStore } from '@aep/sdk-node';
import { chromium } from 'playwright-core';
import { requiredEnvironment } from './e2e-environment.mjs';

// Requires the model-pricing backend. Creates disposable models/users and
// exercises the real HTTP API; no provider key, inference or computed cost.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = requiredEnvironment('ZHIYUAN_AEP_BASE_URL');
const password = requiredEnvironment('ZHIYUAN_AEP_ADMIN_PASSWORD');
const username = process.env.ZHIYUAN_AEP_ADMIN_USERNAME ?? 'admin';
const deploymentId = process.env.ZHIYUAN_AEP_DEPLOYMENT_ID ?? 'demo';
const screenshots = path.join(root, 'build', 'model-pricing-browser');
const store = new MemoryTokenStore();
const admin = new AepClient({ baseUrl, tokenStore: store });
const report = { mode: 'real-aep-api', checks: [], errors: [] };
let model, reader, role, server, browser, page;
async function pricingRequest(method, body) {
  const response = await fetch(`${baseUrl}/aep/v1/admin/models/${encodeURIComponent(model.id)}/pricing`, {
    method,
    headers: {
      Authorization: `Bearer ${(await store.get()).accessToken}`,
      'X-AEP-Protocol-Version': '1.0',
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function login(page, user, pass) {
  await page.getByLabel('用户名', { exact: true }).fill(user);
  await page.getByLabel('密码', { exact: true }).fill(pass);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
}
const openPrices = async (page) => {
  const row = page.locator('.ant-table-row').filter({ hasText: model.displayName });
  await row.getByRole('button', { name: '价格设置', exact: true }).click();
};
try {
  await fs.mkdir(screenshots, { recursive: true });
  await admin.loginWithPassword({ deploymentId, username, password });
  const suffix = Date.now().toString(36);
  model = await admin.createModel({
    displayName: `价格设置验收模型 ${suffix}`,
    sourceType: 'gateway',
    protocol: 'openai-compatible',
    endpoint: 'https://mock.example.test/v1',
    upstreamModel: 'mock-price-reference',
    capabilities: ['text'],
    isDefault: false,
    enabled: true,
  });
  const portServer = http.createServer();
  await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'scripts/serve-admin.mjs')], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, ZHIYUAN_ADMIN_PORT: String(port), ZHIYUAN_ADMIN_WEKNORA_PORT: '0' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  let executablePath;
  for (const candidate of [
    process.env.ZHIYUAN_CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)) {
    try {
      await fs.access(candidate);
      executablePath = candidate;
      break;
    } catch {}
  }
  assert(executablePath, 'Set ZHIYUAN_CHROME_PATH to Chrome/Chromium');
  browser = await chromium.launch({ headless: true, executablePath });
  page = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.goto(origin);
  await login(page, username, password);
  await page.getByRole('heading', { name: '概览', exact: true }).waitFor();
  await page.goto(`${origin}/#model-gateway/observe`);
  await page.getByRole('button', { name: '配置模型价格', exact: true }).click();
  await page.waitForURL('**/#model-gateway/catalog');
  await openPrices(page);
  await page.getByText('尚未配置价格', { exact: true }).waitFor();
  await page.getByLabel('输入单价 / 百万 Token', { exact: true }).fill('-1');
  await page.getByLabel('输出单价 / 百万 Token', { exact: true }).fill('0');
  await page.getByRole('button', { name: '保存价格', exact: true }).click();
  await page.getByText('请输入非负价格，最多 9 位整数、6 位小数。', { exact: true }).waitFor();
  assert.equal((await pricingRequest('GET')).version, 0);
  await page.getByLabel('输入单价 / 百万 Token', { exact: true }).fill('0.000001');
  await page.getByLabel('缓存命中输入单价 / 百万 Token', { exact: true }).fill('0.01');
  await page.getByLabel('价格来源说明', { exact: true }).fill('本地验收参考价；不代表供应商报价或实际成本。');
  await page.getByRole('button', { name: '保存价格', exact: true }).click();
  await page.getByText('参考价格已保存。', { exact: true }).waitFor();
  const saved = await pricingRequest('GET');
  assert.equal(saved.pricing.inputPricePerMillionTokens, '0.000001');
  assert.equal(saved.pricing.outputPricePerMillionTokens, '0');
  assert.equal(saved.pricing.cachedInputPricePerMillionTokens, '0.01');
  report.checks.push(
    'cost-region navigation, unset state, invalid-price rejection and real persisted exact-price save',
  );
  await page.reload();
  await openPrices(page);
  await page.getByText('已保存参考价格', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('输入单价 / 百万 Token', { exact: true }).inputValue(), '0.000001');
  await page.screenshot({ path: path.join(screenshots, 'light.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByLabel('外观', { exact: true }).click();
  await page.locator('.ant-select-dropdown:visible').getByText('深色', { exact: true }).click();
  await openPrices(page);
  await page.getByText('已保存参考价格', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(screenshots, 'dark.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 392, height: 920 });
  await page.screenshot({ path: path.join(screenshots, 'narrow.png'), animations: 'disabled' });
  const overflow = await page.locator('.ant-drawer-section').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  assert.equal(overflow, false, 'Price drawer overflows narrow viewport');
  assert(await page.getByRole('button', { name: '保存价格', exact: true }).isVisible());
  await page.getByLabel('币种', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.locator('.ant-select-dropdown:visible').waitFor();
  await page.keyboard.press('Escape');
  report.checks.push('reloaded persistence, inherited light/dark tokens, narrow layout and keyboard Select');
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.getByLabel('输入单价 / 百万 Token', { exact: true }).fill('3');
  await pricingRequest('PUT', {
    pricing: { ...saved.pricing, inputPricePerMillionTokens: '8' },
    expectedVersion: saved.version,
  });
  await page.getByRole('button', { name: '保存价格', exact: true }).click();
  await page.getByText('价格已被其他管理员修改，请重新加载后再编辑。', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: '保存价格', exact: true }).isDisabled());
  await page.getByRole('button', { name: '重新加载价格', exact: true }).click();
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await page.getByLabel('输入单价 / 百万 Token', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('input[id="inputPricePerMillionTokens"]')?.value === '8');
  await page.getByRole('button', { name: '清除价格配置', exact: true }).click();
  await page.locator('.ant-popconfirm').getByRole('button', { name: '清除价格配置', exact: true }).click();
  await page.getByText('尚未配置价格', { exact: true }).waitFor();
  assert.equal((await pricingRequest('GET')).pricing, null);
  await page.locator('.ant-popconfirm').waitFor({ state: 'hidden' });
  report.checks.push('actual concurrent edit, explicit discard/reload and confirmed clear');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.goto(`${origin}/#model-gateway/observe`);
  await page.getByText('成本数据来源尚未接入，不展示估算金额或成本曲线。', { exact: true }).waitFor();
  report.checks.push('saving prices does not fabricate native cost statistics');
  role = await admin.createRole({
    name: `Pricing reader ${suffix}`,
    description: 'Disposable price-read browser verification',
    permissions: ['models.read'],
  });
  const readerPassword = randomUUID();
  reader = await admin.createUser({
    deploymentId,
    username: `pricing-reader-${suffix}`,
    displayName: '价格只读验收账号',
    temporaryPassword: readerPassword,
    requirePasswordChange: false,
    roleIds: [role.id],
    teamIds: ['all-users'],
  });
  const readerPage = await browser.newPage({ viewport: { width: 1440, height: 1040 } });
  await readerPage.goto(origin);
  await login(readerPage, reader.username, readerPassword);
  await readerPage.goto(`${origin}/#model-gateway/catalog`);
  await openPrices(readerPage);
  await readerPage.getByText('当前账号仅可查看价格，需要模型管理权限才能修改。', { exact: true }).waitFor();
  assert.equal(await readerPage.getByRole('button', { name: '保存价格', exact: true }).count(), 0);
  assert(await readerPage.getByLabel('输入单价 / 百万 Token', { exact: true }).isDisabled());
  report.checks.push('real read-only account sees price settings without mutation controls');
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
  console.log(JSON.stringify(report));
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(screenshots, 'failure.png'), fullPage: true }).catch(() => {});
    console.error(await page.locator('button').allTextContents());
  }
  throw error;
} finally {
  await browser?.close();
  server?.kill();
  if (reader) {
    const response = await fetch(`${baseUrl}/aep/v1/admin/users/${encodeURIComponent(reader.id)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${(await store.get()).accessToken}`,
        'X-AEP-Protocol-Version': '1.0',
      },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 204, 'Disposable reader cleanup failed');
  }
  if (role) await admin.deleteRole(role.id);
  if (model) await admin.deleteModel(model.id);
  await admin.logout().catch(() => {});
  await fs.writeFile(path.join(screenshots, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
}
