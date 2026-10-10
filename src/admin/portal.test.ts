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

  test('managed knowledge client uses fixed routes, strict DTOs, and safe multipart transport', async () => {
    const portal = new PortalClient(async () => 'aep-token');
    stubFetch(200, {
      deploymentId: 'deploy-a',
      tenantId: '10000',
      tenant: 'verified',
      embeddingModel: { state: 'configured', id: 'embed-a', availability: 'unverified' },
      storage: 'unverified',
      parser: 'unverified',
    });
    await expect(portal.managedKnowledgeReadiness()).resolves.toMatchObject({
      embeddingModel: { state: 'configured', availability: 'unverified' },
    });
    vi.unstubAllGlobals();

    const base = {
      id: 'kb/a',
      name: 'Policies',
      description: '',
      tenant_id: 10000,
      embedding_model_id: 'embed-a',
      type: 'document',
    };
    const fetchMock = stubFetch(200, { data: [base] });
    await expect(portal.listManagedKnowledgeBases()).resolves.toEqual([{ ...base, tenant_id: '10000' }]);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases');
    vi.unstubAllGlobals();

    const document = {
      id: 'doc-1',
      knowledge_base_id: 'kb/a',
      name: 'Policy',
      file_name: 'policy.pdf',
      parse_status: 'pending',
      created_at: '2026-10-09T00:00:00Z',
    };
    const pageFetch = stubFetch(200, { data: [document], total: 1, page: 1, pageSize: 10 });
    await expect(
      portal.listManagedKnowledgeDocuments('kb/a', { page: 1, pageSize: 10, keyword: 'policy & guide' }),
    ).resolves.toMatchObject({ data: [document], total: 1 });
    expect(pageFetch.mock.calls[0]![0]).toBe(
      '/api/v1/knowledge/managed/bases/kb%2Fa/documents?page=1&page_size=10&keyword=policy+%26+guide',
    );
    vi.unstubAllGlobals();

    const uploadFetch = stubFetch(202, { data: document, operationId: 'op-upload-1' });
    const file = new File(['policy'], 'policy.pdf', { type: 'application/pdf' });
    await expect(portal.uploadManagedKnowledgeDocument('kb/a', file)).resolves.toMatchObject({
      operationId: 'op-upload-1',
      data: document,
    });
    const [, init] = uploadFetch.mock.calls[0]!;
    expect(uploadFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb%2Fa/documents/file');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer aep-token' });
    expect((init as RequestInit).headers).not.toHaveProperty('Content-Type');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
    vi.unstubAllGlobals();
  });

  test('managed knowledge preserves structured errors and rejects cross-base documents', async () => {
    const portal = new PortalClient(async () => null);
    stubFetch(409, {
      error: {
        code: 'KNOWLEDGE_BASE_IN_USE',
        message: 'Still referenced',
        operationId: 'op-delete-2',
        resourceId: 'kb-1',
      },
    });
    await expect(portal.deleteManagedKnowledgeBase('kb-1')).rejects.toMatchObject({
      status: 409,
      code: 'KNOWLEDGE_BASE_IN_USE',
      message: 'Still referenced',
      operationId: 'op-delete-2',
      resourceId: 'kb-1',
    });
    vi.unstubAllGlobals();

    stubFetch(200, {
      data: [
        {
          id: 'doc-1',
          knowledge_base_id: 'another-kb',
          name: 'x',
          file_name: 'x.txt',
          parse_status: 'completed',
          created_at: '',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    await expect(portal.listManagedKnowledgeDocuments('kb-1', { page: 1, pageSize: 10 })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    vi.unstubAllGlobals();

    stubFetch(403, { error: 'forbidden' });
    await expect(portal.listManagedKnowledgeBases()).rejects.toMatchObject({ status: 403, message: 'forbidden' });
    vi.unstubAllGlobals();
  });

  test('managed knowledge operations use fixed routes and preserve index/CAS state', async () => {
    const portal = new PortalClient(async () => null);
    const tag = {
      id: 'tag-1',
      seq_id: 2,
      name: 'Policies',
      color: '',
      sort_order: 0,
      knowledge_count: 1,
      chunk_count: 2,
    };
    const tagsFetch = stubFetch(200, { data: [tag], total: 1, page: 1, page_size: 200 });
    await expect(portal.listManagedKnowledgeTags('kb-1')).resolves.toEqual([tag]);
    expect(tagsFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1/tags?page=1&page_size=200');
    vi.unstubAllGlobals();

    const folder = { path: 'docs', name: 'docs', document_count: 1, total_count: 2, children: [] };
    const foldersFetch = stubFetch(200, {
      data: { root_document_count: 1, total_document_count: 3, folders: [folder] },
    });
    await expect(portal.getManagedKnowledgeFolders('kb-1')).resolves.toMatchObject({ folders: [folder] });
    expect(foldersFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1/folders');
    vi.unstubAllGlobals();

    const operation = { data: { outcome: 'succeeded', affectedCount: 2 }, operationId: 'op-1' };
    const moveFetch = stubFetch(200, operation);
    await expect(portal.moveManagedKnowledgeDocuments('kb-1', ['doc-1', 'doc-2'], 'docs')).resolves.toEqual(operation);
    expect(moveFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1/folders/move');
    expect(JSON.parse(String((moveFetch.mock.calls[0]![1] as RequestInit).body))).toEqual({
      document_ids: ['doc-1', 'doc-2'],
      folder_path: 'docs',
    });
    vi.unstubAllGlobals();

    const batchDeleteFetch = stubFetch(200, operation);
    await expect(portal.deleteManagedKnowledgeFAQEntries('kb-1', [7])).resolves.toEqual(operation);
    expect(batchDeleteFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1/faq/batch/delete');
    expect((batchDeleteFetch.mock.calls[0]![1] as RequestInit).method).toBe('DELETE');
    vi.unstubAllGlobals();

    const faq = {
      id: 9,
      knowledge_id: 'doc-1',
      knowledge_base_id: 'kb-1',
      tag_id: 0,
      tag_name: '',
      is_enabled: true,
      is_recommended: false,
      standard_question: 'How?',
      similar_questions: [],
      negative_questions: [],
      answers: ['Because.'],
      answer_strategy: '',
      updated_at: '',
      created_at: '',
    };
    const faqCreateFetch = stubFetch(200, { data: faq, operationId: 'op-faq' });
    await expect(
      portal.saveManagedKnowledgeFAQ('kb-1', null, {
        standard_question: 'How?',
        similar_questions: [],
        negative_questions: [],
        answers: ['Because.'],
      }),
    ).resolves.toMatchObject({ data: { id: 9 }, operationId: 'op-faq' });
    expect(faqCreateFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1/faq/entries');
    vi.unstubAllGlobals();

    const chunkFetch = stubFetch(200, {
      data: {
        id: 'chunk-1',
        knowledge_id: 'doc-1',
        seq_id: 3,
        content: 'Updated',
        chunk_type: 'text',
        is_enabled: true,
        content_revision: 5,
        index_status: 'failed',
      },
      operationId: 'op-chunk',
    });
    await expect(
      portal.updateManagedKnowledgeChunk('doc-1', 'chunk-1', { content: 'Updated', expected_revision: 4 }),
    ).resolves.toMatchObject({ data: { content_revision: 5, index_status: 'failed' }, operationId: 'op-chunk' });
    expect(chunkFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/documents/doc-1/chunks/chunk-1');
    expect(JSON.parse(String((chunkFetch.mock.calls[0]![1] as RequestInit).body))).toEqual({
      content: 'Updated',
      expected_revision: 4,
    });
    vi.unstubAllGlobals();
  });

  test('managed knowledge mutations keep DTOs allowlisted and operation IDs visible', async () => {
    const portal = new PortalClient(async () => null);
    const data = {
      id: 'kb-1',
      name: 'Handbook',
      description: 'Public docs',
      tenant_id: '10000',
      embedding_model_id: 'embed-1',
      type: 'document',
    };
    const createFetch = stubFetch(201, { data, operationId: 'op-create-1' });
    await expect(portal.createManagedKnowledgeBase({ name: 'Handbook', description: 'Public docs' })).resolves.toEqual({
      data,
      operationId: 'op-create-1',
    });
    expect(createFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases');
    expect(JSON.parse(String((createFetch.mock.calls[0]![1] as RequestInit).body))).toEqual({
      name: 'Handbook',
      description: 'Public docs',
    });
    vi.unstubAllGlobals();

    const updateFetch = stubFetch(200, { data: { ...data, name: 'Handbook v2' }, operationId: 'op-update-1' });
    await expect(portal.updateManagedKnowledgeBase('kb/1', { name: 'Handbook v2' })).resolves.toMatchObject({
      operationId: 'op-update-1',
      data: { name: 'Handbook v2' },
    });
    expect(updateFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb%2F1');
    expect(JSON.parse(String((updateFetch.mock.calls[0]![1] as RequestInit).body))).toEqual({ name: 'Handbook v2' });
    vi.unstubAllGlobals();

    const deleteFetch = stubFetch(200, { deleted: true, operationId: 'op-delete-1' });
    await expect(portal.deleteManagedKnowledgeBase('kb-1')).resolves.toEqual({ operationId: 'op-delete-1' });
    expect(deleteFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1');
    vi.unstubAllGlobals();
  });

  test('managed document lifecycle methods use only fixed routes and return validated data', async () => {
    const portal = new PortalClient(async () => 'aep-token');
    const document = {
      id: 'doc-1',
      knowledge_base_id: 'kb-1',
      name: 'Guide',
      file_name: 'guide.pdf',
      parse_status: 'pending',
      created_at: '2026-10-09T00:00:00Z',
    };

    const urlFetch = stubFetch(202, { data: document, operationId: 'op-url' });
    await expect(
      portal.importManagedKnowledgeURL('kb-1', { url: 'https://docs.example.test/guide', title: 'Guide' }),
    ).resolves.toMatchObject({ operationId: 'op-url', data: { id: 'doc-1' } });
    expect(urlFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1/documents/url');
    expect(JSON.parse(String((urlFetch.mock.calls[0]![1] as RequestInit).body))).toEqual({
      url: 'https://docs.example.test/guide',
      title: 'Guide',
    });
    vi.unstubAllGlobals();

    const manualFetch = stubFetch(202, { data: document, operationId: 'op-manual' });
    await expect(
      portal.importManagedKnowledgeManual('kb-1', { title: 'Guide', content: '# Notes' }),
    ).resolves.toMatchObject({
      operationId: 'op-manual',
    });
    expect(manualFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1/documents/manual');
    vi.unstubAllGlobals();

    const detailFetch = stubFetch(200, { data: document });
    await expect(portal.getManagedKnowledgeDocument('doc-1')).resolves.toMatchObject({ id: 'doc-1' });
    expect(detailFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/documents/doc-1');
    vi.unstubAllGlobals();

    const spans = {
      knowledge_id: 'doc-1',
      attempt: 2,
      latest_attempt: 2,
      parse_status: 'completed',
      current_stage: 'completed',
      trace: {
        knowledge_id: 'doc-1',
        attempt: 2,
        span_id: 'span-1',
        name: 'parse',
        kind: 'parser',
        status: 'completed',
      },
    };
    const spansFetch = stubFetch(200, { data: spans });
    await expect(portal.getManagedKnowledgeSpans('doc-1')).resolves.toMatchObject({ current_stage: 'completed' });
    expect(spansFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/documents/doc-1/spans');
    vi.unstubAllGlobals();

    const chunksFetch = stubFetch(200, {
      data: [
        {
          id: 'chunk-1',
          knowledge_id: 'doc-1',
          seq_id: 1,
          content: 'excerpt',
          chunk_type: 'text',
          is_enabled: true,
          content_revision: 4,
          index_status: 'ready',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    await expect(portal.listManagedKnowledgeChunks('doc-1', { page: 1, pageSize: 50 })).resolves.toMatchObject({
      total: 1,
    });
    expect(chunksFetch.mock.calls[0]![0]).toBe(
      '/api/v1/knowledge/managed/documents/doc-1/chunks?page=1&page_size=50&chunk_type=text',
    );
    vi.unstubAllGlobals();

    const enabledFetch = stubFetch(200, {
      data: { ...document, enable_status: 'disabled' },
      operationId: 'op-disable',
    });
    await expect(portal.setManagedKnowledgeDocumentEnabled('doc-1', false)).resolves.toMatchObject({
      operationId: 'op-disable',
      data: { id: 'doc-1', enable_status: 'disabled' },
    });
    expect(enabledFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/documents/doc-1/enable-status');
    expect(enabledFetch.mock.calls[0]![1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ enabled: false }) });
    vi.unstubAllGlobals();

    const imageFetch = vi.fn().mockResolvedValue(
      new Response(new Blob(['png']), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );
    vi.stubGlobal('fetch', imageFetch);
    await expect(portal.getManagedKnowledgeChunkImage('doc-1', 'chunk-1', 0)).resolves.toBeInstanceOf(Blob);
    expect(imageFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/documents/doc-1/chunks/chunk-1/images/0');
    vi.unstubAllGlobals();

    const actionFetch = stubFetch(202, { data: document, operationId: 'op-reparse' });
    await expect(portal.runManagedKnowledgeDocumentAction('doc-1', 'reparse')).resolves.toMatchObject({
      operationId: 'op-reparse',
    });
    expect(actionFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/documents/doc-1/reparse');
    vi.unstubAllGlobals();

    const cancelFetch = stubFetch(202, { data: document, operationId: 'op-cancel' });
    await portal.runManagedKnowledgeDocumentAction('doc-1', 'cancel-parse');
    expect(cancelFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/documents/doc-1/cancel-parse');
    vi.unstubAllGlobals();

    const deleteFetch = stubFetch(200, { deleted: true, operationId: 'op-delete', resourceId: 'doc-1' });
    await expect(portal.runManagedKnowledgeDocumentAction('doc-1', 'delete')).resolves.toEqual({
      operationId: 'op-delete',
      resourceId: 'doc-1',
    });
    expect(deleteFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/documents/doc-1');
    expect((deleteFetch.mock.calls[0]![1] as RequestInit).method).toBe('DELETE');
    vi.unstubAllGlobals();

    const fileFetch = vi.fn().mockResolvedValue(new Response(new Blob(['file']), { status: 200 }));
    vi.stubGlobal('fetch', fileFetch);
    await expect(portal.getManagedKnowledgeFile('doc-1', 'preview')).resolves.toBeInstanceOf(Blob);
    expect(fileFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/documents/doc-1/preview');
    expect(fileFetch.mock.calls[0]![1]).toMatchObject({ headers: { Authorization: 'Bearer aep-token' } });
    vi.unstubAllGlobals();
  });

  test('retrieval and access-grant client uses fixed routes and validates source DTOs', async () => {
    const portal = new PortalClient(async () => 'aep-token');
    const grantSet = {
      knowledge_base_id: 'kb-1',
      tenant_id: 'tenant-1',
      grants: [{ type: 'user', id: 'user-1', granted_by: 'admin-1', created_at: '2026-10-10T00:00:00Z' }],
    };
    const grantFetch = stubFetch(200, grantSet);
    await expect(portal.listManagedKnowledgeGrants('kb-1')).resolves.toEqual(grantSet);
    expect(grantFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1/grants');
    vi.unstubAllGlobals();

    const replaceFetch = stubFetch(200, { ...grantSet, grants: [{ type: 'team', id: 'team-1' }] });
    await expect(portal.replaceManagedKnowledgeGrants('kb-1', [{ type: 'team', id: 'team-1' }])).resolves.toMatchObject(
      {
        grants: [{ type: 'team', id: 'team-1' }],
      },
    );
    expect(replaceFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1/grants');
    expect(replaceFetch.mock.calls[0]![1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ grants: [{ type: 'team', id: 'team-1' }] }),
    });
    vi.unstubAllGlobals();

    const searchFetch = stubFetch(200, {
      query: 'refund policy',
      mode: 'hybrid',
      results: [
        {
          score: 0.91,
          content: 'Refunds are available within 30 days.',
          source: { knowledge_base_id: 'kb-1', document_id: 'doc-1', chunk_id: 'chunk-1', title: 'Refund policy' },
        },
      ],
    });
    await expect(
      portal.searchEmployeeKnowledge('sales-helper', {
        query: 'refund policy',
        knowledge_base_ids: ['kb-1'],
        mode: 'hybrid',
        limit: 10,
      }),
    ).resolves.toMatchObject({ results: [{ source: { document_id: 'doc-1', chunk_id: 'chunk-1' } }] });
    expect(searchFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/employees/sales-helper/search');
    expect(searchFetch.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ query: 'refund policy', knowledge_base_ids: ['kb-1'], mode: 'hybrid', limit: 10 }),
    });
    vi.unstubAllGlobals();

    const sourceFetch = stubFetch(200, {
      document: {
        id: 'doc-1',
        title: 'Refund policy',
        file_name: 'refund.pdf',
        file_type: 'pdf',
        source: 'upload',
        knowledge_base_id: 'kb-1',
      },
      chunks: [{ id: 'chunk-1', seq_id: 2, chunk_type: 'text', content: 'Refunds are available within 30 days.' }],
      total: 21,
      page: 2,
      page_size: 20,
    });
    await expect(portal.getEmployeeKnowledgeSource('sales-helper', 'doc-1', 2, 20)).resolves.toMatchObject({
      document: { knowledge_base_id: 'kb-1' },
      chunks: [{ id: 'chunk-1' }],
      page: 2,
      total: 21,
    });
    expect(sourceFetch.mock.calls[0]![0]).toBe(
      '/api/v1/knowledge/employees/sales-helper/documents/doc-1?page=2&page_size=20',
    );
    vi.unstubAllGlobals();

    stubFetch(200, { ...grantSet, knowledge_base_id: 'other-kb' });
    await expect(portal.listManagedKnowledgeGrants('kb-1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    vi.unstubAllGlobals();
    stubFetch(403, { error: 'knowledge access denied' });
    await expect(
      portal.searchEmployeeKnowledge('sales-helper', {
        query: 'x',
        knowledge_base_ids: ['kb-1'],
        mode: 'hybrid',
        limit: 10,
      }),
    ).rejects.toMatchObject({ status: 403 });
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

  test('parses modelFailover on roster rows and normalizes null/absent', async () => {
    stubFetch(200, {
      employees: [
        {
          name: 'failover-helper',
          phase: 'Ready',
          modelFailover: { original: 'bench-qwen38-fast', active: 'bench-qwen', switchedAt: '2026-10-08T12:30:00Z' },
        },
        { name: 'calm-helper', phase: 'Ready', modelFailover: null },
        { name: 'legacy-helper', phase: 'Ready' },
        { name: 'broken-helper', phase: 'Ready', modelFailover: { original: 'only-original' } },
      ],
    });
    const employees = await client().listEmployees();
    expect(employees[0]!.modelFailover).toEqual({
      original: 'bench-qwen38-fast',
      active: 'bench-qwen',
      switchedAt: '2026-10-08T12:30:00Z',
    });
    expect(employees[1]!.modelFailover).toBeNull();
    expect(employees[2]!.modelFailover).toBeNull();
    expect(employees[3]!.modelFailover).toBeNull();
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
