import {
  type AdminControlEvent,
  type AdminModel,
  type AdminModelList,
  AEP_PROTOCOL_VERSION,
  AepClient,
  type AepTokenStore,
  type AepTokens,
  type CredentialAssignment,
  type CredentialAssignmentWrite,
  type CredentialCreate,
  type CredentialList,
  type CredentialMetadata,
  type CredentialPatch,
  type CredentialRotate,
  type CurrentIdentity,
  type DataPlaneDesiredState,
  type DataPlaneDesiredStateWrite,
  type DataPlaneRoute,
  type DataPlaneStatus,
  FetchTransport,
  HttpMethod,
  type JsonObject,
  type JsonValue,
  type License,
  type LicenseImportRequest,
  MemoryTokenStore,
  type ModelAssignment,
  type Permission,
  type PlatformUser,
  type Query,
  type Role,
  type ServiceMetadata,
  type Team,
} from '@aep/sdk-node';
import type {
  GatewayCapabilities,
  GatewayHealth,
  GatewayLimit,
  GatewayLimitPage,
  GatewayLimitPublication,
  GatewayLimitStatus,
  GatewayLimitWrite,
  GatewayMetricQuery,
  GatewayMetricResult,
  GatewayNativeResult,
  GatewayQuota,
  GatewayRequestQuery,
  GatewayTestAccess,
} from './gateway-api.js';

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

export interface AdminSkill {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly state: 'active' | 'withdrawn';
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
  /** ISO expiry. null = a perpetual grant; undefined = the server reported none. */
  readonly expiresAt?: string | null | undefined;
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

export interface AdminSessionClient {
  readonly name: string;
  readonly version?: string;
  readonly deviceId?: string;
}

export interface AdminUserSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly topic: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly revokedAt?: string | null;
  // Self-reported or User-Agent-derived client identity recorded at login;
  // absent entirely on servers predating the field, null when unknown.
  readonly client?: AdminSessionClient | null;
}

export interface AdminCredentials {
  readonly credentials: readonly CredentialMetadata[];
  readonly assignments: readonly CredentialAssignment[];
}

export interface AdminDataPlaneRouteMismatch {
  readonly modelId: string;
  readonly fields: readonly string[];
}

// Drift between the route set the model catalog would publish and the routes
// currently stored as desired state.
export interface AdminDataPlaneCatalogComparison {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly mismatched: readonly AdminDataPlaneRouteMismatch[];
}

// The SDK now carries catalogComparison on DataPlaneStatus; Omit keeps the
// local readonly collection shape instead of intersecting with it. The field
// is absent only in responses predating catalogComparison.
export type AdminDataPlaneStatus = Omit<DataPlaneStatus, 'catalogComparison'> & {
  readonly catalogComparison?: AdminDataPlaneCatalogComparison;
};

export interface AdminDataPlane {
  readonly desired: DataPlaneDesiredState;
  readonly status: AdminDataPlaneStatus;
}

export const AdminDeploymentSettingSource = {
  Override: 'override',
  Env: 'env',
  Unset: 'unset',
} as const;
export type AdminDeploymentSettingSource =
  (typeof AdminDeploymentSettingSource)[keyof typeof AdminDeploymentSettingSource];

export interface AdminDeploymentSettingValue {
  readonly override: string | null;
  readonly effectiveValue: string | null;
  readonly source: AdminDeploymentSettingSource;
}

export interface AdminDeploymentSettings {
  readonly modelGatewayBaseUrl: AdminDeploymentSettingValue;
}

// Omitted fields stay unchanged; an explicit null clears the runtime override
// so the environment-configured value applies again.
export interface AdminDeploymentSettingsUpdate {
  readonly modelGatewayBaseUrl?: string | null;
}

export const AdminModelGatewayUrlProblem = {
  Invalid: 'invalid',
  ClusterInternal: 'cluster-internal',
} as const;
export type AdminModelGatewayUrlProblem =
  (typeof AdminModelGatewayUrlProblem)[keyof typeof AdminModelGatewayUrlProblem];

// Client-side pre-check for the model gateway override, mirroring the
// write-time server rule family: an absolute http/https URL whose hostname is
// neither cluster-internal nor a single-label bare hostname. Loopback depends
// on the deployment environment and stays a server-side judgment.
export function modelGatewayBaseUrlProblem(value: string): AdminModelGatewayUrlProblem | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return AdminModelGatewayUrlProblem.Invalid;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return AdminModelGatewayUrlProblem.Invalid;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return AdminModelGatewayUrlProblem.Invalid;
  const host = parsed.hostname.replace(/\.$/, '').toLowerCase();
  if (!host) return AdminModelGatewayUrlProblem.Invalid;
  // IP literals (IPv4, or bracketed IPv6 per URL hostname) skip the
  // hostname rules, as the server does.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return null;
  if (!host.includes('.') || host === 'svc.cluster.local' || host.endsWith('.svc.cluster.local')) {
    return AdminModelGatewayUrlProblem.ClusterInternal;
  }
  return null;
}

export const AdminIdentitySourceKind = {
  Directory: 'directory',
  Ldap: 'ldap',
  Oidc: 'oidc',
} as const;
export type AdminIdentitySourceKind = (typeof AdminIdentitySourceKind)[keyof typeof AdminIdentitySourceKind];

export const AdminIdentityMappingStatus = {
  Active: 'active',
  Disabled: 'disabled',
} as const;
export type AdminIdentityMappingStatus = (typeof AdminIdentityMappingStatus)[keyof typeof AdminIdentityMappingStatus];

export const AdminIdentitySubjectType = {
  User: 'user',
  Team: 'team',
} as const;
export type AdminIdentitySubjectType = (typeof AdminIdentitySubjectType)[keyof typeof AdminIdentitySubjectType];

export interface AdminIdentitySource {
  readonly id: string;
  readonly kind: AdminIdentitySourceKind | string;
  readonly displayName: string;
  readonly enabled: boolean;
}

export interface AdminIdentitySourcePage {
  readonly items: readonly AdminIdentitySource[];
  readonly nextCursor: string | null;
}

export interface AdminIdentityMapping {
  readonly sourceId: string;
  readonly externalSubjectType: AdminIdentitySubjectType | string;
  readonly externalId: string;
  readonly localSubjectId: string;
  readonly status: AdminIdentityMappingStatus | string;
}

export interface AdminIdentityMappingPage {
  readonly items: readonly AdminIdentityMapping[];
  readonly nextCursor: string | null;
}

export interface AdminIdentitySourceCreate {
  readonly kind: AdminIdentitySourceKind;
  readonly displayName: string;
}

export interface AdminIdentityMappingWrite {
  readonly externalSubjectType: AdminIdentitySubjectType;
  readonly externalId: string;
  readonly localSubjectId: string;
}

export interface AdminEventRecord {
  readonly eventId?: string;
  readonly type?: string;
  readonly userId?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly result?: string;
  readonly scopeType?: string;
  readonly scopeId?: string;
  readonly receivedAt?: string;
  readonly createdAt?: string;
}

export interface AdminEventPage {
  readonly items: readonly AdminEventRecord[];
  readonly nextCursor: string | null;
}

export interface AdminAuthenticationAuditRecord {
  readonly cursor: string;
  readonly userId?: string;
  readonly eventType: string;
  readonly outcome: string;
  readonly reason?: string;
  readonly sourceHash?: string;
  readonly createdAt?: string;
}

export interface AdminAuthenticationAuditPage {
  readonly items: readonly AdminAuthenticationAuditRecord[];
  readonly nextCursor: string | null;
}

export interface AuthenticationAuditFilters {
  readonly eventType?: string;
  readonly outcome?: string;
  readonly userId?: string;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface AdminDeliveryRecord {
  readonly deliveryId: string;
  readonly eventId: string;
  readonly sessionId?: string | null;
  readonly state: string;
  readonly attemptCount?: number;
  readonly createdAt?: string;
  readonly receivedAt?: string | null;
  readonly completedAt?: string | null;
  readonly updatedAt?: string;
  readonly errorCode?: string | null;
  readonly message?: string | null;
}

export interface AdminDeliveryPage {
  readonly items: readonly AdminDeliveryRecord[];
  readonly nextCursor: string | null;
}

export interface AdminControlEvents {
  readonly items: readonly AdminControlEvent[];
  readonly nextCursor: string | null;
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

export class AdminConsoleClient {
  readonly #baseUrl: string;
  readonly #tokenStore: AepTokenStore;
  readonly #transport: AepTransportLike;
  #client: AepClient | null = null;
  #deploymentId: string | null = null;
  #sessionId: string | null = null;

  constructor(baseUrl = defaultBaseUrl(), tokenStore?: AepTokenStore) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#tokenStore = tokenStore ?? new SessionTokenStore();
    this.#transport = new FetchTransport({ fetch: runtimeFetch() }) as unknown as AepTransportLike;
  }

  // The session the console itself is signed in with, captured from the login
  // or restore token response. It survives access-token refreshes unchanged,
  // so pages can compare it against the admin session list.
  get sessionId(): string | null {
    return this.#sessionId;
  }

  async restore(): Promise<AdminSession> {
    const client = this.#getClient();
    const tokens = await client.restoreSession();
    if (!tokens) return { status: AdminConsoleStatus.SignedOut };
    this.#sessionId = tokens.sessionId ?? null;
    return this.#identitySession(client);
  }

  async login(input: { readonly username: string; readonly password: string }): Promise<AdminSession> {
    const client = this.#getClient();
    const deploymentId = await this.#resolveDeploymentId(client);
    this.#deploymentId = deploymentId;
    const tokens = await client.loginWithPassword({ ...input, deploymentId });
    this.#sessionId = tokens.sessionId ?? null;
    return this.#identitySession(client);
  }

  async logout(): Promise<void> {
    if (this.#client) await this.#client.logout().catch(() => undefined);
    await this.#tokenStore.clear();
    this.#client = null;
    this.#sessionId = null;
  }

  // Digital-employee portal calls carry the same bearer, and the portal
  // /chat entry link hands the raw token over in a URL fragment. The store
  // is memory-only, so this returns null once signed out.
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.#tokenStore.get();
    return tokens?.accessToken ?? null;
  }

  async overview(identity?: AdminIdentity): Promise<AdminOverview> {
    const client = this.#requireClient();
    const results = await Promise.all(
      [
        hasAdminPermission(identity, AdminPermission.UsersRead) ? this.#listAllUsers(client) : Promise.resolve(null),
        hasAdminPermission(identity, AdminPermission.TeamsRead) ? this.#listAllTeams(client) : Promise.resolve(null),
        hasAdminPermission(identity, AdminPermission.SkillsRead) ? this.#listAllSkills(client) : Promise.resolve(null),
        hasAdminPermission(identity, AdminPermission.ModelsRead) ? this.#listAllModels(client) : Promise.resolve(null),
        hasAdminPermission(identity, AdminPermission.EventsRead)
          ? client.searchEvents({ limit: 100 })
          : Promise.resolve(null),
      ].map((request) =>
        request.then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
      ),
    );
    const failed: AdminOverviewMetric[] = [];
    const valueAt = <T>(index: number, metric: AdminOverviewMetric): T | null => {
      const result = results[index]!;
      if (!result.ok) {
        failed.push(metric);
        return null;
      }
      return result.value as T | null;
    };
    const users = valueAt<readonly PlatformUser[]>(0, AdminOverviewMetric.Users);
    const teams = valueAt<readonly Team[]>(1, AdminOverviewMetric.Teams);
    const skills = valueAt<JsonObject>(2, AdminOverviewMetric.Skills);
    const models = valueAt<AdminModelList>(3, AdminOverviewMetric.Models);
    const events = valueAt<JsonObject>(4, AdminOverviewMetric.PendingEvents);
    return {
      users: users ? users.length : null,
      teams: teams ? teams.length : null,
      skills: skills ? listCount(skills) : null,
      models: models ? listCount(models) : null,
      pendingEvents: events ? pendingEventCount(events) : null,
      ...(failed.length ? { failed } : {}),
    };
  }

  async resources(identity?: AdminIdentity): Promise<AdminResources> {
    const client = this.#requireClient();
    const [users, teams, roles, permissions, skills, assignments] = await Promise.all([
      hasAdminPermission(identity, AdminPermission.UsersRead) ? this.#listAllUsers(client) : Promise.resolve([]),
      hasAdminPermission(identity, AdminPermission.TeamsRead) ? this.#listAllTeams(client) : Promise.resolve([]),
      hasAdminPermission(identity, AdminPermission.RolesRead) ? this.#listAllRoles(client) : Promise.resolve([]),
      hasAdminPermission(identity, AdminPermission.RolesRead)
        ? client.listPermissions()
        : Promise.resolve({ permissions: [] }),
      hasAdminPermission(identity, AdminPermission.SkillsRead)
        ? this.#listAllSkills(client)
        : Promise.resolve({ skills: [] }),
      hasAdminPermission(identity, AdminPermission.SkillsAssign)
        ? client.listSkillAssignments()
        : Promise.resolve({ items: [] }),
    ]);
    return {
      users,
      teams,
      roles,
      permissions: permissions.permissions,
      skills: parseSkills(skills),
      assignments: parseAssignments(assignments),
    };
  }

  async users(): Promise<readonly PlatformUser[]> {
    return this.#listAllUsers(this.#requireClient());
  }

  /** Full skill catalog (cursor-paged), parsed like the overview path. */
  async skills(): Promise<readonly AdminSkill[]> {
    return parseSkills(await this.#listAllSkills(this.#requireClient()));
  }

  // All AEP teams, cursor-paginated. The portal validates employee teams
  // against AEP (not its own department records), so employee forms must
  // offer this list — portal departments alone hide teams like rd-dept
  // that were created directly in AEP.
  async teams(): Promise<readonly Team[]> {
    return this.#listAllTeams(this.#requireClient());
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

  async resetUserPassword(
    userId: string,
    input: { readonly temporaryPassword: string; readonly requirePasswordChange: boolean },
  ): Promise<void> {
    await this.#requireClient().resetUserPassword(userId, input);
  }

  // Self-service change on a restricted (passwordChangeRequired) session. The
  // pinned SDK release still requires a current password, so this call goes
  // through the handwritten transport path (see #request); the rotated tokens
  // are stored by hand before the identity is reloaded.
  async changePassword(input: { readonly newPassword: string }): Promise<AdminSession> {
    const client = this.#requireClient();
    const tokens = await this.#request<AepTokens>(client, {
      method: HttpMethod.Post,
      path: '/aep/v1/auth/password/change',
      body: { newPassword: input.newPassword },
    });
    await this.#tokenStore.set(tokens);
    this.#sessionId = tokens.sessionId ?? null;
    return this.#identitySession(client);
  }

  async replaceUserRBAC(
    userId: string,
    input: { readonly roleIds: readonly string[]; readonly teamIds: readonly string[] },
  ): Promise<void> {
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

  async createSkill(input: {
    readonly name: string;
    readonly description: string;
    readonly enabled?: boolean;
  }): Promise<string> {
    const { enabled, ...write } = input;
    const created = await this.#requireClient().createSkill(write);
    // The SDK returns the created skill as an untyped JSON object; the id is
    // server-generated from the name.
    const skillId = String((created as { id?: unknown }).id ?? '');
    if (enabled === false) await this.#requireClient().updateSkill(skillId, { state: 'withdrawn' });
    return skillId;
  }

  async updateSkill(
    skillId: string,
    input: { readonly name?: string; readonly description?: string; readonly enabled?: boolean },
  ): Promise<void> {
    const { enabled, ...patch } = input;
    await this.#requireClient().updateSkill(skillId, {
      ...patch,
      ...(enabled === undefined ? {} : { state: enabled ? 'active' : 'withdrawn' }),
    });
  }

  // The pinned SDK release predates the force query parameter, so the delete
  // goes through the same handwritten transport path as the other newer admin
  // endpoints (see #request).
  async deleteSkill(skillId: string, force = false): Promise<void> {
    await this.#request<null>(this.#requireClient(), {
      method: HttpMethod.Delete,
      path: `/aep/v1/admin/skills/${segment(skillId)}${force ? '?force=true' : ''}`,
      responseType: 'empty',
    });
  }

  async uploadSkillVersion(skillId: string, version: string, archive: Uint8Array): Promise<void> {
    await this.#requireClient().uploadSkillVersion(skillId, version, archive);
  }

  async publishSkillVersion(skillId: string, version: string): Promise<void> {
    await this.#requireClient().publishSkillVersion(skillId, version);
  }

  async deleteSkillVersion(skillId: string, version: string): Promise<void> {
    await this.#requireClient().deleteSkillVersion(skillId, version);
  }

  async createSkillAssignment(input: {
    readonly skillId: string;
    readonly subject: AdminAssignmentSubject;
    readonly expiresAt?: string | null;
  }): Promise<void> {
    await this.#requireClient().createSkillAssignment({
      skillId: input.skillId,
      subject: { type: input.subject.type, id: input.subject.id },
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    });
  }

  async deleteSkillAssignment(assignmentId: string): Promise<void> {
    await this.#requireClient().deleteSkillAssignment(assignmentId);
  }

  async models(identity?: AdminIdentity): Promise<AdminModels> {
    const client = this.#requireClient();
    const [models, assignments] = await Promise.all([
      this.#listAllModels(client),
      hasAdminPermission(identity, AdminPermission.ModelsAssign)
        ? client.listModelAssignments()
        : Promise.resolve({ assignments: [] }),
    ]);
    return { models: models.models, assignments: assignments.assignments };
  }

  async createModel(input: Parameters<AepClient['createModel']>[0]): Promise<void> {
    await this.#requireClient().createModel(input);
  }

  async gatewaySubjects(identity?: AdminIdentity) {
    const client = this.#requireClient();
    const [models, users, teams, roles] = await Promise.all([
      hasAdminPermission(identity, AdminPermission.ModelsRead) ? this.#listAllModels(client) : { models: [] },
      hasAdminPermission(identity, AdminPermission.UsersRead) ? this.#listAllUsers(client) : [],
      hasAdminPermission(identity, AdminPermission.TeamsRead) ? this.#listAllTeams(client) : [],
      hasAdminPermission(identity, AdminPermission.RolesRead) ? this.#listAllRoles(client) : [],
    ]);
    return { models: models.models, users, teams, roles };
  }

  getGatewayCapabilities(): Promise<GatewayCapabilities> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Get,
      path: '/aep/v1/admin/model-gateway/capabilities',
    });
  }
  queryGatewayMetrics(input: GatewayMetricQuery): Promise<GatewayMetricResult> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Get,
      path: `/aep/v1/admin/model-gateway/metrics?${identityQuery({ ...input })}`,
    });
  }
  getGatewayMonitoringHealth(): Promise<GatewayHealth> {
    return this.#request(this.#requireClient(), { method: HttpMethod.Get, path: '/aep/v1/admin/model-gateway/health' });
  }
  searchGatewayRequests(input: GatewayRequestQuery): Promise<GatewayNativeResult> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Get,
      path: `/aep/v1/admin/model-gateway/requests?${identityQuery({ ...input })}`,
    });
  }
  getGatewayRequest(requestId: string, input: GatewayRequestQuery): Promise<GatewayNativeResult> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Get,
      path: `/aep/v1/admin/model-gateway/requests/${encodeURIComponent(requestId)}?${identityQuery({ ...input })}`,
    });
  }
  listGatewayLimits(): Promise<GatewayLimitPage> {
    return this.#request(this.#requireClient(), { method: HttpMethod.Get, path: '/aep/v1/admin/model-gateway/limits' });
  }
  putGatewayLimit(ruleId: string, input: GatewayLimitWrite): Promise<GatewayLimit> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Put,
      path: `/aep/v1/admin/model-gateway/limits/${encodeURIComponent(ruleId)}`,
      body: { ...input },
    });
  }
  deleteGatewayLimit(ruleId: string, expectedVersion: number): Promise<void> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Delete,
      path: `/aep/v1/admin/model-gateway/limits/${encodeURIComponent(ruleId)}?${identityQuery({ expectedVersion })}`,
      responseType: 'empty',
    });
  }
  publishGatewayLimits(): Promise<GatewayLimitPublication> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Post,
      path: '/aep/v1/admin/model-gateway/limits/publish',
    });
  }
  getGatewayLimitsStatus(): Promise<GatewayLimitStatus> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Get,
      path: '/aep/v1/admin/model-gateway/limits/status',
    });
  }
  getGatewayQuota(userId: string): Promise<GatewayQuota> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Get,
      path: `/aep/v1/admin/model-gateway/quotas/${encodeURIComponent(userId)}`,
    });
  }
  refreshGatewayQuota(userId: string, quota: number): Promise<GatewayQuota> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Post,
      path: `/aep/v1/admin/model-gateway/quotas/${encodeURIComponent(userId)}/refresh`,
      body: { quota },
    });
  }
  changeGatewayQuota(userId: string, value: number): Promise<GatewayQuota> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Post,
      path: `/aep/v1/admin/model-gateway/quotas/${encodeURIComponent(userId)}/delta`,
      body: { value },
    });
  }
  createGatewayTestAccess(modelId: string): Promise<GatewayTestAccess> {
    return this.#request(this.#requireClient(), {
      method: HttpMethod.Post,
      path: `/aep/v1/admin/model-gateway/models/${encodeURIComponent(modelId)}/test-access`,
    });
  }

  async updateModel(modelId: string, input: Parameters<AepClient['updateModel']>[1]): Promise<void> {
    await this.#requireClient().updateModel(modelId, input);
  }

  async deleteModel(modelId: string): Promise<void> {
    await this.#requireClient().deleteModel(modelId);
  }

  async createModelAssignment(input: {
    readonly modelId: string;
    readonly subject: AdminModelAssignmentSubject;
  }): Promise<void> {
    await this.#requireClient().createModelAssignment({
      modelId: input.modelId,
      subject: { type: input.subject.type, id: input.subject.id },
    });
  }

  async deleteModelAssignment(assignmentId: string): Promise<void> {
    await this.#requireClient().deleteModelAssignment(assignmentId);
  }

  async licenses(): Promise<readonly License[]> {
    const client = this.#requireClient();
    const licenses: License[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await client.listLicenses({ ...(cursor ? { cursor } : {}), limit: 200 });
      licenses.push(...page.items);
      const nextCursor = page.nextCursor ?? null;
      if (!nextCursor || nextCursor === cursor) return licenses;
      cursor = nextCursor;
    }
  }

  async importLicense(input: LicenseImportRequest): Promise<License> {
    return this.#requireClient().importLicense(input);
  }

  async revokeLicense(licenseId: string): Promise<void> {
    await this.#requireClient().revokeLicense(licenseId);
  }

  async revokeUserSession(sessionId: string): Promise<void> {
    await this.#requireClient().revokeUserSession(sessionId);
  }

  async sessions(userId?: string): Promise<readonly AdminUserSession[]> {
    const client = this.#requireClient();
    const sessions: AdminUserSession[] = [];
    let cursor: string | undefined;
    for (;;) {
      const result = await client.listUserSessions({
        ...(userId ? { userId } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 200,
      } satisfies Query);
      const items = arrayFrom(result, 'items');
      sessions.push(...parseSessions(items));
      const nextCursor = valueString(result, 'nextCursor');
      if (!nextCursor || nextCursor === cursor) return sessions;
      cursor = nextCursor;
    }
  }

  async credentials(identity?: AdminIdentity): Promise<AdminCredentials> {
    const client = this.#requireClient();
    const [credentials, assignments] = await Promise.all([
      this.#listAllCredentials(client),
      hasAdminPermission(identity, AdminPermission.CredentialsAssign)
        ? client.listCredentialAssignments()
        : Promise.resolve({ assignments: [] }),
    ]);
    return {
      credentials: credentials.credentials,
      assignments: assignments.assignments,
    };
  }

  async createCredential(input: CredentialCreate): Promise<CredentialMetadata> {
    return this.#requireClient().createCredential(input);
  }

  async updateCredential(credentialId: string, input: CredentialPatch): Promise<CredentialMetadata> {
    return this.#requireClient().updateCredential(credentialId, input);
  }

  async rotateCredential(credentialId: string, input: CredentialRotate): Promise<CredentialMetadata> {
    return this.#requireClient().rotateCredential(credentialId, input);
  }

  async deleteCredential(credentialId: string): Promise<void> {
    await this.#requireClient().deleteCredential(credentialId);
  }

  async createCredentialAssignment(input: CredentialAssignmentWrite): Promise<CredentialAssignment> {
    return this.#requireClient().createCredentialAssignment(input);
  }

  async deleteCredentialAssignment(assignmentId: string): Promise<void> {
    await this.#requireClient().deleteCredentialAssignment(assignmentId);
  }

  async dataPlane(): Promise<AdminDataPlane> {
    const client = this.#requireClient();
    const [desired, status] = await Promise.all([
      client.getDataPlaneDesiredState(),
      // The pinned SDK release predates the catalogComparison field on the
      // data-plane status, so the status read goes through the same
      // handwritten transport path as the publish endpoint (see #request).
      this.#request<JsonObject>(client, {
        method: HttpMethod.Get,
        path: '/aep/v1/admin/data-plane/status',
      }).then(parseDataPlaneStatus),
    ]);
    return { desired, status };
  }

  // The pinned SDK release predates the catalog-derived publish endpoint:
  // the server derives gateway routes from the model catalog and atomically
  // replaces the desired state (see #request for the handwritten precedent).
  async publishDataPlaneRoutes(input?: { readonly revision?: string }): Promise<DataPlaneDesiredState> {
    const revision = input?.revision?.trim();
    const desired = await this.#request<JsonObject>(this.#requireClient(), {
      method: HttpMethod.Post,
      path: '/aep/v1/admin/data-plane/publish',
      body: revision ? { revision } : {},
    });
    return parseDataPlaneDesiredState(desired);
  }

  async putDataPlane(input: DataPlaneDesiredStateWrite): Promise<DataPlaneDesiredState> {
    return this.#requireClient().putDataPlaneDesiredState(input);
  }

  // The pinned SDK release predates the deployment-settings admin endpoints,
  // so these calls go through the same handwritten transport path as the
  // identity-sources endpoints above (see #request).
  async deploymentSettings(): Promise<AdminDeploymentSettings> {
    const settings = await this.#request<JsonObject>(this.#requireClient(), {
      method: HttpMethod.Get,
      path: '/aep/v1/admin/deployment/settings',
    });
    return parseDeploymentSettings(settings);
  }

  async updateDeploymentSettings(input: AdminDeploymentSettingsUpdate): Promise<AdminDeploymentSettings> {
    const body: JsonObject = {};
    if ('modelGatewayBaseUrl' in input) body.modelGatewayBaseUrl = input.modelGatewayBaseUrl ?? null;
    const settings = await this.#request<JsonObject>(this.#requireClient(), {
      method: HttpMethod.Put,
      path: '/aep/v1/admin/deployment/settings',
      body,
    });
    return parseDeploymentSettings(settings);
  }

  async identitySources(): Promise<AdminIdentitySourcePage> {
    const client = this.#requireClient();
    const items: AdminIdentitySource[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.#request<JsonObject>(client, {
        method: HttpMethod.Get,
        path: `/aep/v1/admin/identity-sources?${identityQuery({ cursor, limit: 200 })}`,
      });
      items.push(...parseIdentitySources(page));
      const nextCursor = valueString(page, 'nextCursor');
      if (!nextCursor || nextCursor === cursor) return { items, nextCursor: null };
      cursor = nextCursor;
    }
  }

  async createIdentitySource(input: AdminIdentitySourceCreate): Promise<AdminIdentitySource> {
    const source = await this.#request<JsonObject>(this.#requireClient(), {
      method: HttpMethod.Post,
      path: '/aep/v1/admin/identity-sources',
      body: { kind: input.kind, displayName: input.displayName, config: {} },
    });
    return parseIdentitySource(source);
  }

  async identityMappings(sourceId: string): Promise<AdminIdentityMappingPage> {
    const client = this.#requireClient();
    const items: AdminIdentityMapping[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.#request<JsonObject>(client, {
        method: HttpMethod.Get,
        path: `/aep/v1/admin/identity-sources/${segment(sourceId)}/mappings?${identityQuery({ subjectType: AdminIdentitySubjectType.User, cursor, limit: 200 })}`,
      });
      items.push(...parseIdentityMappings(page, sourceId));
      const nextCursor = valueString(page, 'nextCursor');
      if (!nextCursor || nextCursor === cursor) return { items, nextCursor: null };
      cursor = nextCursor;
    }
  }

  async upsertIdentityMapping(sourceId: string, input: AdminIdentityMappingWrite): Promise<void> {
    await this.#request<JsonObject>(this.#requireClient(), {
      method: HttpMethod.Put,
      path: `/aep/v1/admin/identity-sources/${segment(sourceId)}/mappings`,
      body: {
        externalSubjectType: input.externalSubjectType,
        externalId: input.externalId,
        localSubjectId: input.localSubjectId,
      },
    });
  }

  async deleteIdentityMapping(sourceId: string, externalId: string): Promise<void> {
    await this.#request<null>(this.#requireClient(), {
      method: HttpMethod.Delete,
      responseType: 'empty',
      path: `/aep/v1/admin/identity-sources/${segment(sourceId)}/mappings/${AdminIdentitySubjectType.User}/${segment(externalId)}`,
    });
  }

  async importUsers(input: JsonObject): Promise<Record<string, unknown>> {
    const deploymentId = this.#deploymentId;
    if (!deploymentId) throw new Error('The deployment identity is unavailable.');
    return this.#requireClient().importUsers({ ...input, deploymentId }) as Promise<Record<string, unknown>>;
  }

  async controlEvents(filters?: Query): Promise<AdminControlEvents> {
    const result = await this.#requireClient().listAdminControlEvents(filters);
    return { items: result.items, nextCursor: result.nextCursor };
  }

  async getControlEvent(eventId: string): Promise<AdminControlEvent> {
    return this.#requireClient().getAdminControlEvent(eventId);
  }

  async cancelControlEvent(eventId: string): Promise<AdminControlEvent> {
    return this.#requireClient().cancelControlEvent(eventId);
  }

  async publishControlEvent(input: JsonObject): Promise<Record<string, unknown>> {
    return this.#requireClient().createControlEvent(input) as Promise<Record<string, unknown>>;
  }

  async deliverySummary(eventId: string, filters?: Query): Promise<AdminDeliveryPage> {
    const result = await this.#requireClient().listControlEventDeliveries(eventId, filters);
    const items = Array.isArray(result.items)
      ? result.items.flatMap((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
          const record = item as Record<string, unknown>;
          if (
            typeof record.deliveryId !== 'string' ||
            typeof record.eventId !== 'string' ||
            typeof record.state !== 'string'
          )
            return [];
          return [record as unknown as AdminDeliveryRecord];
        })
      : [];
    return { items, nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : null };
  }

  async searchAudit(filters?: Query): Promise<AdminEventPage> {
    const result = await this.#requireClient().searchEvents(filters);
    const items = arrayFrom(result, 'items').flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      return [
        {
          ...(typeof record.eventId === 'string' ? { eventId: record.eventId } : {}),
          ...(typeof record.type === 'string' ? { type: record.type } : {}),
          ...(typeof record.userId === 'string' ? { userId: record.userId } : {}),
          ...(typeof record.resourceType === 'string' ? { resourceType: record.resourceType } : {}),
          ...(typeof record.resourceId === 'string' ? { resourceId: record.resourceId } : {}),
          ...(typeof record.result === 'string' ? { result: record.result } : {}),
          ...(typeof record.scopeType === 'string' ? { scopeType: record.scopeType } : {}),
          ...(typeof record.scopeId === 'string' ? { scopeId: record.scopeId } : {}),
          ...(typeof record.receivedAt === 'string' ? { receivedAt: record.receivedAt } : {}),
          ...(typeof record.createdAt === 'string' ? { createdAt: record.createdAt } : {}),
        },
      ];
    });
    return { items, nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : null };
  }

  async searchAuthenticationAudit(filters?: AuthenticationAuditFilters): Promise<AdminAuthenticationAuditPage> {
    const result = await this.#request<JsonObject>(this.#requireClient(), {
      method: HttpMethod.Get,
      path: `/aep/v1/admin/audit/authentication?${identityQuery({ ...filters })}`,
    });
    const items = arrayFrom(result, 'items').flatMap((item) => {
      if (!isRecord(item)) return [];
      const record = item as Record<string, unknown>;
      if (
        typeof record.cursor !== 'string' ||
        typeof record.eventType !== 'string' ||
        typeof record.outcome !== 'string'
      ) {
        return [];
      }
      return [
        {
          cursor: record.cursor,
          eventType: record.eventType,
          outcome: record.outcome,
          ...(typeof record.userId === 'string' ? { userId: record.userId } : {}),
          ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
          ...(typeof record.sourceHash === 'string' ? { sourceHash: record.sourceHash } : {}),
          ...(typeof record.createdAt === 'string' ? { createdAt: record.createdAt } : {}),
        },
      ];
    });
    return { items, nextCursor: valueString(result, 'nextCursor') };
  }

  #getClient(): AepClient {
    if (!this.#client) {
      this.#client = new AepClient({
        baseUrl: this.#baseUrl,
        tokenStore: this.#tokenStore,
        transport: this.#transport as never,
      });
    }
    return this.#client;
  }

  #requireClient(): AepClient {
    if (!this.#client) throw new Error('Admin console is not authenticated.');
    return this.#client;
  }

  // The console is deployed against a single AEP deployment, so the login
  // form never asks for a deployment ID; the server metadata names it.
  async #resolveDeploymentId(client: AepClient): Promise<string> {
    let metadata: ServiceMetadata;
    try {
      metadata = await client.getMetadata();
    } catch (error) {
      throw new AdminMetadataError('AEP server metadata could not be retrieved.', { cause: error });
    }
    const deploymentId = metadata.deploymentId ?? metadata.deployment?.id;
    if (!deploymentId) {
      throw new AdminMetadataError('AEP server metadata did not include a deployment ID.');
    }
    return deploymentId;
  }

  // The pinned SDK release predates the identity-sources admin endpoints, so
  // these calls go through the SDK transport directly. This keeps the session
  // headers, bearer auth, 401 refresh retry, and RFC 9457 problem parsing
  // identical to every other request the console makes.
  async #request<T>(
    client: AepClient,
    request: {
      readonly method: (typeof HttpMethod)[keyof typeof HttpMethod];
      readonly path: string;
      readonly body?: JsonObject;
      readonly responseType?: 'json' | 'empty';
    },
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-AEP-Protocol-Version': AEP_PROTOCOL_VERSION,
    };
    const tokens = await this.#tokenStore.get();
    if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
    let response = await this.#transport.request<T>(this.#baseUrl, {
      method: request.method,
      path: request.path,
      headers,
      ...(request.body ? { body: request.body } : {}),
      ...(request.responseType === 'empty' ? { responseType: 'empty' as const } : {}),
    });
    if (response.status === 401 && tokens) {
      const refreshed = await client.refreshSession();
      headers.Authorization = `Bearer ${refreshed.accessToken}`;
      response = await this.#transport.request<T>(this.#baseUrl, {
        method: request.method,
        path: request.path,
        headers,
        ...(request.body ? { body: request.body } : {}),
        ...(request.responseType === 'empty' ? { responseType: 'empty' as const } : {}),
      });
    }
    if (response.status < 200 || response.status >= 300) {
      throw problemFromResponse(response.status, response.data);
    }
    return response.data;
  }

  async #listAllRoles(client: AepClient): Promise<readonly Role[]> {
    const roles: Role[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await client.listRoles({ ...(cursor ? { cursor } : {}), limit: 200 });
      roles.push(...page.roles);
      const nextCursor = page.nextCursor ?? null;
      if (!nextCursor || nextCursor === cursor) return roles;
      cursor = nextCursor;
    }
  }

  async #listAllTeams(client: AepClient): Promise<readonly Team[]> {
    const teams: Team[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await client.listTeams({ ...(cursor ? { cursor } : {}), limit: 200 });
      teams.push(...page.teams);
      const nextCursor = page.nextCursor ?? null;
      if (!nextCursor || nextCursor === cursor) return teams;
      cursor = nextCursor;
    }
  }

  async #listAllSkills(client: AepClient): Promise<JsonObject> {
    const skills: JsonValue[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await client.listSkills({ ...(cursor ? { cursor } : {}), limit: 200 });
      skills.push(...(arrayFrom(page, 'skills') as JsonValue[]));
      const nextCursor = valueString(page, 'nextCursor');
      if (!nextCursor || nextCursor === cursor) return { skills };
      cursor = nextCursor;
    }
  }

  async #listAllCredentials(client: AepClient): Promise<CredentialList> {
    const credentials: CredentialMetadata[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await client.listCredentials({ ...(cursor ? { cursor } : {}), limit: 200 });
      credentials.push(...page.credentials);
      const nextCursor = page.nextCursor ?? null;
      if (!nextCursor || nextCursor === cursor) return { credentials, nextCursor: null };
      cursor = nextCursor;
    }
  }

  async #listAllModels(client: AepClient): Promise<AdminModelList> {
    const models: AdminModel[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await client.listAdminModels({ ...(cursor ? { cursor } : {}), limit: 200 });
      models.push(...page.models);
      const nextCursor = page.nextCursor ?? null;
      if (!nextCursor || nextCursor === cursor) return { models, nextCursor: null };
      cursor = nextCursor;
    }
  }

  async #listAllUsers(client: AepClient): Promise<readonly PlatformUser[]> {
    const users: PlatformUser[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await client.listUsers(cursor, 200);
      users.push(...page.items);
      const nextCursor = page.nextCursor ?? null;
      if (!nextCursor || nextCursor === cursor) return users;
      cursor = nextCursor;
    }
  }

  async #identitySession(client: AepClient): Promise<AdminSession> {
    const identity = parseAdminIdentity(await client.getCurrentIdentity());
    if (!identity) {
      await this.#tokenStore.clear();
      this.#client = null;
      this.#deploymentId = null;
      this.#sessionId = null;
      throw new Error('The AEP current identity response is invalid.');
    }
    this.#deploymentId =
      identity.deploymentId ?? identity.deployment?.id ?? identity.enterprise?.id ?? this.#deploymentId;
    return hasAnyAdminConsoleAccess(identity)
      ? { status: AdminConsoleStatus.Authenticated, identity }
      : { status: AdminConsoleStatus.Forbidden, identity };
  }
}

function runtimeFetch(): typeof globalThis.fetch {
  const root = globalThis as typeof globalThis & { fetch?: typeof globalThis.fetch };
  const candidate = root.fetch ?? (typeof window !== 'undefined' ? window.fetch : undefined);
  if (typeof candidate !== 'function') {
    throw new Error('The enterprise console runtime does not provide fetch.');
  }
  return candidate.bind(typeof window !== 'undefined' ? window : root);
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

interface AepTransportLike {
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

function identityQuery(values: { readonly [key: string]: string | number | undefined }): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

function parseIdentitySource(value: unknown): AdminIdentitySource {
  const record = isRecord(value) ? value : {};
  if (typeof record.id !== 'string' || typeof record.displayName !== 'string') {
    throw new Error('The AEP identity source response is invalid.');
  }
  return {
    id: record.id,
    displayName: record.displayName,
    kind: typeof record.kind === 'string' ? record.kind : AdminIdentitySourceKind.Directory,
    enabled: record.enabled !== false,
  };
}

function parseIdentitySources(value: unknown): AdminIdentitySource[] {
  return arrayFrom(value, 'identitySources').flatMap((item) =>
    item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string'
      ? [safeIdentitySource(item)]
      : [],
  );
}

function safeIdentitySource(item: unknown): AdminIdentitySource {
  const record = item as Record<string, unknown>;
  return {
    id: record.id as string,
    displayName: typeof record.displayName === 'string' ? record.displayName : (record.id as string),
    kind: typeof record.kind === 'string' ? record.kind : AdminIdentitySourceKind.Directory,
    enabled: record.enabled !== false,
  };
}

function parseIdentityMappings(value: unknown, sourceId: string): AdminIdentityMapping[] {
  return arrayFrom(value, 'mappings').flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.externalId !== 'string' || typeof record.localSubjectId !== 'string') return [];
    return [
      {
        sourceId: typeof record.sourceId === 'string' ? record.sourceId : sourceId,
        externalSubjectType:
          typeof record.externalSubjectType === 'string' ? record.externalSubjectType : AdminIdentitySubjectType.User,
        externalId: record.externalId,
        localSubjectId: record.localSubjectId,
        status: typeof record.status === 'string' ? record.status : AdminIdentityMappingStatus.Active,
      },
    ];
  });
}

function parseDeploymentSettingValue(value: unknown): AdminDeploymentSettingValue {
  const record = isRecord(value) ? value : {};
  const source = record.source;
  if (
    source !== AdminDeploymentSettingSource.Override &&
    source !== AdminDeploymentSettingSource.Env &&
    source !== AdminDeploymentSettingSource.Unset
  ) {
    throw new Error('The AEP deployment settings response is invalid.');
  }
  const override = record.override;
  const effectiveValue = record.effectiveValue;
  if (
    (override !== null && override !== undefined && typeof override !== 'string') ||
    (effectiveValue !== null && effectiveValue !== undefined && typeof effectiveValue !== 'string')
  ) {
    throw new Error('The AEP deployment settings response is invalid.');
  }
  return {
    override: typeof override === 'string' ? override : null,
    effectiveValue: typeof effectiveValue === 'string' ? effectiveValue : null,
    source,
  };
}

function parseDeploymentSettings(value: unknown): AdminDeploymentSettings {
  const record = isRecord(value) ? value : {};
  return { modelGatewayBaseUrl: parseDeploymentSettingValue(record.modelGatewayBaseUrl) };
}

const DATA_PLANE_STATES: readonly string[] = ['pending', 'applying', 'ready', 'degraded', 'error'];

function parseDataPlaneStatus(value: unknown): AdminDataPlaneStatus {
  const record = isRecord(value) ? value : {};
  const state =
    typeof record.state === 'string' && DATA_PLANE_STATES.includes(record.state)
      ? (record.state as DataPlaneStatus['state'])
      : 'pending';
  return {
    state,
    observedRevision: typeof record.observedRevision === 'string' ? record.observedRevision : null,
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : null,
    ...(typeof record.lastAppliedAt === 'string' || record.lastAppliedAt === null
      ? { lastAppliedAt: record.lastAppliedAt }
      : {}),
    ...(typeof record.errorCode === 'string' || record.errorCode === null ? { errorCode: record.errorCode } : {}),
    ...(typeof record.message === 'string' || record.message === null ? { message: record.message } : {}),
    ...(typeof record.resourceCount === 'number' ? { resourceCount: record.resourceCount } : {}),
    ...(record.catalogComparison !== undefined
      ? { catalogComparison: parseCatalogComparison(record.catalogComparison) }
      : {}),
  };
}

function parseCatalogComparison(value: unknown): AdminDataPlaneCatalogComparison {
  const record = isRecord(value) ? value : {};
  const mismatched = Array.isArray(record.mismatched) ? record.mismatched : [];
  return {
    missing: stringList(record.missing),
    extra: stringList(record.extra),
    mismatched: mismatched.flatMap((item) => {
      if (!isRecord(item) || typeof item.modelId !== 'string') return [];
      return [{ modelId: item.modelId, fields: stringList(item.fields) }];
    }),
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : [];
}

function parseDataPlaneDesiredState(value: unknown): DataPlaneDesiredState {
  const record = isRecord(value) ? value : {};
  if (typeof record.revision !== 'string' || !Array.isArray(record.routes)) {
    throw new Error('The AEP data-plane publish response is invalid.');
  }
  return {
    revision: record.revision,
    routes: record.routes as DataPlaneRoute[],
    deploymentId: typeof record.deploymentId === 'string' ? record.deploymentId : '',
    publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : '',
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : '',
  };
}

function problemFromResponse(status: number, data: unknown): Error {
  if (isRecord(data) && typeof data.code === 'string') {
    const detail = typeof data.detail === 'string' ? data.detail : null;
    return new AdminRequestError(status, data.code, detail);
  }
  return new AdminRequestError(status, null, null);
}

function parseAdminIdentity(value: unknown): AdminIdentity | null {
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

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function listCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown[] }).items)) {
    return (value as { items: unknown[] }).items.length;
  }
  if (value && typeof value === 'object' && Array.isArray((value as { models?: unknown[] }).models)) {
    return (value as { models: unknown[] }).models.length;
  }
  if (value && typeof value === 'object' && Array.isArray((value as { skills?: unknown[] }).skills)) {
    return (value as { skills: unknown[] }).skills.length;
  }
  return 0;
}

function parseSkills(value: unknown): AdminSkill[] {
  const items = arrayFrom(value, 'skills');
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.name !== 'string') return [];
    const versions = Array.isArray(record.versions)
      ? record.versions.flatMap((version) => {
          if (!version || typeof version !== 'object') return [];
          const item = version as Record<string, unknown>;
          if (
            typeof item.version !== 'string' ||
            typeof item.state !== 'string' ||
            typeof item.sha256 !== 'string' ||
            typeof item.size !== 'number'
          )
            return [];
          return [
            {
              version: item.version,
              state: item.state as AdminSkillVersion['state'],
              sha256: item.sha256,
              size: item.size,
              ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}),
            },
          ];
        })
      : [];
    const state =
      record.state === 'withdrawn' || record.state === 'active'
        ? record.state
        : record.enabled === false
          ? 'withdrawn'
          : 'active';
    return [
      {
        id: record.id,
        name: record.name,
        ...(typeof record.description === 'string' ? { description: record.description } : {}),
        state,
        enabled: state === 'active',
        versions,
      },
    ];
  });
}

function parseAssignments(value: unknown): AdminSkillAssignment[] {
  return arrayFrom(value, 'items').flatMap((item) => {
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
    )
      return [];
    const subjectType = (subject as Record<string, unknown>).type;
    const subjectId = (subject as Record<string, unknown>).id;
    if (typeof subjectType !== 'string' || typeof subjectId !== 'string') return [];
    return [
      {
        id: record.id,
        skillId: record.skillId,
        subjectType,
        subjectId,
        // Distinguish "the server said null (perpetual)" from "the server did
        // not report an expiry at all" (an older API).
        expiresAt:
          record.expiresAt === null ? null : typeof record.expiresAt === 'string' ? record.expiresAt : undefined,
      },
    ];
  });
}

function arrayFrom(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const items = (value as Record<string, unknown>)[key];
  return Array.isArray(items) ? items : [];
}

function valueString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate ? candidate : null;
}

function parseSessions(items: unknown[]): AdminUserSession[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.sessionId !== 'string' ||
      typeof record.userId !== 'string' ||
      typeof record.topic !== 'string' ||
      typeof record.createdAt !== 'string' ||
      typeof record.lastSeenAt !== 'string'
    )
      return [];
    return [
      {
        sessionId: record.sessionId,
        userId: record.userId,
        topic: record.topic,
        createdAt: record.createdAt,
        lastSeenAt: record.lastSeenAt,
        ...(typeof record.revokedAt === 'string' || record.revokedAt === null ? { revokedAt: record.revokedAt } : {}),
        ...('client' in record ? { client: parseSessionClient(record.client) } : {}),
      },
    ];
  });
}

function parseSessionClient(value: unknown): AdminSessionClient | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return null;
  const name = nonEmptyString(value.name);
  if (!name) return null;
  const version = nonEmptyString(value.version);
  const deviceId = nonEmptyString(value.deviceId);
  return {
    name,
    ...(version ? { version } : {}),
    ...(deviceId ? { deviceId } : {}),
  };
}

function pendingEventCount(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const record = value as { items?: unknown[]; pending?: unknown };
  if (typeof record.pending === 'number') return record.pending;
  return Array.isArray(record.items)
    ? record.items.filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const state = (item as { state?: unknown }).state;
        return state === 'pending' || state === 'delivered';
      }).length
    : 0;
}
