import { MemoryTokenStore } from '@aep/sdk-node';
import { afterEach, expect, test, vi } from 'vitest';
import { AdminConsoleClient, AdminRequestError } from './client.js';
import { administratorIdentity } from './test-fixtures.js';

afterEach(() => vi.unstubAllGlobals());

const resources = ['skill', 'model', 'credential'] as const;
type Resource = (typeof resources)[number];
type Mode = 'pages' | 'cycle' | 'failure' | 'refresh' | 'empty';
async function setup(resource: Resource, mode: Mode = 'pages') {
  const pages: string[] = [];
  let refreshed = false;
  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/aep/v1/user/me') return Response.json(administratorIdentity);
    if (url.pathname === '/aep/v1/auth/refresh') {
      refreshed = true;
      return Response.json({ ...tokens, accessToken: 'test-renewed' });
    }
    if (url.pathname === `/aep/v1/admin/${resource}-assignments`) {
      const cursor = url.searchParams.get('cursor');
      pages.push(cursor ?? 'first');
      expect(url.searchParams.get('limit')).toBe('200');
      const headers = new Headers(init.headers);
      expect(headers.get('X-AEP-Protocol-Version')).toBe('1.0');
      expect(headers.get('Authorization')).toBe(`Bearer ${refreshed ? 'test-renewed' : 'test-access'}`);
      if (cursor && mode === 'failure') return Response.json({ code: 'ASSIGNMENTS_UNAVAILABLE' }, { status: 503 });
      if (cursor && mode === 'refresh' && !refreshed) return Response.json({}, { status: 401 });
      return Response.json({
        [resource === 'skill' ? 'items' : 'assignments']:
          mode === 'empty'
            ? []
            : [
                {
                  id: cursor ? 'grant-second' : 'grant-first',
                  ...(resource === 'skill'
                    ? { skillId: 'resource-one' }
                    : { resourceType: resource, resourceId: 'resource-one' }),
                  subject: { type: 'role', id: cursor ? 'role-second' : 'role-first' },
                  createdAt: '2026-10-20T00:00:00Z',
                  expiresAt: null,
                },
              ],
        nextCursor: mode === 'empty' || (cursor && mode !== 'cycle') ? null : 'created-at|id/+?',
      });
    }
    if (url.pathname === '/aep/v1/admin/models') return Response.json({ models: [], nextCursor: null });
    if (url.pathname === '/aep/v1/admin/credentials') return Response.json({ credentials: [], nextCursor: null });
    throw new Error(`Unexpected path ${url.pathname}`);
  });
  const store = new MemoryTokenStore();
  await store.set(tokens);
  const client = new AdminConsoleClient('http://aep.test', store);
  await client.restore();
  const load = (allowed = true) => {
    const identity = {
      ...administratorIdentity,
      roles: ['operator'],
      permissions: allowed ? [`${resource}s.assign`] : [],
    };
    return resource === 'skill'
      ? client.resources(identity)
      : resource === 'model'
        ? client.models(identity)
        : client.credentials(identity);
  };
  return { load, pages };
}
const tokens = {
  accessToken: 'test-access',
  refreshToken: 'test-refresh',
  modelAccessToken: 'test-model',
  tokenType: 'Bearer' as const,
  expiresIn: 3600,
  modelAccessExpiresIn: 3600,
  passwordChangeRequired: false,
};

test.each(resources)('%s assignments include every backend page and encode opaque cursors', async (resource) => {
  const { load, pages } = await setup(resource);
  expect((await load()).assignments.map((item) => item.id)).toEqual(['grant-first', 'grant-second']);
  expect(pages).toEqual(['first', 'created-at|id/+?']);
});
test.each(resources)('%s assignment page failures never return partial success', async (resource) => {
  const { load } = await setup(resource, 'failure');
  await expect(load()).rejects.toBeInstanceOf(AdminRequestError);
});
test.each(resources)('%s repeated cursors fail rather than looping or truncating', async (resource) => {
  const { load, pages } = await setup(resource, 'cycle');
  await expect(load()).rejects.toThrow('Repeated AEP assignment cursor');
  expect(pages).toHaveLength(2);
});
test.each(resources)('%s assignment pagination keeps token-refresh retry', async (resource) => {
  const { load, pages } = await setup(resource, 'refresh');
  expect((await load()).assignments).toHaveLength(2);
  expect(pages).toHaveLength(3);
});
test.each(resources)('%s assignment reads respect permissions', async (resource) => {
  const { load, pages } = await setup(resource);
  expect((await load(false)).assignments).toEqual([]);
  expect(pages).toEqual([]);
});
test.each(resources)('%s empty assignment page is a valid complete result', async (resource) => {
  const { load, pages } = await setup(resource, 'empty');
  expect((await load()).assignments).toEqual([]);
  expect(pages).toHaveLength(1);
});
