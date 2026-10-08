import { describe, expect, test, vi } from 'vitest';

import { isSessionExpired, PortalClient, PortalError } from './portal.js';

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
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

  test('maps apply responses: 201 created, 202 pending, 409 rejected, 400 violations', async () => {
    const portal = new PortalClient(async () => null);
    const tokenless = (init: RequestInit) => !('Authorization' in (init.headers as Record<string, string>));
    const base = { name: 'a', displayName: 'A', description: 'd', team: 'rd-dept' };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 201 })));
    expect(await portal.apply(base)).toMatchObject({ kind: 'created' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ policy: '需管理员审批' }), { status: 202 })),
    );
    expect(await portal.apply({ ...base, name: 'b', displayName: 'B' })).toEqual({
      kind: 'pending',
      message: '需管理员审批',
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: 'digital employee "b" already exists' }), { status: 409 }),
        ),
    );
    expect(await portal.apply({ ...base, name: 'b', displayName: 'B' })).toEqual({
      kind: 'rejected',
      status: 409,
      message: 'digital employee "b" already exists',
    });

    // Release-condition failures carry field-anchored violations.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: '发布条件校验未通过（2 项）',
            violations: [
              { field: 'knowledgeBases[0]', message: '知识库 kb-x 不存在' },
              { field: 'team', message: '团队 nope 不存在' },
            ],
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const rejected = await portal.apply({ ...base, knowledgeBases: ['kb-x'] });
    expect(rejected).toEqual({
      kind: 'rejected',
      status: 400,
      message: '发布条件校验未通过（2 项）',
      violations: [
        { field: 'knowledgeBases[0]', message: '知识库 kb-x 不存在' },
        { field: 'team', message: '团队 nope 不存在' },
      ],
    });

    // The extended body carries every configured field and omits the rest.
    const [input, init] = (vi.mocked(fetch).mock.calls.at(-1) as unknown as [string, RequestInit])!;
    expect(input).toBe('/api/v1/employees');
    expect(JSON.parse((init as { body?: string }).body ?? '{}')).toEqual({
      ...base,
      knowledgeBases: ['kb-x'],
    });
    expect(tokenless(init)).toBe(true);
    vi.unstubAllGlobals();
  });

  test('apply spreads owner, skills, and visibility into the request body', async () => {
    const fetchMock = stubFetch(201, {});
    const portal = new PortalClient(async () => 'aep-token');

    await portal.apply({
      name: 'full-helper',
      displayName: '全字段',
      description: '整理资料',
      team: 'sales-dept',
      models: ['bench-glm'],
      owner: 'u-9',
      knowledgeBases: [],
      skills: [{ id: 'report-writer', version: '1.2.0' }],
      visibility: { mode: 'restricted', teams: ['sales-dept'], users: ['u-x'] },
    });

    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'full-helper',
      displayName: '全字段',
      description: '整理资料',
      team: 'sales-dept',
      models: ['bench-glm'],
      owner: 'u-9',
      knowledgeBases: [],
      skills: [{ id: 'report-writer', version: '1.2.0' }],
      visibility: { mode: 'restricted', teams: ['sales-dept'], users: ['u-x'] },
    });
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

  test('updateEmployee sends only carried fields and maps 200/400', async () => {
    const fetchMock = stubFetch(200, { employee: { name: 'a' } });
    const portal = new PortalClient(async () => 'aep-token');

    // The empty knowledge list must serialize as [] (deny-all), while
    // omitted fields stay out of the body entirely.
    expect(await portal.updateEmployee('a', { models: ['bench-qwen'], knowledgeBases: [] })).toEqual({
      kind: 'updated',
    });
    const [input, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(input).toBe('/api/v1/employees/a');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ models: ['bench-qwen'], knowledgeBases: [] });
    vi.unstubAllGlobals();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: '发布条件校验未通过（1 项）',
            violations: [{ field: 'models', message: '使用模型为必填发布条件' }],
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    expect(await portal.updateEmployee('a', { models: [] })).toEqual({
      kind: 'rejected',
      status: 400,
      message: '发布条件校验未通过（1 项）',
      violations: [{ field: 'models', message: '使用模型为必填发布条件' }],
    });
    vi.unstubAllGlobals();
  });

  test('getEmployee parses the detail row including the ordered model list', async () => {
    const fetchMock = stubFetch(200, {
      employee: {
        name: 'a',
        displayName: 'A',
        phase: 'Ready',
        models: ['bench-qwen', 'bench-anthropic'],
        knowledgeBases: null,
        visibility: null,
      },
    });
    const portal = new PortalClient(async () => 'aep-token');

    const employee = await portal.getEmployee('a');
    expect(employee.models).toEqual(['bench-qwen', 'bench-anthropic']);
    expect(employee.knowledgeBases).toBeNull();
    expect(employee.visibility).toBeNull();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/employees/a');
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

describe('portal client departments and lifecycle', () => {
  const client = () => new PortalClient(async () => 'aep-token');

  test('createDepartment maps 200 to created and failures to rejected', async () => {
    const ok = stubFetch(200, {});
    expect(await client().createDepartment('研发部')).toMatchObject({ kind: 'created' });
    expect(ok.mock.calls[0]![0]).toBe('/api/v1/departments');
    vi.unstubAllGlobals();

    stubFetch(500, { error: 'partial: weknora down' });
    await expect(client().createDepartment('研发部')).resolves.toMatchObject({
      kind: 'rejected',
      message: 'partial: weknora down',
    });
    vi.unstubAllGlobals();
  });

  test('department rename and delete throw PortalError on failure', async () => {
    stubFetch(200, {});
    await expect(client().renameDepartment('rd', '研发一部')).resolves.toBeUndefined();
    vi.unstubAllGlobals();

    stubFetch(409, { error: 'duplicate' });
    await expect(client().renameDepartment('rd', '研发一部')).rejects.toBeInstanceOf(PortalError);
    vi.unstubAllGlobals();

    stubFetch(200, null);
    await expect(client().deleteDepartment('rd')).resolves.toBeUndefined();
    vi.unstubAllGlobals();

    stubFetch(500, { error: 'boom' });
    await expect(client().deleteDepartment('rd')).rejects.toBeInstanceOf(PortalError);
    vi.unstubAllGlobals();
  });

  test('listDepartmentMembers and setDepartmentMembers round-trip', async () => {
    stubFetch(200, { members: [{ userId: 'u1', username: 'zhangsan', displayName: '张三' }] });
    const members = await client().listDepartmentMembers('rd');
    expect(members).toEqual([{ userId: 'u1', username: 'zhangsan', displayName: '张三' }]);
    vi.unstubAllGlobals();

    const put = stubFetch(200, {});
    await client().setDepartmentMembers('rd', ['u1', 'u2']);
    const [input, init] = put.mock.calls[0]!;
    expect(input).toBe('/api/v1/departments/rd/members');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ userIds: ['u1', 'u2'] });
    vi.unstubAllGlobals();
  });

  test('listDepartments parses the departments payload', async () => {
    stubFetch(200, { departments: [{ id: 'rd', name: '研发部' }] });
    await expect(client().listDepartments()).resolves.toEqual([{ id: 'rd', name: '研发部' }]);
    vi.unstubAllGlobals();
  });

  test('usageStats returns the aggregate payload', async () => {
    stubFetch(200, { totals: { employees: 5 }, byDepartment: {} });
    await expect(client().usageStats()).resolves.toMatchObject({ totals: { employees: 5 } });
    vi.unstubAllGlobals();
  });

  test('deleteEmployee encodes the name and surfaces errors', async () => {
    stubFetch(200, {});
    await expect(client().deleteEmployee('sales helper')).resolves.toBeUndefined();
    vi.unstubAllGlobals();

    stubFetch(404, { error: 'missing' });
    await expect(client().deleteEmployee('x')).rejects.toBeInstanceOf(PortalError);
    vi.unstubAllGlobals();
  });

  test('listRequests passes the state filter through', async () => {
    const fetchMock = stubFetch(200, { requests: [] });
    await client().listRequests('approved');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/requests?state=approved');
    vi.unstubAllGlobals();
  });

  test('memory and knowledge probes return the parsed payloads', async () => {
    stubFetch(200, { healthy: true, account: 'zhiyuan', accounts: [], employees: [] });
    await expect(client().memoryStatus()).resolves.toMatchObject({ healthy: true });
    vi.unstubAllGlobals();

    stubFetch(200, { memories: [{ uri: 'mem://1', score: 0.9, abstract: 'a' }] });
    await expect(client().memorySearch('sales-helper', 'q')).resolves.toHaveProperty('memories');
    vi.unstubAllGlobals();

    stubFetch(200, { configured: true, healthy: true, knowledgeBases: [] });
    await expect(client().knowledgeStatus()).resolves.toMatchObject({ configured: true });
    vi.unstubAllGlobals();
  });
});

describe('workbench client surface', () => {
  function client() {
    return new PortalClient(async () => 'aep-token');
  }

  test('parses /me with named teams and quota', async () => {
    const fetchMock = stubFetch(200, {
      user: { id: 'user-1', displayName: '张三', kind: 'human' },
      teams: [
        { id: 'sales-dept', name: '销售部' },
        { id: 'ghost', name: '' },
      ],
      quota: { limit: 2, used: 1, owned: 1, pending: 0 },
      policyMode: 'approval',
      defaultModel: 'bench-glm',
    });
    const me = await client().me();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/me');
    expect(me).toEqual({
      user: { id: 'user-1', displayName: '张三', kind: 'human' },
      teams: [
        { id: 'sales-dept', name: '销售部' },
        { id: 'ghost', name: '' },
      ],
      quota: { limit: 2, used: 1, owned: 1, pending: 0 },
      policyMode: 'approval',
      defaultModel: 'bench-glm',
    });
    vi.unstubAllGlobals();
  });

  test('myRequests hits the own-requests endpoint with the state filter', async () => {
    const fetchMock = stubFetch(200, {
      requests: [
        {
          id: 'req-1',
          employeeName: 'sales-helper',
          owner: '张三',
          displayName: '销售数据助理',
          state: 'approved',
          reason: '',
          createdAt: '2026-10-08T02:00:00Z',
          deploy: { exists: true, phase: 'Ready' },
        },
      ],
    });
    const requests = await client().myRequests('approved');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/requests/mine?state=approved');
    expect(requests[0]).toMatchObject({
      id: 'req-1',
      state: 'approved',
      deploy: { exists: true, phase: 'Ready' },
    });
    vi.unstubAllGlobals();

    const all = stubFetch(200, { requests: [] });
    await client().myRequests();
    expect(all.mock.calls[0]![0]).toBe('/api/v1/requests/mine');
    vi.unstubAllGlobals();
  });

  test('getRequest parses the decoded detail and surfaces 404', async () => {
    stubFetch(200, {
      request: {
        id: 'req-9',
        employeeName: 'sales-helper',
        displayName: '销售数据助理',
        ownerId: 'user-1',
        owner: '张三',
        state: 'pending',
        reason: '',
        createdAt: '2026-10-08T02:00:00Z',
        decidedAt: null,
        decidedBy: '',
        decidedByName: '',
        description: '整理销售数据。',
        teamId: 'sales-dept',
        teamName: '销售部',
        note: '仅使用销售团队可见资料。',
        model: 'bench-glm',
        deploy: { exists: false, phase: '', message: '' },
      },
    });
    const detail = await client().getRequest('req-9');
    expect(detail).toMatchObject({
      id: 'req-9',
      state: 'pending',
      decidedAt: null,
      teamName: '销售部',
      note: '仅使用销售团队可见资料。',
      deploy: { exists: false, phase: '' },
    });
    vi.unstubAllGlobals();

    stubFetch(404, { error: 'request req-x not found' });
    const failure = await client()
      .getRequest('req-x')
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PortalError);
    expect(isSessionExpired(failure)).toBe(false);
    expect(isSessionExpired(new PortalError(401, 'expired'))).toBe(true);
    vi.unstubAllGlobals();
  });

  test('parses accessReason on roster rows and tolerates its absence', async () => {
    stubFetch(200, {
      employees: [
        {
          name: 'sales-helper',
          phase: 'Ready',
          accessReason: { kind: 'team', teamId: 'sales-dept', teamName: '销售部' },
        },
        { name: 'legacy-helper', phase: 'Ready' },
      ],
    });
    const employees = await client().listEmployees();
    expect(employees[0]!.accessReason).toEqual({ kind: 'team', teamId: 'sales-dept', teamName: '销售部' });
    expect(employees[1]!.accessReason).toBeUndefined();
    vi.unstubAllGlobals();
  });

  test('apply sends the note only when present and returns the parked request id', async () => {
    const fetchMock = stubFetch(202, { policy: '需管理员审批', request: { id: 'req-42', state: 'pending' } });
    const result = await client().apply({
      name: 'sales-data-assistant',
      displayName: '销售数据助理',
      description: '整理销售数据。',
      team: 'sales-dept',
      visibility: { mode: 'restricted', teams: ['sales-dept'] },
      note: '仅使用销售团队可见资料。',
    });
    expect(result).toEqual({ kind: 'pending', message: '需管理员审批', requestId: 'req-42' });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.note).toBe('仅使用销售团队可见资料。');
    expect(body.visibility).toEqual({ mode: 'restricted', teams: ['sales-dept'] });
    vi.unstubAllGlobals();

    const withoutNote = stubFetch(201, {});
    await client().apply({ name: 'a', displayName: 'A', description: 'd', team: 'rd-dept' });
    const bare = JSON.parse((withoutNote.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
    expect('note' in bare).toBe(false);
    vi.unstubAllGlobals();
  });
});
