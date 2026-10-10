// Digital-employee portal (de-portal) client. The console reaches it
// same-origin through the admin server's /api proxy — the same pattern as
// the /aep proxy — so all paths are relative and no CORS is involved.
// Bearer-only: portal sessions and CSRF belong to the browser chat entry,
// not to these calls. Errors are plain {error: string} JSON, not RFC 9457.

export type PortalEmployee = {
  readonly name: string;
  readonly displayName: string;
  readonly phase: string;
  readonly runtime: string;
  readonly model: string;
  /** Full ordered model list (first = default); feeds the edit form. */
  readonly models: readonly string[];
  readonly owner: string;
  readonly ownerId: string;
  /** Owning department (AEP team id), empty for legacy unscoped employees. */
  readonly team?: string;
  readonly memoryUser: string;
  readonly createdAt: string;
  readonly channels?: { readonly wecom: boolean; readonly wecomName?: string };
  /** 用途说明 (release condition, new employees only). */
  readonly description?: string | null;
  /** null/undefined = legacy unrestricted policy (not configured). */
  readonly knowledgeBases?: readonly { readonly id: string; readonly name: string }[] | null;
  readonly skills?: readonly { readonly id: string; readonly name: string; readonly version: string }[] | null;
  /** null/undefined = legacy owner/team rules (not explicitly configured). */
  readonly visibility?: PortalEmployeeVisibility | null;
  /** Workbench roster: why the caller can see this employee. */
  readonly accessReason?: PortalEmployeeAccess | undefined;
  /**
   * Set while the platform failover watcher is serving this employee from a
   * fallback model (the default model failed its health probe). null/absent
   * = the default model is serving.
   */
  readonly modelFailover?: { readonly original: string; readonly active: string; readonly switchedAt: string } | null;
};

// accessReason.kind mirrors the portal's canAccessEmployee branch order:
// owner | all | team | user | legacy-team | admin. team carries the
// granting team (spec name snapshot when present); legacy-team ids resolve
// client-side against the caller's /api/v1/me teams.
export type PortalEmployeeAccess = {
  readonly kind: string;
  readonly teamId?: string;
  readonly teamName?: string;
  readonly userId?: string;
};

export type PortalEmployeeVisibility = {
  readonly mode: 'all' | 'restricted' | string;
  readonly teams: readonly { readonly id: string; readonly name: string }[];
  readonly users: readonly { readonly id: string; readonly name: string }[];
};

export type PortalMemoryStatus = {
  readonly server: string;
  readonly account: string;
  readonly healthy: boolean;
  readonly accounts: readonly {
    readonly accountID: string;
    readonly createdAt: string;
    readonly userCount: number;
  }[];
  readonly employees: readonly {
    readonly name: string;
    readonly memoryUser: string;
    readonly sessions?: number;
    readonly lastActive?: string;
  }[];
};

export type PortalMemorySearchResult = {
  readonly memories: readonly {
    readonly uri: string;
    readonly score: number;
    readonly abstract: string;
  }[];
};

export type PortalKnowledgeStatus = {
  /** Legacy field; the portal no longer reports the cluster-internal URL. */
  readonly url?: string | undefined;
  /** Browser-facing WeKnora management URL (console proxy port), from the portal. */
  readonly uiURL?: string | null | undefined;
  readonly configured: boolean;
  readonly healthy: boolean;
  readonly knowledgeBases: readonly {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly documentCount?: number;
    readonly createdAt?: string;
  }[];
};

export type PortalRequest = {
  readonly id: string;
  readonly employeeName: string;
  readonly owner: string;
  readonly displayName: string;
  readonly state: string;
  readonly reason: string;
  readonly createdAt: string;
  /** Deployment leg (workbench list rows; absent on the admin queue). */
  readonly deploy?: PortalRequestDeploy;
};

// The deployment leg of a request, kept separate from the approval state:
// exists/phase come from the employee CR; pending and rejected requests
// carry exists=false without probing the cluster.
export type PortalRequestDeploy = {
  readonly exists: boolean;
  readonly phase: string;
  readonly message?: string;
  readonly createdAt?: string | null;
};

// One request with the decoded spec snapshot, for the workbench detail page
// (审批状态 and 部署状态 display separately, per the wireframes).
export type PortalRequestDetail = {
  readonly id: string;
  readonly employeeName: string;
  readonly displayName: string;
  readonly ownerId: string;
  readonly owner: string;
  readonly state: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  readonly decidedBy: string;
  readonly decidedByName: string;
  readonly description: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly note: string;
  readonly model: string;
  readonly deploy: PortalRequestDeploy;
};

// The workbench caller's own profile (/api/v1/me): identity, team names,
// and quota. quota.used = owned + pending (same formula as the apply gate).
export type PortalMe = {
  readonly user: { readonly id: string; readonly displayName: string; readonly kind: string };
  readonly teams: readonly PortalDepartment[];
  readonly quota: {
    readonly limit: number;
    readonly used: number;
    readonly owned: number;
    readonly pending: number;
  };
  readonly policyMode: string;
  readonly defaultModel: string;
};

export class PortalError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly operationId?: string,
    readonly resourceId?: string,
  ) {
    super(message);
    this.name = 'PortalError';
  }
}

export type ManagedKnowledgeReadiness = {
  readonly deploymentId: string;
  readonly tenantId: string;
  readonly tenant: 'verified';
  readonly embeddingModel: {
    readonly state: 'not_configured' | 'unavailable' | 'configured';
    readonly id: string;
    readonly availability: 'unverified';
  };
  readonly storage: 'unverified';
  readonly parser: 'unverified';
};

export type ManagedKnowledgeBase = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tenant_id: string;
  readonly embedding_model_id: string;
  readonly type: string;
};

export type ManagedKnowledgeDocument = {
  readonly id: string;
  readonly knowledge_base_id: string;
  readonly tenant_id?: string;
  readonly type?: string;
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly source?: string;
  readonly file_name: string;
  readonly file_type?: string;
  readonly file_size?: number;
  readonly parse_status: string;
  readonly enable_status?: string;
  readonly manual_disabled?: boolean;
  readonly summary_status?: string;
  readonly created_at: string;
};

export type ManagedKnowledgeSpan = {
  readonly knowledge_id: string;
  readonly attempt: number;
  readonly span_id: string;
  readonly parent_span_id?: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
  readonly error_code?: string;
  readonly started_at?: string;
  readonly finished_at?: string;
  readonly duration_ms?: number;
  readonly children?: readonly ManagedKnowledgeSpan[];
};

export type ManagedKnowledgeSpans = {
  readonly knowledge_id: string;
  readonly attempt: number;
  readonly latest_attempt: number;
  readonly parse_status: string;
  readonly current_stage: string;
  readonly trace: ManagedKnowledgeSpan;
};

export type ManagedKnowledgeChunk = {
  readonly id: string;
  readonly knowledge_id: string;
  readonly seq_id: number;
  readonly content: string;
  readonly chunk_type: string;
  readonly is_enabled: boolean;
  readonly content_revision: number;
  readonly index_status: 'ready' | 'processing' | 'failed';
  readonly images?: readonly { readonly index: number; readonly url: string }[];
};

export type ManagedKnowledgeChunkUpdate = Omit<ManagedKnowledgeChunk, 'images'>;

export type ManagedKnowledgeTag = {
  readonly id: string;
  readonly seq_id: number;
  readonly name: string;
  readonly color: string;
  readonly sort_order: number;
  readonly knowledge_count?: number;
  readonly chunk_count?: number;
};

export type ManagedKnowledgeFolder = {
  readonly path: string;
  readonly name: string;
  readonly document_count: number;
  readonly total_count: number;
  readonly children?: readonly ManagedKnowledgeFolder[];
};

export type ManagedKnowledgeFolderTree = {
  readonly root_document_count: number;
  readonly total_document_count: number;
  readonly folders: readonly ManagedKnowledgeFolder[];
};

export type ManagedKnowledgeFAQEntry = {
  readonly id: number;
  readonly knowledge_id: string;
  readonly knowledge_base_id: string;
  readonly tag_id: number;
  readonly tag_name: string;
  readonly is_enabled: boolean;
  readonly is_recommended: boolean;
  readonly standard_question: string;
  readonly similar_questions: readonly string[];
  readonly negative_questions: readonly string[];
  readonly answers: readonly string[];
  readonly answer_strategy: string;
  readonly updated_at: string;
  readonly created_at: string;
};

export type ManagedKnowledgeFAQPage = {
  readonly data: readonly ManagedKnowledgeFAQEntry[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
};

export type ManagedKnowledgeOperation = {
  readonly data: { readonly outcome: 'succeeded'; readonly affectedCount?: number; readonly folderPath?: string };
  readonly operationId: string;
};

export type ManagedKnowledgePage = {
  readonly data: readonly ManagedKnowledgeDocument[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
};

export type ManagedKnowledgeMutation<T> = {
  readonly data: T;
  readonly operationId: string;
};

export type ManagedKnowledgeGrant = {
  readonly type: 'user' | 'team';
  readonly id: string;
  readonly granted_by?: string;
  readonly created_at?: string;
};

export type ManagedKnowledgeGrantSet = {
  readonly knowledge_base_id: string;
  readonly tenant_id: string;
  readonly grants: readonly ManagedKnowledgeGrant[];
};

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

// Mirrors the portal's own apply-time validation (portal/api.go namePattern):
// keep both in step or the server rejects with a 400 the UI could have caught.
export const EMPLOYEE_NAME_PATTERN = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

// The workbench treats a 401 as "sign in again" (expired session), distinct
// from transport or permission failures.
export function isSessionExpired(error: unknown): boolean {
  return error instanceof PortalError && error.status === 401;
}

// Apply outcomes the UI distinguishes: direct create (201), parked for
// approval (202, message carries the policy reason), or rejected (400
// release-condition violations / 409 duplicate / 403 quota-policy /
// anything else). Violations are field-anchored so the wizard can point
// at the exact item.
export type PortalApplyViolation = {
  readonly field: string;
  readonly message: string;
};

export type PortalApplyResult =
  | { readonly kind: 'created'; readonly message: string }
  | { readonly kind: 'pending'; readonly message: string; readonly requestId?: string }
  | {
      readonly kind: 'rejected';
      readonly status: number;
      readonly message: string;
      readonly violations?: readonly PortalApplyViolation[];
    };

export type PortalApplyInput = {
  readonly name: string;
  readonly displayName: string;
  /** 用途说明 — required release condition (≤500 chars). */
  readonly description: string;
  /** Owning department (AEP team id) — required for new employees. */
  readonly team: string;
  /** AEP model ids, first = default; empty = platform default. */
  readonly models?: readonly string[];
  /** Designated owner (AEP user id); empty = the caller (admin-only override). */
  readonly owner?: string;
  /** WeKnora kb ids; omitted = legacy unrestricted, [] = deny-all. */
  readonly knowledgeBases?: readonly string[];
  /** AEP skills pinned to published versions. */
  readonly skills?: readonly { readonly id: string; readonly version: string }[];
  /** Explicit open scope; the console always sends it. */
  readonly visibility?: PortalApplyVisibility;
  /** 补充说明 — optional applicant context (≤500 chars), stored on the CR. */
  readonly note?: string;
};

export type PortalApplyVisibility = {
  readonly mode: 'all' | 'restricted';
  readonly teams?: readonly string[];
  readonly users?: readonly string[];
};

// Partial configuration update (PATCH): only carried fields are replaced
// server-side; omitted keys keep the employee's current configuration.
// knowledgeBases mirrors the apply semantics — omitted = unchanged,
// [] = explicit deny-all — so callers must diff against the current state
// and omit untouched fields (never send a "full" payload for an employee
// whose legacy policy is nil).
export type PortalEmployeeUpdateInput = {
  readonly displayName?: string;
  readonly description?: string;
  readonly team?: string;
  readonly owner?: string;
  readonly models?: readonly string[];
  readonly knowledgeBases?: readonly string[];
  readonly skills?: readonly { readonly id: string; readonly version: string }[];
  readonly visibility?: PortalApplyVisibility;
};

export type PortalUpdateResult =
  | { readonly kind: 'updated' }
  | {
      readonly kind: 'rejected';
      readonly status: number;
      readonly message: string;
      readonly violations?: readonly PortalApplyViolation[];
    };

export type PortalDepartment = {
  readonly id: string;
  readonly name: string;
};

export type PortalDepartmentCreateResult = {
  readonly kind: 'created' | 'rejected';
  readonly status?: number;
  readonly message: string;
};

export type PortalDepartmentMember = {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
};

export type PortalUsageStats = {
  readonly totals: {
    readonly conversations: number;
    readonly runs: number;
    readonly todayConversations: number;
    readonly todayRuns: number;
    readonly employees: number;
    readonly readyEmployees: number;
  };
  readonly byDepartment: Record<string, { employees: number; ready: number }>;
  readonly threadsByDepartment7d: Record<string, number>;
  readonly modelCalls7d: Record<string, number>;
};

export class PortalClient {
  readonly #tokenProvider: () => Promise<string | null>;

  constructor(tokenProvider: () => Promise<string | null>) {
    this.#tokenProvider = tokenProvider;
  }

  async #request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<{ readonly status: number; readonly data: unknown }> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const token = await this.#tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, {
      method,
      headers,
      ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
    const data: unknown = await response.json().catch(() => null);
    return { status: response.status, data };
  }

  // Silent chat handoff: mint the portal session and select the employee
  // server-side (cookies land on the shared host through the /api proxy),
  // so the browser can open the chat UI directly — no portal entry page
  // flashing between the console and the conversation. Returns false when
  // any step fails; callers fall back to the portal /chat handoff link.
  async mintChatSession(employee: string): Promise<boolean> {
    const token = await this.#tokenProvider();
    if (!token) return false;
    const session = await this.#request('POST', '/api/v1/session', { token });
    if (session.status !== 200) return false;
    const csrf = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)?.[1];
    if (!csrf) return false;
    const selected = await this.#request(
      'POST',
      '/api/v1/session/employee',
      { name: employee },
      { 'X-CSRF-Token': decodeURIComponent(csrf) },
    );
    return selected.status === 200;
  }

  async listEmployees(signal?: AbortSignal): Promise<readonly PortalEmployee[]> {
    const { status, data } = await this.#request('GET', '/api/v1/employees', undefined, undefined, signal);
    if (status !== 200) throw portalError(status, data);
    const items = (data as { employees?: unknown[] } | null)?.employees ?? [];
    return items.map((raw) => parseEmployee(raw));
  }

  // Sidebar service-status probes (the portal holds the OpenViking root key
  // server-side; the console only ever sees summaries).
  async memoryStatus(): Promise<PortalMemoryStatus> {
    const { status, data } = await this.#request('GET', '/api/v1/memory/status');
    if (status !== 200) throw portalError(status, data);
    return data as PortalMemoryStatus;
  }

  async memorySearch(employee: string, query: string): Promise<PortalMemorySearchResult> {
    const { status, data } = await this.#request('POST', '/api/v1/memory/search', {
      body: { employee, query },
    });
    if (status !== 200) throw portalError(status, data);
    return data as PortalMemorySearchResult;
  }

  async knowledgeStatus(): Promise<PortalKnowledgeStatus> {
    const { status, data } = await this.#request('GET', '/api/v1/knowledge/status');
    if (status !== 200) throw portalError(status, data);
    return data as PortalKnowledgeStatus;
  }

  async managedKnowledgeReadiness(signal?: AbortSignal): Promise<ManagedKnowledgeReadiness> {
    const { status, data } = await this.#request(
      'GET',
      '/api/v1/knowledge/managed/readiness',
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedReadiness(data);
  }

  async listManagedKnowledgeBases(signal?: AbortSignal): Promise<readonly ManagedKnowledgeBase[]> {
    const { status, data } = await this.#request(
      'GET',
      '/api/v1/knowledge/managed/bases',
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    const items = objectOf(data)?.data;
    if (!Array.isArray(items)) throw invalidManagedResponse();
    return items.map(parseManagedKnowledgeBase);
  }

  async getManagedKnowledgeBase(id: string, signal?: AbortSignal): Promise<ManagedKnowledgeBase> {
    const { status, data } = await this.#request(
      'GET',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedKnowledgeBase(objectOf(data)?.data);
  }

  async createManagedKnowledgeBase(input: {
    readonly name: string;
    readonly description: string;
  }): Promise<ManagedKnowledgeMutation<ManagedKnowledgeBase>> {
    const { status, data } = await this.#request('POST', '/api/v1/knowledge/managed/bases', input);
    if (status !== 201) throw portalError(status, data);
    return parseManagedMutation(data, parseManagedKnowledgeBase);
  }

  async updateManagedKnowledgeBase(
    id: string,
    input: { readonly name?: string; readonly description?: string },
  ): Promise<ManagedKnowledgeMutation<ManagedKnowledgeBase>> {
    const { status, data } = await this.#request(
      'PATCH',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}`,
      input,
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedMutation(data, parseManagedKnowledgeBase);
  }

  async deleteManagedKnowledgeBase(id: string): Promise<{ readonly operationId: string }> {
    const { status, data } = await this.#request('DELETE', `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}`);
    if (status !== 200) throw portalError(status, data);
    const record = objectOf(data);
    if (record?.deleted !== true || !nonEmptyString(record.operationId)) throw invalidManagedResponse();
    return { operationId: record.operationId };
  }

  async listManagedKnowledgeDocuments(
    id: string,
    query: { readonly page: number; readonly pageSize: number; readonly keyword?: string },
    signal?: AbortSignal,
  ): Promise<ManagedKnowledgePage> {
    const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) });
    if (query.keyword) params.set('keyword', query.keyword);
    const { status, data } = await this.#request(
      'GET',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/documents?${params.toString()}`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    const record = objectOf(data);
    if (
      !Array.isArray(record?.data) ||
      !isFiniteNumber(record.total) ||
      !isFiniteNumber(record.page) ||
      !isFiniteNumber(record.pageSize)
    ) {
      throw invalidManagedResponse();
    }
    return {
      data: record.data.map((item) => parseManagedKnowledgeDocument(item, id)),
      total: record.total,
      page: record.page,
      pageSize: record.pageSize,
    };
  }

  async uploadManagedKnowledgeDocument(
    id: string,
    file: File,
  ): Promise<ManagedKnowledgeMutation<ManagedKnowledgeDocument>> {
    const form = new FormData();
    form.append('file', file);
    const { status, data } = await this.#request(
      'POST',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/documents/file`,
      form,
    );
    if (status !== 202) throw portalError(status, data);
    return parseManagedMutation(data, (value) => parseManagedKnowledgeDocument(value, id));
  }

  async importManagedKnowledgeURL(
    id: string,
    input: { readonly url: string; readonly title?: string; readonly fileName?: string; readonly fileType?: string },
  ): Promise<ManagedKnowledgeMutation<ManagedKnowledgeDocument>> {
    const { status, data } = await this.#request(
      'POST',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/documents/url`,
      {
        url: input.url,
        ...(input.title ? { title: input.title } : {}),
        ...(input.fileName ? { file_name: input.fileName } : {}),
        ...(input.fileType ? { file_type: input.fileType } : {}),
      },
    );
    if (status !== 202) throw portalError(status, data);
    return parseManagedMutation(data, (value) => parseManagedKnowledgeDocument(value, id));
  }

  async importManagedKnowledgeManual(
    id: string,
    input: { readonly title: string; readonly content: string },
  ): Promise<ManagedKnowledgeMutation<ManagedKnowledgeDocument>> {
    const { status, data } = await this.#request(
      'POST',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/documents/manual`,
      input,
    );
    if (status !== 202) throw portalError(status, data);
    return parseManagedMutation(data, (value) => parseManagedKnowledgeDocument(value, id));
  }

  async getManagedKnowledgeDocument(id: string, signal?: AbortSignal): Promise<ManagedKnowledgeDocument> {
    const { status, data } = await this.#request(
      'GET',
      `/api/v1/knowledge/managed/documents/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    const record = objectOf(data)?.data;
    const document = objectOf(record);
    if (!document) throw invalidManagedResponse();
    return parseManagedKnowledgeDocument(document, String(document.knowledge_base_id ?? ''));
  }

  async getManagedKnowledgeSpans(id: string, signal?: AbortSignal): Promise<ManagedKnowledgeSpans> {
    const { status, data } = await this.#request(
      'GET',
      `/api/v1/knowledge/managed/documents/${encodeURIComponent(id)}/spans`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    const value = objectOf(data)?.data;
    const record = objectOf(value);
    if (!record || record.knowledge_id !== id || !objectOf(record.trace)) throw invalidManagedResponse();
    return record as unknown as ManagedKnowledgeSpans;
  }

  async listManagedKnowledgeChunks(
    id: string,
    query: { readonly page: number; readonly pageSize: number },
    signal?: AbortSignal,
  ): Promise<{
    readonly data: readonly ManagedKnowledgeChunk[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  }> {
    const params = new URLSearchParams({
      page: String(query.page),
      page_size: String(query.pageSize),
      chunk_type: 'text',
    });
    const { status, data } = await this.#request(
      'GET',
      `/api/v1/knowledge/managed/documents/${encodeURIComponent(id)}/chunks?${params.toString()}`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    const record = objectOf(data);
    if (
      !Array.isArray(record?.data) ||
      !isFiniteNumber(record.total) ||
      !isFiniteNumber(record.page) ||
      !isFiniteNumber(record.pageSize)
    ) {
      throw invalidManagedResponse();
    }
    const chunks = record.data.map((value) => {
      const chunk = objectOf(value);
      if (
        !chunk ||
        chunk.knowledge_id !== id ||
        !nonEmptyString(chunk.id) ||
        typeof chunk.content !== 'string' ||
        !isFiniteNumber(chunk.content_revision) ||
        chunk.content_revision < 1 ||
        !['ready', 'processing', 'failed'].includes(String(chunk.index_status))
      ) {
        throw invalidManagedResponse();
      }
      const images = chunk.images;
      if (images !== undefined && !Array.isArray(images)) throw invalidManagedResponse();
      const parsedImages = (images ?? []).map((item) => {
        const image = objectOf(item);
        if (!image || !Number.isInteger(image.index) || Number(image.index) < 0) throw invalidManagedResponse();
        const expectedURL = `/api/v1/knowledge/managed/documents/${encodeURIComponent(id)}/chunks/${encodeURIComponent(chunk.id as string)}/images/${Number(image.index)}`;
        if (image.url !== expectedURL) throw invalidManagedResponse();
        return { index: Number(image.index), url: expectedURL };
      });
      return { ...chunk, images: parsedImages } as unknown as ManagedKnowledgeChunk;
    });
    return { data: chunks, total: record.total, page: record.page, pageSize: record.pageSize };
  }

  async listManagedKnowledgeTags(
    id: string,
    keyword = '',
    signal?: AbortSignal,
  ): Promise<readonly ManagedKnowledgeTag[]> {
    const params = new URLSearchParams({ page: '1', page_size: '200' });
    if (keyword) params.set('keyword', keyword);
    const { status, data } = await this.#request(
      'GET',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/tags?${params.toString()}`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    const page = objectOf(data);
    if (!page || !Array.isArray(page.data) || !isFiniteNumber(page.total) || page.total > page.data.length)
      throw invalidManagedResponse();
    return page.data.map(parseManagedKnowledgeTag);
  }

  async createManagedKnowledgeTag(
    id: string,
    input: { readonly name: string; readonly color?: string; readonly sort_order?: number },
  ): Promise<ManagedKnowledgeMutation<ManagedKnowledgeTag>> {
    const { status, data } = await this.#request(
      'POST',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/tags`,
      input,
    );
    if (status !== 201 && status !== 200) throw portalError(status, data);
    return parseManagedMutation(data, parseManagedKnowledgeTag);
  }

  async updateManagedKnowledgeTag(
    id: string,
    tagId: string,
    input: { readonly name?: string; readonly color?: string; readonly sort_order?: number },
  ): Promise<ManagedKnowledgeMutation<ManagedKnowledgeTag>> {
    const { status, data } = await this.#request(
      'PUT',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/tags/${encodeURIComponent(tagId)}`,
      input,
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedMutation(data, (value) => {
      const tag = parseManagedKnowledgeTag(value);
      if (tag.id !== tagId) throw invalidManagedResponse();
      return tag;
    });
  }

  async deleteManagedKnowledgeTag(
    id: string,
    tagId: string,
  ): Promise<{ readonly deleted: true; readonly operationId: string }> {
    const { status, data } = await this.#request(
      'DELETE',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/tags/${encodeURIComponent(tagId)}`,
    );
    if (status !== 200) throw portalError(status, data);
    const record = objectOf(data);
    if (record?.deleted !== true || !nonEmptyString(record.operationId)) throw invalidManagedResponse();
    return { deleted: true, operationId: record.operationId };
  }

  async getManagedKnowledgeFolders(id: string, signal?: AbortSignal): Promise<ManagedKnowledgeFolderTree> {
    const { status, data } = await this.#request(
      'GET',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/folders`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    const tree = objectOf(objectOf(data)?.data);
    if (!tree || !Array.isArray(tree.folders)) throw invalidManagedResponse();
    return {
      root_document_count: requireFiniteNumber(tree.root_document_count),
      total_document_count: requireFiniteNumber(tree.total_document_count),
      folders: tree.folders.map(parseManagedKnowledgeFolder),
    };
  }

  async moveManagedKnowledgeDocuments(
    id: string,
    documentIds: readonly string[],
    folderPath: string,
  ): Promise<ManagedKnowledgeOperation> {
    const { status, data } = await this.#request(
      'POST',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/folders/move`,
      { document_ids: [...documentIds], folder_path: folderPath },
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedOperation(data);
  }

  async renameManagedKnowledgeFolder(id: string, from: string, to: string): Promise<ManagedKnowledgeOperation> {
    const { status, data } = await this.#request(
      'PUT',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/folders`,
      { from, to },
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedOperation(data);
  }

  async setManagedKnowledgeDocumentTags(
    id: string,
    updates: Readonly<Record<string, readonly string[]>>,
  ): Promise<ManagedKnowledgeOperation> {
    const { status, data } = await this.#request(
      'PUT',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/document-tags`,
      { updates },
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedOperation(data);
  }

  async listManagedKnowledgeFAQ(
    id: string,
    query: { readonly page: number; readonly pageSize: number; readonly keyword?: string },
    signal?: AbortSignal,
  ): Promise<ManagedKnowledgeFAQPage> {
    const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) });
    if (query.keyword) params.set('keyword', query.keyword);
    const { status, data } = await this.#request(
      'GET',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/faq/entries?${params.toString()}`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    const page = objectOf(data);
    if (
      !page ||
      !Array.isArray(page.data) ||
      !isFiniteNumber(page.total) ||
      !isFiniteNumber(page.page) ||
      !isFiniteNumber(page.page_size)
    )
      throw invalidManagedResponse();
    return {
      data: page.data.map(parseManagedKnowledgeFAQ),
      total: page.total,
      page: page.page,
      page_size: page.page_size,
    };
  }

  async saveManagedKnowledgeFAQ(
    id: string,
    entryId: number | null,
    input: {
      readonly standard_question: string;
      readonly similar_questions: readonly string[];
      readonly negative_questions: readonly string[];
      readonly answers: readonly string[];
      readonly answer_strategy?: string;
      readonly tag_id?: number;
      readonly is_enabled?: boolean;
      readonly is_recommended?: boolean;
    },
  ): Promise<ManagedKnowledgeMutation<ManagedKnowledgeFAQEntry>> {
    const path = `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/faq/entries${entryId === null ? '' : `/${entryId}`}`;
    const { status, data } = await this.#request(entryId === null ? 'POST' : 'PUT', path, input);
    if (status !== 200) throw portalError(status, data);
    return parseManagedMutation(data, (value) => {
      const entry = parseManagedKnowledgeFAQ(value);
      if (entry.knowledge_base_id !== id || (entryId !== null && entry.id !== entryId)) throw invalidManagedResponse();
      return entry;
    });
  }

  async updateManagedKnowledgeFAQFields(
    id: string,
    byId: Readonly<
      Record<number, { readonly is_enabled?: boolean; readonly is_recommended?: boolean; readonly tag_id?: number }>
    >,
  ): Promise<ManagedKnowledgeOperation> {
    const { status, data } = await this.#request(
      'PUT',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/faq/batch/fields`,
      { by_id: byId },
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedOperation(data);
  }

  async updateManagedKnowledgeFAQTags(
    id: string,
    updates: Readonly<Record<number, number | null>>,
  ): Promise<ManagedKnowledgeOperation> {
    const { status, data } = await this.#request(
      'PUT',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/faq/batch/tags`,
      { updates },
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedOperation(data);
  }

  async deleteManagedKnowledgeFAQEntries(id: string, ids: readonly number[]): Promise<ManagedKnowledgeOperation> {
    const { status, data } = await this.#request(
      'DELETE',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(id)}/faq/batch/delete`,
      { ids: [...ids] },
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedOperation(data);
  }

  async updateManagedKnowledgeChunk(
    documentId: string,
    chunkId: string,
    input: { readonly content?: string; readonly is_enabled?: boolean; readonly expected_revision?: number },
  ): Promise<ManagedKnowledgeMutation<ManagedKnowledgeChunkUpdate>> {
    const { status, data } = await this.#request(
      'PUT',
      `/api/v1/knowledge/managed/documents/${encodeURIComponent(documentId)}/chunks/${encodeURIComponent(chunkId)}`,
      input,
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedMutation(data, (value) => {
      const chunk = objectOf(value);
      if (
        !chunk ||
        chunk.id !== chunkId ||
        chunk.knowledge_id !== documentId ||
        !isFiniteNumber(chunk.seq_id) ||
        typeof chunk.content !== 'string' ||
        typeof chunk.chunk_type !== 'string' ||
        typeof chunk.is_enabled !== 'boolean' ||
        !isFiniteNumber(chunk.content_revision) ||
        !['ready', 'processing', 'failed'].includes(String(chunk.index_status))
      )
        throw invalidManagedResponse();
      return {
        id: chunk.id,
        knowledge_id: chunk.knowledge_id,
        seq_id: chunk.seq_id,
        content: chunk.content,
        chunk_type: chunk.chunk_type,
        is_enabled: chunk.is_enabled,
        content_revision: chunk.content_revision,
        index_status: chunk.index_status as ManagedKnowledgeChunk['index_status'],
      };
    });
  }

  async runManagedKnowledgeDocumentAction(
    id: string,
    action: 'reparse' | 'cancel-parse' | 'delete',
  ): Promise<
    ManagedKnowledgeMutation<ManagedKnowledgeDocument> | { readonly operationId: string; readonly resourceId: string }
  > {
    const method = action === 'delete' ? 'DELETE' : 'POST';
    const { status, data } = await this.#request(
      method,
      `/api/v1/knowledge/managed/documents/${encodeURIComponent(id)}${action === 'delete' ? '' : `/${action}`}`,
    );
    if (action === 'delete') {
      if (status !== 200) throw portalError(status, data);
      const record = objectOf(data);
      if (!nonEmptyString(record?.operationId) || record.resourceId !== id) throw invalidManagedResponse();
      return { operationId: record.operationId, resourceId: id };
    }
    if (status !== 202) throw portalError(status, data);
    return parseManagedMutation(data, (value) => {
      const document = objectOf(value);
      if (!document || document.id !== id || typeof document.knowledge_base_id !== 'string')
        throw invalidManagedResponse();
      return parseManagedKnowledgeDocument(document, document.knowledge_base_id);
    });
  }

  async setManagedKnowledgeDocumentEnabled(
    id: string,
    enabled: boolean,
  ): Promise<ManagedKnowledgeMutation<ManagedKnowledgeDocument>> {
    const { status, data } = await this.#request(
      'PUT',
      `/api/v1/knowledge/managed/documents/${encodeURIComponent(id)}/enable-status`,
      { enabled },
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedMutation(data, (value) =>
      parseManagedKnowledgeDocument(value, String(objectOf(value)?.knowledge_base_id ?? '')),
    );
  }

  async listManagedKnowledgeGrants(baseId: string, signal?: AbortSignal): Promise<ManagedKnowledgeGrantSet> {
    const { status, data } = await this.#request(
      'GET',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(baseId)}/grants`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedKnowledgeGrantSet(data, baseId);
  }

  async replaceManagedKnowledgeGrants(
    baseId: string,
    grants: readonly Pick<ManagedKnowledgeGrant, 'type' | 'id'>[],
  ): Promise<ManagedKnowledgeGrantSet> {
    const { status, data } = await this.#request(
      'PUT',
      `/api/v1/knowledge/managed/bases/${encodeURIComponent(baseId)}/grants`,
      { grants },
    );
    if (status !== 200) throw portalError(status, data);
    return parseManagedKnowledgeGrantSet(data, baseId);
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
    const { status, data } = await this.#request(
      'POST',
      `/api/v1/knowledge/employees/${encodeURIComponent(employee)}/search`,
      input,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    return parseEmployeeKnowledgeSearch(data);
  }

  async getEmployeeKnowledgeSource(
    employee: string,
    documentId: string,
    page: number,
    pageSize: number,
    signal?: AbortSignal,
  ): Promise<EmployeeKnowledgeSource> {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    const { status, data } = await this.#request(
      'GET',
      `/api/v1/knowledge/employees/${encodeURIComponent(employee)}/documents/${encodeURIComponent(documentId)}?${query}`,
      undefined,
      undefined,
      signal,
    );
    if (status !== 200) throw portalError(status, data);
    return parseEmployeeKnowledgeSource(data, documentId);
  }

  async getManagedKnowledgeChunkImage(
    documentId: string,
    chunkId: string,
    index: number,
    signal?: AbortSignal,
  ): Promise<Blob> {
    if (!Number.isInteger(index) || index < 0) throw invalidManagedResponse();
    const token = await this.#tokenProvider();
    const response = await fetch(
      `/api/v1/knowledge/managed/documents/${encodeURIComponent(documentId)}/chunks/${encodeURIComponent(chunkId)}/images/${index}`,
      { method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : {}, ...(signal ? { signal } : {}) },
    );
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      throw portalError(response.status, data);
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.toLowerCase();
    if (!contentType || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType)) {
      throw invalidManagedResponse();
    }
    return response.blob();
  }

  async getManagedKnowledgeFile(id: string, kind: 'preview' | 'download', signal?: AbortSignal): Promise<Blob> {
    const token = await this.#tokenProvider();
    const response = await fetch(`/api/v1/knowledge/managed/documents/${encodeURIComponent(id)}/${kind}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      throw portalError(response.status, data);
    }
    return response.blob();
  }

  // Single-employee detail (same authorization as the list/chat rules).
  // Throws PortalError so callers can distinguish 403 (out of scope) from
  // transport failures.
  async getEmployee(name: string): Promise<PortalEmployee> {
    const { status, data } = await this.#request('GET', `/api/v1/employees/${encodeURIComponent(name)}`);
    if (status !== 200) throw portalError(status, data);
    return parseEmployee((data as { employee?: unknown } | null)?.employee);
  }

  async updateEmployee(name: string, input: PortalEmployeeUpdateInput): Promise<PortalUpdateResult> {
    const { status, data } = await this.#request('PATCH', `/api/v1/employees/${encodeURIComponent(name)}`, {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.team !== undefined ? { team: input.team } : {}),
      ...(input.owner !== undefined ? { owner: input.owner } : {}),
      ...(input.models !== undefined ? { models: input.models } : {}),
      ...(input.knowledgeBases !== undefined ? { knowledgeBases: input.knowledgeBases } : {}),
      ...(input.skills !== undefined ? { skills: input.skills } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    });
    if (status === 200) return { kind: 'updated' };
    const violations = violationsOf(data);
    return {
      kind: 'rejected',
      status,
      message: errorMessage(data) ?? `HTTP ${status}`,
      ...(violations ? { violations } : {}),
    };
  }

  async apply(input: PortalApplyInput): Promise<PortalApplyResult> {
    const { status, data } = await this.#request('POST', '/api/v1/employees', {
      name: input.name,
      displayName: input.displayName,
      description: input.description,
      team: input.team,
      ...(input.models && input.models.length > 0 ? { models: input.models } : {}),
      ...(input.owner ? { owner: input.owner } : {}),
      ...(input.knowledgeBases ? { knowledgeBases: input.knowledgeBases } : {}),
      ...(input.skills && input.skills.length > 0 ? { skills: input.skills } : {}),
      ...(input.visibility ? { visibility: input.visibility } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
    if (status === 201) {
      return { kind: 'created', message: policyMessage(data, 'digital employee created') };
    }
    if (status === 202) {
      // The workbench navigates straight to the submitted page, so the
      // parked request id rides along when the portal returns it.
      const requestId = (data as { request?: { id?: unknown } } | null)?.request?.id ?? null;
      return {
        kind: 'pending',
        message: policyMessage(data, 'approval required'),
        ...(typeof requestId === 'string' && requestId ? { requestId } : {}),
      };
    }
    const violations = violationsOf(data);
    return {
      kind: 'rejected',
      status,
      message: errorMessage(data) ?? `HTTP ${status}`,
      ...(violations ? { violations } : {}),
    };
  }

  async usageStats(): Promise<PortalUsageStats> {
    const { status, data } = await this.#request('GET', '/api/v1/usage/stats');
    if (status !== 200) throw portalError(status, data);
    return data as PortalUsageStats;
  }

  async listDepartments(): Promise<readonly PortalDepartment[]> {
    const { status, data } = await this.#request('GET', '/api/v1/departments');
    if (status !== 200) throw portalError(status, data);
    const items = (data as { departments?: unknown[] } | null)?.departments ?? [];
    return items.map(parseDepartment);
  }

  async createDepartment(name: string): Promise<PortalDepartmentCreateResult> {
    // The department id is server-generated from the name (AEP team slug)
    // and keys the downstream memory/knowledge provisioning.
    const { status, data } = await this.#request('POST', '/api/v1/departments', { name });
    if (status === 200) return { kind: 'created', message: '部门创建成功' };
    return { kind: 'rejected', status, message: errorMessage(data) ?? `HTTP ${status}` };
  }

  async renameDepartment(id: string, name: string): Promise<void> {
    const { status, data } = await this.#request('PATCH', `/api/v1/departments/${encodeURIComponent(id)}`, { name });
    if (status !== 200) throw portalError(status, data);
  }

  async deleteDepartment(id: string): Promise<void> {
    const { status, data } = await this.#request('DELETE', `/api/v1/departments/${encodeURIComponent(id)}`);
    if (status !== 200 && status !== 204) throw portalError(status, data);
  }

  async listDepartmentMembers(id: string): Promise<readonly PortalDepartmentMember[]> {
    const { status, data } = await this.#request('GET', `/api/v1/departments/${encodeURIComponent(id)}/members`);
    if (status !== 200) throw portalError(status, data);
    const items = (data as { members?: unknown[] } | null)?.members ?? [];
    return items.map((raw) => {
      const m = raw as Record<string, unknown>;
      return {
        userId: String(m.userId ?? ''),
        username: String(m.username ?? ''),
        displayName: String(m.displayName ?? ''),
      };
    });
  }

  async setDepartmentMembers(id: string, userIds: readonly string[]): Promise<void> {
    const { status, data } = await this.#request('PUT', `/api/v1/departments/${encodeURIComponent(id)}/members`, {
      userIds,
    });
    if (status !== 200) throw portalError(status, data);
  }

  async deleteEmployee(name: string): Promise<void> {
    const { status, data } = await this.#request('DELETE', `/api/v1/employees/${encodeURIComponent(name)}`);
    if (status !== 200) throw portalError(status, data);
  }

  async listRequests(state?: string): Promise<readonly PortalRequest[]> {
    const query = state ? `?state=${encodeURIComponent(state)}` : '';
    const { status, data } = await this.#request('GET', `/api/v1/requests${query}`);
    if (status !== 200) throw portalError(status, data);
    const items = (data as { requests?: unknown[] } | null)?.requests ?? [];
    return items.map(parseRequest);
  }

  // The workbench's own-requests view: every state by default, scoped
  // server-side to the caller (administrators included).
  async myRequests(state?: string): Promise<readonly PortalRequest[]> {
    const query = state && state !== 'all' ? `?state=${encodeURIComponent(state)}` : '';
    const { status, data } = await this.#request('GET', `/api/v1/requests/mine${query}`);
    if (status !== 200) throw portalError(status, data);
    const items = (data as { requests?: unknown[] } | null)?.requests ?? [];
    return items.map(parseRequest);
  }

  async getRequest(id: string): Promise<PortalRequestDetail> {
    const { status, data } = await this.#request('GET', `/api/v1/requests/${encodeURIComponent(id)}`);
    if (status !== 200) throw portalError(status, data);
    const raw = ((data as { request?: unknown } | null)?.request ?? {}) as Record<string, unknown>;
    return {
      id: String(raw.id ?? ''),
      employeeName: String(raw.employeeName ?? ''),
      displayName: String(raw.displayName ?? ''),
      ownerId: String(raw.ownerId ?? ''),
      owner: String(raw.owner ?? ''),
      state: String(raw.state ?? ''),
      reason: String(raw.reason ?? ''),
      createdAt: String(raw.createdAt ?? ''),
      decidedAt: raw.decidedAt == null ? null : String(raw.decidedAt),
      decidedBy: String(raw.decidedBy ?? ''),
      decidedByName: String(raw.decidedByName ?? ''),
      description: String(raw.description ?? ''),
      teamId: String(raw.teamId ?? ''),
      teamName: String(raw.teamName ?? ''),
      note: String(raw.note ?? ''),
      model: String(raw.model ?? ''),
      deploy: parseDeploy(raw.deploy),
    };
  }

  // The workbench first paint: identity, team names and quota.
  async me(): Promise<PortalMe> {
    const { status, data } = await this.#request('GET', '/api/v1/me');
    if (status !== 200) throw portalError(status, data);
    const raw = (data ?? {}) as Record<string, unknown>;
    const user = (raw.user ?? {}) as Record<string, unknown>;
    const quota = (raw.quota ?? {}) as Record<string, unknown>;
    const teams = Array.isArray(raw.teams) ? raw.teams : [];
    return {
      user: {
        id: String(user.id ?? ''),
        displayName: String(user.displayName ?? ''),
        kind: String(user.kind ?? ''),
      },
      teams: teams.map(parseDepartment),
      quota: {
        limit: Number(quota.limit ?? 0),
        used: Number(quota.used ?? 0),
        owned: Number(quota.owned ?? 0),
        pending: Number(quota.pending ?? 0),
      },
      policyMode: String(raw.policyMode ?? ''),
      defaultModel: String(raw.defaultModel ?? ''),
    };
  }

  async decideRequest(id: string, decision: 'approve' | 'reject', reason?: string): Promise<void> {
    const { status, data } = await this.#request(
      'POST',
      `/api/v1/requests/${encodeURIComponent(id)}/${decision}`,
      decision === 'reject' && reason ? { reason } : undefined,
    );
    if (status !== 200) throw portalError(status, data);
  }
}

function errorMessage(data: unknown): string | null {
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === 'string' && error) return error;
  const message = objectOf(error)?.message;
  return typeof message === 'string' && message ? message : null;
}

// One summarize() row from the portal → PortalEmployee. null-vs-absent is
// preserved for every optional policy field (legacy = null).
function parseEmployee(raw: unknown): PortalEmployee {
  const employee = raw as Record<string, unknown>;
  const channels = employee.channels as PortalEmployee['channels'];
  const models = Array.isArray(employee.models) ? employee.models.map((id) => String(id)) : [];
  const access = employee.accessReason as Record<string, unknown> | undefined;
  return {
    name: String(employee.name ?? ''),
    displayName: String(employee.displayName ?? ''),
    phase: String(employee.phase ?? ''),
    runtime: String(employee.runtime ?? ''),
    model: String(employee.model ?? ''),
    models,
    owner: String(employee.owner ?? ''),
    ownerId: String(employee.ownerId ?? ''),
    team: String(employee.team ?? ''),
    memoryUser: String(employee.memoryUser ?? ''),
    createdAt: String(employee.createdAt ?? ''),
    ...(channels ? { channels } : {}),
    description: employee.description === undefined ? null : String(employee.description ?? ''),
    knowledgeBases: (employee.knowledgeBases as PortalEmployee['knowledgeBases']) ?? null,
    skills: (employee.skills as PortalEmployee['skills']) ?? null,
    visibility: (employee.visibility as PortalEmployee['visibility']) ?? null,
    accessReason: access
      ? {
          kind: String(access.kind ?? ''),
          ...(access.teamId !== undefined ? { teamId: String(access.teamId ?? '') } : {}),
          ...(access.teamName !== undefined ? { teamName: String(access.teamName ?? '') } : {}),
          ...(access.userId !== undefined ? { userId: String(access.userId ?? '') } : {}),
        }
      : undefined,
    modelFailover: parseModelFailover(employee.modelFailover),
  } satisfies PortalEmployee;
}

// null/absent = the default model is serving; a record without both model
// ids is unusable and degrades to null rather than a half-filled pair.
function parseModelFailover(raw: unknown): { original: string; active: string; switchedAt: string } | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const original = String(record.original ?? '');
  const active = String(record.active ?? '');
  if (!original || !active) {
    return null;
  }
  return { original, active, switchedAt: String(record.switchedAt ?? '') };
}

function parseDeploy(raw: unknown): PortalRequestDeploy {
  const deploy = (raw ?? {}) as Record<string, unknown>;
  return {
    exists: Boolean(deploy.exists),
    phase: String(deploy.phase ?? ''),
    ...(deploy.message !== undefined ? { message: String(deploy.message ?? '') } : {}),
    ...(deploy.createdAt !== undefined
      ? { createdAt: deploy.createdAt == null ? null : String(deploy.createdAt) }
      : {}),
  };
}

function parseRequest(raw: unknown): PortalRequest {
  const request = raw as Record<string, unknown>;
  return {
    id: String(request.id ?? ''),
    employeeName: String(request.employeeName ?? ''),
    owner: String(request.owner ?? ''),
    displayName: String(request.displayName ?? ''),
    state: String(request.state ?? ''),
    reason: String(request.reason ?? ''),
    createdAt: String(request.createdAt ?? ''),
    ...(request.deploy !== undefined ? { deploy: parseDeploy(request.deploy) } : {}),
  };
}

function parseDepartment(raw: unknown): PortalDepartment {
  const department = raw as Record<string, unknown>;
  return {
    id: String(department.id ?? ''),
    name: String(department.name ?? ''),
  };
}

function violationsOf(data: unknown): readonly PortalApplyViolation[] | null {
  const violations = (data as { violations?: unknown } | null)?.violations;
  if (!Array.isArray(violations)) return null;
  const parsed = violations.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    return typeof record.field === 'string' && typeof record.message === 'string'
      ? [{ field: record.field, message: record.message }]
      : [];
  });
  return parsed.length > 0 ? parsed : null;
}

function policyMessage(data: unknown, fallback: string): string {
  const policy = (data as { policy?: unknown } | null)?.policy;
  return typeof policy === 'string' && policy ? policy : fallback;
}

function portalError(status: number, data: unknown): PortalError {
  const error = objectOf(data)?.error;
  const details = objectOf(error);
  return new PortalError(
    status,
    errorMessage(data) ?? `HTTP ${status}`,
    nonEmptyString(details?.code) ? details.code : undefined,
    nonEmptyString(details?.operationId) ? details.operationId : undefined,
    nonEmptyString(details?.resourceId) ? details.resourceId : undefined,
  );
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

function requireFiniteNumber(value: unknown): number {
  if (!isFiniteNumber(value)) throw invalidManagedResponse();
  return value;
}

function invalidManagedResponse(): PortalError {
  return new PortalError(502, '知识库服务返回了无法识别的数据。', 'INVALID_RESPONSE');
}

function parseManagedReadiness(value: unknown): ManagedKnowledgeReadiness {
  const record = objectOf(value);
  const model = objectOf(record?.embeddingModel);
  if (
    !nonEmptyString(record?.deploymentId) ||
    !nonEmptyString(record.tenantId) ||
    record.tenant !== 'verified' ||
    !model ||
    !['not_configured', 'unavailable', 'configured'].includes(String(model.state)) ||
    typeof model.id !== 'string' ||
    model.availability !== 'unverified' ||
    record.storage !== 'unverified' ||
    record.parser !== 'unverified'
  ) {
    throw invalidManagedResponse();
  }
  return record as unknown as ManagedKnowledgeReadiness;
}

function parseManagedKnowledgeBase(value: unknown): ManagedKnowledgeBase {
  const record = objectOf(value);
  if (
    !record ||
    !nonEmptyString(record.id) ||
    typeof record.name !== 'string' ||
    typeof record.description !== 'string' ||
    (typeof record.tenant_id !== 'string' && typeof record.tenant_id !== 'number') ||
    !nonEmptyString(record.embedding_model_id) ||
    typeof record.type !== 'string'
  ) {
    throw invalidManagedResponse();
  }
  return { ...record, tenant_id: String(record.tenant_id) } as ManagedKnowledgeBase;
}

function parseManagedKnowledgeDocument(value: unknown, expectedBaseId: string): ManagedKnowledgeDocument {
  const record = objectOf(value);
  if (
    !record ||
    !nonEmptyString(record.id) ||
    record.knowledge_base_id !== expectedBaseId ||
    typeof record.name !== 'string' ||
    typeof record.file_name !== 'string' ||
    typeof record.parse_status !== 'string' ||
    typeof record.created_at !== 'string'
  ) {
    throw invalidManagedResponse();
  }
  if (record.manual_disabled !== undefined && typeof record.manual_disabled !== 'boolean')
    throw invalidManagedResponse();
  return record as unknown as ManagedKnowledgeDocument;
}

function parseManagedKnowledgeGrantSet(value: unknown, expectedBaseId: string): ManagedKnowledgeGrantSet {
  const record = objectOf(value);
  if (
    !record ||
    record.knowledge_base_id !== expectedBaseId ||
    !nonEmptyString(record.tenant_id) ||
    !Array.isArray(record.grants)
  )
    throw invalidManagedResponse();
  const grants = record.grants.map((value) => {
    const grant = objectOf(value);
    if (!grant || (grant.type !== 'user' && grant.type !== 'team') || !nonEmptyString(grant.id))
      throw invalidManagedResponse();
    if (grant.granted_by !== undefined && typeof grant.granted_by !== 'string') throw invalidManagedResponse();
    if (grant.created_at !== undefined && typeof grant.created_at !== 'string') throw invalidManagedResponse();
    return {
      type: grant.type,
      id: grant.id,
      ...(typeof grant.granted_by === 'string' ? { granted_by: grant.granted_by } : {}),
      ...(typeof grant.created_at === 'string' ? { created_at: grant.created_at } : {}),
    } satisfies ManagedKnowledgeGrant;
  });
  return { knowledge_base_id: expectedBaseId, tenant_id: record.tenant_id, grants };
}

function parseEmployeeKnowledgeSearch(value: unknown): EmployeeKnowledgeSearchResponse {
  const record = objectOf(value);
  if (!record || typeof record.query !== 'string' || record.mode !== 'hybrid' || !Array.isArray(record.results))
    throw invalidManagedResponse();
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
      throw invalidManagedResponse();
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

function parseEmployeeKnowledgeSource(value: unknown, expectedDocumentId: string): EmployeeKnowledgeSource {
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
    throw invalidManagedResponse();
  const chunks = record.chunks.map((value) => {
    const chunk = objectOf(value);
    if (
      !chunk ||
      !nonEmptyString(chunk.id) ||
      !isFiniteNumber(chunk.seq_id) ||
      typeof chunk.chunk_type !== 'string' ||
      typeof chunk.content !== 'string'
    )
      throw invalidManagedResponse();
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

function parseManagedMutation<T>(value: unknown, parse: (data: unknown) => T): ManagedKnowledgeMutation<T> {
  const record = objectOf(value);
  if (!record || !nonEmptyString(record.operationId)) throw invalidManagedResponse();
  return { data: parse(record.data), operationId: record.operationId };
}

function parseManagedOperation(value: unknown): ManagedKnowledgeOperation {
  const record = objectOf(value);
  const data = objectOf(record?.data);
  if (!record || !nonEmptyString(record.operationId) || data?.outcome !== 'succeeded') throw invalidManagedResponse();
  if (data.affectedCount !== undefined && (!isFiniteNumber(data.affectedCount) || data.affectedCount < 0))
    throw invalidManagedResponse();
  if (data.folderPath !== undefined && typeof data.folderPath !== 'string') throw invalidManagedResponse();
  return {
    data: {
      outcome: 'succeeded',
      ...(data.affectedCount !== undefined ? { affectedCount: data.affectedCount } : {}),
      ...(data.folderPath !== undefined ? { folderPath: data.folderPath } : {}),
    },
    operationId: record.operationId,
  };
}

function parseManagedKnowledgeTag(value: unknown): ManagedKnowledgeTag {
  const tag = objectOf(value);
  if (
    !tag ||
    !nonEmptyString(tag.id) ||
    !isFiniteNumber(tag.seq_id) ||
    tag.seq_id <= 0 ||
    typeof tag.name !== 'string' ||
    typeof tag.color !== 'string' ||
    !isFiniteNumber(tag.sort_order)
  )
    throw invalidManagedResponse();
  if (tag.knowledge_count !== undefined && !isFiniteNumber(tag.knowledge_count)) throw invalidManagedResponse();
  if (tag.chunk_count !== undefined && !isFiniteNumber(tag.chunk_count)) throw invalidManagedResponse();
  return {
    id: tag.id,
    seq_id: tag.seq_id,
    name: tag.name,
    color: tag.color,
    sort_order: tag.sort_order,
    ...(isFiniteNumber(tag.knowledge_count) ? { knowledge_count: tag.knowledge_count } : {}),
    ...(isFiniteNumber(tag.chunk_count) ? { chunk_count: tag.chunk_count } : {}),
  };
}

function parseManagedKnowledgeFolder(value: unknown): ManagedKnowledgeFolder {
  const folder = objectOf(value);
  if (
    !folder ||
    typeof folder.path !== 'string' ||
    typeof folder.name !== 'string' ||
    !isFiniteNumber(folder.document_count) ||
    !isFiniteNumber(folder.total_count)
  )
    throw invalidManagedResponse();
  if (folder.children !== undefined && !Array.isArray(folder.children)) throw invalidManagedResponse();
  return {
    path: folder.path,
    name: folder.name,
    document_count: folder.document_count,
    total_count: folder.total_count,
    ...(Array.isArray(folder.children) ? { children: folder.children.map(parseManagedKnowledgeFolder) } : {}),
  };
}

function parseManagedKnowledgeFAQ(value: unknown): ManagedKnowledgeFAQEntry {
  const entry = objectOf(value);
  const stringArray = (input: unknown) => Array.isArray(input) && input.every((item) => typeof item === 'string');
  if (
    !entry ||
    !isFiniteNumber(entry.id) ||
    entry.id <= 0 ||
    !nonEmptyString(entry.knowledge_id) ||
    !nonEmptyString(entry.knowledge_base_id) ||
    !isFiniteNumber(entry.tag_id) ||
    typeof entry.tag_name !== 'string' ||
    typeof entry.is_enabled !== 'boolean' ||
    typeof entry.is_recommended !== 'boolean' ||
    typeof entry.standard_question !== 'string' ||
    !stringArray(entry.similar_questions) ||
    !stringArray(entry.negative_questions) ||
    !stringArray(entry.answers) ||
    typeof entry.answer_strategy !== 'string' ||
    typeof entry.updated_at !== 'string' ||
    typeof entry.created_at !== 'string'
  )
    throw invalidManagedResponse();
  return {
    id: entry.id,
    knowledge_id: entry.knowledge_id,
    knowledge_base_id: entry.knowledge_base_id,
    tag_id: entry.tag_id,
    tag_name: entry.tag_name,
    is_enabled: entry.is_enabled,
    is_recommended: entry.is_recommended,
    standard_question: entry.standard_question,
    similar_questions: entry.similar_questions,
    negative_questions: entry.negative_questions,
    answers: entry.answers,
    answer_strategy: entry.answer_strategy,
    updated_at: entry.updated_at,
    created_at: entry.created_at,
  };
}

// The chat entry lives on the portal origin (not proxied): the browser must
// land there so the portal can set its own cookies. The portal runs on the
// SAME host as the console (k3s NodePort 30190), so the default derives from
// the console's own location — whatever hostname the user typed keeps
// portal and chat UI on one hostname (cookies ignore ports, not hosts), and
// nothing environment-specific is baked into the build. VITE_PORTAL_URL
// overrides for split deployments.
export function chatUIBaseURL(): string {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env;
  if (env?.VITE_CHAT_UI_URL) return env.VITE_CHAT_UI_URL;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:30195`;
  }
  return 'http://localhost:30195';
}

export function portalChatBaseURL(): string {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env;
  if (env?.VITE_PORTAL_URL) return env.VITE_PORTAL_URL;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:30190`;
  }
  return 'http://localhost:30190';
}
