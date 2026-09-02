import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  AepClient,
  EntitlementTokenResponse,
} from '@aep/sdk-node';

import type { ZhiyuanEnterpriseConfig } from '../enterprise-config.js';
import type { ZhiyuanPasswordSession } from '../session/password-session.js';
import { LicenseStatus, type LicenseSnapshot } from './types.js';
import { ZhiyuanLicenseStateMachine } from './state.js';

export interface ZhiyuanLicenseActivationOptions {
  readonly resourcesPath: string;
  readonly config: NonNullable<ZhiyuanEnterpriseConfig['license']>;
  readonly session: ZhiyuanPasswordSession;
  readonly client: Pick<AepClient, 'activateEnterpriseLicense'>;
  readonly onError?: (error: unknown) => void;
}

export class ZhiyuanLicenseActivation {
  readonly #state: ZhiyuanLicenseStateMachine;
  readonly #session: ZhiyuanPasswordSession;
  readonly #client: Pick<AepClient, 'activateEnterpriseLicense'>;
  readonly #onError: (error: unknown) => void;
  #unsubscribe: (() => void) | null = null;
  #activationPromise: Promise<EntitlementTokenResponse | null> | null = null;
  #entitlement: EntitlementTokenResponse | null = null;

  static async create(options: ZhiyuanLicenseActivationOptions): Promise<ZhiyuanLicenseActivation> {
    const root = path.resolve(options.resourcesPath, 'zhiyuan-enterprise');
    const file = path.resolve(root, options.config.file);
    if (file !== root && !file.startsWith(root + path.sep)) {
      throw new Error('Zhiyuan enterprise license file must stay inside the enterprise resources directory.');
    }
    const content = await fs.readFile(file, 'utf8');
    const state = new ZhiyuanLicenseStateMachine({
      trustedKeys: options.config.trustedKeys,
      expectedDeploymentId: options.config.deploymentId,
    });
    const snapshot = state.load(content);
    return new ZhiyuanLicenseActivation(options, state, snapshot);
  }

  readonly #initialSnapshot: LicenseSnapshot;

  private constructor(
    options: ZhiyuanLicenseActivationOptions,
    state: ZhiyuanLicenseStateMachine,
    initialSnapshot: LicenseSnapshot,
  ) {
    this.#state = state;
    this.#session = options.session;
    this.#client = options.client;
    this.#onError = options.onError ?? (() => undefined);
    this.#initialSnapshot = initialSnapshot;
  }

  start(): void {
    if (this.#unsubscribe) return;
    this.#unsubscribe = this.#session.onDidChange(() => {
      if (this.#session.snapshot().status === 'authenticated') void this.activate();
    });
    if (this.#initialSnapshot.status === LicenseStatus.Invalid) return;
    if (this.#session.snapshot().status === 'authenticated') void this.activate();
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#entitlement = null;
  }

  snapshot(): LicenseSnapshot {
    return this.#state.snapshot();
  }

  entitlement(): EntitlementTokenResponse | null {
    return this.#entitlement ? {...this.#entitlement, features: [...this.#entitlement.features]} : null;
  }

  async activate(): Promise<EntitlementTokenResponse | null> {
    if (this.#state.snapshot().status === LicenseStatus.Invalid || this.#session.snapshot().status !== 'authenticated') return null;
    if (this.#activationPromise) return this.#activationPromise;
    this.#activationPromise = (async () => {
      const snapshot = this.#state.snapshot();
      if (!snapshot.licenseId || !snapshot.digest || !snapshot.deploymentId || !snapshot.expiresAt) return null;
      try {
        const entitlement = await this.#client.activateEnterpriseLicense({
          licenseId: snapshot.licenseId,
          licenseDigest: snapshot.digest,
          deploymentId: snapshot.deploymentId,
          expiresAt: snapshot.expiresAt,
          features: [...snapshot.features],
        });
        this.#entitlement = entitlement;
        return entitlement;
      } catch (error) {
        this.#onError(error);
        return null;
      } finally {
        this.#activationPromise = null;
      }
    })();
    return this.#activationPromise;
  }
}
