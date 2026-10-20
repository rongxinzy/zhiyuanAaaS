import { writeJson } from './admin-fixture-http.mjs';

export function handleKnowledgeRetrievalFixture(method, pathname, query, input, response) {
  const respond = (data) => {
    writeJson(response, 200, data);
    return true;
  };
  const managedSearchMatch = pathname.match(/^\/api\/v1\/knowledge\/managed\/bases\/([^/]+)\/search$/);
  if (method === 'POST' && (managedSearchMatch || pathname.match(/^\/api\/v1\/knowledge\/employees\/[^/]+\/search$/)))
    return respond({
      query: input.query,
      mode: input.mode,
      results: [
        {
          score: 0.92,
          content: '退款可在 30 天内申请。',
          source: {
            knowledge_base_id: managedSearchMatch
              ? decodeURIComponent(managedSearchMatch[1])
              : (input.knowledge_base_ids?.[0] ?? 'kb-1'),
            document_id: 'doc-e2e-policy',
            chunk_id: 'chunk-e2e-policy',
            title: '退款政策',
          },
        },
      ],
    });
  const managedSourceMatch = pathname.match(
    /^\/api\/v1\/knowledge\/managed\/bases\/([^/]+)\/documents\/([^/]+)\/source$/,
  );
  const knowledgeSourceMatch = managedSourceMatch
    ? [managedSourceMatch[0], managedSourceMatch[2]]
    : pathname.match(/^\/api\/v1\/knowledge\/employees\/[^/]+\/documents\/([^/]+)$/);
  if (method === 'GET' && knowledgeSourceMatch)
    return respond({
      document: {
        id: decodeURIComponent(knowledgeSourceMatch[1]),
        title: '退款政策',
        file_name: 'refund-policy.pdf',
        file_type: 'pdf',
        source: 'upload',
        knowledge_base_id: managedSourceMatch ? decodeURIComponent(managedSourceMatch[1]) : 'kb-1',
      },
      chunks: [{ id: 'chunk-e2e-policy', seq_id: 1, chunk_type: 'text', content: '退款可在 30 天内申请。' }],
      total: 1,
      page: Number(query.get('page') ?? 1),
      page_size: Number(query.get('page_size') ?? 20),
    });
  return false;
}
