import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { MemoryTokenStore } from '@aep/sdk-node';
import { afterEach, describe, expect, test } from 'vitest';

import { AdminConsoleClient, AdminModelSubjectType, AdminSubjectType } from './client.js';

interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

function startAepStub() {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      requests.push({ method: request.method ?? '', path: request.url ?? '', body: raw ? JSON.parse(raw) : null });
      response.setHeader('Content-Type', 'application/json');
      if (request.method === 'GET' && request.url === '/aep/v1/user/me') {
        response.writeHead(200);
        response.end(JSON.stringify({ user: { id: 'admin-1', displayName: '管理员', username: 'admin', roles: ['admin'] }, deployment: { id: 'demo', name: '演示部署' }, deploymentId: 'demo', roles: ['admin'] }));
        return;
      }
      if (request.method === 'POST' && request.url === '/aep/v1/admin/skill-assignments') {
        response.writeHead(201);
        response.end(JSON.stringify({ id: 'assignment-1', resourceType: 'skill', resourceId: 's1', subject: { type: 'user', id: 'u1' }, createdAt: '2026-09-01T00:00:00Z' }));
        return;
      }
      if (request.method === 'POST' && request.url === '/aep/v1/admin/model-assignments') {
        response.writeHead(201);
        response.end(JSON.stringify({ id: 'assignment-2', resourceType: 'model', resourceId: 'm1', subject: { type: 'user', id: 'u1' }, createdAt: '2026-09-01T00:00:00Z' }));
        return;
      }
      response.writeHead(404);
      response.end(JSON.stringify({ title: 'not found' }));
    });
  });
  return { server, requests };
}

describe('admin console assignment wire contract', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    server?.close();
    server = null;
  });

  test('createSkillAssignment POSTs the SDK payload to the control plane', async () => {
    const stub = startAepStub();
    await new Promise<void>(resolve => stub.server.listen(0, '127.0.0.1', resolve));
    server = stub.server;
    const port = (stub.server.address() as AddressInfo).port;
    const tokenStore = new MemoryTokenStore();
    await tokenStore.set({ accessToken: 'test-access', refreshToken: 'test-refresh', modelAccessToken: 'test-model-access', tokenType: 'Bearer', expiresIn: 3600, modelAccessExpiresIn: 3600, passwordChangeRequired: false });
    const client = new AdminConsoleClient(`http://127.0.0.1:${port}`, tokenStore);

    const session = await client.restore();
    expect(session.status).toBe('authenticated');
    await client.createSkillAssignment({ skillId: 's1', subject: { type: AdminSubjectType.User, id: 'u1' } });

    const post = stub.requests.find(request => request.method === 'POST');
    expect(post?.path).toBe('/aep/v1/admin/skill-assignments');
    expect(post?.body).toEqual({ skillId: 's1', subject: { type: 'user', id: 'u1' } });
  });

  test('createModelAssignment POSTs the SDK payload to the control plane', async () => {
    const stub = startAepStub();
    await new Promise<void>(resolve => stub.server.listen(0, '127.0.0.1', resolve));
    server = stub.server;
    const port = (stub.server.address() as AddressInfo).port;
    const tokenStore = new MemoryTokenStore();
    await tokenStore.set({ accessToken: 'test-access', refreshToken: 'test-refresh', modelAccessToken: 'test-model-access', tokenType: 'Bearer', expiresIn: 3600, modelAccessExpiresIn: 3600, passwordChangeRequired: false });
    const client = new AdminConsoleClient(`http://127.0.0.1:${port}`, tokenStore);

    await client.restore();
    await client.createModelAssignment({ modelId: 'm1', subject: { type: AdminModelSubjectType.User, id: 'u1' } });

    const post = stub.requests.find(request => request.method === 'POST');
    expect(post?.path).toBe('/aep/v1/admin/model-assignments');
    expect(post?.body).toEqual({ modelId: 'm1', subject: { type: 'user', id: 'u1' } });
  });

  test('loads all user pages for the admin resource picker', async () => {
    const requests: string[] = [];
    const stub = http.createServer((request, response) => {
      requests.push(request.url ?? '');
      response.setHeader('Content-Type', 'application/json');
      if (request.method === 'GET' && request.url === '/aep/v1/user/me') {
        response.writeHead(200);
        response.end(JSON.stringify({ user: { id: 'admin-1', displayName: '管理员', username: 'admin', roles: ['admin'] }, deployment: { id: 'demo', name: '演示部署' }, deploymentId: 'demo', roles: ['admin'] }));
        return;
      }
      if (request.method === 'GET' && request.url?.startsWith('/aep/v1/admin/users')) {
        const page = new URL(request.url, 'http://127.0.0.1').searchParams.get('cursor');
        response.writeHead(200);
        response.end(JSON.stringify(page === 'page-2'
          ? { items: [{ id: 'u2', displayName: '李四', username: 'lisi', status: 'active' }], nextCursor: null }
          : { items: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }], nextCursor: 'page-2' }));
        return;
      }
      response.writeHead(404);
      response.end(JSON.stringify({ title: 'not found' }));
    });
    await new Promise<void>(resolve => stub.listen(0, '127.0.0.1', resolve));
    server = stub;
    const port = (stub.address() as AddressInfo).port;
    const tokenStore = new MemoryTokenStore();
    await tokenStore.set({ accessToken: 'test-access', refreshToken: 'test-refresh', modelAccessToken: 'test-model-access', tokenType: 'Bearer', expiresIn: 3600, modelAccessExpiresIn: 3600, passwordChangeRequired: false });
    const client = new AdminConsoleClient(`http://127.0.0.1:${port}`, tokenStore);

    await client.restore();
    await expect(client.users()).resolves.toEqual([
      { id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' },
      { id: 'u2', displayName: '李四', username: 'lisi', status: 'active' },
    ]);
    expect(requests.filter(path => path.startsWith('/aep/v1/admin/users'))).toEqual([
      '/aep/v1/admin/users?limit=200',
      '/aep/v1/admin/users?cursor=page-2&limit=200',
    ]);
  });

  test('maps the admin Skill enabled compatibility flag to the state contract', async () => {
    const requests: RecordedRequest[] = [];
    const stub = http.createServer((request, response) => {
      let raw = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { raw += chunk; });
      request.on('end', () => {
        requests.push({ method: request.method ?? '', path: request.url ?? '', body: raw ? JSON.parse(raw) : null });
        response.setHeader('Content-Type', 'application/json');
        if (request.method === 'GET' && request.url === '/aep/v1/user/me') {
          response.writeHead(200);
          response.end(JSON.stringify({ user: { id: 'admin-1', displayName: '管理员', username: 'admin', roles: ['admin'] }, deployment: { id: 'demo', name: '演示部署' }, deploymentId: 'demo', roles: ['admin'] }));
          return;
        }
        if (request.method === 'POST' && request.url === '/aep/v1/admin/skills') {
          response.writeHead(201);
          response.end(JSON.stringify({ id: 'skill-1', name: '写作', description: '生成文案', state: 'active', versions: [] }));
          return;
        }
        if (request.method === 'PATCH' && request.url?.startsWith('/aep/v1/admin/skills/')) {
          response.writeHead(200);
          response.end(JSON.stringify({ id: 'skill-1', name: '写作', description: '生成文案', state: 'withdrawn', versions: [] }));
          return;
        }
        response.writeHead(404);
        response.end(JSON.stringify({ title: 'not found' }));
      });
    });
    await new Promise<void>(resolve => stub.listen(0, '127.0.0.1', resolve));
    server = stub;
    const port = (stub.address() as AddressInfo).port;
    const tokenStore = new MemoryTokenStore();
    await tokenStore.set({ accessToken: 'test-access', refreshToken: 'test-refresh', modelAccessToken: 'test-model-access', tokenType: 'Bearer', expiresIn: 3600, modelAccessExpiresIn: 3600, passwordChangeRequired: false });
    const client = new AdminConsoleClient(`http://127.0.0.1:${port}`, tokenStore);

    await client.restore();
    await client.createSkill({ id: 'skill-1', name: '写作', description: '生成文案', enabled: true });
    await client.updateSkill('skill-1', { enabled: false });
    await client.createSkill({ id: 'skill-2', name: '翻译', description: '翻译文本', enabled: false });
    await client.updateSkill('skill-1', { enabled: true });

    expect(requests.filter(request => request.method === 'POST')).toEqual([
      { method: 'POST', path: '/aep/v1/admin/skills', body: { id: 'skill-1', name: '写作', description: '生成文案' } },
      { method: 'POST', path: '/aep/v1/admin/skills', body: { id: 'skill-2', name: '翻译', description: '翻译文本' } },
    ]);
    expect(requests.filter(request => request.method === 'PATCH')).toEqual([
      { method: 'PATCH', path: '/aep/v1/admin/skills/skill-1', body: { state: 'withdrawn' } },
      { method: 'PATCH', path: '/aep/v1/admin/skills/skill-2', body: { state: 'withdrawn' } },
      { method: 'PATCH', path: '/aep/v1/admin/skills/skill-1', body: { state: 'active' } },
    ]);
  });

  test('counts Skills returned in the standard admin list envelope', async () => {
    const stub = http.createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json');
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      if (path === '/aep/v1/user/me') {
        response.writeHead(200);
        response.end(JSON.stringify({ user: { id: 'admin-1', displayName: '管理员', username: 'admin', roles: ['admin'] }, deployment: { id: 'demo', name: '演示部署' }, deploymentId: 'demo', roles: ['admin'] }));
        return;
      }
      if (path === '/aep/v1/admin/users') {
        response.writeHead(200);
        response.end(JSON.stringify({ items: [], nextCursor: null }));
        return;
      }
      if (path === '/aep/v1/admin/teams') {
        response.writeHead(200);
        response.end(JSON.stringify({ teams: [] }));
        return;
      }
      if (path === '/aep/v1/admin/skills') {
        response.writeHead(200);
        response.end(JSON.stringify({ skills: [{ id: 'skill-1', name: '写作', description: '', state: 'active', versions: [] }] }));
        return;
      }
      if (path === '/aep/v1/admin/models') {
        response.writeHead(200);
        response.end(JSON.stringify({ models: [] }));
        return;
      }
      if (path === '/aep/v1/admin/events') {
        response.writeHead(200);
        response.end(JSON.stringify({ items: [], nextCursor: null }));
        return;
      }
      response.writeHead(404);
      response.end(JSON.stringify({ title: 'not found' }));
    });
    await new Promise<void>(resolve => stub.listen(0, '127.0.0.1', resolve));
    server = stub;
    const port = (stub.address() as AddressInfo).port;
    const tokenStore = new MemoryTokenStore();
    await tokenStore.set({ accessToken: 'test-access', refreshToken: 'test-refresh', modelAccessToken: 'test-model-access', tokenType: 'Bearer', expiresIn: 3600, modelAccessExpiresIn: 3600, passwordChangeRequired: false });
    const client = new AdminConsoleClient(`http://127.0.0.1:${port}`, tokenStore);

    await client.restore();
    await expect(client.overview()).resolves.toMatchObject({ users: 0, teams: 0, skills: 1, models: 0, pendingEvents: 0 });
  });
});
