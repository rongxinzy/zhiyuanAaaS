import { describe, expect, test, vi } from 'vitest';

import { PortalClient, PortalError } from './portal.js';

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('portal client', () => {
  test('attaches the bearer token and parses the employee list', async () => {
    const fetchMock = stubFetch(200, {
      employees: [{ name: 'sales-helper', displayName: '销售助理', phase: 'Ready', model: 'bench-glm' }],
    });
    const portal = new PortalClient(async () => 'aep-token');

    const employees = await portal.listEmployees();

    expect(employees).toHaveLength(1);
    expect(employees[0]).toMatchObject({ name: 'sales-helper', phase: 'Ready' });
    const [input, init] = fetchMock.mock.calls[0]!;
    expect(input).toBe('/api/v1/employees');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer aep-token' });
    vi.unstubAllGlobals();
  });

  test('maps apply responses: 201 created, 202 pending, 409 rejected with message', async () => {
    const portal = new PortalClient(async () => null);
    const tokenless = (init: RequestInit) => !('Authorization' in (init.headers as Record<string, string>));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 201 })));
    expect(await portal.apply('a', 'A')).toMatchObject({ kind: 'created' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ policy: '需管理员审批' }), { status: 202 }),
    ));
    expect(await portal.apply('b', 'B')).toEqual({ kind: 'pending', message: '需管理员审批' });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'digital employee "b" already exists' }), { status: 409 }),
    ));
    expect(await portal.apply('b', 'B')).toEqual({
      kind: 'rejected',
      status: 409,
      message: 'digital employee "b" already exists',
    });

    // No session token → no Authorization header.
    const [input, init] = (vi.mocked(fetch).mock.calls.at(-1) as unknown as [string, RequestInit])!;
    expect(input).toBe('/api/v1/employees');
    expect(tokenless(init)).toBe(true);
    vi.unstubAllGlobals();
  });

  test('listRequests surfaces portal errors as PortalError', async () => {
    stubFetch(403, { error: 'administrator role required' });
    const portal = new PortalClient(async () => 'aep-token');

    const failure = await portal.listRequests().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PortalError);
    expect((failure as PortalError).status).toBe(403);
    expect((failure as PortalError).message).toBe('administrator role required');
    vi.unstubAllGlobals();
  });

  test('decideRequest posts the reject reason', async () => {
    const fetchMock = stubFetch(200, {});
    const portal = new PortalClient(async () => 'aep-token');

    await portal.decideRequest('req-1', 'reject', '名称不合规');

    const [input, init] = fetchMock.mock.calls[0]!;
    expect(input).toBe('/api/v1/requests/req-1/reject');
    expect((init as RequestInit).body).toBe(JSON.stringify({ reason: '名称不合规' }));
    vi.unstubAllGlobals();
  });
});
