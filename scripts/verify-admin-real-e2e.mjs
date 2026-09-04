import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

// This verifier needs a running AEP control service. It starts an ephemeral
// static Admin Console unless ZHIYUAN_ADMIN_ORIGIN points at one already running.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceBase = process.env.ZHIYUAN_AEP_BASE_URL ?? 'http://127.0.0.1:8080';
const explicitOrigin = process.env.ZHIYUAN_ADMIN_ORIGIN;
const adminPassword = process.env.ZHIYUAN_AEP_ADMIN_PASSWORD ?? 'change-this-admin-password';
const suffix = `real-${Date.now().toString(36)}`;
const names = {
  user: `console-user-${suffix}`,
  display: `Console User ${suffix}`,
  imported: `console-imported-${suffix}`,
  team: `console-team-${suffix}`,
  role: `console-role-${suffix}`,
  skill: `console-skill-${suffix}`,
  model: `console-model-${suffix}`,
  credential: `Console Credential ${suffix}`,
};

let staticServer;
let adminOrigin = explicitOrigin;
let accessToken;
const browserPath = await findBrowser();
const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const requests = [];
page.on('request', request => {
  if (request.url().includes('/aep/')) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
});

const waitText = value => page.getByText(value, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
const waitGone = value => page.getByText(value, { exact: true }).first().waitFor({ state: 'detached', timeout: 15000 });
const dialog = () => page.getByRole('dialog');
const confirm = label => page.getByRole('alertdialog').getByRole('button', { name: label }).click();
const row = text => page.getByRole('row').filter({ hasText: text });

try {
  if (!adminOrigin) {
    const port = await freePort();
    staticServer = spawn(process.execPath, [path.join(repositoryRoot, 'scripts', 'serve-admin.mjs')], {
      cwd: repositoryRoot,
      env: { ...process.env, ZHIYUAN_AEP_BASE_URL: serviceBase, ZHIYUAN_ADMIN_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    adminOrigin = `http://127.0.0.1:${port}`;
  }
  await waitForHttp(`${adminOrigin}/aep/v1/metadata`);
  accessToken = await loginApi();
  await page.goto(adminOrigin, { waitUntil: 'networkidle' });
  await page.getByLabel('密码').fill(adminPassword);
  await page.getByRole('button', { name: '登录' }).click();
  await waitText('概览');

  await page.getByRole('button', { name: '资源管理' }).click();
  await waitText('admin');
  await createUserAndMemberships();
  await exerciseTeamAndRole();
  await exerciseSkill();
  await exerciseModel();
  await exerciseCredential();
  await exerciseEvents();
  await exerciseDataPlane();

  await page.reload({ waitUntil: 'networkidle' });
  await waitText('概览');
  await assertApiState();
  console.log(JSON.stringify({
    status: 'passed',
    origin: adminOrigin,
    prefix: suffix,
    checks: [
      'browser login and session restore',
      'user create/update/password reset/RBAC/import/disable',
      'team and role create/update/enable/disable/delete',
      'Skill create/update/enable/disable/version publish/withdraw/assignment revoke/delete',
      'model create/update/enable/disable/assignment revoke/delete',
      'credential create/update/rotate/enable/disable/assignment revoke/delete',
      'control event publish/detail/cancel',
      'data plane route add/update/remove/publish',
      'real API list state verification',
    ],
    requests: requests.length,
  }));
} catch (error) {
  console.error(JSON.stringify({ verifier: 'admin-real-e2e', url: page.url(), body: (await page.locator('body').innerText().catch(() => '')).slice(0, 2000) }));
  throw error;
} finally {
  await browser.close();
  if (staticServer) staticServer.kill();
}

async function createUserAndMemberships() {
  await page.getByRole('tab', { name: 'Team' }).click();
  await page.getByRole('button', { name: '新增 Team' }).click();
  let current = dialog();
  await current.getByLabel('Team ID').fill(names.team);
  await current.getByLabel('名称').fill(`Console Team ${suffix}`);
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`Console Team ${suffix}`);

  await page.getByRole('tab', { name: 'Role' }).click();
  await page.getByRole('button', { name: '新增 Role' }).click();
  current = dialog();
  await current.getByLabel('Role ID').fill(names.role);
  await current.getByLabel('名称').fill(`Console Role ${suffix}`);
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`Console Role ${suffix}`);

  await page.getByRole('tab', { name: '用户' }).click();
  await page.getByRole('button', { name: '新增用户' }).click();
  current = dialog();
  await current.getByLabel('用户名').fill(names.user);
  await current.getByLabel('显示名称').fill(names.display);
  await current.getByLabel('临时密码').fill(`Temporary-${suffix}-password`);
  await current.getByRole('checkbox', { name: `Console Role ${suffix}` }).click();
  await current.getByRole('checkbox', { name: `Console Team ${suffix}` }).click();
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(names.display);

  await row(names.user).getByRole('button', { name: '编辑' }).click();
  current = dialog();
  await current.getByLabel('显示名称').fill(`${names.display} Updated`);
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`${names.display} Updated`);

  await row(names.user).getByRole('button', { name: '重置密码' }).click();
  current = dialog();
  await current.getByLabel('临时密码').fill(`Reset-${suffix}-password`);
  await current.getByRole('button', { name: '保存' }).click();

  await page.getByRole('button', { name: '导入用户' }).click();
  current = dialog();
  const importPayload = JSON.stringify({ users: [{ externalRowId: `row-${suffix}`, username: names.imported, displayName: `Imported ${suffix}`, temporaryPassword: `Imported-${suffix}-password`, roleIds: ['admin'], teamIds: ['all-users'] }] });
  await current.getByLabel('用户 JSON 文件').setInputFiles({ name: 'users.json', mimeType: 'application/json', buffer: Buffer.from(importPayload) });
  await current.getByRole('button', { name: '导入用户' }).click();
  await waitText(`Imported ${suffix}`);
  await row(names.imported).getByRole('button', { name: '停用' }).click();
  await row(names.user).getByRole('button', { name: '停用' }).click();
  await waitText('停用');
}

async function exerciseTeamAndRole() {
  // Remove the temporary memberships before deleting their owner resources.
  await page.getByRole('tab', { name: '用户' }).click();
  await row(names.user).getByRole('button', { name: '编辑' }).click();
  let current = dialog();
  // Every user must retain a role and the built-in All users team.
  await ensureChecked(current.getByRole('checkbox', { name: 'Administrator' }));
  await ensureChecked(current.getByRole('checkbox', { name: 'All users' }));
  await ensureUnchecked(current.getByRole('checkbox', { name: `Console Role ${suffix}` }));
  await ensureUnchecked(current.getByRole('checkbox', { name: `Console Team ${suffix}` }));
  await current.getByRole('button', { name: '保存' }).click();

  await page.getByRole('button', { name: '资源管理' }).click();
  await page.getByRole('tab', { name: 'Team' }).click();
  const teamText = `Console Team ${suffix}`;
  await row(names.team).getByRole('button', { name: '编辑' }).click();
  current = dialog();
  await current.getByLabel('名称').fill(`${teamText} Updated`);
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`${teamText} Updated`);
  await row(names.team).getByRole('button', { name: '停用' }).click();
  await waitText('停用');
  await row(names.team).getByRole('button', { name: '启用' }).click();
  await waitText('启用');
  await row(names.team).getByRole('button', { name: '删除' }).click();
  await confirm('删除');
  await waitGone(`${teamText} Updated`);

  await page.getByRole('tab', { name: 'Role' }).click();
  const roleText = `Console Role ${suffix}`;
  await row(names.role).getByRole('button', { name: '编辑' }).click();
  current = dialog();
  await current.getByLabel('名称').fill(`${roleText} Updated`);
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`${roleText} Updated`);
  await row(names.role).getByRole('button', { name: '停用' }).click();
  await waitText('停用');
  await row(names.role).getByRole('button', { name: '启用' }).click();
  await waitText('启用');
  await row(names.role).getByRole('button', { name: '删除' }).click();
  await confirm('删除');
  await waitGone(`${roleText} Updated`);
}

async function exerciseSkill() {
  await page.getByRole('tab', { name: 'Skill', exact: true }).click();
  await page.getByRole('button', { name: '新增 Skill' }).click();
  let current = dialog();
  await current.getByLabel('Skill ID').fill(names.skill);
  await current.getByLabel('名称').fill(`Console Skill ${suffix}`);
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`Console Skill ${suffix}`);
  await row(names.skill).getByRole('button', { name: '编辑' }).click();
  current = dialog();
  await current.getByLabel('名称').fill(`Console Skill Updated ${suffix}`);
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`Console Skill Updated ${suffix}`);
  await row(names.skill).getByRole('button', { name: '停用' }).click();
  await waitText('停用');
  await row(names.skill).getByRole('button', { name: '启用' }).click();
  await waitText('启用');

  await row(names.skill).getByRole('button', { name: '上传版本' }).click();
  current = dialog();
  await current.getByLabel('版本号').fill('1.0.0');
  await current.getByLabel('Skill ZIP 包').setInputFiles({ name: 'skill.zip', mimeType: 'application/zip', buffer: Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64') });
  await current.getByRole('button', { name: '上传版本' }).click();
  await waitText('1.0.0');
  await current.getByRole('button', { name: '发布版本' }).click();
  await waitText('已发布');
  await current.getByRole('button', { name: '取消' }).click();
  await row(names.skill).getByRole('button', { name: '撤回版本' }).click();
  await confirm('确认撤回版本');

  await page.getByRole('tab', { name: 'Skill 授权' }).click();
  await page.getByRole('button', { name: '授权 Skill' }).first().click();
  current = dialog();
  await current.getByRole('button', { name: `Console Skill Updated ${suffix}` }).click();
  await current.getByRole('checkbox', { name: new RegExp(names.display) }).click();
  await current.getByRole('button', { name: '授权' }).click();
  await waitText(`${names.display} Updated`);
  await page.getByRole('button', { name: '撤销授权' }).first().click();
  await confirm('确认撤销');
  await page.getByRole('tab', { name: 'Skill', exact: true }).click();
  await row(names.skill).getByRole('button', { name: '删除' }).click();
  await confirm('删除');
  await waitGone(`Console Skill Updated ${suffix}`);
}

async function exerciseModel() {
  await page.getByRole('button', { name: '企业模型' }).click();
  await page.getByRole('button', { name: '添加模型' }).click();
  let current = dialog();
  await current.getByLabel('模型 ID').fill(names.model);
  await current.getByLabel('显示名称').fill(`Console Model ${suffix}`);
  await current.getByLabel('网关地址').fill('http://127.0.0.1:8090/v1');
  await current.getByLabel('上游模型').fill('deepseek-chat');
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`Console Model ${suffix}`);
  await page.getByRole('button', { name: '编辑模型' }).last().click();
  current = dialog();
  await current.getByLabel('显示名称').fill(`Console Model Updated ${suffix}`);
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`Console Model Updated ${suffix}`);
  await page.getByRole('button', { name: '分配模型' }).last().click();
  current = dialog();
  await current.getByRole('checkbox', { name: new RegExp(names.display) }).click();
  await current.getByRole('button', { name: '授权' }).click();
  await waitText(`${names.display} Updated`);
  await page.getByRole('button', { name: '撤销' }).first().click();
  await confirm('确认撤销');
  await page.getByRole('button', { name: '删除' }).last().click();
  await confirm('删除');
  await waitGone(`Console Model Updated ${suffix}`);
}

async function exerciseCredential() {
  await page.getByRole('button', { name: '平台运维' }).click();
  await page.getByRole('tab', { name: '凭证' }).click();
  await page.getByRole('button', { name: '添加凭证' }).click();
  let current = dialog();
  await current.getByLabel('名称').fill(names.credential);
  await current.getByLabel('服务').fill('model-gateway');
  await current.getByLabel('凭证值').fill(`secret-${suffix}`);
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(names.credential);
  const credentialRow = row(names.credential);
  await credentialRow.getByRole('button', { name: '编辑' }).click();
  current = dialog();
  await current.getByLabel('名称').fill(`${names.credential} Updated`);
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`${names.credential} Updated`);
  await row(names.credential).getByRole('button', { name: '轮换凭证' }).click();
  current = dialog();
  await current.getByLabel('凭证值').fill(`rotated-${suffix}`);
  await current.getByRole('button', { name: '轮换凭证' }).click();
  await row(names.credential).getByRole('button', { name: '停用' }).click();
  await waitText('停用');
  await row(names.credential).getByRole('button', { name: '启用' }).click();
  await waitText('启用');
  await row(names.credential).getByRole('button', { name: '授权凭证' }).click();
  current = dialog();
  await current.getByRole('checkbox', { name: new RegExp(names.display) }).click();
  await current.getByRole('button', { name: '授权' }).click();
  await waitText(`${names.display} Updated`);
  await page.getByRole('button', { name: '撤销' }).first().click();
  await confirm('确认撤销');
  await row(names.credential).getByRole('button', { name: '删除' }).click();
  await confirm('确认删除凭证');
  await waitGone(`${names.credential} Updated`);
}

async function exerciseEvents() {
  await page.getByRole('button', { name: '事件与审计' }).click();
  const before = (await api('/aep/v1/admin/control-events')).items.length;
  await page.getByRole('button', { name: '发布' }).click();
  await waitFor(async () => (await api('/aep/v1/admin/control-events')).items.length > before);
  await page.getByRole('button', { name: '查看详情' }).last().click();
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '取消事件' }).last().click();
  await confirm('确认取消事件');
}

async function exerciseDataPlane() {
  await page.getByRole('button', { name: '平台运维' }).click();
  await page.getByRole('tab', { name: '数据平面' }).click();
  await page.getByRole('button', { name: '添加路由' }).click();
  let current = dialog();
  await current.getByLabel('模型 ID').fill(`route-${suffix}`);
  await current.getByLabel('网关路径').fill('/v1/chat/completions');
  await current.getByLabel('上游模型').fill('deepseek-chat');
  await current.getByRole('button', { name: '保存' }).click();
  await waitText(`route-${suffix}`);
  await page.getByLabel('版本号').fill(`rev-${suffix}`);
  await page.getByRole('button', { name: '发布期望状态' }).click();
  await waitText(`route-${suffix}`);
  await row(`route-${suffix}`).getByRole('button', { name: '编辑' }).click();
  current = dialog();
  await current.getByLabel('网关路径').fill('/v1/responses');
  await current.getByRole('button', { name: '保存' }).click();
  await waitText('/v1/responses');
  await row(`route-${suffix}`).getByRole('button', { name: '删除' }).click();
  await confirm('确认删除路由');
  await page.getByRole('button', { name: '发布期望状态' }).click();
}

async function assertApiState() {
  const users = await api('/aep/v1/admin/users?limit=200');
  const teams = await api('/aep/v1/admin/teams');
  const roles = await api('/aep/v1/admin/roles');
  const skills = await api('/aep/v1/admin/skills');
  const models = await api('/aep/v1/admin/models');
  const credentials = await api('/aep/v1/admin/credentials');
  assert.equal(teams.teams.some(item => item.id === names.team), false);
  assert.equal(roles.roles.some(item => item.id === names.role), false);
  assert.equal(skills.skills.some(item => item.id === names.skill), false);
  assert.equal(models.models.some(item => item.id === names.model), false);
  assert.equal(credentials.credentials.some(item => item.name === names.credential), false);
  assert.equal(users.items.find(item => item.username === names.user)?.status, 'disabled');
  assert.equal(users.items.find(item => item.username === names.imported)?.status, 'disabled');
  assert.ok(requests.some(value => value.includes('/aep/v1/admin/skills/') && value.includes('/versions')));
  assert.ok(requests.some(value => value.includes('/aep/v1/admin/control-events')));
  assert.ok(requests.some(value => value.includes('/aep/v1/admin/data-plane/desired-state')));
}

async function ensureChecked(locator) {
  if (await locator.getAttribute('aria-checked') !== 'true') await locator.click();
}

async function ensureUnchecked(locator) {
  if (await locator.getAttribute('aria-checked') === 'true') await locator.click();
}

async function loginApi() {
  const response = await fetch(`${adminOrigin}/aep/v1/auth/password/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-AEP-Protocol-Version': '1.0' },
    body: JSON.stringify({ deploymentId: 'demo', username: 'admin', password: adminPassword }),
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return JSON.parse(text).accessToken;
}

async function api(pathname, options = {}) {
  const response = await fetch(`${adminOrigin}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', 'X-AEP-Protocol-Version': '1.0', Authorization: `Bearer ${accessToken}`, ...(options.headers ?? {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  assert.ok(response.ok, `${options.method ?? 'GET'} ${pathname}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function findBrowser() {
  const candidates = [process.env.ZHIYUAN_CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* try next candidate */ }
  }
  throw new Error('Chrome/Chromium was not found. Set ZHIYUAN_CHROME_PATH.');
}

async function freePort() {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForHttp(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* server still starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`HTTP server did not start: ${url}`);
}

async function waitFor(read) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await read()) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Condition did not become true before timeout.');
}
