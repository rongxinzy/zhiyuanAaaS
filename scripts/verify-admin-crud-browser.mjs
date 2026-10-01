import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createAdminFixture, state } from './admin-browser-fixture.mjs';

// Browser plugin not available: use the repository's Playwright workflow.
// Login -> seven business areas -> real form interaction -> API fixture changes.
// These fixtures test browser/API contracts, not production service behavior.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshots = process.env.ZHIYUAN_ADMIN_SCREENSHOTS ?? '/tmp/zhiyuan-admin-antd-qa';
const api = createAdminFixture();
let server;
let browser;
let page;
const errors = [];
const checks = [];
const expectedFailurePaths = new Set();
try {
  await fs.mkdir(screenshots, { recursive: true });
  const apiPort = await listen(api);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'scripts/serve-admin.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      ZHIYUAN_ADMIN_PORT: String(port),
      ZHIYUAN_AEP_BASE_URL: `http://127.0.0.1:${apiPort}`,
      ZHIYUAN_PORTAL_BASE_URL: `http://127.0.0.1:${apiPort}`,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await waitForHttp(origin);
  browser = await chromium.launch({
    headless: true,
    executablePath: await findChrome(),
  });
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && [...expectedFailurePaths].some((route) => message.location().url.endsWith(route)))
      return;
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  assert.match(await page.title(), /知远|Zhiyuan/);
  await page.screenshot({
    path: path.join(screenshots, 'login.png'),
    fullPage: true,
    animations: 'disabled',
  });
  // Login derives the deployment from server metadata; no ID input exists.
  assert.equal(await page.getByLabel('部署 ID').count(), 0);
  await page.getByLabel('用户名', { exact: true }).fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('e2e-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('heading', { name: '概览', exact: true }).waitFor();
  assert.equal(await page.getByRole('menuitem').count(), 7);
  await page.screenshot({
    path: path.join(screenshots, 'overview.png'),
    fullPage: true,
    animations: 'disabled',
  });
  checks.push('explicit login, seven business entries, overview');

  async function visit(route, expected) {
    await page.goto(`${origin}/#${route}`);
    await page.locator('.admin-page').getByText(expected, { exact: true }).first().waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
  }
  await visit('employees', 'E2E 销售助理');
  await page.screenshot({
    path: path.join(screenshots, 'employees.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page
    .getByRole('row')
    .filter({ hasText: 'E2E 销售助理' })
    .getByRole('button', { name: /管理|查看/ })
    .first()
    .click();
  for (const label of ['基本配置', '知识与技能', '长期记忆', '发布与使用', '运行记录']) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    await page.waitForLoadState('networkidle');
  }
  await page.screenshot({
    path: path.join(screenshots, 'employee-detail.png'),
    fullPage: true,
    animations: 'disabled',
  });
  checks.push('employee detail: all five business tabs');
  await visit('knowledge', 'E2E 产品资料');
  await page.screenshot({
    path: path.join(screenshots, 'knowledge.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await visit('users', '管理员');
  await page.screenshot({
    path: path.join(screenshots, 'users.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await visit('users/teams', '团队管理');
  await page.getByRole('button', { name: /新增团队$/ }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('团队 ID', { exact: true }).fill('e2e-team');
  await dialog.getByLabel('名称', { exact: true }).fill('E2E 业务团队');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('E2E 业务团队', { exact: true }).first().waitFor();
  await visit('users', '用户列表');
  await page.getByRole('button', { name: /新增用户$/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('用户名', { exact: true }).fill('e2e-member');
  await dialog.getByLabel('显示名称', { exact: true }).fill('E2E 业务成员');
  await dialog.getByLabel('临时密码', { exact: true }).fill('e2e-temporary-password');
  await dialog.getByRole('checkbox', { name: /企业成员/ }).check();
  await dialog.getByRole('checkbox', { name: /E2E 业务团队/ }).check();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('E2E 业务成员', { exact: true }).first().waitFor();
  const member = state.users.find((user) => user.username === 'e2e-member');
  assert.deepEqual(member.teamIds, ['e2e-team']);
  assert.deepEqual(member.roleIds, ['member']);
  const memberRow = page.getByRole('row').filter({ hasText: 'E2E 业务成员' });
  await memberRow.getByRole('button', { name: '查看', exact: true }).click();
  for (const label of ['基本信息', '团队与角色', '访问权限', '关联账号', '登录会话']) {
    await page
      .getByRole('dialog')
      .getByRole('tab', { name: new RegExp(`^${label}`) })
      .click();
  }
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Close|关闭/ })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await memberRow.getByRole('button', { name: '更多', exact: true }).hover();
  await page.getByRole('menuitem', { name: /停用/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '确认停用', exact: true }).click();
  await dialog.getByText('账号已停用', { exact: true }).waitFor();
  assert.equal(member.status, 'disabled');
  await dialog.locator('button.ant-btn-primary:not(.ant-btn-loading)').filter({ hasText: '确定' }).click();
  await dialog.waitFor({ state: 'hidden' });
  checks.push('team and user creation, membership, five detail tabs, disable result');

  await visit('users/roles', '角色权限');
  await visit('users/accounts', '账号关联');
  await visit('users/sessions', '登录会话');
  await page.screenshot({
    path: path.join(screenshots, 'sessions.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /撤销登录$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认撤销', exact: true }).click();
  await waitForValue(() => Boolean(state.sessions[0].revokedAt), true);
  checks.push('session revoke with explicit confirmation');
  await visit('skills', '技能管理');
  await page.getByRole('button', { name: /新增技能$/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('技能 ID', { exact: true }).fill('e2e-skill');
  await dialog.getByLabel('名称', { exact: true }).fill('E2E 报表整理');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page
    .getByRole('row')
    .filter({ hasText: 'E2E 报表整理' })
    .getByRole('button', { name: '查看', exact: true })
    .click();
  for (const label of ['说明与配置', '版本记录', '使用权限', '关联数字员工']) {
    await page
      .getByRole('dialog')
      .getByRole('tab', { name: new RegExp(`^${label}`) })
      .click();
  }
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Close|关闭/ })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(state.skills[0].id, 'e2e-skill');
  await page.screenshot({ path: path.join(screenshots, 'skills.png'), fullPage: true, animations: 'disabled' });
  checks.push('skill registration and four detail tabs');
  await visit('system/models', '模型列表');
  await page.screenshot({
    path: path.join(screenshots, 'models.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await visit('system/models/connections', '接入配置');
  await page.getByRole('button', { name: /新建接入配置$/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('名称', { exact: true }).fill('E2E 模型接入');
  await dialog.getByLabel('服务', { exact: true }).fill('openai');
  await dialog.getByLabel('新密钥', { exact: true }).fill('e2e-never-render-this-key');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('E2E 模型接入', { exact: true }).first().waitFor();
  assert.equal(state.credentials.length, 1);
  assert.equal(state.credentials[0].deliveryMode, 'server_only');
  assert.equal((await page.locator('body').innerText()).includes('e2e-never-render-this-key'), false);
  const rotatePath = `/aep/v1/admin/credentials/${state.credentials[0].id}/rotate`;
  expectedFailurePaths.add(rotatePath);
  state.failNext = `POST ${rotatePath}`;
  await page
    .getByRole('row')
    .filter({ hasText: 'E2E 模型接入' })
    .getByRole('button', { name: /更新密钥$/ })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('新密钥', { exact: true }).fill('e2e-rotated-key');
  await dialog.getByRole('button', { name: /更新密钥$/ }).click();
  await dialog.getByRole('alert').filter({ hasText: '凭证轮换失败' }).waitFor();
  assert.equal(state.credentials[0].maskedValue, 'e2e-***');
  await page.screenshot({
    path: path.join(screenshots, 'key-rotation-failure.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: /更新密钥$/ }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(state.credentials[0].maskedValue, 'e2e-rotated-***');
  checks.push('credential create and rotation failure/retry, no secret echo');
  await visit('system/models', '模型列表');
  await page.getByRole('button', { name: /添加模型$/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('模型 ID', { exact: true }).fill('e2e-model');
  await dialog.getByLabel('显示名称', { exact: true }).fill('E2E 企业模型');
  await dialog.getByLabel('网关地址', { exact: true }).fill('https://gateway.example.test/v1');
  await dialog.getByLabel('上游模型', { exact: true }).fill('test-model');
  await dialog.getByRole('combobox', { name: '接入配置', exact: true }).click();
  await page.locator('.ant-select-item-option').filter({ hasText: 'E2E 模型接入' }).click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('E2E 企业模型', { exact: true }).first().waitFor();
  assert.equal(state.models[0].credentialId, state.credentials[0].id);
  checks.push('model registration reuses a server-only connection');
  // A freshly created model is catalog-publishable but not yet in the
  // desired routes: the drift badge shows, then publish replaces the state.
  await page.getByText('待发布', { exact: true }).first().waitFor();
  await page
    .getByRole('button', { name: /发布生效/ })
    .first()
    .click();
  await page
    .locator('.ant-popconfirm')
    .getByRole('button', { name: /发布生效/ })
    .click();
  await page.getByText('已发布，等待网关应用', { exact: true }).waitFor();
  assert.ok(state.requests.some((item) => item.method === 'POST' && item.path === '/aep/v1/admin/data-plane/publish'));
  assert.equal(state.dataPlane.desired.routes[0]?.modelId, 'e2e-model');
  checks.push('catalog drift badge and publish');
  await visit('system/models/configuration', '配置生效详情');
  await page.getByText('期望路由与模型目录一致', { exact: true }).waitFor();
  await visit('system/channels', 'E2E 企业微信');
  await visit('system/services', '服务状态');
  await page.screenshot({
    path: path.join(screenshots, 'services.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await visit('system/settings', '基本设置');
  await visit('system/licenses', '产品授权');
  await visit('audit', '日志审计');
  await page.getByRole('tab', { name: '登录日志', exact: true }).click();
  await page.getByText('登录历史查询尚未接入', { exact: true }).waitFor();
  checks.push('all available module routes, truthful unsupported login history');

  await visit('overview', '概览');
  await page.getByRole('combobox', { name: '外观', exact: true }).click();
  await page.getByText('深色', { exact: true }).last().click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await page.keyboard.press('Escape');
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').waitFor({ state: 'hidden' });
  // Wait for the finite theme transition before collecting color evidence.
  await page.waitForTimeout(350);
  await page.screenshot({
    path: path.join(screenshots, 'overview-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const loginsBeforeReload = state.requests.filter(
    (item) => item.method === 'POST' && item.path === '/aep/v1/auth/password/login',
  ).length;
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '概览', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
  assert.notEqual(
    await page.evaluate(() => localStorage.getItem('zhiyuan.admin.tokens')),
    null,
    'Reload must restore the persisted admin session',
  );
  assert.equal(
    state.requests.filter((item) => item.method === 'POST' && item.path === '/aep/v1/auth/password/login').length,
    loginsBeforeReload,
    'Reload must restore the stored session instead of issuing a new password login',
  );
  checks.push('theme persistence and session restoration without a new password login');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByLabel('密码', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('zhiyuan.admin.tokens')), null);
  checks.push('logout clears session');
  assert.deepEqual(errors, [], 'Browser console must be clear');
  const result = {
    status: 'passed',
    mode: 'mock-api',
    checks,
    requests: state.requests.length,
    screenshots,
    consoleErrors: errors,
  };
  await fs.writeFile(path.join(screenshots, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page
    ?.screenshot({ path: path.join(screenshots, 'failure.png'), fullPage: true, animations: 'disabled' })
    .catch(() => undefined);
  console.error(JSON.stringify({ checks, errors, route: page?.url() }));
  throw error;
} finally {
  await browser?.close().catch(() => undefined);
  server?.kill();
  api.close();
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function waitForHttp(origin) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Admin test server did not start');
}
async function findChrome() {
  for (const candidate of [
    process.env.ZHIYUAN_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean)) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error('Set ZHIYUAN_CHROME_PATH to a Chrome/Chromium executable');
}

async function waitForValue(read, expected) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (read() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(read(), expected);
}
