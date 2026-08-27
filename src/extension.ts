import path from 'node:path';

import {
  ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION,
  ZHIYUAN_ENTERPRISE_RENDERER_CAPABILITY_API_VERSION,
  ZHIYUAN_ENTERPRISE_SESSION_CAPABILITY_API_VERSION,
  ZHIYUAN_ENTERPRISE_SETTINGS_CAPABILITY_API_VERSION,
  ZHIYUAN_MANAGED_PROVIDER_CAPABILITY_API_VERSION,
  ZHIYUAN_AGENT_CONTROL_CAPABILITY_API_VERSION,
  type ZhiyuanEnterpriseExtension,
  type ZhiyuanEnterpriseHostContext,
} from './host-contract.js';
import { ZhiyuanPasswordSessionProvider } from './session/provider.js';
import { createZhiyuanSessionRuntime } from './session/runtime.js';
import type { ZhiyuanPasswordSession } from './session/password-session.js';
import { ZhiyuanModelProvider } from './models/provider.js';
import { createZhiyuanAgentControlBackend, type ZhiyuanAgentControlBackend } from './agent-control/factory.js';

export const ZHIYUAN_ENTERPRISE_EXTENSION_ID = 'zhiyuan.aaas';
export const ZHIYUAN_ENTERPRISE_SESSION_GATE_ENTRYPOINT = 'ui/index.html';
export const ZHIYUAN_ENTERPRISE_SETTINGS_ENTRYPOINT = 'ui/index.html';
export const ZHIYUAN_ENTERPRISE_SETTINGS_PAGES = Object.freeze([
  Object.freeze({
    id: 'account',
    entrypoint: ZHIYUAN_ENTERPRISE_SETTINGS_ENTRYPOINT,
    labels: Object.freeze({ zh: '企业账户', en: 'Enterprise account' }),
  }),
  Object.freeze({
    id: 'models',
    entrypoint: ZHIYUAN_ENTERPRISE_SETTINGS_ENTRYPOINT,
    labels: Object.freeze({ zh: '企业模型', en: 'Enterprise models' }),
  }),
]);

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
  #unregisterSettingsPages: Array<() => void> = [];
  #unregisterManagedProvider: (() => void) | null = null;
  #agentControlBackend: ZhiyuanAgentControlBackend | null = null;
  #disposeSessionListener: (() => void) | null = null;

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
    const rendererCapability = context.capabilities.renderer;
    const settingsCapability = context.capabilities.settings;
    const managedProviderCapability = context.capabilities.managedProvider;
    const agentControlCapability = context.capabilities.agentControl;
    if (
      sessionCapability &&
      sessionCapability.apiVersion !== ZHIYUAN_ENTERPRISE_SESSION_CAPABILITY_API_VERSION
    ) {
      throw new Error('Zhiyuan enterprise session capability API version is not supported.');
    }
    if (
      rendererCapability &&
      rendererCapability.apiVersion !== ZHIYUAN_ENTERPRISE_RENDERER_CAPABILITY_API_VERSION
    ) {
      throw new Error('Zhiyuan enterprise renderer capability API version is not supported.');
    }
    if (
      settingsCapability &&
      settingsCapability.apiVersion !== ZHIYUAN_ENTERPRISE_SETTINGS_CAPABILITY_API_VERSION
    ) {
      throw new Error('Zhiyuan enterprise settings capability API version is not supported.');
    }
    if (
      managedProviderCapability &&
      managedProviderCapability.apiVersion !== ZHIYUAN_MANAGED_PROVIDER_CAPABILITY_API_VERSION
    ) {
      throw new Error('Zhiyuan managed provider capability API version is not supported.');
    }
    if (
      agentControlCapability &&
      agentControlCapability.apiVersion !== ZHIYUAN_AGENT_CONTROL_CAPABILITY_API_VERSION
    ) {
      throw new Error('Zhiyuan Agent control capability API version is not supported.');
    }
    if (sessionCapability || managedProviderCapability || agentControlCapability) {
      const session = await this.#dependencies.createSession(context);
      if (sessionCapability) {
        this.#unregisterSessionProvider = sessionCapability.registerProvider(
          new ZhiyuanPasswordSessionProvider(session),
        );
      }
      if (managedProviderCapability) {
        this.#unregisterManagedProvider = managedProviderCapability.registerSource(
          new ZhiyuanModelProvider(session),
        );
      }
      if (agentControlCapability) {
        this.#agentControlBackend = createZhiyuanAgentControlBackend({
          client: session.getAgentControlClient(),
          databasePath: path.join(context.paths.userData, 'zhiyuan-enterprise', 'agent-control.sqlite'),
          skillRoot: agentControlCapability.skillRoot,
          agentVersion: context.appVersion,
          platform: mapPlatform(context.platform),
          onError: error =>
            this.#dependencies.warn(
              `[AgentControl] Control cycle failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          onSkillsChanged: agentControlCapability.notifySkillsChanged,
        });
        this.#disposeSessionListener = session.onDidChange(() => {
          void this.#agentControlBackend?.runOnce().catch(error =>
            this.#dependencies.warn(
              `[AgentControl] Session-triggered control cycle failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        });
        this.#agentControlBackend.start();
      }
      await session.initialize().catch(() => {
        this.#dependencies.warn(
          '[EnterpriseSession] Session restoration could not complete and remains retryable.',
        );
      });
    }
    if (rendererCapability) {
      this.#unregisterSessionGate = rendererCapability.registerSessionGate(
        ZHIYUAN_ENTERPRISE_SESSION_GATE_ENTRYPOINT,
      );
    }
    if (settingsCapability) {
      try {
        for (const page of ZHIYUAN_ENTERPRISE_SETTINGS_PAGES) {
          this.#unregisterSettingsPages.push(settingsCapability.registerPage(page));
        }
      } catch (error) {
        for (const unregister of this.#unregisterSettingsPages.reverse()) unregister();
        this.#unregisterSettingsPages = [];
        throw error;
      }
    }
    this.#state = { status: 'active', context };
  }

  async dispose(): Promise<void> {
    this.#disposeSessionListener?.();
    this.#disposeSessionListener = null;
    await this.#agentControlBackend?.close();
    this.#agentControlBackend = null;
    this.#unregisterManagedProvider?.();
    this.#unregisterManagedProvider = null;
    for (const unregister of this.#unregisterSettingsPages.reverse()) unregister();
    this.#unregisterSettingsPages = [];
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

function mapPlatform(platform: NodeJS.Platform): 'windows' | 'macos' | 'linux' {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  throw new Error(`Zhiyuan enterprise platform ${platform} is not supported.`);
}

export { createZhiyuanPasswordSession } from './session/factory.js';
export {
  createZhiyuanAgentControlBackend,
  ZhiyuanAgentControlBackend,
  type ZhiyuanAgentControlBackendOptions,
} from './agent-control/factory.js';
