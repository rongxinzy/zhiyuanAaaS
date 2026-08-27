import {
  AepClient,
  MemoryTokenStore,
  type AepTokenStore,
  type AdminAgent,
  type AdminModel,
  type ModelAssignment,
  type CurrentIdentity,
  type Page,
  type PlatformUser,
} from '@aep/sdk-node';

const ADMIN_AGENT_VERSION = '0.1.0';
const ADMIN_AGENT_STORAGE_KEY = 'zhiyuan.admin.agent-id';

export const AdminConsoleStatus = {
  SignedOut: 'signed-out',
  Authenticated: 'authenticated',
  Forbidden: 'forbidden',
} as const;
export type AdminConsoleStatus = (typeof AdminConsoleStatus)[keyof typeof AdminConsoleStatus];

export interface AdminOverview {
  readonly users: number;
  readonly agents: number;
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
}

export interface AdminSkillAssignment {
  readonly id: string;
  readonly skillId: string;
  readonly subjectType: string;
  readonly subjectId: string;
}

export interface AdminResources {
  readonly users: readonly PlatformUser[];
  readonly agents: readonly AdminAgent[];
  readonly skills: readonly AdminSkill[];
  readonly assignments: readonly AdminSkillAssignment[];
}

export interface AdminModels {
  readonly models: readonly AdminModel[];
  readonly assignments: readonly ModelAssignment[];
}

export class AdminConsoleClient {
  readonly #baseUrl: string;
  readonly #tokenStore: AepTokenStore;
  #client: AepClient | null = null;

  constructor(baseUrl = defaultBaseUrl(), tokenStore?: AepTokenStore) {
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
    readonly enterpriseId: string;
    readonly username: string;
    readonly password: string;
  }): Promise<AdminSession> {
    const client = this.#getClient();
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
    const [users, agents, skills, models, events] = await Promise.all([
      client.listUsers(),
      client.listAgents(),
      client.listSkills(),
      client.listAdminModels(),
      client.searchEvents({ limit: 100 }),
    ]);
    return {
      users: pageCount(users),
      agents: pageCount(agents),
      skills: listCount(skills),
      models: listCount(models),
      pendingEvents: pendingEventCount(events),
    };
  }

  async resources(): Promise<AdminResources> {
    const client = this.#requireClient();
    const [users, agents, skills, assignments] = await Promise.all([
      client.listUsers(),
      client.listAgents(),
      client.listSkills(),
      client.listSkillAssignments(),
    ]);
    return {
      users: users.items,
      agents: agents.items,
      skills: parseSkills(skills),
      assignments: parseAssignments(assignments),
    };
  }

  async updateUser(userId: string, input: { readonly status: 'active' | 'disabled' }): Promise<void> {
    await this.#requireClient().updateUser(userId, input);
  }

  async updateSkill(skillId: string, input: { readonly enabled: boolean }): Promise<void> {
    await this.#requireClient().updateSkill(skillId, input);
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

  async deleteModelAssignment(assignmentId: string): Promise<void> {
    await this.#requireClient().deleteModelAssignment(assignmentId);
  }

  #getClient(): AepClient {
    if (!this.#client) {
      this.#client = new AepClient({
        baseUrl: this.#baseUrl,
        agentId: adminAgentId(),
        agentVersion: ADMIN_AGENT_VERSION,
        platform: platform(),
        tokenStore: this.#tokenStore,
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
    const hasAdminRole = identity.roles.some(role =>
      ['admin', 'enterprise_admin', 'enterprise-admin'].includes(role.toLowerCase()),
    );
    return hasAdminRole
      ? { status: AdminConsoleStatus.Authenticated, identity }
      : { status: AdminConsoleStatus.Forbidden, identity };
  }
}

function adminAgentId(): string {
  const existing = globalThis.sessionStorage?.getItem(ADMIN_AGENT_STORAGE_KEY);
  if (existing && /^[a-zA-Z0-9._:-]{8,128}$/.test(existing)) return existing;
  const generated = `zhiyuan-admin-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
  globalThis.sessionStorage?.setItem(ADMIN_AGENT_STORAGE_KEY, generated);
  return generated;
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
  return env?.VITE_AEP_BASE_URL ?? 'http://localhost:8080';
}

function platform(): 'windows' | 'macos' | 'linux' {
  return 'linux';
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
    return [{
      id: record.id,
      name: record.name,
      ...(typeof record.description === 'string' ? { description: record.description } : {}),
      enabled: record.enabled !== false,
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
