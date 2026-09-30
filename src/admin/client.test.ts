import { afterEach, describe, expect, test, vi } from 'vitest';

import { MemoryTokenStore } from '@aep/sdk-node';

import { AdminConsoleClient, AdminMetadataError, AdminPermission, hasAdminConsoleAccess, hasAdminPermission, hasAnyAdminConsoleAccess, type AdminIdentity } from './client.js';

const fullPermissions = [
  'users.read', 'users.write', 'roles.read', 'roles.write', 'teams.read', 'teams.write',
  'skills.read', 'skills.write', 'skills.assign', 'models.read', 'models.write', 'models.assign',
  'credentials.read', 'credentials.write', 'credentials.assign', 'licenses.read', 'licenses.write', 'licenses.revoke',
  'identity.read', 'identity.write',
  'sessions.write', 'events.read', 'events.write', 'data_plane.write',
];

function identity(overrides: Partial<AdminIdentity> = {}): AdminIdentity {
  return {
    user: { id: 'u1', displayName: '管理员' },
    deployment: { id: 'demo', name: '演示部署' },
    deploymentId: 'demo',
    enterprise: { id: 'demo', name: '演示部署' },
    roles: [],
    permissions: [],
    sessionExpiresAt: '2026-09-04T00:00:00Z',
    passwordChangeRequired: false,
    ...overrides,
  };
}

describe('admin console access', () => {
  test('accepts the bootstrap administrator role', () => {
    expect(hasAdminConsoleAccess(identity({ roles: ['admin'] }))).toBe(true);
  });

  test('accepts a custom role with the complete console permission set', () => {
    expect(hasAdminConsoleAccess(identity({ roles: ['operations-admin'], permissions: fullPermissions }))).toBe(true);
  });

  test('rejects a partial permission set instead of showing a broken full console', () => {
    expect(hasAdminConsoleAccess(identity({ roles: ['operations-admin'], permissions: fullPermissions.slice(0, -1) }))).toBe(false);
  });

  test('allows a partial permission set into its readable console surface', () => {
    const partial = identity({ roles: ['model-reader'], permissions: ['models.read'] });
    expect(hasAnyAdminConsoleAccess(partial)).toBe(true);
    expect(hasAdminConsoleAccess(partial)).toBe(false);
  });

  test('rejects an identity without any management permission', () => {
    expect(hasAnyAdminConsoleAccess(identity({ roles: ['member'], permissions: [] }))).toBe(false);
  });

  test('fails closed when no validated identity is available', () => {
    expect(hasAdminPermission(undefined, AdminPermission.UsersRead)).toBe(false);
  });

  test('does not replace the host Web Crypto object when randomUUID is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const cryptoWithoutRandomUUID = {getRandomValues: (value: Uint8Array) => value};
    try {
      Object.defineProperty(globalThis, 'crypto', {configurable: true, value: cryptoWithoutRandomUUID});
      new AdminConsoleClient();
      expect(globalThis.crypto).toBe(cryptoWithoutRandomUUID);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });
});

describe('admin console login', () => {
  const tokens = {
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    modelAccessToken: 'test-model',
    tokenType: 'Bearer',
    expiresIn: 3600,
    modelAccessExpiresIn: 3600,
    deploymentId: 'demo',
    sessionId: 'test-session',
    passwordChangeRequired: false,
  };
  const me = {
    user: { id: 'admin-1', displayName: '管理员', email: null },
    deployment: { id: 'demo', name: '演示部署' },
    deploymentId: 'demo',
    roles: ['admin'],
    permissions: [],
    sessionExpiresAt: '2027-01-01T00:00:00Z',
    passwordChangeRequired: false,
  };
  const metadata = {
    service: 'zhiyuan-aep',
    supportedProtocolVersions: ['1.0'],
    capabilities: [],
    jwksUri: '/.well-known/jwks.json',
    deploymentId: 'demo',
    deployment: { id: 'demo', name: '演示部署' },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubAepServer(routes: Record<string, { readonly status?: number; readonly body: unknown }>) {
    const requests: { method: string; path: string; body?: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const method = init?.method ?? 'GET';
      requests.push({
        method,
        path: url.pathname,
        ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {}),
      });
      const route = routes[`${method} ${url.pathname}`];
      return new Response(JSON.stringify(route?.body ?? { code: 'NOT_FOUND' }), {
        status: route?.status ?? (route ? 200 : 404),
        headers: { 'Content-Type': 'application/json' },
      });
    });
    return requests;
  }

  test('derives the deployment id from server metadata before signing in', async () => {
    const requests = stubAepServer({
      'GET /aep/v1/metadata': { body: metadata },
      'POST /aep/v1/auth/password/login': { body: tokens },
      'GET /aep/v1/user/me': { body: me },
    });
    const client = new AdminConsoleClient('http://aep.test', new MemoryTokenStore());
    const session = await client.login({ username: 'admin', password: 'test-password' });
    expect(session.status).toBe('authenticated');
    expect(requests.slice(0, 2).map(request => `${request.method} ${request.path}`)).toEqual([
      'GET /aep/v1/metadata',
      'POST /aep/v1/auth/password/login',
    ]);
    expect(requests[1]?.body).toMatchObject({ deploymentId: 'demo', username: 'admin' });
  });

  test('accepts a deployment named only by the metadata deployment object', async () => {
    const requests = stubAepServer({
      'GET /aep/v1/metadata': { body: { service: 'zhiyuan-aep', deployment: { id: 'demo', name: '演示部署' } } },
      'POST /aep/v1/auth/password/login': { body: tokens },
      'GET /aep/v1/user/me': { body: me },
    });
    const client = new AdminConsoleClient('http://aep.test', new MemoryTokenStore());
    await client.login({ username: 'admin', password: 'test-password' });
    expect(requests[1]?.body).toMatchObject({ deploymentId: 'demo' });
  });

  test('rejects with a metadata error when server metadata is unavailable', async () => {
    const requests = stubAepServer({
      'GET /aep/v1/metadata': { status: 500, body: { code: 'INTERNAL' } },
    });
    const client = new AdminConsoleClient('http://aep.test', new MemoryTokenStore());
    await expect(client.login({ username: 'admin', password: 'test-password' }))
      .rejects.toBeInstanceOf(AdminMetadataError);
    expect(requests.some(request => request.path === '/aep/v1/auth/password/login')).toBe(false);
  });

  test('rejects with a metadata error when metadata omits the deployment id', async () => {
    const requests = stubAepServer({
      'GET /aep/v1/metadata': { body: { service: 'zhiyuan-aep' } },
    });
    const client = new AdminConsoleClient('http://aep.test', new MemoryTokenStore());
    await expect(client.login({ username: 'admin', password: 'test-password' }))
      .rejects.toBeInstanceOf(AdminMetadataError);
    expect(requests.some(request => request.path === '/aep/v1/auth/password/login')).toBe(false);
  });
});
