import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createAdminFixture, state } from './admin-browser-fixture.mjs';

// Workbench (employee-facing) browser contract: regular members land in the
// workbench after login (no 403 wall), browse the roster with access reasons
// and phases, apply for an employee, follow their own requests, and admins
// keep the console with a one-click workbench switch. Fixtures test
// browser/API contracts, not production service behavior.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshots = process.env.ZHIYUAN_ADMIN_SCREENSHOTS ?? '/tmp/zhiyuan-workbench-qa';
const api = createAdminFixture();
let server;
let browser;
let page;
const errors = [];
const checks = [];
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
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });

  // --- Regular member ("zhang"): straight into the workbench, no 403 wall.
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByLabel('用户名', { exact: true }).fill('zhang');
  await page.getByLabel('密码', { exact: true }).fill('e2e-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('heading', { name: '我的工作台', exact: true }).waitFor();
  assert.equal(await page.getByText('没有管理权限').count(), 0);
  assert.equal(new URL(page.url()).hash, '#workbench');
  assert.equal(await page.getByRole('menuitem').count(), 0, 'Employees get no admin sidebar');
  const rosterRow = page.getByRole('row').filter({ hasText: 'E2E 销售助理' });
  await rosterRow.waitFor();
  assert.equal(await rosterRow.getByText('全体成员', { exact: true }).count(), 1, 'Access reason column');
  assert.equal(await rosterRow.getByText('已发布', { exact: true }).count(), 1, 'Phase column');
  await page.getByText('销售数据助理', { exact: true }).first().waitFor();
  await page.screenshot({
    path: path.join(screenshots, 'workbench-home.png'),
    fullPage: true,
    animations: 'disabled',
  });
  checks.push('regular member lands in the workbench: roster with access reason/phase plus own requests');

  // --- Apply: the form parks a request and lands on the submitted page.
  await page.getByRole('button', { name: /申请数字员工/ }).click();
  await page.getByText(/平台默认模型/).waitFor();
  await page.getByLabel('技术标识').fill('e2e-wb-helper');
  await page.getByLabel('申请名称').fill('E2E 工作台助理');
  await page.getByLabel('使用目的').fill('整理测试数据，辅助生成周报。');
  await page.getByLabel('补充说明').fill('仅使用销售团队可见资料。');
  await page.screenshot({
    path: path.join(screenshots, 'workbench-apply.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await page.getByText('申请已提交', { exact: true }).waitFor();
  assert.match(new URL(page.url()).hash, /^#workbench\/submitted\/req-wb-\d+$/);
  await page.getByText('待平台管理员审批', { exact: true }).waitFor();
  checks.push('apply form parks the request and shows the submitted timeline');

  // --- Detail: approval and deployment stay visibly apart.
  await page.getByRole('button', { name: '查看申请', exact: true }).click();
  await page.getByRole('heading', { name: /申请详情/ }).waitFor();
  await page.getByText('尚未开始', { exact: true }).first().waitFor();
  // Both fields are echoed from the apply payload (the fixture stores what
  // was submitted), not from fixture constants.
  await page.getByText('整理测试数据，辅助生成周报。', { exact: true }).waitFor();
  await page.getByText('仅使用销售团队可见资料。', { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(screenshots, 'workbench-detail.png'),
    fullPage: true,
    animations: 'disabled',
  });
  checks.push('request detail shows approval and deployment separately');

  // --- My requests: the parked and the seeded request both list.
  // Icon buttons fold the icon label into the accessible name; match the
  // trailing text (the CRUD script uses the same idiom).
  await page.getByRole('button', { name: /返回申请列表$/ }).click();
  await page.getByRole('heading', { name: '我的申请', exact: true }).waitFor();
  await page.getByRole('row').filter({ hasText: 'E2E 工作台助理' }).first().waitFor();
  assert.ok((await page.getByRole('row').filter({ hasText: '销售数据助理' }).count()) >= 1);
  checks.push('own-requests list shows parked and seeded requests');

  // --- Sign out returns to the shared login screen.
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('heading', { name: '登录企业管理后台' }).waitFor();

  // --- Administrator: console by default, one-click workbench switch.
  await page.getByLabel('用户名', { exact: true }).fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('e2e-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('heading', { name: '概览', exact: true }).waitFor();
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await page.getByRole('heading', { name: '我的工作台', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '管理后台', exact: true }).count(), 1);
  await page.screenshot({
    path: path.join(screenshots, 'workbench-as-admin.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '管理后台', exact: true }).click();
  await page.getByRole('heading', { name: '概览', exact: true }).waitFor();
  checks.push('admin switches console <-> workbench with a single login');

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
