import type { AgentModel, ModelConnection } from '@aep/sdk-node';

import {
  ModelCapabilityStatus,
  type ModelCapabilities,
  type ProviderConfig,
  type ProviderModelPiRuntimeConfig,
  type ZhiyuanManagedProviderSource,
} from '../host-contract.js';
import type { ZhiyuanPasswordSession } from '../session/password-session.js';

export const ZHIYUAN_MODEL_PROVIDER_KEY = 'custom_enterprise';
export const ZHIYUAN_MODEL_PROVIDER_DISPLAY_NAME = 'Zhiyuan';
export const ZHIYUAN_MODEL_POLL_INTERVAL_MS = 30_000;

interface TimerHandle {
  unref?(): void;
}

export interface ZhiyuanModelProviderDependencies {
  readonly pollIntervalMs?: number;
  readonly setInterval?: (callback: () => void, milliseconds: number) => TimerHandle;
  readonly clearInterval?: (handle: TimerHandle) => void;
}

export class ZhiyuanModelProvider implements ZhiyuanManagedProviderSource {
  readonly providerKey = ZHIYUAN_MODEL_PROVIDER_KEY;
  readonly exclusive = true;
  readonly #session: ZhiyuanPasswordSession;
  readonly #pollIntervalMs: number;
  readonly #setInterval: (callback: () => void, milliseconds: number) => TimerHandle;
  readonly #clearInterval: (handle: TimerHandle) => void;
  readonly #listeners = new Set<() => void>();
  #sessionUnsubscribe: (() => void) | null = null;
  #pollTimer: TimerHandle | null = null;
  #pollInFlight = false;

  constructor(
    session: ZhiyuanPasswordSession,
    dependencies: ZhiyuanModelProviderDependencies = {},
  ) {
    this.#session = session;
    this.#pollIntervalMs = dependencies.pollIntervalMs ?? ZHIYUAN_MODEL_POLL_INTERVAL_MS;
    this.#setInterval =
      dependencies.setInterval ??
      ((callback, milliseconds) => setInterval(callback, milliseconds));
    this.#clearInterval = dependencies.clearInterval ?? (handle => clearInterval(handle as never));
  }

  async snapshot(): Promise<ProviderConfig> {
    const [models, connection] = await Promise.all([
      this.#readModels(),
      this.#session.getModelConnection(),
    ]);
    validateGatewayConnection(connection);
    return {
      enabled: true,
      userEnabled: true,
      apiKey: connection.apiKey,
      baseUrl: connection.baseUrl,
      apiFormat: 'openai',
      displayName: ZHIYUAN_MODEL_PROVIDER_DISPLAY_NAME,
      models: models.map(toProviderModel),
    };
  }

  onDidChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) this.#startWatching();
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#stopWatching();
    };
  }

  async #readModels(): Promise<AgentModel[]> {
    const { models } = await this.#session.listAgentModels();
    return models
      .filter(isGatewayModel)
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
  }

  #startWatching(): void {
    this.#sessionUnsubscribe = this.#session.onDidChange(() => {
      this.#emitChanged();
    });
    this.#pollTimer = this.#setInterval(() => void this.#poll(), this.#pollIntervalMs);
    this.#pollTimer.unref?.();
  }

  #stopWatching(): void {
    this.#sessionUnsubscribe?.();
    this.#sessionUnsubscribe = null;
    if (this.#pollTimer) this.#clearInterval(this.#pollTimer);
    this.#pollTimer = null;
  }

  async #poll(): Promise<void> {
    if (this.#pollInFlight) return;
    this.#pollInFlight = true;
    try {
      await this.#readModels();
    } catch {
      // The host refresh below will clear the stale provider snapshot.
    } finally {
      this.#pollInFlight = false;
      // Refreshes the short-lived model token and clears stale snapshots on outages.
      this.#emitChanged();
    }
  }

  #emitChanged(): void {
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // Host notification failures must not stop authorization polling.
      }
    }
  }
}

function isGatewayModel(model: AgentModel): boolean {
  return model.enabled && model.sourceType === 'gateway' && model.protocol === 'openai-compatible';
}

function toProviderModel(model: AgentModel): NonNullable<ProviderConfig['models']>[number] {
  const capabilities = mapCapabilities(model.capabilities);
  const piRuntime = mapPiRuntime(model);
  return {
    id: model.id,
    name: model.displayName,
    ...(capabilities.imageInput === ModelCapabilityStatus.Supported
      ? { supportsImage: true }
      : {}),
    ...(Object.keys(capabilities).length > 0 ? { capabilities } : {}),
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(piRuntime ? { piRuntime } : {}),
  };
}

type AepReasoningAwareAgentModel = AgentModel & {
  readonly reasoningCompatibility?: {
    readonly thinkingFormat: 'deepseek';
    readonly supportsReasoningEffort: true;
    readonly requiresReasoningContentOnAssistantMessages: true;
  };
};

function mapPiRuntime(model: AgentModel): ProviderModelPiRuntimeConfig | undefined {
  const value = (model as AepReasoningAwareAgentModel).reasoningCompatibility;
  if (value === undefined) return undefined;
  if (
    value.thinkingFormat !== 'deepseek' ||
    value.supportsReasoningEffort !== true ||
    value.requiresReasoningContentOnAssistantMessages !== true
  ) {
    throw new Error('Zhiyuan model reasoning compatibility is not supported.');
  }
  return {
    api: 'openai-completions',
    reasoning: true,
    compat: {
      thinkingFormat: 'deepseek',
      supportsReasoningEffort: true,
      requiresReasoningContentOnAssistantMessages: true,
    },
  };
}

function mapCapabilities(values: string[]): Partial<ModelCapabilities> {
  const capabilities = new Set(values.map(value => value.trim().toLowerCase()));
  return {
    ...(hasAny(capabilities, 'tools', 'tool-calling', 'tool_calling')
      ? { toolCalling: ModelCapabilityStatus.Supported }
      : {}),
    ...(hasAny(capabilities, 'vision', 'image', 'image-input', 'image_input')
      ? { imageInput: ModelCapabilityStatus.Supported }
      : {}),
    ...(hasAny(capabilities, 'video', 'video-input', 'video_input')
      ? { videoInput: ModelCapabilityStatus.Supported }
      : {}),
    ...(hasAny(capabilities, 'audio', 'audio-input', 'audio_input')
      ? { audioInput: ModelCapabilityStatus.Supported }
      : {}),
    ...(hasAny(capabilities, 'document', 'document-input', 'document_input')
      ? { documentInput: ModelCapabilityStatus.Supported }
      : {}),
    ...(capabilities.has('reasoning')
      ? { reasoning: ModelCapabilityStatus.Supported }
      : {}),
  };
}

function hasAny(values: ReadonlySet<string>, ...candidates: string[]): boolean {
  return candidates.some(candidate => values.has(candidate));
}

function validateGatewayConnection(connection: ModelConnection): void {
  if (connection.protocol !== 'openai-compatible') {
    throw new Error('Zhiyuan model gateway protocol is not supported.');
  }
}
