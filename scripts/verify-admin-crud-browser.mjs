import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticServerScript = path.join(repositoryRoot, 'scripts', 'serve-admin.mjs');
const state = {
  users: [{ id: 'admin-1', username: 'admin', displayName: '管理员', email: null, status: 'active', roleIds: ['admin'], teamIds: [] }],
  teams: [],
  roles: [],
  skills: [],
  skillAssignments: [],
  models: [],
  modelAssignments: [],
  credentials: [],
  credentialAssignments: [],
  requests: [],
  nextId: 1,
};

const api = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const body = await readBody(request);
  state.requests.push({ method: request.method ?? '', path: url.pathname });
  try {
    await route(request.method ?? 'GET', url.pathname, body, response);
  } catch (error) {
    console.error('[admin-crud-e2e] mock route failed', error);
    writeJson(response, 500, { code: 'MOCK_FAILURE', detail: String(error) });
  }
});

let staticServer;
let browser;
try {
  const apiPort = await listenOnRandomPort(api);
  const staticPort = await freePort();
  staticServer = spawn(process.execPath, [staticServerScript], {
    cwd: repositoryRoot,
    env: { ...process.env, ZHIYUAN_AEP_BASE_URL: `http://127.0.0.1:${apiPort}`, ZHIYUAN_ADMIN_PORT: String(staticPort) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await waitForHttp(`http://127.0.0.1:${staticPort}/`);

  const executablePath = await findChrome();
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`http://127.0.0.1:${staticPort}/`, { waitUntil: 'networkidle' });

  await page.getByLabel('密码').fill('change-this-admin-password');
  await page.getByRole('button', { name: '登录' }).click();
  await waitForText(page, '概览');

  await page.getByRole('button', { name: '资源管理' }).click();
  await waitForText(page, 'admin');

  await page.getByRole('button', { name: '新增用户' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('用户名').fill('e2e-user');
  await dialog.getByLabel('显示名称').fill('E2E 用户');
  await dialog.getByLabel('临时密码').fill('e2e-temporary-password');
  await dialog.getByRole('button', { name: '保存' }).click();
  await waitForText(page, 'E2E 用户');
  const createdUser = state.users.find(item => item.username === 'e2e-user');
  assert.ok(createdUser, 'user create request did not reach the mock service');

  await page.getByRole('tab', { name: 'Team' }).click();
  await page.getByRole('button', { name: '新增 Team' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Team ID').fill('e2e-team');
  await dialog.getByLabel('名称').fill('E2E Team');
  await dialog.getByRole('button', { name: '保存' }).click();
  await waitForText(page, 'E2E Team');
  assert.ok(state.teams.some(item => item.id === 'e2e-team'));

  await page.getByRole('tab', { name: 'Role' }).click();
  await page.getByRole('button', { name: '新增 Role' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Role ID').fill('e2e-role');
  await dialog.getByLabel('名称').fill('E2E Role');
  await dialog.getByRole('button', { name: '保存' }).click();
  await waitForText(page, 'E2E Role');
  assert.ok(state.roles.some(item => item.id === 'e2e-role'));

  await page.getByRole('tab', { name: 'Skill', exact: true }).click();
  await page.getByRole('button', { name: '新增 Skill' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Skill ID').fill('e2e-skill');
  await dialog.getByLabel('名称').fill('E2E Skill');
  await dialog.getByRole('button', { name: '保存' }).click();
  await waitForText(page, 'E2E Skill');
  assert.ok(state.skills.some(item => item.id === 'e2e-skill'));

  await page.getByRole('tab', { name: 'Skill 授权' }).click();
  await page.getByRole('button', { name: '授权 Skill' }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'E2E Skill' }).click();
  await dialog.getByRole('checkbox', { name: /E2E 用户/ }).click();
  await dialog.getByRole('button', { name: '授权' }).click();
  await waitForText(page, 'E2E 用户');
  assert.equal(state.skillAssignments.length, 1);

  await page.getByRole('button', { name: '企业模型' }).click();
  await page.getByRole('button', { name: '添加模型' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('模型 ID').fill('e2e-model');
  await dialog.getByLabel('显示名称').fill('E2E Model');
  await dialog.getByLabel('网关地址').fill('http://127.0.0.1:8090/v1');
  await dialog.getByLabel('上游模型').fill('deepseek-chat');
  await dialog.getByRole('button', { name: '保存' }).click();
  await waitForText(page, 'E2E Model');
  assert.ok(state.models.some(item => item.id === 'e2e-model'));
  await page.getByRole('button', { name: '编辑模型' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('显示名称').fill('E2E Model Updated');
  await dialog.getByRole('button', { name: '保存' }).click();
  await waitForText(page, 'E2E Model Updated');
  assert.equal(state.models.find(item => item.id === 'e2e-model')?.displayName, 'E2E Model Updated');
  await page.getByRole('button', { name: '分配模型' }).click();
  dialog = page.getByRole('dialog');
  const modelSubject = dialog.getByRole('checkbox', { name: /E2E 用户/ });
  await modelSubject.waitFor({ state: 'visible' });
  assert.equal(await modelSubject.getAttribute('aria-checked'), 'false');
  await modelSubject.click();
  await waitForAttribute(modelSubject, 'aria-checked', 'true');
  await dialog.getByRole('button', { name: '授权' }).click();
  assert.ok(state.requests.some(item => item.method === 'POST' && item.path === '/aep/v1/admin/model-assignments'), 'model assignment request did not reach the mock service');
  assert.equal(state.modelAssignments.length, 1);
  await page.getByRole('button', { name: '删除' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '删除' }).click();
  await waitForNoText(page, 'E2E Model Updated');
  assert.equal(state.models.length, 0);

  await page.getByRole('button', { name: '平台运维' }).click();
  await page.getByRole('tab', { name: '凭证' }).click();
  await page.getByRole('button', { name: '添加凭证' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('名称').fill('E2E Credential');
  await dialog.getByLabel('服务').fill('model-gateway');
  await dialog.getByLabel('凭证值').fill('e2e-secret');
  await dialog.getByRole('button', { name: '保存' }).click();
  await waitForText(page, 'E2E Credential');
  assert.equal(state.credentials.length, 1);
  await page.getByRole('button', { name: '编辑' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('名称').fill('E2E Credential Updated');
  await dialog.getByRole('button', { name: '保存' }).click();
  await waitForText(page, 'E2E Credential Updated');
  assert.equal(state.credentials[0].name, 'E2E Credential Updated');
  await page.getByRole('button', { name: '删除' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认删除凭证' }).click();
  await waitForNoText(page, 'E2E Credential Updated');
  assert.equal(state.credentials.length, 0);

  await page.getByRole('button', { name: '资源管理' }).click();
  await page.getByRole('tab', { name: '用户' }).click();
  await waitForText(page, 'E2E 用户');
  await page.getByRole('button', { name: '停用' }).last().click();
  await waitForText(page, '停用');
  assert.equal(createdUser.status, 'disabled');

  await page.reload({ waitUntil: 'networkidle' });
  await waitForText(page, '概览');
  await page.getByRole('button', { name: '资源管理' }).click();
  await page.getByRole('tab', { name: '用户' }).click();
  await waitForText(page, 'E2E 用户');
  assert.ok(state.requests.some(item => item.path === '/aep/v1/user/me'));
  console.log(JSON.stringify({ status: 'passed', checks: ['login', 'user create/disable', 'team create', 'role create', 'Skill create/grant', 'model create/update/grant/delete', 'credential create/update/delete', 'reload session restore'], requests: state.requests.length }));
} finally {
  await browser?.close().catch(() => undefined);
  if (staticServer) staticServer.kill();
  api.close();
}

async function route(method, pathname, rawBody, response) {
  if (pathname === '/aep/v1/auth/password/login' && method === 'POST') {
    return writeJson(response, 200, { accessToken: 'e2e-access', refreshToken: 'e2e-refresh', modelAccessToken: 'e2e-model', tokenType: 'Bearer', expiresIn: 3600, modelAccessExpiresIn: 3600, deploymentId: 'demo', sessionId: 'e2e-session', passwordChangeRequired: false });
  }
  if (pathname === '/aep/v1/auth/refresh' && method === 'POST') {
    return writeJson(response, 200, { accessToken: 'e2e-access', refreshToken: 'e2e-refresh', modelAccessToken: 'e2e-model', tokenType: 'Bearer', expiresIn: 3600, modelAccessExpiresIn: 3600, deploymentId: 'demo', sessionId: 'e2e-session', passwordChangeRequired: false });
  }
  if (pathname === '/aep/v1/user/me' && method === 'GET') {
    return writeJson(response, 200, { user: { id: 'admin-1', displayName: '管理员', email: null }, deployment: { id: 'demo', name: '演示部署' }, deploymentId: 'demo', sessionId: 'e2e-session', roles: ['admin'], permissions: [], sessionExpiresAt: '2027-01-01T00:00:00Z', passwordChangeRequired: false });
  }
  if (method === 'GET' && pathname === '/aep/v1/admin/users') return writeJson(response, 200, { items: state.users, nextCursor: null });
  if (method === 'POST' && pathname === '/aep/v1/admin/users') {
    const input = jsonBody(rawBody);
    const user = { id: `user-${state.nextId++}`, username: input.username, displayName: input.displayName, email: input.email ?? null, status: 'active', roleIds: input.roleIds ?? [], teamIds: input.teamIds ?? [] };
    state.users.push(user);
    return writeJson(response, 201, user);
  }
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/users/')) {
    const user = state.users.find(item => item.id === pathname.split('/').at(-1));
    Object.assign(user ?? {}, jsonBody(rawBody));
    return writeJson(response, 200, user);
  }
  if (method === 'PUT' && pathname.startsWith('/aep/v1/admin/users/') && pathname.endsWith('/rbac')) return writeJson(response, 200, jsonBody(rawBody));
  if (method === 'GET' && pathname === '/aep/v1/admin/teams') return writeJson(response, 200, { teams: state.teams });
  if (method === 'POST' && pathname === '/aep/v1/admin/teams') return createRecord(response, state.teams, jsonBody(rawBody));
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/teams/')) return patchRecord(response, state.teams, pathname, jsonBody(rawBody));
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/teams/')) return deleteRecord(response, state.teams, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/roles') return writeJson(response, 200, { roles: state.roles, permissions: [] });
  if (method === 'POST' && pathname === '/aep/v1/admin/roles') return createRecord(response, state.roles, jsonBody(rawBody));
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/roles/')) return patchRecord(response, state.roles, pathname, jsonBody(rawBody));
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/roles/')) return deleteRecord(response, state.roles, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/permissions') return writeJson(response, 200, { permissions: [] });
  if (method === 'GET' && pathname === '/aep/v1/admin/skills') return writeJson(response, 200, { skills: state.skills });
  if (method === 'POST' && pathname === '/aep/v1/admin/skills') return createRecord(response, state.skills, { ...jsonBody(rawBody), state: 'active', enabled: true, versions: [] });
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/skills/')) return patchRecord(response, state.skills, pathname, jsonBody(rawBody));
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/skills/') && pathname.split('/').length === 6) return deleteRecord(response, state.skills, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/skill-assignments') return writeJson(response, 200, { items: state.skillAssignments });
  if (method === 'POST' && pathname === '/aep/v1/admin/skill-assignments') return createAssignment(response, state.skillAssignments, jsonBody(rawBody), 'skill');
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/skill-assignments/')) return deleteRecord(response, state.skillAssignments, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/models') return writeJson(response, 200, { models: state.models, assignments: state.modelAssignments });
  if (method === 'POST' && pathname === '/aep/v1/admin/models') return createRecord(response, state.models, jsonBody(rawBody));
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/models/')) return patchRecord(response, state.models, pathname, jsonBody(rawBody));
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/models/')) return deleteRecord(response, state.models, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/model-assignments') return writeJson(response, 200, { assignments: state.modelAssignments });
  if (method === 'POST' && pathname === '/aep/v1/admin/model-assignments') return createAssignment(response, state.modelAssignments, jsonBody(rawBody), 'model');
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/model-assignments/')) return deleteRecord(response, state.modelAssignments, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/credentials') return writeJson(response, 200, { credentials: state.credentials, assignments: state.credentialAssignments });
  if (method === 'POST' && pathname === '/aep/v1/admin/credentials') {
    const input = jsonBody(rawBody);
    return createRecord(response, state.credentials, { ...input, id: `credential-${state.nextId++}`, maskedValue: 'e2e-***', updatedAt: new Date().toISOString() });
  }
  if (method === 'PATCH' && pathname.startsWith('/aep/v1/admin/credentials/')) return patchRecord(response, state.credentials, pathname, jsonBody(rawBody));
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/credentials/')) return deleteRecord(response, state.credentials, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/credential-assignments') return writeJson(response, 200, { assignments: state.credentialAssignments });
  if (method === 'POST' && pathname === '/aep/v1/admin/credential-assignments') return createAssignment(response, state.credentialAssignments, jsonBody(rawBody), 'credential');
  if (method === 'DELETE' && pathname.startsWith('/aep/v1/admin/credential-assignments/')) return deleteRecord(response, state.credentialAssignments, pathname);
  if (method === 'GET' && pathname === '/aep/v1/admin/licenses') return writeJson(response, 200, { items: [], nextCursor: null });
  if (method === 'GET' && pathname === '/aep/v1/admin/events') return writeJson(response, 200, { items: [], nextCursor: null });
  if (method === 'GET' && pathname === '/aep/v1/admin/control-events') return writeJson(response, 200, { items: [], nextCursor: null });
  if (method === 'GET' && pathname === '/aep/v1/admin/sessions') return writeJson(response, 200, { items: [], nextCursor: null });
  if (method === 'GET' && pathname === '/aep/v1/admin/data-plane/desired-state') return writeJson(response, 200, { deploymentId: 'demo', revision: 'rev-1', routes: [], publishedAt: null, contentHash: '' });
  if (method === 'GET' && pathname === '/aep/v1/admin/data-plane/status') return writeJson(response, 200, { state: 'ready', observedRevision: 'rev-1', contentHash: '', lastAppliedAt: null, resourceCount: 0 });
  return writeJson(response, 404, { code: 'NOT_FOUND', path: pathname });
}

function createRecord(response, collection, input) {
  const record = { ...input, id: input.id ?? `record-${state.nextId++}`, enabled: input.enabled ?? true, builtIn: false, permissions: input.permissions ?? [], versions: input.versions ?? [] };
  collection.push(record);
  return writeJson(response, 201, record);
}

function patchRecord(response, collection, pathname, input) {
  const record = collection.find(item => item.id === pathname.split('/').at(-1));
  if (!record) return writeJson(response, 404, { code: 'NOT_FOUND' });
  Object.assign(record, input);
  return writeJson(response, 200, record);
}

function deleteRecord(response, collection, pathname) {
  const id = pathname.split('/').at(-1);
  const index = collection.findIndex(item => item.id === id);
  if (index >= 0) collection.splice(index, 1);
  response.writeHead(204).end();
}

function createAssignment(response, collection, input, resourceType) {
  const resourceId = input[`${resourceType}Id`];
  const record = { id: `${resourceType}-assignment-${state.nextId++}`, resourceType, resourceId, [`${resourceType}Id`]: resourceId, subject: input.subject, subjectType: input.subject.type, subjectId: input.subject.id };
  collection.push(record);
  return writeJson(response, 201, record);
}

function jsonBody(raw) {
  if (!raw || Buffer.isBuffer(raw) && raw.length === 0) return {};
  return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
}

function readBody(request) {
  return new Promise(resolve => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function writeJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

async function findChrome() {
  const candidates = [process.env.ZHIYUAN_CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* try next known installation */ }
  }
  throw new Error('Chrome/Chromium was not found. Set ZHIYUAN_CHROME_PATH to a browser executable.');
}

async function listenOnRandomPort(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

async function freePort() {
  const server = http.createServer();
  const port = await listenOnRandomPort(server);
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForHttp(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`HTTP server did not start: ${url}`);
}

async function waitForText(page, value) {
  await page.getByText(value, { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 });
}

async function waitForNoText(page, value) {
  await page.getByText(value, { exact: true }).first().waitFor({ state: 'detached', timeout: 10_000 });
}

async function waitForAttribute(locator, name, expected) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await locator.getAttribute(name) === expected) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${name}=${expected}`);
}
