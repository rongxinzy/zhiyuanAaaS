import { afterEach, describe, expect, test, vi } from 'vitest';

import { MemoryTokenStore } from '@aep/sdk-node';

import { AdminConsoleClient, AdminMetadataError, AdminPermission, AdminRequestError, hasAdminConsoleAccess, hasAdminPermission, hasAnyAdminConsoleAccess, modelGatewayBaseUrlProblem, type AdminIdentity } from './client.js';

const fullPermissions = [
  'users.read', 'users.write', 'roles.read', 'roles.write', 'teams.read', 'teams.write',
  'skills.read', 'skills.write', 'skills.assign', 'models.read', 'models.write', 'models.assign',
  'credentials.read', 'credentials.write', 'credentials.assign', 'licenses.read', 'licenses.write', 'licenses.revoke',
  'identity.read', 'identity.write',
  'sessions.write', 'events.read', 'events.write', 'data_plane.write', 'deployment.read', 'deployment.write',
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
    expect(requests.slice(0, 2).map(request => `${request.method} ${request.path}`)).toEqual([
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
    expect(requests.map(request => `${request.method} ${request.path}`)).toContain('GET /aep/v1/admin/deployment/settings');
  });

  test('parses override and unset sources', async () => {
    const { client } = await signedInClient({
      'GET /aep/v1/admin/deployment/settings': {
        body: { modelGatewayBaseUrl: { override: 'https://gw.internal.test/v1', effectiveValue: 'https://gw.internal.test/v1', source: 'override' } },
      },
    });
    const overridden = await client.deploymentSettings();
    expect(overridden.modelGatewayBaseUrl.source).toBe('override');
    expect(overridden.modelGatewayBaseUrl.override).toBe('https://gw.internal.test/v1');
  });

  test('writes an override value with PUT', async () => {
    const { client, requests } = await signedInClient({
      'PUT /aep/v1/admin/deployment/settings': {
        body: { modelGatewayBaseUrl: { override: 'https://gateway.example.test/v2', effectiveValue: 'https://gateway.example.test/v2', source: 'override' } },
      },
    });
    const settings = await client.updateDeploymentSettings({ modelGatewayBaseUrl: 'https://gateway.example.test/v2' });
    expect(settings.modelGatewayBaseUrl.source).toBe('override');
    const write = requests.find(request => `${request.method} ${request.path}` === 'PUT /aep/v1/admin/deployment/settings');
    expect(write?.body).toEqual({ modelGatewayBaseUrl: 'https://gateway.example.test/v2' });
  });

  test('clears the override with an explicit null', async () => {
    const { client, requests } = await signedInClient({
      'PUT /aep/v1/admin/deployment/settings': { body: envSettings },
    });
    const settings = await client.updateDeploymentSettings({ modelGatewayBaseUrl: null });
    expect(settings.modelGatewayBaseUrl.source).toBe('env');
    const write = requests.find(request => `${request.method} ${request.path}` === 'PUT /aep/v1/admin/deployment/settings');
    expect(write?.body).toEqual({ modelGatewayBaseUrl: null });
  });

  test('sends an empty object when every field is omitted', async () => {
    const { client, requests } = await signedInClient({
      'PUT /aep/v1/admin/deployment/settings': { body: envSettings },
    });
    await client.updateDeploymentSettings({});
    const write = requests.find(request => `${request.method} ${request.path}` === 'PUT /aep/v1/admin/deployment/settings');
    expect(write?.body).toEqual({});
  });

  test('surfaces the 422 problem code and detail', async () => {
    const { client } = await signedInClient({
      'PUT /aep/v1/admin/deployment/settings': {
        status: 422,
        body: { code: 'INVALID_DEPLOYMENT_SETTINGS', detail: 'The model gateway base URL must not use a cluster-internal hostname.' },
      },
    });
    const error = await client.updateDeploymentSettings({ modelGatewayBaseUrl: 'http://gateway.svc.cluster.local/v1' })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AdminRequestError);
    expect((error as AdminRequestError).status).toBe(422);
    expect((error as AdminRequestError).code).toBe('INVALID_DEPLOYMENT_SETTINGS');
    expect((error as AdminRequestError).detail).toBe('The model gateway base URL must not use a cluster-internal hostname.');
  });

  test('surfaces a 403 as an AdminRequestError', async () => {
    const { client } = await signedInClient({
      'GET /aep/v1/admin/deployment/settings': { status: 403, body: { code: 'FORBIDDEN', detail: 'deployment.read required' } },
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
