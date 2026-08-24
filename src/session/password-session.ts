import type {
  AepSessionState,
  AepTokens,
  CurrentIdentity,
} from '@aep/sdk-node';

export interface PasswordSessionClient {
  getSessionState(): Promise<AepSessionState>;
  restoreSession(): Promise<AepTokens | null>;
  loginWithPassword(input: {
    enterpriseId: string;
    username: string;
    password: string;
  }): Promise<AepTokens>;
  changePassword(currentPassword: string, newPassword: string): Promise<AepTokens>;
  getCurrentIdentity(): Promise<CurrentIdentity>;
  logout(): Promise<void>;
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
  readonly #client: PasswordSessionClient;
  #snapshot: ZhiyuanSessionSnapshot = Object.freeze({ status: 'signed-out' });
  #initialized = false;
  #initialization: Promise<ZhiyuanSessionSnapshot> | null = null;
  #operationTail: Promise<void> = Promise.resolve();

  constructor(client: PasswordSessionClient) {
    this.#client = client;
  }

  snapshot(): ZhiyuanSessionSnapshot {
    return cloneSnapshot(this.#snapshot);
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
          await this.#loadIdentity();
        }
      } else {
        await this.#loadIdentity();
      }
      this.#initialized = true;
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
      await this.#client.loginWithPassword({ ...input });
      this.#initialized = true;
      await this.#loadIdentityOrMarkRecoverable();
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
      await this.#client.changePassword(currentPassword, newPassword);
      await this.#loadIdentityOrMarkRecoverable();
      return this.snapshot();
    });
  }

  logout(): Promise<ZhiyuanSessionSnapshot> {
    return this.#enqueue(async () => {
      await this.#client.logout();
      this.#snapshot = Object.freeze({ status: 'signed-out' });
      this.#initialized = true;
      return this.snapshot();
    });
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
