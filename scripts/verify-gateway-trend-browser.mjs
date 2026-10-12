import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dayjs from 'dayjs';
import { chromium } from 'playwright-core';
import { createAdminFixture } from './admin-browser-fixture.mjs';

// Fixture-only UI regression. Native-shaped samples exercise gaps and gestures;
// this does not claim runtime metric completeness or production acceptance.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = process.env.ZHIYUAN_ADMIN_SCREENSHOTS ?? path.join(root, 'build/gateway-trend-browser');
const api = createAdminFixture();
const requests = [];
const errors = [];
let child;
let browser;
let mode = 'data';
const checks = [];
try {
  await fs.mkdir(folder, { recursive: true });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(root, 'scripts/serve-admin.mjs')], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      ZHIYUAN_ADMIN_PORT: String(port),
      ZHIYUAN_ADMIN_WEKNORA_PORT: '0',
      ZHIYUAN_AEP_BASE_URL: `http://127.0.0.1:${api.address().port}`,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      await fetch(origin)
        .then((response) => response.ok)
        .catch(() => false)
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const executablePath =
    process.env.CHROME_PATH ??
    (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1500 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/model-gateway/metrics?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(Object.fromEntries(query));
    if (mode === 'error')
      return route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code: 'SOURCE_UNAVAILABLE', detail: 'Fixture source unavailable' }),
      });
    const start = Date.parse(query.get('start')) / 1000;
    const metric = query.get('metric');
    const values = Array.from({ length: 61 }, (_, index) => [
      start + index * 60,
      index === 30 ? 'NaN' : String((metric === 'failures' ? 1 : 10) + (index % 9)),
    ]);
    return route.fulfill({
      json: {
        source: 'prometheus',
        queriedAt: new Date().toISOString(),
        definition: {
          id: metric,
          unit: metric.includes('tokens') ? 'tokens' : 'requests',
          aggregation: 'counter_increase',
          windowSeconds: Number(query.get('step')),
          groupBy: query.get('groupBy'),
          modelDimension: 'not_applicable',
        },
        data: { data: { result: mode === 'empty' ? [] : [{ metric: {}, values }] } },
      },
    });
  });
  const select = async (label, option) => {
    await page.getByLabel(label, { exact: true }).click();
    await page.locator('.ant-select-dropdown:visible').getByText(option, { exact: true }).click();
  };
  await page.goto(origin);
  await page.getByLabel('用户名', { exact: true }).fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('e2e-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('heading', { name: '概览', exact: true }).waitFor();
  await page.goto(`${origin}/#model-gateway/observe`);
  const calls = page.getByRole('img', { name: '调用趋势', exact: true });
  const tokens = page.getByRole('img', { name: 'Token 用量趋势', exact: true });
  await calls.locator('canvas').waitFor();
  await tokens.locator('canvas').waitFor();
  assert.equal(await page.getByLabel('调用结果筛选').count(), 0);
  assert.equal(await page.getByText('调用与失败趋势', { exact: true }).count(), 0);
  assert.equal(await page.locator('.ant-card-head-title').getByText('成本统计', { exact: true }).count(), 1);
  const images = () =>
    page
      .locator('.gateway-native-chart canvas')
      .evaluateAll((elements) => elements.map((canvas) => canvas.toDataURL()));
  await calls.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const original = await images();
  const box = await calls.locator('canvas').boundingBox();
  await page.screenshot({ path: path.join(folder, 'slider-before.png') });
  console.log(JSON.stringify({ canvasBox: box }));
  // The official slider sits below the x axis; use real pointer gestures.
  const left = box.x + 56;
  const right = box.x + box.width - 32;
  const sliderY = box.y + box.height - 28;
  await page.mouse.move(left, sliderY);
  await page.mouse.down();
  await page.mouse.move(left + (right - left) * 0.25, sliderY, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const zoomed = await images();
  assert.ok(zoomed[0] !== original[0], 'calls must zoom after dragging the left handle');
  assert.ok(zoomed[1] !== original[1], 'Tokens must follow the linked slider');
  const middle = left + (right - left) * 0.6;
  await page.mouse.move(middle, sliderY);
  await page.mouse.down();
  await page.mouse.move(middle - (right - left) * 0.15, sliderY, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const panned = await images();
  assert.ok(panned[0] !== zoomed[0], 'calls must pan after dragging the selection');
  assert.ok(panned[1] !== zoomed[1], 'Tokens must follow the linked pan');
  checks.push('real native slider handle zoom and selection pan link both charts');
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.4);
  await page.locator('.g2-tooltip:visible').first().waitFor();
  assert.match(await page.locator('.g2-tooltip:visible').first().innerText(), /调用次数|value/);
  checks.push('native crosshair tooltip');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(folder, 'fixture-light.png') });
  await select('时间范围', '自定义时段');
  assert.equal(await page.locator('.gateway-time-range').count(), 1);
  const inputs = page.locator('.gateway-time-range input');
  const start = dayjs().subtract(2, 'hour').startOf('minute');
  const end = dayjs().subtract(1, 'hour').startOf('minute');
  await inputs.first().fill(start.format('YYYY-MM-DD HH:mm'));
  await inputs.first().press('Tab');
  await inputs.nth(1).fill(end.format('YYYY-MM-DD HH:mm'));
  await inputs.nth(1).press('Enter');
  await inputs.nth(1).press('Escape');
  for (let attempt = 0; attempt < 50; attempt++) {
    if (requests.some((query) => query.start === start.toISOString() && query.end === end.toISOString())) break;
    await page.waitForTimeout(100);
  }
  assert(
    requests.some((query) => query.start === start.toISOString() && query.end === end.toISOString()),
    'both picker endpoints must reach the API together',
  );
  checks.push('one confirmed RangePicker submits full-year start/end');
  await inputs.first().click();
  await page.locator('.ant-picker-dropdown:visible .ant-picker-panel-container').waitFor();
  await page.screenshot({ path: path.join(folder, 'fixture-range-picker.png') });
  await inputs.first().press('Escape');
  await select('时间范围', '最近 1 小时');
  await select('外观', '深色');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(folder, 'fixture-dark.png') });
  for (const width of [736, 392, 320]) {
    await page.setViewportSize({ width, height: 1400 });
    await page.waitForTimeout(700);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
      console.log(
        await page.evaluate(() =>
          Array.from(document.querySelectorAll('body *'))
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.right > innerWidth + 1 && box.width > 0;
            })
            .slice(0, 15)
            .map((element) => ({
              className: element.className,
              width: element.getBoundingClientRect().width,
              right: element.getBoundingClientRect().right,
            })),
        ),
      );
      await page.screenshot({ path: path.join(folder, 'overflow.png'), fullPage: true });
    }
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `page overflows at ${width}`,
    );
    assert(
      await page
        .locator('.gateway-trend-card')
        .evaluateAll((cards) => cards.every((card) => card.scrollWidth <= card.clientWidth + 1)),
      `chart card overflows at ${width}`,
    );
  }
  await page.screenshot({ path: path.join(folder, 'fixture-narrow.png'), fullPage: true });
  checks.push('dark/light theme and 736/392/320px layout');
  const groupTable = page.locator('.gateway-group-table');
  assert.equal(await groupTable.locator('.ant-table-pagination').count(), 1);
  assert.equal(
    await groupTable.evaluate((element) => getComputedStyle(element).backgroundColor),
    await groupTable.locator('.ant-table').evaluate((element) => getComputedStyle(element).backgroundColor),
  );
  checks.push('group pagination stays inside its table surface');
  mode = 'empty';
  await page.getByRole('button', { name: '刷新查询', exact: true }).click();
  await calls.waitFor({ state: 'detached' });
  await tokens.waitFor({ state: 'detached' });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.gateway-trend-card .ant-empty-description')).filter(
        (element) => element.textContent === '当前查询没有原生数据',
      ).length === 2,
  );
  assert.equal(await page.locator('.gateway-trend-card').getByText('当前查询没有原生数据', { exact: true }).count(), 2);
  mode = 'error';
  await page.getByRole('button', { name: '刷新查询', exact: true }).click();
  await page.getByText('数据加载失败', { exact: true }).first().waitFor();
  mode = 'data';
  await page.getByRole('button', { name: '刷新查询', exact: true }).click();
  await calls.locator('canvas').waitFor();
  await page.goto(`${origin}/#overview`);
  await page.getByRole('heading', { name: '概览', exact: true }).waitFor();
  assert.equal(await page.locator('.gateway-native-chart').count(), 0);
  await page.goto(`${origin}/#model-gateway/observe`);
  await calls.locator('canvas').waitFor();
  await tokens.locator('canvas').waitFor();
  assert.equal(await page.locator('.gateway-native-chart canvas').count(), 2);
  await page.locator('.gateway-time-range input').first().click();
  const popup = page.locator('.ant-picker-dropdown:visible .ant-picker-panel-container');
  await popup.waitFor();
  const popupBox = await popup.boundingBox();
  assert(popupBox.x >= 0 && popupBox.x + popupBox.width <= 321, 'narrow RangePicker must stay in the viewport');
  checks.push('narrow RangePicker remains reachable with local horizontal scrolling');
  await page.screenshot({ path: path.join(folder, 'fixture-narrow-picker.png') });
  await page.locator('.gateway-time-range input').first().press('Escape');
  checks.push('empty/error recovery and chart teardown/remount');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', checks, metricRequests: requests.length, errors }));
} finally {
  await fs.writeFile(
    path.join(folder, 'report.json'),
    JSON.stringify({ checks, errors, metricRequests: requests.length }, null, 2),
  );
  await browser?.close();
  child?.kill();
  await new Promise((resolve) => api.close(resolve));
}
