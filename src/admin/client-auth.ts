import { type AepTokenStore, type CurrentIdentity, MemoryTokenStore } from '@aep/sdk-node';
import { isRecord, nonEmptyString, stringArray } from './client-values.js';

export const AdminConsoleStatus = {
  SignedOut: 'signed-out',
  Authenticated: 'authenticated',
  Forbidden: 'forbidden',
} as const;

export type AdminConsoleStatus = (typeof AdminConsoleStatus)[keyof typeof AdminConsoleStatus];

export interface AdminOverview {
  readonly users: number | null;
  readonly teams: number | null;
  readonly skills: number | null;
  readonly models: number | null;
  readonly pendingEvents: number | null;
  readonly failed?: readonly AdminOverviewMetric[];
}

export const AdminOverviewMetric = {
  Users: 'users',
  Teams: 'teams',
  Skills: 'skills',
  Models: 'models',
  PendingEvents: 'pendingEvents',
} as const;

export type AdminOverviewMetric = (typeof AdminOverviewMetric)[keyof typeof AdminOverviewMetric];

export interface AdminSession {
  readonly status: AdminConsoleStatus;
  readonly identity?: AdminIdentity;
}

// The permissions field was added to AEP CurrentIdentity after the initial
// Console release. Keep it optional at this boundary so an older SDK package
// can still be type-checked while the service and SDK roll forward together.
export type AdminIdentity = CurrentIdentity & { readonly permissions?: readonly string[] };

export const AdminPermission = {
  UsersRead: 'users.read',
  UsersWrite: 'users.write',
  RolesRead: 'roles.read',
  RolesWrite: 'roles.write',
  TeamsRead: 'teams.read',
  TeamsWrite: 'teams.write',
  SkillsRead: 'skills.read',
  SkillsWrite: 'skills.write',
  SkillsAssign: 'skills.assign',
  ModelsRead: 'models.read',
  ModelsWrite: 'models.write',
  ModelsAssign: 'models.assign',
  CredentialsRead: 'credentials.read',
  CredentialsWrite: 'credentials.write',
  CredentialsAssign: 'credentials.assign',
  LicensesRead: 'licenses.read',
  LicensesWrite: 'licenses.write',
  LicensesRevoke: 'licenses.revoke',
  IdentityRead: 'identity.read',
  IdentityWrite: 'identity.write',
  SessionsWrite: 'sessions.write',
  EventsRead: 'events.read',
  EventsWrite: 'events.write',
  AuditRead: 'audit.read',
  DataPlaneWrite: 'data_plane.write',
  DeploymentRead: 'deployment.read',
  DeploymentWrite: 'deployment.write',
  AgentsComputeWrite: 'agents.compute.write',
} as const;

export type AdminPermission = (typeof AdminPermission)[keyof typeof AdminPermission];

const ADMIN_CONSOLE_PERMISSIONS: readonly AdminPermission[] = Object.values(AdminPermission);

export function hasAdminPermission(identity: AdminIdentity | undefined, permission: AdminPermission): boolean {
  if (!identity) return false;
  if (identity.roles.some((role) => ['admin', 'enterprise_admin', 'enterprise-admin'].includes(role.toLowerCase())))
    return true;
  return new Set(identity.permissions ?? []).has(permission);
}

export function hasAdminConsoleAccess(identity: AdminIdentity): boolean {
  return ADMIN_CONSOLE_PERMISSIONS.every((permission) => hasAdminPermission(identity, permission));
}

export function hasAnyAdminConsoleAccess(identity: AdminIdentity): boolean {
  return ADMIN_CONSOLE_PERMISSIONS.some((permission) => hasAdminPermission(identity, permission));
}

export class AdminMetadataError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AdminMetadataError';
  }
}

// RFC 9457 problem details carried by the handwritten endpoints so pages can
// react to the status and show the server-provided detail instead of parsing
// the message string.
export class AdminRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly detail: string | null;

  constructor(status: number, code: string | null, detail: string | null) {
    super(code ? `AEP ${status} ${code}${detail ? `: ${detail}` : ''}` : `AEP request failed with status ${status}.`);
    this.name = 'AdminRequestError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function runtimeFetch(): typeof globalThis.fetch {
  const root = globalThis as typeof globalThis & { fetch?: typeof globalThis.fetch };
  const candidate = root.fetch ?? (typeof window !== 'undefined' ? window.fetch : undefined);
  if (typeof candidate !== 'function') {
    throw new Error('The enterprise console runtime does not provide fetch.');
  }
  return candidate.bind(typeof window !== 'undefined' ? window : root);
}

export interface AepTransportLike {
  request<T>(
    baseUrl: string,
    request: {
      readonly method: string;
      readonly path: string;
      readonly headers?: Record<string, string>;
      readonly body?: unknown;
      readonly responseType?: 'json' | 'bytes' | 'empty';
    },
  ): Promise<{ status: number; headers: Headers; data: T }>;
}

export function parseAdminIdentity(value: unknown): AdminIdentity | null {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const userId = nonEmptyString(value.user.id);
  const displayName = nonEmptyString(value.user.displayName);
  if (!userId || !displayName || !stringArray(value.roles)) return null;
  if (value.permissions !== undefined && !stringArray(value.permissions)) return null;
  if (typeof value.sessionExpiresAt !== 'string' || !Number.isFinite(Date.parse(value.sessionExpiresAt))) return null;
  if (typeof value.passwordChangeRequired !== 'boolean') return null;

  const deployment = namedIdentity(value.deployment);
  const enterprise = namedIdentity(value.enterprise);
  const deploymentId = nonEmptyString(value.deploymentId) ?? deployment?.id ?? enterprise?.id;
  const legacyEnterprise = enterprise ?? deployment;
  if (!deploymentId || !legacyEnterprise) return null;
  if (deployment && deployment.id !== deploymentId) return null;
  if (enterprise && enterprise.id !== deploymentId) return null;
  if (value.user.email !== undefined && value.user.email !== null && typeof value.user.email !== 'string') return null;

  return {
    user: {
      id: userId,
      displayName,
      ...(value.user.email === undefined ? {} : { email: value.user.email }),
    },
    ...(deployment ? { deployment } : {}),
    deploymentId,
    enterprise: legacyEnterprise,
    roles: [...value.roles],
    permissions: [...(value.permissions ?? [])],
    sessionExpiresAt: value.sessionExpiresAt,
    passwordChangeRequired: value.passwordChangeRequired,
  };
}

function namedIdentity(value: unknown): { id: string; name: string } | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  return id && name ? { id, name } : null;
}

export class SessionTokenStore implements AepTokenStore {
  // localStorage-backed so a page refresh restores the session instead of
  // bouncing the admin to the login form (App boots via client.restore(),
  // and the SDK's 401 path renews the access token through the stored
  // refresh token). Memory stays the fast path; storage failures (full,
  // blocked, private mode) degrade to the previous memory-only behaviour.
  readonly #memory = new MemoryTokenStore();
  readonly #storageKey = 'zhiyuan.admin.tokens';

  async get() {
    const memory = await this.#memory.get();
    if (memory) return memory;
    try {
      const raw = window.localStorage.getItem(this.#storageKey);
      if (!raw) return null;
      await this.#memory.set(JSON.parse(raw) as Parameters<AepTokenStore['set']>[0]);
      return this.#memory.get();
    } catch {
      return null;
    }
  }

  async set(tokens: Parameters<AepTokenStore['set']>[0]): Promise<void> {
    await this.#memory.set(tokens);
    try {
      window.localStorage.setItem(this.#storageKey, JSON.stringify(tokens));
    } catch {
      // storage unavailable — memory-only session
    }
  }

  async clear(): Promise<void> {
    await this.#memory.clear();
    try {
      window.localStorage.removeItem(this.#storageKey);
    } catch {
      // storage unavailable
    }
  }
}

export function defaultBaseUrl(): string {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env;
  if (env?.VITE_AEP_BASE_URL) return env.VITE_AEP_BASE_URL;
  // The admin server proxies /aep to the control service. Keeping the client
  // same-origin avoids browser CORS failures and also works behind a reverse
  // proxy in production.
  if (typeof window !== 'undefined' && window.location.origin !== 'null') {
    return window.location.origin;
  }
  return 'http://localhost:8080';
}
