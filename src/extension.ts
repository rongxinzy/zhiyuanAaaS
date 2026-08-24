import {
  ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION,
  ZHIYUAN_ENTERPRISE_RENDERER_CAPABILITY_API_VERSION,
  ZHIYUAN_ENTERPRISE_SESSION_CAPABILITY_API_VERSION,
  type ZhiyuanEnterpriseExtension,
  type ZhiyuanEnterpriseHostContext,
} from './host-contract.js';
import { ZhiyuanPasswordSessionProvider } from './session/provider.js';
import { createZhiyuanSessionRuntime } from './session/runtime.js';
import type { ZhiyuanPasswordSession } from './session/password-session.js';

export const ZHIYUAN_ENTERPRISE_EXTENSION_ID = 'zhiyuan.aaas';
export const ZHIYUAN_ENTERPRISE_SESSION_GATE_ENTRYPOINT = 'ui/index.html';

type ExtensionState =
  | { readonly status: 'idle' }
  | { readonly status: 'active'; readonly context: ZhiyuanEnterpriseHostContext }
  | { readonly status: 'disposed' };

export interface ZhiyuanExtensionDependencies {
  readonly createSession: (
    context: ZhiyuanEnterpriseHostContext,
  ) => Promise<ZhiyuanPasswordSession>;
  readonly warn: (message: string) => void;
}

const defaultDependencies: ZhiyuanExtensionDependencies = {
  createSession: createZhiyuanSessionRuntime,
  warn: message => console.warn(message),
};

export class ZhiyuanAaaSExtension implements ZhiyuanEnterpriseExtension {
  readonly apiVersion = ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION;
  readonly id = ZHIYUAN_ENTERPRISE_EXTENSION_ID;
  readonly #dependencies: ZhiyuanExtensionDependencies;
  #state: ExtensionState = { status: 'idle' };
  #unregisterSessionProvider: (() => void) | null = null;
  #unregisterSessionGate: (() => void) | null = null;

  constructor(dependencies: ZhiyuanExtensionDependencies = defaultDependencies) {
    this.#dependencies = dependencies;
  }

  async initialize(context: ZhiyuanEnterpriseHostContext): Promise<void> {
    if (this.#state.status !== 'idle') {
      throw new Error(`Zhiyuan enterprise extension cannot initialize from ${this.#state.status}.`);
    }
    if (context.apiVersion !== ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION) {
      throw new Error('Zhiyuan enterprise extension host API version is not supported.');
    }
    const sessionCapability = context.capabilities.session;
    if (sessionCapability) {
      if (sessionCapability.apiVersion !== ZHIYUAN_ENTERPRISE_SESSION_CAPABILITY_API_VERSION) {
        throw new Error('Zhiyuan enterprise session capability API version is not supported.');
      }
      const session = await this.#dependencies.createSession(context);
      this.#unregisterSessionProvider = sessionCapability.registerProvider(
        new ZhiyuanPasswordSessionProvider(session),
      );
      await session.initialize().catch(() => {
        this.#dependencies.warn(
          '[EnterpriseSession] Session restoration could not complete and remains retryable.',
        );
      });
    }
    const rendererCapability = context.capabilities.renderer;
    if (rendererCapability) {
      if (rendererCapability.apiVersion !== ZHIYUAN_ENTERPRISE_RENDERER_CAPABILITY_API_VERSION) {
        throw new Error('Zhiyuan enterprise renderer capability API version is not supported.');
      }
      this.#unregisterSessionGate = rendererCapability.registerSessionGate(
        ZHIYUAN_ENTERPRISE_SESSION_GATE_ENTRYPOINT,
      );
    }
    this.#state = { status: 'active', context };
  }

  async dispose(): Promise<void> {
    this.#unregisterSessionGate?.();
    this.#unregisterSessionGate = null;
    this.#unregisterSessionProvider?.();
    this.#unregisterSessionProvider = null;
    this.#state = { status: 'disposed' };
  }
}

export function createZhiyuanEnterpriseExtension(): ZhiyuanEnterpriseExtension {
  return new ZhiyuanAaaSExtension();
}

export { createZhiyuanPasswordSession } from './session/factory.js';
