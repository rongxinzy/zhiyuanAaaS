import type {
  AgentModelList,
  AepSessionState,
  AepTokens,
  CurrentIdentity,
  ModelConnection,
} from '@aep/sdk-node';

import type { AgentControlClient } from '../agent-control/types.js';

export interface PasswordSessionClient {
  getSessionState(): Promise<AepSessionState>;
  restoreSession(): Promise<AepTokens | null>;
  refreshSession(): Promise<AepTokens>;
  loginWithPassword(input: {
    enterpriseId: string;
    username: string;
    password: string;
  }): Promise<AepTokens>;
  changePassword(currentPassword: string, newPassword: string): Promise<AepTokens>;
  getCurrentIdentity(): Promise<CurrentIdentity>;
  listAgentModels(): Promise<AgentModelList>;
  getModelConnection(): Promise<ModelConnection>;
  logout(): Promise<void>;
  getSkillManifest?: AgentControlClient['getSkillManifest'];
  downloadSkillPackage?: AgentControlClient['downloadSkillPackage'];
  reportSkillSyncResult?: AgentControlClient['reportSkillSyncResult'];
  uploadEventBatch?: AgentControlClient['uploadEventBatch'];
  heartbeat?: AgentControlClient['heartbeat'];
  listControlEvents?: AgentControlClient['listControlEvents'];
  acknowledgeControlEvent?: AgentControlClient['acknowledgeControlEvent'];
  reportControlEventResult?: AgentControlClient['reportControlEventResult'];
}

export type ZhiyuanSessionSnapshot =
  | { readonly status: 'signed-out' }
  | { readonly status: 'recoverable' }
  | { readonly status: 'authenticated'; readonly identity: CurrentIdentity };

export interface PasswordLoginInput {
  readonly enterpriseId: string;
  readonly username: string;
  readonly password: string;
}

export class ZhiyuanPasswordSession {
  static readonly MODEL_TOKEN_REFRESH_WINDOW_MS = 30_000;
  readonly #client: PasswordSessionClient;
  #snapshot: ZhiyuanSessionSnapshot = Object.freeze({ status: 'signed-out' });
  #initialized = false;
  #initialization: Promise<ZhiyuanSessionSnapshot> | null = null;
  #operationTail: Promise<void> = Promise.resolve();
  readonly #listeners = new Set<() => void>();
  #modelAccessExpiresAt = 0;

  constructor(client: PasswordSessionClient) {
    this.#client = client;
  }

  snapshot(): ZhiyuanSessionSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  onDidChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  initialize(): Promise<ZhiyuanSessionSnapshot> {
    if (this.#initialized) return Promise.resolve(this.snapshot());
    if (this.#initialization) return this.#initialization;

    this.#initialization = this.#enqueue(async () => {
      const sessionState = await this.#client.getSessionState();
      if (sessionState.status === 'signed-out') {
        this.#snapshot = Object.freeze({ status: 'signed-out' });
      } else if (sessionState.status === 'recoverable') {
        this.#snapshot = Object.freeze({ status: 'recoverable' });
        const tokens = await this.#client.restoreSession();
        if (!tokens) {
          this.#snapshot = Object.freeze({ status: 'signed-out' });
        } else {
          this.#recordTokens(tokens);
          await this.#loadIdentity();
        }
      } else {
        const tokens = await this.#client.restoreSession();
        if (tokens) this.#recordTokens(tokens);
        await this.#loadIdentity();
      }
      this.#initialized = true;
      this.#publishChanged();
      return this.snapshot();
    }).finally(() => {
      this.#initialization = null;
    });
    return this.#initialization;
  }

  login(input: PasswordLoginInput): Promise<ZhiyuanSessionSnapshot> {
    try {
      validateLogin(input);
    } catch (error) {
      return Promise.reject(error);
    }
    return this.#enqueue(async () => {
      const tokens = await this.#client.loginWithPassword({ ...input });
      this.#recordTokens(tokens);
      this.#initialized = true;
      await this.#loadIdentityOrMarkRecoverable();
      this.#publishChanged();
      return this.snapshot();
    });
  }

  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ZhiyuanSessionSnapshot> {
    if (!currentPassword || !newPassword) {
      return Promise.reject(new Error('Current and new passwords are required.'));
    }
    return this.#enqueue(async () => {
      const tokens = await this.#client.changePassword(currentPassword, newPassword);
      this.#recordTokens(tokens);
      await this.#loadIdentityOrMarkRecoverable();
      this.#publishChanged();
      return this.snapshot();
    });
  }

  logout(): Promise<ZhiyuanSessionSnapshot> {
    return this.#enqueue(async () => {
      await this.#client.logout();
      this.#snapshot = Object.freeze({ status: 'signed-out' });
      this.#modelAccessExpiresAt = 0;
      this.#initialized = true;
      this.#publishChanged();
      return this.snapshot();
    });
  }

  listAgentModels(): Promise<AgentModelList> {
    return this.#enqueue(async () => {
      if (this.#snapshot.status !== 'authenticated') return { models: [] };
      return this.#client.listAgentModels();
    });
  }

  getModelConnection(): Promise<ModelConnection> {
    return this.#enqueue(async () => {
      if (this.#snapshot.status !== 'authenticated') {
        throw new Error('Zhiyuan enterprise session is not authenticated.');
      }
      if (
        this.#modelAccessExpiresAt <=
        Date.now() + ZhiyuanPasswordSession.MODEL_TOKEN_REFRESH_WINDOW_MS
      ) {
        this.#recordTokens(await this.#client.refreshSession());
      }
      return this.#client.getModelConnection();
    });
  }

  getAgentControlClient(): AgentControlClient {
    const candidate = this.#client as Partial<AgentControlClient>;
    const required = [
      'getSkillManifest',
      'downloadSkillPackage',
      'reportSkillSyncResult',
      'uploadEventBatch',
      'heartbeat',
      'listControlEvents',
      'acknowledgeControlEvent',
      'reportControlEventResult',
    ] as const;
    if (required.some(method => typeof candidate[method] !== 'function')) {
      throw new Error('Zhiyuan enterprise session does not support Agent control operations.');
    }
    return candidate as AgentControlClient;
  }

  async #loadIdentityOrMarkRecoverable(): Promise<void> {
    try {
      await this.#loadIdentity();
    } catch (error) {
      this.#snapshot = Object.freeze({ status: 'recoverable' });
      throw error;
    }
  }

  async #loadIdentity(): Promise<void> {
    const identity = await this.#client.getCurrentIdentity();
    this.#snapshot = Object.freeze({
      status: 'authenticated',
      identity: cloneIdentity(identity),
    });
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operationTail.then(operation, operation);
    this.#operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #publishChanged(): void {
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // Session operations must not fail because a projection listener failed.
      }
    }
  }

  #recordTokens(tokens: AepTokens): void {
    this.#modelAccessExpiresAt = Date.now() + Math.max(0, tokens.modelAccessExpiresIn) * 1_000;
  }
}

function validateLogin(input: PasswordLoginInput): void {
  if (!input.enterpriseId || !input.username || !input.password) {
    throw new Error('Enterprise ID, username, and password are required.');
  }
}

function cloneSnapshot(snapshot: ZhiyuanSessionSnapshot): ZhiyuanSessionSnapshot {
  if (snapshot.status !== 'authenticated') return Object.freeze({ ...snapshot });
  return Object.freeze({ status: 'authenticated', identity: cloneIdentity(snapshot.identity) });
}

function cloneIdentity(identity: CurrentIdentity): CurrentIdentity {
  return Object.freeze({
    ...identity,
    user: Object.freeze({ ...identity.user }),
    enterprise: Object.freeze({ ...identity.enterprise }),
    roles: Object.freeze([...identity.roles]) as string[],
  });
}
