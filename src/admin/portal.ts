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
  readonly memoryUser: string;
  readonly createdAt: string;
  readonly channels?: { readonly wecom: boolean; readonly wecomName?: string };
};

export type PortalMemoryStatus = {
  readonly server: string;
  readonly account: string;
  readonly healthy: boolean;
  readonly accounts: readonly {
    readonly accountID: string;
    readonly adminUser: string;
    readonly createdAt: string;
  }[];
};

export type PortalKnowledgeStatus = {
  readonly url: string;
  readonly configured: boolean;
  readonly healthy: boolean;
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
// approval (202, message carries the policy reason), or rejected (409
// duplicate / 403 quota-policy / anything else).
export type PortalApplyResult =
  | { readonly kind: 'created'; readonly message: string }
  | { readonly kind: 'pending'; readonly message: string }
  | { readonly kind: 'rejected'; readonly status: number; readonly message: string };

export class PortalClient {
  readonly #tokenProvider: () => Promise<string | null>;

  constructor(tokenProvider: () => Promise<string | null>) {
    this.#tokenProvider = tokenProvider;
  }

  async #request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ readonly status: number; readonly data: unknown }> {
    const headers: Record<string, string> = {};
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

  async listEmployees(): Promise<readonly PortalEmployee[]> {
    const { status, data } = await this.#request('GET', '/api/v1/employees');
    if (status !== 200) throw portalError(status, data);
    const items = (data as { employees?: unknown[] } | null)?.employees ?? [];
    return items.map((raw) => {
      const employee = raw as Record<string, unknown>;
      const channels = employee['channels'] as PortalEmployee['channels'];
      return {
        name: String(employee['name'] ?? ''),
        displayName: String(employee['displayName'] ?? ''),
        phase: String(employee['phase'] ?? ''),
        runtime: String(employee['runtime'] ?? ''),
        model: String(employee['model'] ?? ''),
        owner: String(employee['owner'] ?? ''),
        ownerId: String(employee['ownerId'] ?? ''),
        memoryUser: String(employee['memoryUser'] ?? ''),
        createdAt: String(employee['createdAt'] ?? ''),
        ...(channels ? { channels } : {}),
      };
    });
  }

  // Sidebar service-status probes (the portal holds the OpenViking root key
  // server-side; the console only ever sees summaries).
  async memoryStatus(): Promise<PortalMemoryStatus> {
    const { status, data } = await this.#request('GET', '/api/v1/memory/status');
    if (status !== 200) throw portalError(status, data);
    return data as PortalMemoryStatus;
  }

  async knowledgeStatus(): Promise<PortalKnowledgeStatus> {
    const { status, data } = await this.#request('GET', '/api/v1/knowledge/status');
    if (status !== 200) throw portalError(status, data);
    return data as PortalKnowledgeStatus;
  }

  async apply(
    name: string,
    displayName: string,
  ): Promise<PortalApplyResult> {
    const { status, data } = await this.#request('POST', '/api/v1/employees', {
      name,
      displayName,
    });
    if (status === 201) {
      return { kind: 'created', message: policyMessage(data, 'digital employee created') };
    }
    if (status === 202) {
      return { kind: 'pending', message: policyMessage(data, 'approval required') };
    }
    return { kind: 'rejected', status, message: errorMessage(data) ?? `HTTP ${status}` };
  }

  async deleteEmployee(name: string): Promise<void> {
    const { status, data } = await this.#request(
      'DELETE',
      `/api/v1/employees/${encodeURIComponent(name)}`,
    );
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
        id: String(request['id'] ?? ''),
        employeeName: String(request['employeeName'] ?? ''),
        owner: String(request['owner'] ?? ''),
        displayName: String(request['displayName'] ?? ''),
        state: String(request['state'] ?? ''),
        reason: String(request['reason'] ?? ''),
        createdAt: String(request['createdAt'] ?? ''),
      };
    });
  }

  async decideRequest(
    id: string,
    decision: 'approve' | 'reject',
    reason?: string,
  ): Promise<void> {
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
export function portalChatBaseURL(): string {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env;
  if (env?.VITE_PORTAL_URL) return env.VITE_PORTAL_URL;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:30190`;
  }
  return 'http://localhost:30190';
}
