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
};

export class PortalError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PortalError';
  }
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
  | { readonly kind: 'pending'; readonly message: string }
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
};

export type PortalApplyVisibility = {
  readonly mode: 'all' | 'restricted';
  readonly teams?: readonly string[];
  readonly users?: readonly string[];
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
  ): Promise<{ readonly status: number; readonly data: unknown }> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = await this.#tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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

  async listEmployees(): Promise<readonly PortalEmployee[]> {
    const { status, data } = await this.#request('GET', '/api/v1/employees');
    if (status !== 200) throw portalError(status, data);
    const items = (data as { employees?: unknown[] } | null)?.employees ?? [];
    return items.map((raw) => {
      const employee = raw as Record<string, unknown>;
      const channels = employee.channels as PortalEmployee['channels'];
      return {
        name: String(employee.name ?? ''),
        displayName: String(employee.displayName ?? ''),
        phase: String(employee.phase ?? ''),
        runtime: String(employee.runtime ?? ''),
        model: String(employee.model ?? ''),
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
      } satisfies PortalEmployee;
    });
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
    });
    if (status === 201) {
      return { kind: 'created', message: policyMessage(data, 'digital employee created') };
    }
    if (status === 202) {
      return { kind: 'pending', message: policyMessage(data, 'approval required') };
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
    return items.map((raw) => {
      const d = raw as Record<string, unknown>;
      return {
        id: String(d.id ?? ''),
        name: String(d.name ?? ''),
      };
    });
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
    return items.map((raw) => {
      const request = raw as Record<string, unknown>;
      return {
        id: String(request.id ?? ''),
        employeeName: String(request.employeeName ?? ''),
        owner: String(request.owner ?? ''),
        displayName: String(request.displayName ?? ''),
        state: String(request.state ?? ''),
        reason: String(request.reason ?? ''),
        createdAt: String(request.createdAt ?? ''),
      };
    });
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
  const message = (data as { error?: unknown } | null)?.error;
  return typeof message === 'string' && message ? message : null;
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
  return new PortalError(status, errorMessage(data) ?? `HTTP ${status}`);
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
