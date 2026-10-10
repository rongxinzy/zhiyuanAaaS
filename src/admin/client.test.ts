import { MemoryTokenStore } from '@aep/sdk-node';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  AdminConsoleClient,
  type AdminIdentity,
  AdminMetadataError,
  AdminPermission,
  AdminRequestError,
  hasAdminConsoleAccess,
  hasAdminPermission,
  hasAnyAdminConsoleAccess,
  modelGatewayBaseUrlProblem,
} from './client.js';

const fullPermissions = [
  'users.read',
  'users.write',
  'roles.read',
  'roles.write',
  'teams.read',
  'teams.write',
  'skills.read',
  'skills.write',
  'skills.assign',
  'models.read',
  'models.write',
  'models.assign',
  'credentials.read',
  'credentials.write',
  'credentials.assign',
  'licenses.read',
  'licenses.write',
  'licenses.revoke',
  'identity.read',
  'identity.write',
  'sessions.write',
  'events.read',
  'events.write',
  'audit.read',
  'data_plane.write',
  'deployment.read',
  'deployment.write',
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

describe('gateway API adapters', () => {
  afterEach(() => vi.unstubAllGlobals());
  test('preserves query filters, encoded subjects, scoped auth and optimistic write versions', async () => {
    const requests: { url: URL; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/aep/v1/metadata') return Response.json(serverMetadata);
      if (url.pathname === '/aep/v1/auth/password/login') return Response.json(loginTokens);
      if (url.pathname === '/aep/v1/user/me') return Response.json(adminMe);
      requests.push({ url, init });
      return init.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ items: [], quota: 17 }), { headers: { 'Content-Type': 'application/json' } });
    });
    const client = new AdminConsoleClient('http://aep.test', new MemoryTokenStore());
    await client.login({ username: 'admin', password: 'test-password' });
    const window = {
      start: '2026-10-10T00:00:00Z',
      end: '2026-10-10T01:00:00Z',
      userId: '用户/1',
      teamId: 'team',
      roleId: 'role',
      modelId: 'model',
    };
    await client.getGatewayCapabilities();
    await client.queryGatewayMetrics({
      ...window,
      metric: 'calls',
      groupBy: 'team',
      step: 60,
      expectedDefinition: 'gateway_access_requests',
    });
    await client.getGatewayMonitoringHealth();
    await client.searchGatewayRequests({ ...window, source: 'gateway', limit: 200, cursor: '1000000000000000001' });
    await client.getGatewayRequest('request/1', { ...window, source: 'all' });
    await client.listGatewayLimits();
    const configuration = {
      kind: 'tokens' as const,
      scopeType: 'user' as const,
      scopeId: 'user',
      modelId: 'model',
      maximum: 25,
      interval: 'minute' as const,
      enabled: true,
      expectedVersion: 7,
    };
    await client.putGatewayLimit('rule/1', configuration);
    await client.deleteGatewayLimit('rule/1', 7);
    await client.publishGatewayLimits();
    await client.getGatewayLimitsStatus();
    await client.getGatewayQuota('用户/1');
    await client.refreshGatewayQuota('用户/1', 100);
    await client.changeGatewayQuota('用户/1', -5);
    await client.createGatewayTestAccess('model/1');
    const prefix = '/aep/v1/admin/model-gateway/';
    expect(requests.map(({ url }) => url.pathname)).toEqual(
      [
        'capabilities',
        'metrics',
        'health',
        'requests',
        'requests/request%2F1',
        'limits',
        'limits/rule%2F1',
        'limits/rule%2F1',
        'limits/publish',
        'limits/status',
        'quotas/%E7%94%A8%E6%88%B7%2F1',
        'quotas/%E7%94%A8%E6%88%B7%2F1/refresh',
        'quotas/%E7%94%A8%E6%88%B7%2F1/delta',
        'models/model%2F1/test-access',
      ].map((path) => prefix + path),
    );
    expect(Object.fromEntries(requests[1]!.url.searchParams)).toEqual({
      ...window,
      metric: 'calls',
      groupBy: 'team',
      step: '60',
      expectedDefinition: 'gateway_access_requests',
    });
    expect(requests[3]!.url.searchParams.get('cursor')).toBe('1000000000000000001');
    expect(requests[7]!.url.searchParams.get('expectedVersion')).toBe('7');
    expect(JSON.parse(String(requests[6]!.init.body))).toEqual(configuration);
    expect(JSON.parse(String(requests[11]!.init.body))).toEqual({ quota: 100 });
    expect(JSON.parse(String(requests[12]!.init.body))).toEqual({ value: -5 });
    for (const { init } of requests) {
      const headers = new Headers(init.headers);
      expect(headers.get('Authorization')).toBe('Bearer test-access');
      expect(headers.get('X-AEP-Protocol-Version')).toBe('1.0');
    }
  });
  test('fails closed on signed-out calls and does not replay conflict writes', async () => {
    expect(() => new AdminConsoleClient().getGatewayCapabilities()).toThrow();
    const { client, requests } = await signedInClient({
      'PUT /aep/v1/admin/model-gateway/limits/rule': { status: 409, body: { code: 'VERSION_CONFLICT' } },
    });
    await expect(
      client.putGatewayLimit('rule', {
        kind: 'requests',
        scopeType: 'global',
        maximum: 1,
        interval: 'second',
        enabled: true,
        expectedVersion: 0,
      }),
    ).rejects.toThrow();
    expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(1);
  });
  test('loads only readable subject catalogs and paginates without fetching Skills', async () => {
    const { client, requests } = await signedInClient({
      'GET /aep/v1/admin/models': { body: { models: [{ id: 'model' }], nextCursor: null } },
      'GET /aep/v1/admin/users': { body: { items: [{ id: 'user' }], nextCursor: null } },
      'GET /aep/v1/admin/teams': { body: { teams: [{ id: 'team' }], nextCursor: null } },
      'GET /aep/v1/admin/roles': { body: { roles: [{ id: 'role' }], nextCursor: null } },
    });
    expect(await client.gatewaySubjects()).toEqual({ models: [], users: [], teams: [], roles: [] });
    expect(await client.gatewaySubjects(identity({ roles: ['admin'] }))).toEqual({
      models: [{ id: 'model' }],
      users: [{ id: 'user' }],
      teams: [{ id: 'team' }],
      roles: [{ id: 'role' }],
    });
    expect(requests.some((request) => request.path.includes('skills'))).toBe(false);
  });
});

const loginTokens = {
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
const adminMe = {
  user: { id: 'admin-1', displayName: '管理员', email: null },
  deployment: { id: 'demo', name: '演示部署' },
  deploymentId: 'demo',
  roles: ['admin'],
  permissions: [],
  sessionExpiresAt: '2027-01-01T00:00:00Z',
  passwordChangeRequired: false,
};
const serverMetadata = {
  service: 'zhiyuan-aep',
  supportedProtocolVersions: ['1.0'],
  capabilities: [],
  jwksUri: '/.well-known/jwks.json',
  deploymentId: 'demo',
  deployment: { id: 'demo', name: '演示部署' },
};

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

async function signedInClient(routes: Record<string, { readonly status?: number; readonly body: unknown }>) {
  const requests = stubAepServer({
    'GET /aep/v1/metadata': { body: serverMetadata },
    'POST /aep/v1/auth/password/login': { body: loginTokens },
    'GET /aep/v1/user/me': { body: adminMe },
    ...routes,
  });
  const client = new AdminConsoleClient('http://aep.test', new MemoryTokenStore());
  await client.login({ username: 'admin', password: 'test-password' });
  return { client, requests };
}

describe('admin console access', () => {
  test('accepts the bootstrap administrator role', () => {
    expect(hasAdminConsoleAccess(identity({ roles: ['admin'] }))).toBe(true);
  });

  test('accepts a custom role with the complete console permission set', () => {
    expect(hasAdminConsoleAccess(identity({ roles: ['operations-admin'], permissions: fullPermissions }))).toBe(true);
  });

  test('rejects a partial permission set instead of showing a broken full console', () => {
    expect(
      hasAdminConsoleAccess(identity({ roles: ['operations-admin'], permissions: fullPermissions.slice(0, -1) })),
    ).toBe(false);
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
    const cryptoWithoutRandomUUID = { getRandomValues: (value: Uint8Array) => value };
    try {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: cryptoWithoutRandomUUID });
      new AdminConsoleClient();
      expect(globalThis.crypto).toBe(cryptoWithoutRandomUUID);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });
});

describe('admin console login', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('derives the deployment id from server metadata before signing in', async () => {
    const requests = stubAepServer({
      'GET /aep/v1/metadata': { body: serverMetadata },
      'POST /aep/v1/auth/password/login': { body: loginTokens },
      'GET /aep/v1/user/me': { body: adminMe },
    });
    const client = new AdminConsoleClient('http://aep.test', new MemoryTokenStore());
    const session = await client.login({ username: 'admin', password: 'test-password' });
    expect(session.status).toBe('authenticated');
    expect(requests.slice(0, 2).map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /aep/v1/metadata',
      'POST /aep/v1/auth/password/login',
    ]);
    expect(requests[1]?.body).toMatchObject({ deploymentId: 'demo', username: 'admin' });
  });

  test('accepts a deployment named only by the metadata deployment object', async () => {
    const requests = stubAepServer({
      'GET /aep/v1/metadata': { body: { service: 'zhiyuan-aep', deployment: { id: 'demo', name: '演示部署' } } },
      'POST /aep/v1/auth/password/login': { body: loginTokens },
      'GET /aep/v1/user/me': { body: adminMe },
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
    await expect(client.login({ username: 'admin', password: 'test-password' })).rejects.toBeInstanceOf(
      AdminMetadataError,
    );
    expect(requests.some((request) => request.path === '/aep/v1/auth/password/login')).toBe(false);
  });

  test('rejects with a metadata error when metadata omits the deployment id', async () => {
    const requests = stubAepServer({
      'GET /aep/v1/metadata': { body: { service: 'zhiyuan-aep' } },
    });
    const client = new AdminConsoleClient('http://aep.test', new MemoryTokenStore());
    await expect(client.login({ username: 'admin', password: 'test-password' })).rejects.toBeInstanceOf(
      AdminMetadataError,
    );
    expect(requests.some((request) => request.path === '/aep/v1/auth/password/login')).toBe(false);
  });
});

describe('admin session client identity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('parses the recorded client identity on session list items', async () => {
    const { client } = await signedInClient({
      'GET /aep/v1/admin/sessions': {
        body: {
          items: [
            {
              sessionId: 's-agent',
              userId: 'u1',
              topic: 'user:u1',
              createdAt: '2026-09-01T00:00:00Z',
              lastSeenAt: '2026-09-04T00:00:00Z',
              revokedAt: null,
              client: {
                name: 'zhiyuan-enterprise',
                version: '0.8.0',
                deviceId: '7b7d02c4-2c4f-4f6f-9d3c-9d6f8a1b2c3d',
              },
            },
            {
              sessionId: 's-ua',
              userId: 'u1',
              topic: 'user:u1',
              createdAt: '2026-09-01T00:00:00Z',
              lastSeenAt: '2026-09-04T00:00:00Z',
              revokedAt: null,
              client: { name: 'browser' },
            },
            {
              sessionId: 's-unknown',
              userId: 'u1',
              topic: 'user:u1',
              createdAt: '2026-09-01T00:00:00Z',
              lastSeenAt: '2026-09-04T00:00:00Z',
              revokedAt: null,
              client: null,
            },
            {
              sessionId: 's-legacy',
              userId: 'u1',
              topic: 'user:u1',
              createdAt: '2026-09-01T00:00:00Z',
              lastSeenAt: '2026-09-04T00:00:00Z',
              revokedAt: null,
            },
          ],
        },
      },
    });
    const sessions = await client.sessions();
    expect(sessions).toHaveLength(4);
    expect(sessions[0]?.client).toEqual({
      name: 'zhiyuan-enterprise',
      version: '0.8.0',
      deviceId: '7b7d02c4-2c4f-4f6f-9d3c-9d6f8a1b2c3d',
    });
    expect(sessions[1]?.client).toEqual({ name: 'browser' });
    expect(sessions[2]?.client).toBeNull();
    expect(sessions[3]?.client).toBeUndefined();
  });

  test('loads the authentication audit and drops malformed records', async () => {
    const { client, requests } = await signedInClient({
      'GET /aep/v1/admin/audit/authentication': {
        body: {
          items: [
            {
              cursor: '7',
              userId: 'u1',
              eventType: 'login.failed',
              outcome: 'failure',
              reason: 'invalid_credentials',
              sourceHash: 'h',
              createdAt: '2026-10-01T00:00:00Z',
            },
            { cursor: '6', userId: null, eventType: 'login.throttled', outcome: 'denied', reason: null },
            { cursor: 5 },
          ],
          nextCursor: '6',
        },
      },
    });
    const page = await client.searchAuthenticationAudit({ eventType: 'login.failed', limit: 50 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ cursor: '7', userId: 'u1', eventType: 'login.failed', outcome: 'failure' });
    expect(page.items[1]).toMatchObject({ cursor: '6', eventType: 'login.throttled', outcome: 'denied' });
    expect(page.items[1]?.userId).toBeUndefined();
    expect(page.nextCursor).toBe('6');
    expect(requests.some((item) => item.path === '/aep/v1/admin/audit/authentication')).toBe(true);
  });

  test('tracks the console session id from login and clears it on logout', async () => {
    const { client } = await signedInClient({
      'POST /aep/v1/auth/logout': { status: 204, body: null },
    });
    expect(client.sessionId).toBe('test-session');
    await client.logout();
    expect(client.sessionId).toBeNull();
  });

  test('captures the session id from restored tokens', async () => {
    stubAepServer({ 'GET /aep/v1/user/me': { body: adminMe } });
    const store = new MemoryTokenStore({
      ...loginTokens,
      tokenType: 'Bearer' as const,
      sessionId: 'restored-session',
    });
    const client = new AdminConsoleClient('http://aep.test', store);
    const session = await client.restore();
    expect(session.status).toBe('authenticated');
    expect(client.sessionId).toBe('restored-session');
  });

  test('keeps the same session id across an access-token refresh', async () => {
    let sessionReads = 0;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const method = init?.method ?? 'GET';
      const key = `${method} ${url.pathname}`;
      const respond = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      if (key === 'GET /aep/v1/metadata') return respond(200, serverMetadata);
      if (key === 'POST /aep/v1/auth/password/login') return respond(200, loginTokens);
      if (key === 'GET /aep/v1/user/me') return respond(200, adminMe);
      if (key === 'POST /aep/v1/auth/refresh') {
        return respond(200, { ...loginTokens, accessToken: 'test-access-refreshed' });
      }
      if (key === 'GET /aep/v1/admin/sessions') {
        sessionReads += 1;
        return sessionReads === 1 ? respond(401, { code: 'TOKEN_EXPIRED' }) : respond(200, { items: [] });
      }
      return respond(404, { code: 'NOT_FOUND' });
    });
    const client = new AdminConsoleClient('http://aep.test', new MemoryTokenStore());
    await client.login({ username: 'admin', password: 'test-password' });
    expect(client.sessionId).toBe('test-session');
    await client.sessions();
    expect(sessionReads).toBe(2);
    expect(client.sessionId).toBe('test-session');
  });

  test('changePassword rotates the restricted session and reloads the identity', async () => {
    const rotated = { ...loginTokens, sessionId: 'rotated-session' };
    const { client, requests } = await signedInClient({
      'POST /aep/v1/auth/password/change': { body: rotated },
    });
    const session = await client.changePassword({ newPassword: 'new-password-123' });
    expect(session.status).toBe('authenticated');
    expect(client.sessionId).toBe('rotated-session');
    expect(requests.find((request) => request.path === '/aep/v1/auth/password/change')?.body).toEqual({
      newPassword: 'new-password-123',
    });
  });
});

describe('admin deployment settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const envSettings = {
    modelGatewayBaseUrl: { override: null, effectiveValue: 'https://gateway.example.test/v1', source: 'env' },
  };

  test('reads the current settings through the admin deployment endpoint', async () => {
    const { client, requests } = await signedInClient({
      'GET /aep/v1/admin/deployment/settings': { body: envSettings },
    });
    const settings = await client.deploymentSettings();
    expect(settings.modelGatewayBaseUrl).toEqual({
      override: null,
      effectiveValue: 'https://gateway.example.test/v1',
      source: 'env',
    });
    expect(requests.map((request) => `${request.method} ${request.path}`)).toContain(
      'GET /aep/v1/admin/deployment/settings',
    );
  });

  test('parses override and unset sources', async () => {
    const { client } = await signedInClient({
      'GET /aep/v1/admin/deployment/settings': {
        body: {
          modelGatewayBaseUrl: {
            override: 'https://gw.internal.test/v1',
            effectiveValue: 'https://gw.internal.test/v1',
            source: 'override',
          },
        },
      },
    });
    const overridden = await client.deploymentSettings();
    expect(overridden.modelGatewayBaseUrl.source).toBe('override');
    expect(overridden.modelGatewayBaseUrl.override).toBe('https://gw.internal.test/v1');
  });

  test('writes an override value with PUT', async () => {
    const { client, requests } = await signedInClient({
      'PUT /aep/v1/admin/deployment/settings': {
        body: {
          modelGatewayBaseUrl: {
            override: 'https://gateway.example.test/v2',
            effectiveValue: 'https://gateway.example.test/v2',
            source: 'override',
          },
        },
      },
    });
    const settings = await client.updateDeploymentSettings({ modelGatewayBaseUrl: 'https://gateway.example.test/v2' });
    expect(settings.modelGatewayBaseUrl.source).toBe('override');
    const write = requests.find(
      (request) => `${request.method} ${request.path}` === 'PUT /aep/v1/admin/deployment/settings',
    );
    expect(write?.body).toEqual({ modelGatewayBaseUrl: 'https://gateway.example.test/v2' });
  });

  test('clears the override with an explicit null', async () => {
    const { client, requests } = await signedInClient({
      'PUT /aep/v1/admin/deployment/settings': { body: envSettings },
    });
    const settings = await client.updateDeploymentSettings({ modelGatewayBaseUrl: null });
    expect(settings.modelGatewayBaseUrl.source).toBe('env');
    const write = requests.find(
      (request) => `${request.method} ${request.path}` === 'PUT /aep/v1/admin/deployment/settings',
    );
    expect(write?.body).toEqual({ modelGatewayBaseUrl: null });
  });

  test('sends an empty object when every field is omitted', async () => {
    const { client, requests } = await signedInClient({
      'PUT /aep/v1/admin/deployment/settings': { body: envSettings },
    });
    await client.updateDeploymentSettings({});
    const write = requests.find(
      (request) => `${request.method} ${request.path}` === 'PUT /aep/v1/admin/deployment/settings',
    );
    expect(write?.body).toEqual({});
  });

  test('surfaces the 422 problem code and detail', async () => {
    const { client } = await signedInClient({
      'PUT /aep/v1/admin/deployment/settings': {
        status: 422,
        body: {
          code: 'INVALID_DEPLOYMENT_SETTINGS',
          detail: 'The model gateway base URL must not use a cluster-internal hostname.',
        },
      },
    });
    const error = await client
      .updateDeploymentSettings({ modelGatewayBaseUrl: 'http://gateway.svc.cluster.local/v1' })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AdminRequestError);
    expect((error as AdminRequestError).status).toBe(422);
    expect((error as AdminRequestError).code).toBe('INVALID_DEPLOYMENT_SETTINGS');
    expect((error as AdminRequestError).detail).toBe(
      'The model gateway base URL must not use a cluster-internal hostname.',
    );
  });

  test('surfaces a 403 as an AdminRequestError', async () => {
    const { client } = await signedInClient({
      'GET /aep/v1/admin/deployment/settings': {
        status: 403,
        body: { code: 'FORBIDDEN', detail: 'deployment.read required' },
      },
    });
    const error = await client.deploymentSettings().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AdminRequestError);
    expect((error as AdminRequestError).status).toBe(403);
  });

  test('rejects a malformed settings payload', async () => {
    const { client } = await signedInClient({
      'GET /aep/v1/admin/deployment/settings': { body: { modelGatewayBaseUrl: { source: 'sideways' } } },
    });
    await expect(client.deploymentSettings()).rejects.toThrow('invalid');
  });
});

describe('model gateway URL pre-validation', () => {
  test('accepts absolute http/https URLs with public hostnames', () => {
    expect(modelGatewayBaseUrlProblem('https://gateway.example.com/v1')).toBeNull();
    expect(modelGatewayBaseUrlProblem('http://models.internal.example.com')).toBeNull();
    expect(modelGatewayBaseUrlProblem(' https://gateway.example.com/v1 ')).toBeNull();
  });

  test('accepts IP literal hosts; loopback policy stays server-side', () => {
    expect(modelGatewayBaseUrlProblem('http://10.0.0.8:8080/v1')).toBeNull();
    expect(modelGatewayBaseUrlProblem('http://127.0.0.1:8080/v1')).toBeNull();
    expect(modelGatewayBaseUrlProblem('http://[2001:db8::1]/v1')).toBeNull();
  });

  test('rejects cluster-internal and single-label hostnames', () => {
    expect(modelGatewayBaseUrlProblem('http://gateway.svc.cluster.local/v1')).toBe('cluster-internal');
    expect(modelGatewayBaseUrlProblem('http://svc.cluster.local/v1')).toBe('cluster-internal');
    expect(modelGatewayBaseUrlProblem('http://gateway/v1')).toBe('cluster-internal');
  });

  test('rejects non-absolute or non-http(s) values', () => {
    expect(modelGatewayBaseUrlProblem('')).toBe('invalid');
    expect(modelGatewayBaseUrlProblem('gateway.example.com/v1')).toBe('invalid');
    expect(modelGatewayBaseUrlProblem('ftp://gateway.example.com')).toBe('invalid');
    expect(modelGatewayBaseUrlProblem(`https://${'a'.repeat(2100)}.com`)).toBe('invalid');
  });
});

describe('admin data-plane publish', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const desiredState = {
    deploymentId: 'demo',
    revision: 'catalog-abc',
    routes: [
      {
        modelId: 'chat',
        enabled: true,
        endpoint: '/v1/chat',
        upstreamModel: 'deepseek-chat',
        protocol: 'openai-compatible',
      },
    ],
    publishedAt: '2026-09-30T00:00:00Z',
    contentHash: 'a'.repeat(64),
  };

  test('publishes the catalog-derived routes with an empty body by default', async () => {
    const { client, requests } = await signedInClient({
      'POST /aep/v1/admin/data-plane/publish': { body: desiredState },
    });
    const desired = await client.publishDataPlaneRoutes();
    expect(desired.revision).toBe('catalog-abc');
    expect(desired.routes).toHaveLength(1);
    const publish = requests.find(
      (request) => `${request.method} ${request.path}` === 'POST /aep/v1/admin/data-plane/publish',
    );
    expect(publish?.body).toEqual({});
  });

  test('forwards an explicit revision', async () => {
    const { client, requests } = await signedInClient({
      'POST /aep/v1/admin/data-plane/publish': { body: { ...desiredState, revision: 'release-7' } },
    });
    const desired = await client.publishDataPlaneRoutes({ revision: 'release-7' });
    expect(desired.revision).toBe('release-7');
    const publish = requests.find(
      (request) => `${request.method} ${request.path}` === 'POST /aep/v1/admin/data-plane/publish',
    );
    expect(publish?.body).toEqual({ revision: 'release-7' });
  });

  test('surfaces publish failures as AdminRequestError', async () => {
    const { client } = await signedInClient({
      'POST /aep/v1/admin/data-plane/publish': {
        status: 400,
        body: { code: 'INVALID_DATA_PLANE_STATE', detail: 'The revision is too long.' },
      },
    });
    const error = await client.publishDataPlaneRoutes({ revision: 'x'.repeat(300) }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AdminRequestError);
    expect((error as AdminRequestError).status).toBe(400);
    expect((error as AdminRequestError).code).toBe('INVALID_DATA_PLANE_STATE');
  });

  test('dataPlane() parses the catalog comparison from the status response', async () => {
    const { client } = await signedInClient({
      'GET /aep/v1/admin/data-plane/desired-state': { body: desiredState },
      'GET /aep/v1/admin/data-plane/status': {
        body: {
          state: 'ready',
          observedRevision: 'catalog-abc',
          contentHash: 'a'.repeat(64),
          lastAppliedAt: '2026-09-30T00:01:00Z',
          resourceCount: 1,
          catalogComparison: {
            missing: ['vision'],
            extra: ['retired'],
            mismatched: [{ modelId: 'chat', fields: ['endpoint'] }],
          },
        },
      },
    });
    const dataPlane = await client.dataPlane();
    expect(dataPlane.status.state).toBe('ready');
    expect(dataPlane.status.catalogComparison).toEqual({
      missing: ['vision'],
      extra: ['retired'],
      mismatched: [{ modelId: 'chat', fields: ['endpoint'] }],
    });
  });

  test('dataPlane() tolerates a status response without the comparison field', async () => {
    const { client } = await signedInClient({
      'GET /aep/v1/admin/data-plane/desired-state': { body: desiredState },
      'GET /aep/v1/admin/data-plane/status': {
        body: { state: 'pending', observedRevision: null, contentHash: null },
      },
    });
    const dataPlane = await client.dataPlane();
    expect(dataPlane.status.state).toBe('pending');
    expect(dataPlane.status.catalogComparison).toBeUndefined();
  });
});

describe('admin console passthrough endpoints', () => {
  afterEach(() => vi.unstubAllGlobals());

  // One-row-per-endpoint table exercise: each call must hit the contract
  // path with the right method and unwrap the response.
  const cases = [
    {
      name: 'updateUser',
      call: (c: AdminConsoleClient) => c.updateUser('u1', { displayName: '新名' } as never),
      route: 'PATCH /aep/v1/admin/users/u1',
      response: { user: { id: 'u1' } },
    },
    {
      name: 'replaceUserRBAC',
      call: (c: AdminConsoleClient) => c.replaceUserRBAC('u1', { roleIds: ['admin'], teamIds: [] }),
      route: 'PUT /aep/v1/admin/users/u1/rbac',
      response: {},
    },
    {
      name: 'resetUserPassword',
      call: (c: AdminConsoleClient) =>
        c.resetUserPassword('u1', { temporaryPassword: 'x1234567', requirePasswordChange: true }),
      route: 'POST /aep/v1/admin/users/u1/reset-password',
      response: {},
    },
    {
      name: 'createRole',
      call: (c: AdminConsoleClient) => c.createRole({ id: 'auditor', name: '审计' } as never),
      route: 'POST /aep/v1/admin/roles',
      response: { role: { id: 'auditor' } },
    },
    {
      name: 'deleteRole',
      call: (c: AdminConsoleClient) => c.deleteRole('auditor'),
      route: 'DELETE /aep/v1/admin/roles/auditor',
      response: {},
    },
    {
      name: 'updateTeam',
      call: (c: AdminConsoleClient) => c.updateTeam('t1', { name: '研发二部' } as never),
      route: 'PATCH /aep/v1/admin/teams/t1',
      response: { team: { id: 't1' } },
    },
    {
      name: 'deleteTeam',
      call: (c: AdminConsoleClient) => c.deleteTeam('t1'),
      route: 'DELETE /aep/v1/admin/teams/t1',
      response: {},
    },
    {
      name: 'models',
      call: (c: AdminConsoleClient) => c.models(),
      route: 'GET /aep/v1/admin/models',
      response: { models: [], assignments: [] },
    },
  ] as const;

  test.each(cases)('$name hits $route', async ({ call, route, response }) => {
    const { client } = await signedInClient({ [route]: { body: response } });
    await expect(call(client)).resolves.not.toThrow();
  });

  test('dataPlane merges desired-state with the handwritten status read', async () => {
    const { client } = await signedInClient({
      'GET /aep/v1/admin/data-plane/desired-state': { body: { revision: 'r1', secrets: [], routes: [] } },
      'GET /aep/v1/admin/data-plane/status': { body: { state: 'ready', routes: [] } },
    });
    const result = await client.dataPlane();
    expect(result.desired).toMatchObject({ revision: 'r1' });
    expect(result.status).toMatchObject({ state: 'ready' });
  });
});
