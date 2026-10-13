import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createAdminFixture, state } from './admin-browser-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshots = process.env.ZHIYUAN_ADMIN_SCREENSHOTS ?? path.join(root, 'artifacts/gateway-user-filters');
state.teams.push(
  { id: 'filter-sales', name: '销售团队', enabled: true },
  { id: 'filter-ops', name: '运营团队', enabled: true },
);
state.roles.push(
  { id: 'filter-member', name: '成员角色', enabled: true, permissions: [] },
  { id: 'filter-manager', name: '主管角色', enabled: true, permissions: [] },
);
for (const user of [
  {
    id: 'filter-alice',
    username: 'alice',
    displayName: '筛选用户甲',
    teamIds: ['filter-sales'],
    roleIds: ['filter-member'],
  },
  {
    id: 'filter-bob',
    username: 'bob',
    displayName: '筛选用户乙',
    teamIds: ['filter-sales', 'filter-ops'],
    roleIds: ['filter-manager'],
  },
  {
    id: 'filter-carol',
    username: 'carol',
    displayName: '筛选用户丙',
    teamIds: ['filter-ops'],
    roleIds: ['filter-member'],
  },
])
  state.users.push({ ...user, email: null, status: 'active' });
const api = createAdminFixture();
await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiOrigin = `http://127.0.0.1:${api.address().port}`;
const portProbe = http.createServer();
await new Promise((resolve) => portProbe.listen(0, '127.0.0.1', resolve));
const adminPort = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const server = spawn(process.execPath, [path.join(root, 'scripts/serve-admin.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    ZHIYUAN_ADMIN_PORT: String(adminPort),
    ZHIYUAN_ADMIN_WEKNORA_PORT: '0',
    ZHIYUAN_AEP_BASE_URL: apiOrigin,
    ZHIYUAN_PORTAL_BASE_URL: apiOrigin,
    ZHIYUAN_GATEWAY_ORIGIN: apiOrigin,
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let browser;
let page;
const errors = [];
const checks = [];
try {
  await fs.mkdir(screenshots, { recursive: true });
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Admin server startup timed out')), 15000);
    server.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/http:\/\/[^\s]+/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    server.once('error', reject);
  });
  let executablePath = process.env.ZHIYUAN_CHROME_PATH;
  if (!executablePath) {
    for (const candidate of [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ]) {
      try {
        await fs.access(candidate);
        executablePath = candidate;
        break;
      } catch {}
    }
  }
  assert(executablePath, 'Set ZHIYUAN_CHROME_PATH to a Chrome executable');
  browser = await chromium.launch({ headless: true, executablePath });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) errors.push(message.text());
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByLabel('用户名', { exact: true }).fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('e2e-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('heading', { name: '概览', exact: true }).waitFor();
  await page.goto(`${origin}/#model-gateway/limits`, { waitUntil: 'networkidle' });
  async function dropdown(label) {
    const listId = await page.getByRole('combobox', { name: label, exact: true }).getAttribute('aria-controls');
    return page.locator(`[id="${listId}"]`).locator('xpath=ancestor::*[contains(@class,"ant-select-dropdown")][1]');
  }
  async function choose(label, text) {
    const input = page.getByRole('combobox', { name: label, exact: true });
    await input.click();
    await (await dropdown(label)).locator('.ant-select-item-option-content').getByText(text, { exact: true }).click();
    await input.press('Escape');
  }
  async function filterUsers(label) {
    await choose('筛选团队', '销售团队');
    await choose('筛选角色', '成员角色');
    const input = page.getByRole('combobox', { name: label, exact: true });
    await input.click();
    await input.fill('ALICE');
    const menu = await dropdown(label);
    await menu.getByText('筛选用户甲 (alice)', { exact: true }).waitFor();
    assert.equal(await menu.locator('.ant-select-item-option').count(), 1);
    await menu.getByText('筛选用户甲 (alice)', { exact: true }).click();
  }
  await filterUsers('指定主体');
  await page.getByLabel('规则 ID', { exact: true }).fill('filtered-user-rule');
  await page.getByRole('button', { name: '保存规则', exact: true }).click();
  await page.waitForFunction(() => document.body.textContent.includes('filtered-user-rule'));
  assert.equal(state.gateway.rules.length, 1);
  assert.equal(state.gateway.rules[0].configuration.scopeType, 'user');
  assert.equal(state.gateway.rules[0].configuration.scopeId, 'filter-alice');
  checks.push('Username search plus team/role intersection saves the selected user ID');
  await choose('筛选团队', '销售团队');
  await choose('筛选团队', '运营团队');
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByText('全部团队', { exact: true }).waitFor();
  await page.getByText('全部角色', { exact: true }).waitFor();
  checks.push('Reopening a rule resets filters and restores its saved user');
  await page.getByText('Token 余额配额', { exact: true }).click();
  await filterUsers('用户');
  await page.getByText('1,000', { exact: true }).waitFor();
  await choose('筛选团队', '销售团队');
  await choose('筛选团队', '运营团队');
  assert(await page.getByRole('button', { name: '调整余额', exact: true }).isDisabled());
  assert(await page.getByRole('button', { name: '重置余额', exact: true }).isDisabled());
  checks.push('Excluded quota target is cleared before any mutation');
  await choose('用户', '筛选用户丙 (carol)');
  await page.getByLabel('配额值 / 调整量').fill('250');
  await page.getByRole('button', { name: '调整余额', exact: true }).click();
  await page.locator('.ant-popconfirm').getByRole('button', { name: '调整余额', exact: true }).click();
  await page.getByText('1,250', { exact: true }).waitFor();
  assert(state.requests.some((request) => request.path === '/aep/v1/admin/model-gateway/quotas/filter-carol/delta'));
  checks.push('Confirmed quota mutation applies to the filtered user, not a group');
  for (const mode of ['light', 'dark']) {
    await page.evaluate((mode) => localStorage.setItem('zhiyuan.admin.theme', mode), mode);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Token 余额配额', { exact: true }).click();
    await choose('筛选团队', '运营团队');
    await choose('筛选角色', '成员角色');
    for (const [size, width] of [
      ['desktop', 1440],
      ['narrow', 390],
    ]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.getByRole('combobox', { name: '用户', exact: true }).click();
      const menu = await dropdown('用户');
      await menu.getByText('筛选用户丙 (carol)', { exact: true }).waitFor();
      assert.equal(await menu.locator('.ant-select-item-option').count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await menu.getByText('筛选用户丙 (carol)', { exact: true }).click();
      await page.getByText('1,250', { exact: true }).waitFor();
      await page.screenshot({
        path: path.join(screenshots, `${size}-${mode}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await page.getByRole('combobox', { name: '用户', exact: true }).press('Escape');
    }
  }
  checks.push('Light/dark and desktop/390px layouts, accessible filters, no page overflow');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  assert.deepEqual(errors, []);
  const result = { status: 'passed', mode: 'mock-api', checks, screenshots, consoleErrors: errors };
  await fs.writeFile(path.join(screenshots, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.kill();
  api.close();
}
