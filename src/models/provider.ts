import type { AgentModel, ModelConnection } from '@aep/sdk-node';

import {
  ExternalModelProtocol,
  ExternalModelThinkingFormat,
  ModelCapabilityStatus,
  type ExternalModelConnection,
  type ExternalModelDescriptor,
  type ExternalModelProvider,
  type ExternalModelReasoningCompatibility,
  type ModelCapabilities,
} from '../host-contract.js';
import type { ZhiyuanPasswordSession } from '../session/password-session.js';

export const ZHIYUAN_MODEL_PROVIDER_ID = 'external.zhiyuan';
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

export class ZhiyuanModelProvider implements ExternalModelProvider {
  readonly id = ZHIYUAN_MODEL_PROVIDER_ID;
  readonly displayName = ZHIYUAN_MODEL_PROVIDER_DISPLAY_NAME;
  readonly exclusive = true;
  readonly #session: ZhiyuanPasswordSession;
  readonly #pollIntervalMs: number;
  readonly #setInterval: (callback: () => void, milliseconds: number) => TimerHandle;
  readonly #clearInterval: (handle: TimerHandle) => void;
  readonly #listeners = new Set<() => void>();
  #sessionUnsubscribe: (() => void) | null = null;
  #pollTimer: TimerHandle | null = null;
  #modelSignature: string | null = null;
  #cachedModels: readonly ExternalModelDescriptor[] | null = null;
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

  async listModels(): Promise<readonly ExternalModelDescriptor[]> {
    try {
      const models = await this.#readModels();
      this.#cachedModels = models;
      this.#modelSignature = signature(models);
      return models;
    } catch (error) {
      if (this.#cachedModels) return this.#cachedModels;
      throw error;
    }
  }

  async resolveConnection(modelId: string): Promise<ExternalModelConnection> {
    const connection = await this.#session.getModelConnection();
    validateGatewayConnection(connection);
    return Object.freeze({
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      modelId,
    });
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

  async #readModels(): Promise<ExternalModelDescriptor[]> {
    const { models } = await this.#session.listAgentModels();
    return models.filter(isGatewayModel).map(toExternalModel);
  }

  #startWatching(): void {
    this.#sessionUnsubscribe = this.#session.onDidChange(() => {
      this.#modelSignature = null;
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
    this.#modelSignature = null;
  }

  async #poll(): Promise<void> {
    if (this.#pollInFlight) return;
    this.#pollInFlight = true;
    try {
      const models = await this.#readModels();
      const nextSignature = signature(models);
      this.#cachedModels = models;
      if (this.#modelSignature !== null && nextSignature !== this.#modelSignature) {
        this.#modelSignature = nextSignature;
        this.#emitChanged();
      } else {
        this.#modelSignature = nextSignature;
      }
    } catch {
      // A temporary control-plane outage must not remove the last known picker state.
    } finally {
      this.#pollInFlight = false;
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

function toExternalModel(model: AgentModel): ExternalModelDescriptor {
  const capabilities = mapCapabilities(model.capabilities);
  const reasoningCompatibility = mapReasoningCompatibility(model);
  return Object.freeze({
    id: model.id,
    displayName: model.displayName,
    protocol: ExternalModelProtocol.OpenAICompatible,
    ...(Object.keys(capabilities).length > 0 ? { capabilities: Object.freeze(capabilities) } : {}),
    ...(reasoningCompatibility ? { reasoningCompatibility } : {}),
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    isDefault: model.isDefault,
  });
}

type AepReasoningAwareAgentModel = AgentModel & {
  readonly reasoningCompatibility?: {
    readonly thinkingFormat: 'deepseek';
    readonly supportsReasoningEffort: true;
    readonly requiresReasoningContentOnAssistantMessages: true;
  };
};

function mapReasoningCompatibility(
  model: AgentModel,
): ExternalModelReasoningCompatibility | undefined {
  const value = (model as AepReasoningAwareAgentModel).reasoningCompatibility;
  if (value === undefined) return undefined;
  if (
    value.thinkingFormat !== ExternalModelThinkingFormat.DeepSeek ||
    value.supportsReasoningEffort !== true ||
    value.requiresReasoningContentOnAssistantMessages !== true
  ) {
    throw new Error('Zhiyuan model reasoning compatibility is not supported.');
  }
  return Object.freeze({
    thinkingFormat: ExternalModelThinkingFormat.DeepSeek,
    supportsReasoningEffort: true,
    requiresReasoningContentOnAssistantMessages: true,
  });
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

function signature(models: readonly ExternalModelDescriptor[]): string {
  return JSON.stringify(models);
}

function validateGatewayConnection(connection: ModelConnection): void {
  if (connection.protocol !== ExternalModelProtocol.OpenAICompatible) {
    throw new Error('Zhiyuan model gateway protocol is not supported.');
  }
}
