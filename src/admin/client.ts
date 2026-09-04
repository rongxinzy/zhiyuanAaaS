import {
  AepClient,
  FetchTransport,
  MemoryTokenStore,
  type AepTokenStore,
  type AdminModel,
  type ModelAssignment,
  type CurrentIdentity,
  type JsonObject,
  type Page,
  type PlatformUser,
  type Permission,
  type Role,
  type Team,
} from '@aep/sdk-node';

export const AdminConsoleStatus = {
  SignedOut: 'signed-out',
  Authenticated: 'authenticated',
  Forbidden: 'forbidden',
} as const;
export type AdminConsoleStatus = (typeof AdminConsoleStatus)[keyof typeof AdminConsoleStatus];

export interface AdminOverview {
  readonly users: number;
  readonly teams: number;
  readonly skills: number;
  readonly models: number;
  readonly pendingEvents: number;
}

export interface AdminSession {
  readonly status: AdminConsoleStatus;
  readonly identity?: CurrentIdentity;
}

export interface AdminSkill {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly enabled: boolean;
  readonly versions: readonly AdminSkillVersion[];
}

export interface AdminSkillVersion {
  readonly version: string;
  readonly state: 'draft' | 'published' | 'withdrawn';
  readonly sha256: string;
  readonly size: number;
  readonly createdAt?: string;
}

export interface AdminSkillAssignment {
  readonly id: string;
  readonly skillId: string;
  readonly subjectType: string;
  readonly subjectId: string;
}

export const AdminSubjectType = {
  User: 'user',
  Role: 'role',
  Team: 'team',
} as const;
export type AdminSubjectType = (typeof AdminSubjectType)[keyof typeof AdminSubjectType];

export interface AdminAssignmentSubject {
  readonly type: AdminSubjectType;
  readonly id: string;
}

export const AdminModelSubjectType = {
  User: 'user',
  Role: 'role',
  Team: 'team',
} as const;
export type AdminModelSubjectType = (typeof AdminModelSubjectType)[keyof typeof AdminModelSubjectType];

export interface AdminModelAssignmentSubject {
  readonly type: AdminModelSubjectType;
  readonly id: string;
}

export interface AdminResources {
  readonly users: readonly PlatformUser[];
  readonly teams: readonly Team[];
  readonly roles: readonly Role[];
  readonly permissions: readonly Permission[];
  readonly skills: readonly AdminSkill[];
  readonly assignments: readonly AdminSkillAssignment[];
}

export interface AdminModels {
  readonly models: readonly AdminModel[];
  readonly assignments: readonly ModelAssignment[];
}

export interface AdminEventRecord {
  readonly eventId?: string;
  readonly type?: string;
  readonly scopeType?: string;
  readonly scopeId?: string;
  readonly receivedAt?: string;
  readonly createdAt?: string;
}

export class AdminConsoleClient {
  readonly #baseUrl: string;
  readonly #tokenStore: AepTokenStore;
  #client: AepClient | null = null;
  #deploymentId: string | null = null;

  constructor(baseUrl = defaultBaseUrl(), tokenStore?: AepTokenStore) {
    ensureRequestIdCrypto();
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#tokenStore = tokenStore ?? new SessionTokenStore();
  }

  async restore(): Promise<AdminSession> {
    const client = this.#getClient();
    const tokens = await client.restoreSession();
    if (!tokens) return { status: AdminConsoleStatus.SignedOut };
    return this.#identitySession(client);
  }

  async login(input: {
    readonly deploymentId: string;
    readonly username: string;
    readonly password: string;
  }): Promise<AdminSession> {
    const client = this.#getClient();
    this.#deploymentId = input.deploymentId;
    await client.loginWithPassword(input);
    return this.#identitySession(client);
  }

  async logout(): Promise<void> {
    if (this.#client) await this.#client.logout().catch(() => undefined);
    await this.#tokenStore.clear();
    this.#client = null;
  }

  async overview(): Promise<AdminOverview> {
    const client = this.#requireClient();
    const [users, teams, skills, models, events] = await Promise.all([
      client.listUsers(),
      client.listTeams(),
      client.listSkills(),
      client.listAdminModels(),
      client.searchEvents({ limit: 100 }),
    ]);
    return {
      users: pageCount(users),
      teams: teams.teams.length,
      skills: listCount(skills),
      models: listCount(models),
      pendingEvents: pendingEventCount(events),
    };
  }

  async resources(): Promise<AdminResources> {
    const client = this.#requireClient();
    const [users, teams, roles, permissions, skills, assignments] = await Promise.all([
      client.listUsers(),
      client.listTeams(),
      client.listRoles(),
      client.listPermissions(),
      client.listSkills(),
      client.listSkillAssignments(),
    ]);
    return {
      users: users.items,
      teams: teams.teams,
      roles: roles.roles,
      permissions: permissions.permissions,
      skills: parseSkills(skills),
      assignments: parseAssignments(assignments),
    };
  }

  async users(): Promise<readonly PlatformUser[]> {
    const page = await this.#requireClient().listUsers();
    return page.items;
  }

  async createUser(input: {
    readonly username: string;
    readonly displayName: string;
    readonly email?: string | null;
    readonly temporaryPassword: string;
    readonly teamIds?: readonly string[];
    readonly roleIds?: readonly string[];
    readonly requirePasswordChange: boolean;
  }): Promise<PlatformUser> {
    const deploymentId = this.#deploymentId;
    if (!deploymentId) throw new Error('The deployment identity is unavailable.');
    return this.#requireClient().createUser({
      deploymentId,
      username: input.username,
      displayName: input.displayName,
      ...(input.email ? { email: input.email } : {}),
      temporaryPassword: input.temporaryPassword,
      ...(input.teamIds ? { teamIds: [...input.teamIds] } : {}),
      ...(input.roleIds ? { roleIds: [...input.roleIds] } : {}),
      requirePasswordChange: input.requirePasswordChange,
    });
  }

  async updateUser(userId: string, input: Parameters<AepClient['updateUser']>[1]): Promise<PlatformUser> {
    return this.#requireClient().updateUser(userId, input);
  }

  async resetUserPassword(userId: string, input: { readonly temporaryPassword: string; readonly requirePasswordChange: boolean }): Promise<void> {
    await this.#requireClient().resetUserPassword(userId, input);
  }

  async replaceUserRBAC(userId: string, input: { readonly roleIds: readonly string[]; readonly teamIds: readonly string[] }): Promise<void> {
    await this.#requireClient().replaceUserRBAC(userId, { roleIds: [...input.roleIds], teamIds: [...input.teamIds] });
  }

  async createRole(input: Parameters<AepClient['createRole']>[0]): Promise<Role> {
    return this.#requireClient().createRole(input);
  }

  async updateRole(roleId: string, input: Parameters<AepClient['updateRole']>[1]): Promise<Role> {
    return this.#requireClient().updateRole(roleId, input);
  }

  async deleteRole(roleId: string): Promise<void> {
    await this.#requireClient().deleteRole(roleId);
  }

  async createTeam(input: Parameters<AepClient['createTeam']>[0]): Promise<Team> {
    return this.#requireClient().createTeam(input);
  }

  async updateTeam(teamId: string, input: Parameters<AepClient['updateTeam']>[1]): Promise<Team> {
    return this.#requireClient().updateTeam(teamId, input);
  }

  async deleteTeam(teamId: string): Promise<void> {
    await this.#requireClient().deleteTeam(teamId);
  }

  async createSkill(input: { readonly id: string; readonly name: string; readonly description: string; readonly enabled?: boolean }): Promise<void> {
    await this.#requireClient().createSkill(input);
  }

  async updateSkill(skillId: string, input: { readonly name?: string; readonly description?: string; readonly enabled?: boolean }): Promise<void> {
    await this.#requireClient().updateSkill(skillId, input);
  }

  async deleteSkill(skillId: string): Promise<void> {
    await this.#requireClient().deleteSkill(skillId);
  }

  async uploadSkillVersion(skillId: string, version: string, archive: Uint8Array): Promise<void> {
    await this.#requireClient().uploadSkillVersion(skillId, version, archive);
  }

  async publishSkillVersion(skillId: string, version: string): Promise<void> {
    await this.#requireClient().publishSkillVersion(skillId, version);
  }

  async createSkillAssignment(input: { readonly skillId: string; readonly subject: AdminAssignmentSubject }): Promise<void> {
    await this.#requireClient().createSkillAssignment({ skillId: input.skillId, subject: { type: input.subject.type, id: input.subject.id } });
  }

  async deleteSkillAssignment(assignmentId: string): Promise<void> {
    await this.#requireClient().deleteSkillAssignment(assignmentId);
  }

  async models(): Promise<AdminModels> {
    const client = this.#requireClient();
    const [models, assignments] = await Promise.all([
      client.listAdminModels(),
      client.listModelAssignments(),
    ]);
    return { models: models.models, assignments: assignments.assignments };
  }

  async createModel(input: Parameters<AepClient['createModel']>[0]): Promise<void> {
    await this.#requireClient().createModel(input);
  }

  async updateModel(modelId: string, input: Parameters<AepClient['updateModel']>[1]): Promise<void> {
    await this.#requireClient().updateModel(modelId, input);
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.#requireClient().deleteModel(modelId);
  }

  async createModelAssignment(input: { readonly modelId: string; readonly subject: AdminModelAssignmentSubject }): Promise<void> {
    await this.#requireClient().createModelAssignment({ modelId: input.modelId, subject: { type: input.subject.type, id: input.subject.id } });
  }

  async deleteModelAssignment(assignmentId: string): Promise<void> {
    await this.#requireClient().deleteModelAssignment(assignmentId);
  }

  async publishControlEvent(input: JsonObject): Promise<Record<string, unknown>> {
    return this.#requireClient().createControlEvent(input) as Promise<Record<string, unknown>>;
  }

  async deliverySummary(eventId: string): Promise<unknown> {
    return this.#requireClient().listControlEventDeliveries(eventId);
  }

  async searchAudit(filters?: Record<string, string | number>): Promise<readonly AdminEventRecord[]> {
    const result = await this.#requireClient().searchEvents(filters);
    return arrayFrom(result, 'items').flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      return [{
        ...(typeof record.eventId === 'string' ? { eventId: record.eventId } : {}),
        ...(typeof record.type === 'string' ? { type: record.type } : {}),
        ...(typeof record.scopeType === 'string' ? { scopeType: record.scopeType } : {}),
        ...(typeof record.scopeId === 'string' ? { scopeId: record.scopeId } : {}),
        ...(typeof record.receivedAt === 'string' ? { receivedAt: record.receivedAt } : {}),
        ...(typeof record.createdAt === 'string' ? { createdAt: record.createdAt } : {}),
      }];
    });
  }

  #getClient(): AepClient {
    if (!this.#client) {
      this.#client = new AepClient({
        baseUrl: this.#baseUrl,
        tokenStore: this.#tokenStore,
        transport: new FetchTransport({fetch: runtimeFetch()}),
      });
    }
    return this.#client;
  }

  #requireClient(): AepClient {
    if (!this.#client) throw new Error('Admin console is not authenticated.');
    return this.#client;
  }

  async #identitySession(client: AepClient): Promise<AdminSession> {
    const identity = await client.getCurrentIdentity();
    this.#deploymentId = identity.deploymentId ?? identity.deployment?.id ?? identity.enterprise?.id ?? this.#deploymentId;
    const hasAdminRole = identity.roles.some(role =>
      ['admin', 'enterprise_admin', 'enterprise-admin'].includes(role.toLowerCase()),
    );
    return hasAdminRole
      ? { status: AdminConsoleStatus.Authenticated, identity }
      : { status: AdminConsoleStatus.Forbidden, identity };
  }
}

function runtimeFetch(): typeof globalThis.fetch {
  const root = globalThis as typeof globalThis & {fetch?: typeof globalThis.fetch};
  const candidate = root.fetch ?? (typeof window !== 'undefined' ? window.fetch : undefined);
  if (typeof candidate !== 'function') {
    throw new Error('The enterprise console runtime does not provide fetch.');
  }
  return candidate.bind(typeof window !== 'undefined' ? window : root);
}

function ensureRequestIdCrypto(): void {
  const root = globalThis as typeof globalThis & {
    crypto?: {randomUUID?: () => string};
  };
  if (typeof root.crypto?.randomUUID === 'function') return;
  const fallback = {
    randomUUID: () => {
      const bytes = Array.from({length: 16}, () => Math.floor(Math.random() * 256));
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = bytes.map(value => value.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
    },
  };
  try {
    Object.defineProperty(root, 'crypto', {configurable: true, value: fallback});
  } catch {
    // The host may expose a non-configurable global; the SDK will report its
    // native error in that environment instead of preventing app startup.
  }
}

export class SessionTokenStore implements AepTokenStore {
  static readonly STORAGE_KEY = 'zhiyuan.admin.session';
  readonly #memory = new MemoryTokenStore();

  async get() {
    const current = await this.#memory.get();
    if (current) return current;
    const raw = globalThis.sessionStorage?.getItem(SessionTokenStore.STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.refreshToken !== 'string') {
        return null;
      }
      await this.#memory.set(parsed);
      return parsed;
    } catch {
      await this.clear();
      return null;
    }
  }

  async set(tokens: Parameters<AepTokenStore['set']>[0]): Promise<void> {
    await this.#memory.set(tokens);
    globalThis.sessionStorage?.setItem(SessionTokenStore.STORAGE_KEY, JSON.stringify(tokens));
  }

  async clear(): Promise<void> {
    await this.#memory.clear();
    globalThis.sessionStorage?.removeItem(SessionTokenStore.STORAGE_KEY);
  }
}

function defaultBaseUrl(): string {
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

function pageCount(value: Page<unknown> | { items?: unknown[] }): number {
  return Array.isArray(value.items) ? value.items.length : 0;
}

function listCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown[] }).items)) {
    return (value as { items: unknown[] }).items.length;
  }
  if (value && typeof value === 'object' && Array.isArray((value as { models?: unknown[] }).models)) {
    return (value as { models: unknown[] }).models.length;
  }
  return 0;
}

function parseSkills(value: unknown): AdminSkill[] {
  const items = arrayFrom(value, 'skills');
  return items.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.name !== 'string') return [];
    const versions = Array.isArray(record.versions) ? record.versions.flatMap(version => {
      if (!version || typeof version !== 'object') return [];
      const item = version as Record<string, unknown>;
      if (typeof item.version !== 'string' || typeof item.state !== 'string' || typeof item.sha256 !== 'string' || typeof item.size !== 'number') return [];
      return [{ version: item.version, state: item.state as AdminSkillVersion['state'], sha256: item.sha256, size: item.size, ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}) }];
    }) : [];
    return [{
      id: record.id,
      name: record.name,
      ...(typeof record.description === 'string' ? { description: record.description } : {}),
      enabled: record.enabled !== false,
      versions,
    }];
  });
}

function parseAssignments(value: unknown): AdminSkillAssignment[] {
  return arrayFrom(value, 'items').flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const subject = record.subject;
    if (
      typeof record.id !== 'string' ||
      typeof record.skillId !== 'string' ||
      !subject ||
      typeof subject !== 'object' ||
      typeof (subject as Record<string, unknown>).type !== 'string' ||
      typeof (subject as Record<string, unknown>).id !== 'string'
    ) return [];
    const subjectType = (subject as Record<string, unknown>).type;
    const subjectId = (subject as Record<string, unknown>).id;
    if (typeof subjectType !== 'string' || typeof subjectId !== 'string') return [];
    return [{
      id: record.id,
      skillId: record.skillId,
      subjectType,
      subjectId,
    }];
  });
}

function arrayFrom(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const items = (value as Record<string, unknown>)[key];
  return Array.isArray(items) ? items : [];
}

function pendingEventCount(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const record = value as { items?: unknown[]; pending?: unknown };
  if (typeof record.pending === 'number') return record.pending;
  return Array.isArray(record.items)
    ? record.items.filter(item => {
        if (!item || typeof item !== 'object') return false;
        const state = (item as { state?: unknown }).state;
        return state === 'pending' || state === 'delivered';
      }).length
    : 0;
}
