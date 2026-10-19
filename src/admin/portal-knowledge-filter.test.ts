import { afterEach, expect, test, vi } from 'vitest';
import { PortalClient, PortalError } from './portal.js';

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());
test('preserves status, root folder and recursive folder filters', async () => {
  const portal = new PortalClient(async () => 'aep-token');
  // 状态与文件夹过滤要如实透给 portal（上游按这些参数返回过滤后的真实 total）；
  // folder_path 传空串表示知识库根目录，是有意义的过滤值，不能被忽略。
  const filteredFetch = stubFetch(200, { data: [], total: 0, page: 1, pageSize: 10 });
  await portal.listManagedKnowledgeDocuments('kb/a', {
    page: 2,
    pageSize: 10,
    parseStatus: 'failed',
    folderPath: '',
  });
  expect(filteredFetch.mock.calls[0]![0]).toBe(
    '/api/v1/knowledge/managed/bases/kb%2Fa/documents?page=2&page_size=10&parse_status=failed&folder_path=',
  );
  const folderFetch = stubFetch(200, { data: [], total: 0, page: 1, pageSize: 10 });
  await portal.listManagedKnowledgeDocuments('kb/a', {
    page: 1,
    pageSize: 10,
    folderPath: 'manuals/2026',
    folderRecursive: true,
  });
  expect(folderFetch.mock.calls[0]![0]).toBe(
    '/api/v1/knowledge/managed/bases/kb%2Fa/documents?page=1&page_size=10&folder_path=manuals%2F2026&folder_recursive=true',
  );
  vi.unstubAllGlobals();
});

test('rejects unsafe chunk image MIME, invalid image indexes and unauthorized binary reads', async () => {
  const portal = new PortalClient(async () => null);
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(portal.getManagedKnowledgeChunkImage('doc', 'chunk', -1)).rejects.toBeInstanceOf(PortalError);
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(new Response('<script>bad</script>', { headers: { 'Content-Type': 'text/html' } }));
  await expect(portal.getManagedKnowledgeChunkImage('doc', 'chunk', 0)).rejects.toBeInstanceOf(PortalError);
  fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }));
  await expect(portal.getManagedKnowledgeChunkImage('doc', 'chunk', 0)).rejects.toMatchObject({ status: 403 });
  fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }));
  await expect(portal.getManagedKnowledgeFile('doc', 'download')).rejects.toMatchObject({ status: 403 });
  vi.unstubAllGlobals();
});
