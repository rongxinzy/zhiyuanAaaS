export type EmployeeKnowledgeSearchHit = {
  readonly score: number;
  readonly content: string;
  readonly source: {
    readonly knowledge_base_id: string;
    readonly document_id: string;
    readonly chunk_id: string;
    readonly title: string;
  };
};

export type EmployeeKnowledgeSearchResponse = {
  readonly query: string;
  readonly mode: 'hybrid';
  readonly results: readonly EmployeeKnowledgeSearchHit[];
};

export type EmployeeKnowledgeSource = {
  readonly document: {
    readonly id: string;
    readonly title: string;
    readonly file_name: string;
    readonly file_type: string;
    readonly source: string;
    readonly knowledge_base_id: string;
  };
  readonly chunks: readonly {
    readonly id: string;
    readonly seq_id: number;
    readonly chunk_type: string;
    readonly content: string;
  }[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
};

type RetrievalRequest = (
  method: string,
  path: string,
  body?: unknown,
  headers?: Readonly<Record<string, string>>,
  signal?: AbortSignal,
) => Promise<{ readonly status: number; readonly data: unknown }>;

// Keep management inspection separate from employee authorization while sharing DTO validation.
export class KnowledgeRetrievalClient {
  constructor(
    private readonly request: RetrievalRequest,
    private readonly error: (status: number, data: unknown) => Error,
    private readonly invalid: () => Error,
  ) {}

  async searchManagedKnowledge(
    baseId: string,
    input: { readonly query: string; readonly mode: 'hybrid'; readonly limit: number },
    signal?: AbortSignal,
  ): Promise<EmployeeKnowledgeSearchResponse> {
    const { status, data } = await this.request(
      'POST',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(baseId)}/search`,
      input,
      undefined,
      signal,
    );
    if (status !== 200) throw this.error(status, data);
    const response = parseEmployeeKnowledgeSearch(data, this.invalid);
    if (response.results.some((hit) => hit.source.knowledge_base_id !== baseId)) throw this.invalid();
    return response;
  }

  async getManagedKnowledgeSource(
    baseId: string,
    documentId: string,
    page: number,
    pageSize: number,
    signal?: AbortSignal,
  ): Promise<EmployeeKnowledgeSource> {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    const { status, data } = await this.request(
      'GET',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(baseId)}/documents/${encodeURIComponent(documentId)}/source?${query}`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw this.error(status, data);
    const response = parseEmployeeKnowledgeSource(data, documentId, this.invalid);
    if (response.document.knowledge_base_id !== baseId || response.page !== page || response.page_size !== pageSize)
      throw this.invalid();
    return response;
  }

  async searchEmployeeKnowledge(
    employee: string,
    input: {
      readonly query: string;
      readonly knowledge_base_ids: readonly string[];
      readonly mode: 'hybrid';
      readonly limit: number;
    },
    signal?: AbortSignal,
  ): Promise<EmployeeKnowledgeSearchResponse> {
    const { status, data } = await this.request(
      'POST',
      `/api/v1/knowledge/employees/${encodeURIComponent(employee)}/search`,
      input,
      undefined,
      signal,
    );
    if (status !== 200) throw this.error(status, data);
    return parseEmployeeKnowledgeSearch(data, this.invalid);
  }

  async getEmployeeKnowledgeSource(
    employee: string,
    documentId: string,
    page: number,
    pageSize: number,
    signal?: AbortSignal,
  ): Promise<EmployeeKnowledgeSource> {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    const { status, data } = await this.request(
      'GET',
      `/api/v1/knowledge/employees/${encodeURIComponent(employee)}/documents/${encodeURIComponent(documentId)}?${query}`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw this.error(status, data);
    return parseEmployeeKnowledgeSource(data, documentId, this.invalid);
  }
}

function parseEmployeeKnowledgeSearch(value: unknown, invalid: () => Error): EmployeeKnowledgeSearchResponse {
  const record = objectOf(value);
  if (!record || typeof record.query !== 'string' || record.mode !== 'hybrid' || !Array.isArray(record.results))
    throw invalid();
  const results = record.results.map((value) => {
    const hit = objectOf(value);
    const source = objectOf(hit?.source);
    if (
      !hit ||
      !isFiniteNumber(hit.score) ||
      typeof hit.content !== 'string' ||
      !source ||
      !nonEmptyString(source.knowledge_base_id) ||
      !nonEmptyString(source.document_id) ||
      !nonEmptyString(source.chunk_id) ||
      typeof source.title !== 'string'
    )
      throw invalid();
    return {
      score: hit.score,
      content: hit.content,
      source: {
        knowledge_base_id: source.knowledge_base_id,
        document_id: source.document_id,
        chunk_id: source.chunk_id,
        title: source.title,
      },
    };
  });
  return { query: record.query, mode: 'hybrid', results };
}

function parseEmployeeKnowledgeSource(
  value: unknown,
  expectedDocumentId: string,
  invalid: () => Error,
): EmployeeKnowledgeSource {
  const record = objectOf(value);
  const document = objectOf(record?.document);
  if (
    !document ||
    document.id !== expectedDocumentId ||
    !nonEmptyString(document.knowledge_base_id) ||
    typeof document.title !== 'string' ||
    typeof document.file_name !== 'string' ||
    typeof document.file_type !== 'string' ||
    typeof document.source !== 'string' ||
    !Array.isArray(record?.chunks) ||
    !isFiniteNumber(record.total) ||
    !Number.isInteger(record.total) ||
    record.total < 0 ||
    !isFiniteNumber(record.page) ||
    !Number.isInteger(record.page) ||
    record.page < 1 ||
    !isFiniteNumber(record.page_size) ||
    !Number.isInteger(record.page_size) ||
    record.page_size < 1
  )
    throw invalid();
  const chunks = record.chunks.map((value) => {
    const chunk = objectOf(value);
    if (
      !chunk ||
      !nonEmptyString(chunk.id) ||
      !isFiniteNumber(chunk.seq_id) ||
      typeof chunk.chunk_type !== 'string' ||
      typeof chunk.content !== 'string'
    )
      throw invalid();
    return { id: chunk.id, seq_id: chunk.seq_id, chunk_type: chunk.chunk_type, content: chunk.content };
  });
  return {
    document: {
      id: expectedDocumentId,
      title: document.title,
      file_name: document.file_name,
      file_type: document.file_type,
      source: document.source,
      knowledge_base_id: document.knowledge_base_id,
    },
    chunks,
    total: record.total,
    page: record.page,
    page_size: record.page_size,
  };
}

function objectOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
