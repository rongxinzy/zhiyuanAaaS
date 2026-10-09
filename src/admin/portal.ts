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
  ) {
    super(message);
    this.name = 'PortalError';
  }
}

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
  const message = (data as { error?: unknown } | null)?.error;
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
