import { MemoryTokenStore } from '@aep/sdk-node';
import { afterEach, expect, test, vi } from 'vitest';
import { AdminConsoleClient } from './client.js';
import { PortalClient } from './portal.js';

const tokens = {
  accessToken: 'synthetic-stale-access',
  refreshToken: 'synthetic-refresh',
  modelAccessToken: 'synthetic-model',
  tokenType: 'Bearer' as const,
  expiresIn: 3600,
  modelAccessExpiresIn: 3600,
  deploymentId: 'demo',
  sessionId: 'synthetic-session',
  passwordChangeRequired: false,
};

afterEach(() => vi.unstubAllGlobals());

async function session(
  options: { alwaysReject?: boolean; refreshFails?: boolean; deniedCode?: string; rotatedElsewhere?: boolean } = {},
) {
  const store = new MemoryTokenStore(tokens);
  const requests: { authorization: string | null; body: string | undefined }[] = [];
  let refreshes = 0;
  let accepted = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://console.test');
    if (url.pathname === '/aep/v1/user/me')
      return Response.json({
        user: { id: 'admin-1', displayName: '管理员', email: null },
        deploymentId: 'demo',
        deployment: { id: 'demo', name: '演示部署' },
        roles: ['admin'],
        permissions: [],
        sessionExpiresAt: '2027-01-01T00:00:00Z',
        passwordChangeRequired: false,
      });
    if (url.pathname === '/aep/v1/auth/refresh') {
      refreshes += 1;
      if (options.refreshFails) return Response.json({ code: 'SESSION_REVOKED' }, { status: 401 });
      return Response.json({ ...tokens, accessToken: 'synthetic-fresh-access' });
    }
    if (url.pathname.endsWith('/activation')) {
      const authorization = new Headers(init?.headers).get('Authorization');
      requests.push({ authorization, body: typeof init?.body === 'string' ? init.body : undefined });
      if (options.rotatedElsewhere && authorization === `Bearer ${tokens.accessToken}`)
        await store.set({ ...tokens, accessToken: 'synthetic-fresh-access' });
      if (options.alwaysReject || authorization !== 'Bearer synthetic-fresh-access')
        return Response.json(
          { error: { code: options.deniedCode ?? 'AUTH_REQUIRED', message: 'Session expired' } },
          { status: 401 },
        );
      accepted += 1;
      return Response.json({ enabled: true, pending: true }, { status: 202 });
    }
    throw new Error(`Unexpected path: ${url.pathname}`);
  });
  const client = new AdminConsoleClient('http://aep.test', store);
  await client.restore();
  const portal = new PortalClient((rejectedToken?: string) => client.getAccessToken(rejectedToken));
  return { client, portal, requests, refreshes: () => refreshes, accepted: () => accepted };
}

test('channel activation refreshes an expired session through the SDK and retries the rejected request once', async () => {
  const state = await session();
  await state.portal.activateChannel('hr-bot', 'feishu', true);
  expect(state.refreshes()).toBe(1);
  expect(state.requests.map((item) => item.authorization)).toEqual([
    'Bearer synthetic-stale-access',
    'Bearer synthetic-fresh-access',
  ]);
  expect(state.requests.map((item) => item.body)).toEqual(['{"enabled":true}', '{"enabled":true}']);
  expect(state.accepted()).toBe(1);
  expect(state.client.sessionId).toBe('synthetic-session');
});

test('concurrent channel requests share the SDK refresh rather than rotating the same refresh token twice', async () => {
  const state = await session();
  await Promise.all([
    state.portal.activateChannel('hr-bot', 'feishu', true),
    state.portal.activateChannel('hr-bot', 'wecom', true),
  ]);
  expect(state.refreshes()).toBe(1);
  expect(state.accepted()).toBe(2);
});

test('a request rejected after a concurrent token rotation uses the current token without another refresh', async () => {
  const state = await session({ rotatedElsewhere: true });
  await state.portal.activateChannel('hr-bot', 'feishu', true);
  expect(state.refreshes()).toBe(0);
  expect(state.accepted()).toBe(1);
});

test('a revoked session is not retried or treated as a successful channel activation', async () => {
  const state = await session({ refreshFails: true });
  await expect(state.portal.activateChannel('hr-bot', 'feishu', true)).rejects.toMatchObject({
    status: 401,
    code: 'AUTH_REQUIRED',
  });
  expect(state.refreshes()).toBe(1);
  expect(state.requests).toHaveLength(1);
  expect(await state.client.getAccessToken()).toBeNull();
});

test('an unchanged rejection after refresh cannot create a retry loop', async () => {
  const state = await session({ alwaysReject: true });
  await expect(state.portal.activateChannel('hr-bot', 'feishu', true)).rejects.toMatchObject({ status: 401 });
  expect(state.refreshes()).toBe(1);
  expect(state.requests).toHaveLength(2);
});

test('a downstream 401 without AUTH_REQUIRED is not replayed as an authentication retry', async () => {
  const state = await session({ deniedCode: 'CHANNEL_RUNTIME_UNAVAILABLE' });
  await expect(state.portal.activateChannel('hr-bot', 'feishu', true)).rejects.toMatchObject({ status: 401 });
  expect(state.refreshes()).toBe(0);
  expect(state.requests).toHaveLength(1);
});
