import { describe, expect, test, vi } from 'vitest';
import { PortalClient } from './portal.js';

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('administrator knowledge retrieval client', () => {
  test('administrator library search and source stay scoped to the requested base', async () => {
    const portal = new PortalClient(async () => 'aep-token');
    const input = { query: 'refund', mode: 'hybrid' as const, limit: 10 };
    const search = {
      query: 'refund',
      mode: 'hybrid',
      results: [
        {
          score: 0.9,
          content: 'A passage',
          source: { knowledge_base_id: 'kb-1', document_id: 'doc-1', chunk_id: 'chunk-1', title: 'Policy' },
        },
      ],
    };
    const controller = new AbortController();
    const searchFetch = stubFetch(200, search);
    await expect(portal.searchManagedKnowledge('kb-1', input, controller.signal)).resolves.toEqual(search);
    expect(searchFetch.mock.calls[0]![0]).toBe('/api/v1/knowledge/managed/bases/kb-1/search');
    expect(searchFetch.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(input),
      headers: { Authorization: 'Bearer aep-token' },
      signal: expect.any(AbortSignal),
    });
    vi.unstubAllGlobals();
    stubFetch(200, {
      ...search,
      results: [{ ...search.results[0], source: { ...search.results[0]!.source, knowledge_base_id: 'kb-other' } }],
    });
    await expect(portal.searchManagedKnowledge('kb-1', input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    vi.unstubAllGlobals();
    const source = {
      document: {
        id: 'doc-1',
        title: 'Policy',
        file_name: 'policy.pdf',
        file_type: 'pdf',
        source: 'upload',
        knowledge_base_id: 'kb-1',
      },
      chunks: [{ id: 'chunk-1', seq_id: 1, chunk_type: 'text', content: 'A passage' }],
      total: 40,
      page: 2,
      page_size: 20,
    };
    const sourceFetch = stubFetch(200, source);
    await expect(portal.getManagedKnowledgeSource('kb-1', 'doc-1', 2, 20, controller.signal)).resolves.toEqual(source);
    expect(sourceFetch.mock.calls[0]![0]).toBe(
      '/api/v1/knowledge/managed/bases/kb-1/documents/doc-1/source?page=2&page_size=20',
    );
    expect(sourceFetch.mock.calls[0]![1]).toMatchObject({ method: 'GET', signal: expect.any(AbortSignal) });
    vi.unstubAllGlobals();
    for (const invalid of [
      { ...source, document: { ...source.document, knowledge_base_id: 'kb-other' } },
      { ...source, document: { ...source.document, id: 'doc-other' } },
      { ...source, page: 1 },
      { ...source, page_size: 50 },
    ]) {
      stubFetch(200, invalid);
      await expect(portal.getManagedKnowledgeSource('kb-1', 'doc-1', 2, 20)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
      vi.unstubAllGlobals();
    }
    stubFetch(403, { error: { code: 'ADMIN_REQUIRED', message: '需要管理员权限' } });
    await expect(portal.searchManagedKnowledge('kb-1', input)).rejects.toMatchObject({
      status: 403,
      code: 'ADMIN_REQUIRED',
    });
    vi.unstubAllGlobals();
  });
});
