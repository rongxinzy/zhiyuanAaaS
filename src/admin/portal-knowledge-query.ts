export type KnowledgeAuditRecord = {
  readonly cursor: string;
  readonly operationId: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly parentResourceId: string;
  readonly outcome: string;
  readonly statusCode: number;
  readonly createdAt: string;
};
export type ManagedKnowledgeDocumentQuery = {
  readonly page: number;
  readonly pageSize: number;
  readonly keyword?: string;
  readonly parseStatus?: string;
  readonly folderPath?: string;
  readonly folderRecursive?: boolean;
};
export type KnowledgeAuditFilters = {
  readonly operationId?: string;
  readonly actorUserId?: string;
  readonly cursor?: string;
  readonly knowledgeBaseId?: string;
};
export function managedKnowledgeDocumentQuery(query: ManagedKnowledgeDocumentQuery): URLSearchParams {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) });
  if (query.keyword) params.set('keyword', query.keyword);
  // 上游按 parse_status / folder_path(+recursive) 过滤，并返回过滤后的真实 total；
  // portal 已白名单转发这几个参数，这里只是把它们透出去。
  if (query.parseStatus) params.set('parse_status', query.parseStatus);
  if (query.folderPath !== undefined) {
    params.set('folder_path', query.folderPath);
    if (query.folderRecursive) params.set('folder_recursive', 'true');
  }
  return params;
}
