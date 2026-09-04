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
});
