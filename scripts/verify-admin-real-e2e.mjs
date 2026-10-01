import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

import { requiredEnvironment } from './e2e-environment.mjs';

// This verifier needs a running AEP control service. It starts an ephemeral
// static Admin Console unless ZHIYUAN_ADMIN_ORIGIN points at one already running.
// The console is the Ant Design rewrite: seven business entries in the side
// navigation, hash routes, Modal/Drawer/Select/Popconfirm interactions, and a
// session that survives reloads and is cleared only by explicit sign-out.
// Control-event publishing and raw data-plane route editing were removed from
// the product; the audit and configuration pages are verified read-only here.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceBase = process.env.ZHIYUAN_AEP_BASE_URL ?? 'http://127.0.0.1:8080';
const explicitOrigin = process.env.ZHIYUAN_ADMIN_ORIGIN;
const deploymentId = process.env.ZHIYUAN_AEP_DEPLOYMENT_ID ?? 'demo';
const adminUsername = process.env.ZHIYUAN_AEP_ADMIN_USERNAME ?? 'admin';
const adminPassword = requiredEnvironment('ZHIYUAN_AEP_ADMIN_PASSWORD');
const memberRoleId = process.env.ZHIYUAN_AEP_E2E_ROLE_ID ?? 'aaas-e2e-member';
const memberRoleName = 'AaaS E2E member';
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
let verifierError;
const browserPath = await findBrowser();
const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const requests = [];
const authenticationDiagnostics = [];
const browserDiagnostics = [];
page.on('request', (request) => {
  if (request.url().includes('/aep/')) requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
});
page.on('response', (response) => {
  const pathname = new URL(response.url()).pathname;
  if (pathname === '/aep/v1/auth/password/login' || pathname === '/aep/v1/user/me') {
    authenticationDiagnostics.push(`${response.request().method()} ${pathname} ${response.status()}`);
  }
});
page.on('requestfailed', (request) => {
  const pathname = new URL(request.url()).pathname;
  if (pathname === '/aep/v1/auth/password/login' || pathname === '/aep/v1/user/me') {
    authenticationDiagnostics.push(
      `${request.method()} ${pathname} failed: ${request.failure()?.errorText ?? 'unknown error'}`,
    );
  }
});
page.on('console', (message) => {
  if (message.type() === 'error') browserDiagnostics.push(message.text().slice(0, 500));
});
page.on('pageerror', (error) => browserDiagnostics.push(error.message.slice(0, 500)));

const waitText = (value) =>
  page.getByText(value, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
const waitGone = (value) =>
  page.getByText(value, { exact: true }).first().waitFor({ state: 'detached', timeout: 15000 });
const waitHeading = (value) =>
  page.getByRole('heading', { name: value, exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
const dialog = () => page.getByRole('dialog');
const row = (text) => page.getByRole('row').filter({ hasText: text }).first();
const menuItem = (name) => page.getByRole('menuitem', { name, exact: true }).first();
const tabItem = (name) => page.getByRole('tab', { name }).first();
// Ant Design keeps closed Popconfirm overlays mounted; only confirm the visible one.
const confirmPopover = (label) =>
  page
    .locator('.ant-popover:not(.ant-popover-hidden)')
    .getByRole('button', { name: label, exact: true })
    .first()
    .click();
const closeDrawer = async () => {
  await dialog()
    .getByRole('button', { name: /关闭|Close/ })
    .first()
    .click();
  await dialog().first().waitFor({ state: 'hidden', timeout: 15000 });
};

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
  await waitForHttp(adminOrigin);
  accessToken = await loginApi();
  await ensureMemberRole();
  await page.goto(adminOrigin, { waitUntil: 'networkidle' });
  await page.getByLabel('用户名', { exact: true }).fill(adminUsername);
  await page.getByLabel('密码', { exact: true }).fill(adminPassword);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  const loginOutcome = await Promise.race([
    waitHeading('概览').then(() => 'authenticated'),
    page
      .getByText('登录失败，请检查账号信息或稍后重试。', { exact: true })
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => 'failed'),
  ]);
  assert.equal(loginOutcome, 'authenticated', 'Admin Console rejected a successful AEP authentication response');
  assert.equal(
    await page.getByRole('menuitem').count(),
    7,
    'The redesigned console must expose exactly seven business entries',
  );

  await createUserAndMemberships();
  await exerciseTeamAndRole();
  await exerciseSkill();
  await exerciseModel();
  await exerciseCredential();
  await exerciseAuditReadonly();
  await exerciseConfigurationReadonly();
  await assertApiState();
  await assertSessionSemantics();

  console.log(
    JSON.stringify({
      status: 'passed',
      origin: adminOrigin,
      prefix: suffix,
      checks: [
        'browser login and seven business entries',
        'reload restores the persisted session; explicit sign-out clears it',
        'user create/update/password reset/RBAC/import/disable',
        'team and role create/update/enable/disable/delete',
        'skill create/update/enable/disable/version upload/publish/withdraw/grant+revoke/delete',
        'model create/update/assignment grant/revoke/delete',
        'credential create/update/rotate/enable/disable/grant+revoke/delete',
        'audit read-only query, execution records, honest login-history gap',
        'data-plane configuration status read-only (route editing removed from the product)',
        'real API list state verification',
      ],
      requests: requests.length,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      verifier: 'admin-real-e2e',
      url: page.url(),
      body: (
        await page
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(0, 2000),
      authenticationDiagnostics,
      browserDiagnostics,
    }),
  );
  verifierError = error;
} finally {
  if (accessToken) {
    try {
      await disableAndRevokeTestUsers();
    } catch (error) {
      if (!verifierError) verifierError = error;
      else console.error('Admin real E2E cleanup failed.');
    }
  }
  await browser.close();
  if (staticServer) staticServer.kill();
}
if (verifierError) throw verifierError;

async function createUserAndMemberships() {
  await menuItem('用户管理').click();
  await tabItem('团队管理').click();
  await page.getByRole('button', { name: '新增团队', exact: true }).click();
  let current = dialog();
  await current.getByLabel('团队 ID', { exact: true }).fill(names.team);
  await current.getByLabel('名称', { exact: true }).fill(`Console Team ${suffix}`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(`Console Team ${suffix}`);

  await tabItem('角色权限').click();
  await page.getByRole('button', { name: '新增角色', exact: true }).click();
  current = dialog();
  await current.getByLabel('角色 ID', { exact: true }).fill(names.role);
  await current.getByLabel('名称', { exact: true }).fill(`Console Role ${suffix}`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(`Console Role ${suffix}`);

  await tabItem('用户列表').click();
  await page.getByRole('button', { name: '新增用户', exact: true }).click();
  current = dialog();
  await current.getByLabel('用户名', { exact: true }).fill(names.user);
  await current.getByLabel('显示名称', { exact: true }).fill(names.display);
  await current.getByLabel('临时密码', { exact: true }).fill(`Temporary-${suffix}-password`);
  await current.getByRole('checkbox', { name: new RegExp(memberRoleName) }).check();
  await current.getByRole('checkbox', { name: /All users/ }).check();
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(names.display);

  // Filter the user table so prior runs' disabled accounts cannot hide this row.
  await page.getByLabel('搜索姓名或账号', { exact: true }).fill(names.user);
  const userRow = row(names.user);

  await userRow.getByRole('button', { name: '编辑', exact: true }).click();
  current = dialog();
  await current.getByLabel('显示名称', { exact: true }).fill(`${names.display} Updated`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(`${names.display} Updated`);

  await userRow.getByRole('button', { name: '更多', exact: true }).hover();
  await page.getByRole('menuitem', { name: '重置密码', exact: true }).click();
  current = dialog();
  await current.getByLabel('临时密码', { exact: true }).fill(`Reset-${suffix}-password`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: '导入用户', exact: true }).click();
  current = dialog();
  const importPayload = JSON.stringify({
    users: [
      {
        externalRowId: `row-${suffix}`,
        username: names.imported,
        displayName: `Imported ${suffix}`,
        temporaryPassword: `Imported-${suffix}-password`,
        roleIds: [memberRoleId],
        teamIds: ['all-users'],
      },
    ],
  });
  await current
    .locator('input[type="file"]')
    .setInputFiles({ name: 'users.json', mimeType: 'application/json', buffer: Buffer.from(importPayload) });
  await current.getByRole('button', { name: '导入用户', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText('导入结果');
  await waitText(`Imported ${suffix}`);

  await disableUserViaRow(row(names.user));
  await page.getByLabel('搜索姓名或账号', { exact: true }).fill(names.imported);
  await disableUserViaRow(row(names.imported));
}

async function disableUserViaRow(target) {
  await target.getByRole('button', { name: '更多', exact: true }).hover();
  await page.getByRole('menuitem', { name: '停用', exact: true }).click();
  const current = dialog();
  await current.getByRole('button', { name: '确认停用', exact: true }).click();
  await current.getByText('账号已停用', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await current.locator('button.ant-btn-primary:not(.ant-btn-loading)').filter({ hasText: '确定' }).click();
  await current.waitFor({ state: 'hidden' });
}

async function exerciseTeamAndRole() {
  await tabItem('团队管理').click();
  await page.getByLabel('搜索团队名称', { exact: true }).fill(names.team);
  const teamText = `Console Team ${suffix}`;
  await row(names.team).getByRole('button', { name: '编辑', exact: true }).click();
  let current = dialog();
  await current.getByLabel('名称', { exact: true }).fill(`${teamText} Updated`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(`${teamText} Updated`);
  const teamRow = row(names.team);
  await teamRow.getByRole('button', { name: '停用', exact: true }).click();
  await teamRow.getByRole('button', { name: '启用', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await teamRow.getByRole('button', { name: '启用', exact: true }).click();
  await teamRow.getByRole('button', { name: '停用', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await teamRow.getByRole('button', { name: '删除', exact: true }).click();
  await confirmPopover('删除');
  await waitGone(`${teamText} Updated`);

  await tabItem('角色权限').click();
  await page.getByLabel('搜索角色', { exact: true }).fill(names.role);
  const roleText = `Console Role ${suffix}`;
  await row(names.role).getByRole('button', { name: '编辑', exact: true }).click();
  current = dialog();
  await current.getByLabel('名称', { exact: true }).fill(`${roleText} Updated`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(`${roleText} Updated`);
  const roleRow = row(names.role);
  await roleRow.getByRole('button', { name: '停用', exact: true }).click();
  await roleRow.getByRole('button', { name: '启用', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await roleRow.getByRole('button', { name: '启用', exact: true }).click();
  await roleRow.getByRole('button', { name: '停用', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await roleRow.getByRole('button', { name: '删除', exact: true }).click();
  await confirmPopover('删除');
  await waitGone(`${roleText} Updated`);
}

async function exerciseSkill() {
  await menuItem('技能管理').click();
  await page.getByRole('button', { name: '新增技能', exact: true }).click();
  let current = dialog();
  await current.getByLabel('技能 ID', { exact: true }).fill(names.skill);
  await current.getByLabel('名称', { exact: true }).fill(`Console Skill ${suffix}`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(`Console Skill ${suffix}`);
  await page.getByLabel('搜索名称或用途', { exact: true }).fill(names.skill);
  const skillRow = row(names.skill);
  await skillRow.getByRole('button', { name: '编辑', exact: true }).click();
  current = dialog();
  await current.getByLabel('名称', { exact: true }).fill(`Console Skill Updated ${suffix}`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(`Console Skill Updated ${suffix}`);
  await skillRow.getByRole('button', { name: '停用', exact: true }).click();
  await skillRow.getByRole('button', { name: '启用', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await skillRow.getByRole('button', { name: '启用', exact: true }).click();
  await skillRow.getByRole('button', { name: '停用', exact: true }).waitFor({ state: 'visible', timeout: 15000 });

  // Version lifecycle inside the skill detail drawer.
  await skillRow.getByRole('button', { name: '查看', exact: true }).click();
  current = dialog();
  await current.getByRole('tab', { name: /^版本记录/ }).click();
  await current.getByLabel('版本号', { exact: true }).fill('1.0.0');
  await current.locator('input[type="file"]').setInputFiles({
    name: 'skill.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64'),
  });
  await current.getByRole('button', { name: '上传版本', exact: true }).click();
  const versionRow = current.getByRole('row').filter({ hasText: '1.0.0' }).first();
  await versionRow.waitFor({ state: 'visible', timeout: 15000 });
  await versionRow.getByRole('button', { name: '发布', exact: true }).click();
  await current.getByText('已发布', { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
  await versionRow.getByRole('button', { name: '撤回', exact: true }).click();
  await confirmPopover('确认撤回版本');

  // Grant the skill to the created user, then revoke from the same drawer.
  await closeDrawer();
  await page.getByRole('button', { name: '授权技能', exact: true }).click();
  current = dialog();
  await current.getByRole('combobox').click();
  await page
    .locator('.ant-select-item-option')
    .filter({ hasText: `Console Skill Updated ${suffix}` })
    .first()
    .click();
  await current.getByRole('checkbox', { name: new RegExp(names.user) }).check();
  await current.getByRole('button', { name: '授权', exact: true }).click();
  await current.waitFor({ state: 'hidden' });

  await skillRow.getByRole('button', { name: '查看', exact: true }).click();
  current = dialog();
  await current.getByRole('tab', { name: /^使用权限/ }).click();
  const assignmentRow = current.getByRole('row').filter({ hasText: names.user }).first();
  await assignmentRow.waitFor({ state: 'visible', timeout: 15000 });
  await assignmentRow.getByRole('button', { name: '撤销授权', exact: true }).click();
  await confirmPopover('确认撤销');
  await assignmentRow.waitFor({ state: 'detached', timeout: 15000 });
  await closeDrawer();

  await skillRow.getByRole('button', { name: '删除', exact: true }).click();
  await confirmPopover('删除');
  await waitGone(`Console Skill Updated ${suffix}`);
}

async function exerciseModel() {
  await menuItem('系统管理').click();
  await tabItem('模型服务').click();
  await tabItem('模型列表').click();
  await page.getByRole('button', { name: '添加模型', exact: true }).click();
  let current = dialog();
  await current.getByLabel('模型 ID', { exact: true }).fill(names.model);
  await current.getByLabel('显示名称', { exact: true }).fill(`Console Model ${suffix}`);
  await current.getByLabel('网关地址', { exact: true }).fill('http://127.0.0.1:8090/v1');
  await current.getByLabel('上游模型', { exact: true }).fill('deepseek-chat');
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(`Console Model ${suffix}`);
  await page.getByPlaceholder('搜索模型名称或标识').fill(names.model);
  const modelRow = row(names.model);

  await modelRow.getByRole('button', { name: '编辑模型', exact: true }).click();
  current = dialog();
  await current.getByLabel('显示名称', { exact: true }).fill(`Console Model Updated ${suffix}`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(`Console Model Updated ${suffix}`);

  await modelRow.getByRole('button', { name: '分配模型', exact: true }).click();
  await waitHeading('为成员分配模型');
  await page.getByRole('checkbox', { name: new RegExp(names.user) }).check();
  await page.getByRole('button', { name: '授权', exact: true }).click();
  await waitText(`Console Model Updated ${suffix}`);

  await modelRow.getByRole('button', { name: '查看详情', exact: true }).click();
  current = dialog();
  await current.getByRole('tab', { name: '使用权限', exact: true }).click();
  const assignmentRow = current.getByRole('row').filter({ hasText: names.user }).first();
  await assignmentRow.waitFor({ state: 'visible', timeout: 15000 });
  await assignmentRow.getByRole('button', { name: '撤销授权', exact: true }).click();
  await confirmPopover('确认撤销');
  await assignmentRow.waitFor({ state: 'detached', timeout: 15000 });
  await closeDrawer();

  await modelRow.getByRole('button', { name: '操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  current = dialog();
  await current.getByRole('button', { name: '删除', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitGone(`Console Model Updated ${suffix}`);
}

async function exerciseCredential() {
  await tabItem('接入配置').click();
  await page.getByRole('button', { name: '新建接入配置', exact: true }).click();
  let current = dialog();
  await current.getByLabel('名称', { exact: true }).fill(names.credential);
  await current.getByLabel('服务', { exact: true }).fill('model-gateway');
  await current.getByLabel('新密钥', { exact: true }).fill(`secret-${suffix}`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(names.credential);
  const credentialRow = row(names.credential);

  await credentialRow.getByRole('button', { name: '编辑', exact: true }).click();
  current = dialog();
  await current.getByLabel('名称', { exact: true }).fill(`${names.credential} Updated`);
  await current.getByRole('button', { name: '保存', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitText(`${names.credential} Updated`);

  await credentialRow.getByRole('button', { name: '更新密钥', exact: true }).click();
  current = dialog();
  await current.getByLabel('新密钥', { exact: true }).fill(`rotated-${suffix}`);
  await current.getByRole('button', { name: '更新密钥', exact: true }).click();
  await current.waitFor({ state: 'hidden' });

  await credentialRow.getByRole('button', { name: '停用', exact: true }).click();
  await confirmPopover('停用');
  await credentialRow.getByRole('button', { name: '启用', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await credentialRow.getByRole('button', { name: '启用', exact: true }).click();
  await credentialRow.getByRole('button', { name: '停用', exact: true }).waitFor({ state: 'visible', timeout: 15000 });

  await credentialRow.getByRole('button', { name: '授权', exact: true }).click();
  current = dialog();
  await current.getByRole('combobox').click();
  await page.locator('.ant-select-item-option').filter({ hasText: names.user }).first().click();
  await current.getByRole('button', { name: '授权', exact: true }).click();
  await current.waitFor({ state: 'hidden' });

  await credentialRow.locator('.ant-table-row-expand-icon').click();
  const grantedRow = page.getByRole('row').filter({ hasText: names.user }).first();
  await grantedRow.getByRole('button', { name: '撤销授权', exact: true }).click();
  await confirmPopover('确认撤销');
  await grantedRow
    .getByRole('button', { name: '撤销授权', exact: true })
    .waitFor({ state: 'detached', timeout: 15000 });

  await credentialRow.getByRole('button', { name: '删除', exact: true }).click();
  current = dialog();
  await current.getByRole('button', { name: '确认删除', exact: true }).click();
  await current.waitFor({ state: 'hidden' });
  await waitGone(`${names.credential} Updated`);
}

// Control-event publishing and cancellation were removed from the product.
// The audit page is accepted read-only: the operations tab issues a real
// search, the execution tab lists control events, and the login-history tab
// states honestly that the capability is not connected.
async function exerciseAuditReadonly() {
  await menuItem('日志审计').click();
  await tabItem('操作记录').click();
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await tabItem('配置执行记录').click();
  await tabItem('登录日志').click();
  await waitText('登录历史查询尚未接入');
}

// Raw route editing and desired-state publishing were removed from the
// product UI; the configuration page is verified read-only.
async function exerciseConfigurationReadonly() {
  await menuItem('系统管理').click();
  await tabItem('配置生效详情').click();
  await waitText('当前路由（只读）');
}

async function assertSessionSemantics() {
  await menuItem('概览').click();
  await waitHeading('概览');
  await page.reload({ waitUntil: 'networkidle' });
  await waitHeading('概览');
  assert.notEqual(
    await page.evaluate(() => window.localStorage.getItem('zhiyuan.admin.tokens')),
    null,
    'A page reload must restore the persisted admin session',
  );
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await waitHeading('登录企业管理后台');
  assert.equal(
    await page.evaluate(() => window.localStorage.getItem('zhiyuan.admin.tokens')),
    null,
    'Explicit sign-out must clear the persisted admin session',
  );
}

async function assertApiState() {
  const users = await api('/aep/v1/admin/users?limit=200');
  const teams = await api('/aep/v1/admin/teams');
  const roles = await api('/aep/v1/admin/roles');
  const skills = await api('/aep/v1/admin/skills');
  const models = await api('/aep/v1/admin/models');
  const credentials = await api('/aep/v1/admin/credentials');
  assert.equal(
    teams.teams.some((item) => item.id === names.team),
    false,
  );
  assert.equal(
    roles.roles.some((item) => item.id === names.role),
    false,
  );
  assert.equal(
    skills.skills.some((item) => item.id === names.skill),
    false,
  );
  assert.equal(
    models.models.some((item) => item.id === names.model),
    false,
  );
  assert.equal(
    credentials.credentials.some((item) => item.name.startsWith(names.credential)),
    false,
  );
  assert.equal(users.items.find((item) => item.username === names.user)?.status, 'disabled');
  assert.equal(users.items.find((item) => item.username === names.imported)?.status, 'disabled');
  assert.ok(requests.some((value) => value.includes('/aep/v1/admin/skills/') && value.includes('/versions')));
  assert.ok(requests.some((value) => value.includes('/aep/v1/admin/events')));
  assert.ok(requests.some((value) => value.includes('/aep/v1/admin/control-events')));
  assert.ok(requests.some((value) => value.includes('/aep/v1/admin/data-plane/desired-state')));
}

async function ensureMemberRole() {
  const roles = await api('/aep/v1/admin/roles?limit=200');
  const existing = roles.roles.find((role) => role.id === memberRoleId);
  if (existing) {
    assert.equal(existing.enabled, true, `E2E role ${memberRoleId} must be enabled`);
    assert.deepEqual(existing.permissions, [], `E2E role ${memberRoleId} must not grant permissions`);
    return;
  }
  await api('/aep/v1/admin/roles', {
    method: 'POST',
    body: {
      id: memberRoleId,
      name: memberRoleName,
      description: 'Least-privileged role for disposable enterprise extension tests',
      permissions: [],
    },
  });
}

async function disableAndRevokeTestUsers() {
  const users = await api('/aep/v1/admin/users?limit=200');
  const testUsers = users.items.filter((item) => [names.user, names.imported].includes(item.username));
  for (const user of testUsers) {
    if (user.status !== 'disabled') {
      await api(`/aep/v1/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        body: { status: 'disabled' },
      });
    }
    const sessions = await api(`/aep/v1/admin/sessions?userId=${encodeURIComponent(user.id)}&limit=200`);
    for (const session of sessions.items) {
      if (!session.revokedAt) {
        await api(`/aep/v1/admin/sessions/${encodeURIComponent(session.sessionId)}/revoke`, { method: 'POST' });
      }
    }
  }
}

async function loginApi() {
  const response = await fetch(`${adminOrigin}/aep/v1/auth/password/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-AEP-Protocol-Version': '1.0' },
    body: JSON.stringify({ deploymentId, username: adminUsername, password: adminPassword }),
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return JSON.parse(text).accessToken;
}

async function api(pathname, options = {}) {
  const response = await fetch(`${adminOrigin}${pathname}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'X-AEP-Protocol-Version': '1.0',
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  assert.ok(response.ok, `${options.method ?? 'GET'} ${pathname}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function findBrowser() {
  const candidates = [
    process.env.ZHIYUAN_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* try next candidate */
    }
  }
  throw new Error('Chrome/Chromium was not found. Set ZHIYUAN_CHROME_PATH.');
}

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHttp(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* server still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`HTTP server did not start: ${url}`);
}
