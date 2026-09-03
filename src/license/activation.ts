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

type LicenseEnvelope = {
  readonly format: 'zhiyuan-license-v1';
  readonly keyId: string;
  readonly payload: Record<string, unknown>;
  readonly signature: string;
};

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
  readonly #licenseEnvelope: LicenseEnvelope | null;
  #unsubscribe: (() => void) | null = null;
  #activationPromise: Promise<EntitlementTokenResponse | null> | null = null;
  #entitlement: EntitlementTokenResponse | null = null;
  readonly #listeners = new Set<() => void>();

  static async create(options: ZhiyuanLicenseActivationOptions): Promise<ZhiyuanLicenseActivation> {
    const root = path.resolve(options.resourcesPath, 'zhiyuan-enterprise');
    const file = path.resolve(root, options.config.file);
    if (file !== root && !file.startsWith(root + path.sep)) {
      throw new Error('Zhiyuan enterprise license file must stay inside the enterprise resources directory.');
    }
    let content: string;
    try {
      content = await fs.readFile(file, 'utf8');
    } catch (error) {
      // A license is deployed separately from the application bundle. Keep the
      // extension usable while it is absent, and expose the invalid state to
      // the host instead of aborting enterprise runtime initialization.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      content = '';
    }
    const state = new ZhiyuanLicenseStateMachine({
      trustedKeys: options.config.trustedKeys,
      expectedDeploymentId: options.config.deploymentId,
    });
    const snapshot = state.load(content);
    let envelope: LicenseEnvelope | null = null;
    try {
      const parsed = JSON.parse(content) as LicenseEnvelope;
      if (parsed && parsed.format === 'zhiyuan-license-v1' && typeof parsed.keyId === 'string' && parsed.payload && typeof parsed.payload === 'object' && typeof parsed.signature === 'string') {
        envelope = parsed;
      }
    } catch {
      envelope = null;
    }
    return new ZhiyuanLicenseActivation(options, state, snapshot, envelope);
  }

  readonly #initialSnapshot: LicenseSnapshot;

  private constructor(
    options: ZhiyuanLicenseActivationOptions,
    state: ZhiyuanLicenseStateMachine,
    initialSnapshot: LicenseSnapshot,
    licenseEnvelope: LicenseEnvelope | null,
  ) {
    this.#state = state;
    this.#session = options.session;
    this.#client = options.client;
    this.#onError = options.onError ?? (() => undefined);
    this.#initialSnapshot = initialSnapshot;
    this.#licenseEnvelope = licenseEnvelope;
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
    this.#emitChanged();
  }

  onDidChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
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
      if (!snapshot.licenseId || !snapshot.digest || !snapshot.deploymentId || !snapshot.expiresAt || !this.#licenseEnvelope) return null;
      try {
        const entitlement = await this.#client.activateEnterpriseLicense({license: this.#licenseEnvelope} as never);
        this.#entitlement = entitlement;
        this.#emitChanged();
        return entitlement;
      } catch (error) {
        this.#entitlement = null;
        this.#emitChanged();
        this.#onError(error);
        return null;
      } finally {
        this.#activationPromise = null;
      }
    })();
    return this.#activationPromise;
  }

  #emitChanged(): void {
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // A projection listener must not interrupt activation or shutdown.
      }
    }
  }
}
