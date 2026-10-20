import {
  type AdminModel,
  type AdminModelList,
  AEP_PROTOCOL_VERSION,
  AepClient,
  type AepTokenStore,
  type AepTokens,
  type CredentialList,
  type CredentialMetadata,
  FetchTransport,
  HttpMethod,
  type JsonObject,
  type JsonValue,
  type PlatformUser,
  type Role,
  type ServiceMetadata,
} from '@aep/sdk-node';
import {
  AdminConsoleStatus,
  AdminMetadataError,
  type AdminSession,
  type AepTransportLike,
  defaultBaseUrl,
  hasAnyAdminConsoleAccess,
  parseAdminIdentity,
  runtimeFetch,
  SessionTokenStore,
} from './client-auth.js';
import { createEventsApi } from './client-events.js';
import { createGatewayApi } from './client-gateway.js';
import { createIdentityApi } from './client-identity.js';
import { createModelsApi } from './client-models.js';
import { createOperationsApi } from './client-operations.js';
import type { Team } from './client-resource-types.js';
import { createResourcesApi } from './client-resources.js';
import { arrayFrom, problemFromResponse, valueString } from './client-values.js';

export type AdminApi = ReturnType<typeof createResourcesApi> &
  ReturnType<typeof createModelsApi> &
  ReturnType<typeof createGatewayApi> &
  ReturnType<typeof createOperationsApi> &
  ReturnType<typeof createIdentityApi> &
  ReturnType<typeof createEventsApi>;

export class AdminClientSession {
  protected readonly api: AdminApi;
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
    const self = this;
    const context = {
      get deploymentId() {
        return self.#deploymentId;
      },
      requireClient: this.#requireClient.bind(this),
      request: this.#request.bind(this),
      listAllRoles: this.#listAllRoles.bind(this),
      listAllTeams: this.#listAllTeams.bind(this),
      listAllUsers: this.#listAllUsers.bind(this),
      listAllSkills: this.#listAllSkills.bind(this),
      listAllCredentials: this.#listAllCredentials.bind(this),
      listAllModels: this.#listAllModels.bind(this),
    };
    this.api = Object.assign(
      {},
      createResourcesApi(context),
      createModelsApi(context),
      createGatewayApi(context),
      createOperationsApi(context),
      createIdentityApi(context),
      createEventsApi(context),
    );
  }

  // The session the console itself is signed in with, captured from the login
  // or restore token response. It survives access-token refreshes unchanged,
  // so pages can compare it against the admin session list.
  get sessionId(): string | null {
    return this.#sessionId;
  }

  // Used only to scope non-secret publication pointers; never includes tokens.
  get publicationScope(): string | null {
    return this.#deploymentId ? JSON.stringify([this.#baseUrl, this.#deploymentId]) : null;
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

  async getAccessToken(rejectedToken?: string): Promise<string | null> {
    const tokens = await this.#tokenStore.get();
    if (!tokens || !rejectedToken || tokens.accessToken !== rejectedToken) return tokens?.accessToken ?? null;
    const renewed = await this.#getClient().refreshSession();
    this.#sessionId = renewed.sessionId ?? this.#sessionId;
    return renewed.accessToken;
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
      readonly idempotencyKey?: string;
    },
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-AEP-Protocol-Version': AEP_PROTOCOL_VERSION,
      ...(request.idempotencyKey ? { 'Idempotency-Key': request.idempotencyKey } : {}),
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
