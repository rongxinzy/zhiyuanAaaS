import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
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
// Companion messenger stub: the workbench home embeds /companion/ through the
// admin server's proxy; a minimal page stands in for the real messenger so the
// iframe contract (mint → embed) is asserted without a live companion pod.
const companionStub = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><html><body><main id="messenger-stub">messenger stub</main></body></html>');
});
let server;
let browser;
let page;
const errors = [];
const checks = [];
try {
  await fs.mkdir(screenshots, { recursive: true });
  const apiPort = await listen(api);
  const companionPort = await listen(companionStub);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'scripts/serve-admin.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      ZHIYUAN_ADMIN_PORT: String(port),
      ZHIYUAN_AEP_BASE_URL: `http://127.0.0.1:${apiPort}`,
      ZHIYUAN_PORTAL_BASE_URL: `http://127.0.0.1:${apiPort}`,
      ZHIYUAN_COMPANION_BASE_URL: `http://127.0.0.1:${companionPort}`,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await waitForHttp(origin);
  // Local Chrome binary, or an already-running headless Chrome over CDP
  // (ZHIYUAN_CHROME_CDP=http://127.0.0.1:9222) when no executable exists.
  const cdp = process.env.ZHIYUAN_CHROME_CDP;
  if (cdp) {
    browser = await chromium.connectOverCDP(cdp);
    page = await browser.contexts()[0].newPage();
  } else {
    browser = await chromium.launch({
      headless: true,
      executablePath: await findChrome(),
    });
    page = await browser.newPage();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });

  // --- Regular member ("zhang"): straight into the workbench messenger.
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByLabel('用户名', { exact: true }).fill('zhang');
  await page.getByLabel('密码', { exact: true }).fill('e2e-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByText('消息', { exact: true }).first().waitFor();
  assert.equal(await page.getByText('没有管理权限').count(), 0);
  assert.equal(new URL(page.url()).hash, '#workbench');
  assert.equal(await page.getByRole('menuitem').count(), 0, 'Employees get no admin sidebar');
  // The portal session is minted, then the messenger iframe embeds through
  // the same-origin /companion/ proxy.
  const messenger = page.locator('iframe[title="消息"]');
  await messenger.waitFor();
  await page.frameLocator('iframe[title="消息"]').locator('#messenger-stub').waitFor();
  await page.screenshot({
    path: path.join(screenshots, 'workbench-home.png'),
    fullPage: true,
    animations: 'disabled',
  });
  checks.push('regular member lands in the workbench: session minted and messenger iframe embedded');

  // --- Proxy hardening regressions (review findings B1/B2).
  // Malformed request-target: llhttp accepts it, WHATWG URL rejects it — the
  // server must answer 4xx and stay alive (one packet must not kill the
  // console + WeKnora process).
  {
    const { socket, statusLine } = await rawStatusLine(port, 'GET http://[ HTTP/1.1');
    socket.destroy();
    assert.match(statusLine ?? '', /^HTTP\/1\.[01] 4\d\d/, 'malformed request-target must get a 4xx');
    const alive = await fetch(origin).then((r) => r.ok).catch(() => false);
    assert.ok(alive, 'server must survive a malformed request-target');
    checks.push('malformed request-target answered 4xx without killing the process');
  }
  // Open-proxy guard: `/companion//<host>/x` must route to the configured
  // companion target's `/<host>/x` path — never reinterpret `<host>` as an
  // authority. A second stub proves no request escapes to arbitrary hosts.
  {
    let escapeAttempts = 0;
    const escapeTarget = http.createServer(() => {
      escapeAttempts += 1;
    });
    const escapePort = await listen(escapeTarget);
    const res = await fetch(`${origin}/companion//127.0.0.1:${escapePort}/steal`, {
      headers: { cookie: 'de_portal_session=x; csrf_token=y' },
    }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 300));
    escapeTarget.close();
    assert.equal(escapeAttempts, 0, 'companion proxy must not become an open relay');
    if (res) {
      assert.ok([400, 404, 502].includes(res.status) || res.status === 200, `unexpected status ${res.status}`);
      // Whatever answered, it must be the configured stub (path-routed), not
      // the escape target: the escape server saw zero requests.
    }
    checks.push('companion double-slash does not reinterpret host authority (no open relay)');
  }

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
  await page.locator('iframe[title="消息"]').waitFor();
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
  companionStub.close();
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

// Sends one raw request line over a socket and resolves with the response's
// status line (or null on early close). Playwright cannot emit malformed
// request-targets; this regression needs the raw wire.
function rawStatusLine(port, requestLine) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve({ socket, statusLine: null });
    });
    socket.on('error', (error) => {
      socket.destroy();
      resolve({ socket, statusLine: null, error: error.message });
    });
    socket.on('connect', () => {
      socket.write(`${requestLine}\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      const statusLine = chunk.toString('latin1').split('\r\n')[0];
      socket.destroy();
      resolve({ socket, statusLine });
    });
  });
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
