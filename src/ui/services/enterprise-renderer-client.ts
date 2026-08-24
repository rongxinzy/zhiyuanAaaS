import type {
  EnterprisePasswordChangeInput,
  EnterprisePasswordLoginInput,
  EnterpriseSessionResult,
} from '../../host-contract.js';
import {
  EnterpriseRendererMessageSource,
  EnterpriseRendererMessageType,
  EnterpriseRendererSessionOperation,
  type EnterpriseRendererInitializeMessage,
  type EnterpriseRendererReadyMessage,
  type EnterpriseRendererSessionRequestMessage,
  type EnterpriseRendererSessionResponseMessage,
} from '../../renderer-contract.js';

const REQUEST_TIMEOUT_MS = 30_000;

interface PendingRequest {
  readonly resolve: (result: EnterpriseSessionResult) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: number;
}

export class EnterpriseRendererClient {
  readonly #pending = new Map<string, PendingRequest>();
  #onInitialize: ((message: EnterpriseRendererInitializeMessage) => void) | null = null;
  #started = false;

  start(onInitialize: (message: EnterpriseRendererInitializeMessage) => void): () => void {
    this.#onInitialize = onInitialize;
    if (!this.#started) {
      this.#started = true;
      window.addEventListener('message', this.#handleMessage);
    }
    const ready: EnterpriseRendererReadyMessage = {
      source: EnterpriseRendererMessageSource.Module,
      apiVersion: 1,
      type: EnterpriseRendererMessageType.Ready,
    };
    window.parent.postMessage(ready, '*');
    return () => this.stop();
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    this.#onInitialize = null;
    window.removeEventListener('message', this.#handleMessage);
    for (const pending of this.#pending.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error('Zhiyuan enterprise renderer stopped.'));
    }
    this.#pending.clear();
  }

  snapshot(): Promise<EnterpriseSessionResult> {
    return this.#request(EnterpriseRendererSessionOperation.Snapshot);
  }

  login(input: EnterprisePasswordLoginInput): Promise<EnterpriseSessionResult> {
    return this.#request(EnterpriseRendererSessionOperation.Login, input);
  }

  changePassword(input: EnterprisePasswordChangeInput): Promise<EnterpriseSessionResult> {
    return this.#request(EnterpriseRendererSessionOperation.ChangePassword, input);
  }

  logout(): Promise<EnterpriseSessionResult> {
    return this.#request(EnterpriseRendererSessionOperation.Logout);
  }

  #request(
    operation: EnterpriseRendererSessionOperation,
    input?: EnterprisePasswordLoginInput | EnterprisePasswordChangeInput,
  ): Promise<EnterpriseSessionResult> {
    if (!this.#started) return Promise.reject(new Error('Enterprise renderer is not connected.'));
    const requestId = crypto.randomUUID();
    const request = {
      source: EnterpriseRendererMessageSource.Module,
      apiVersion: 1,
      type: EnterpriseRendererMessageType.SessionRequest,
      requestId,
      operation,
      ...(input ? { input } : {}),
    } as EnterpriseRendererSessionRequestMessage;

    return new Promise<EnterpriseSessionResult>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error('Enterprise session request timed out.'));
      }, REQUEST_TIMEOUT_MS);
      this.#pending.set(requestId, { resolve, reject, timeout });
      window.parent.postMessage(request, '*');
    });
  }

  readonly #handleMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return;
    const message = asRecord(event.data);
    if (
      message?.source !== EnterpriseRendererMessageSource.Host ||
      message.apiVersion !== 1
    ) {
      return;
    }
    if (message.type === EnterpriseRendererMessageType.Initialize) {
      this.#onInitialize?.(message as unknown as EnterpriseRendererInitializeMessage);
      return;
    }
    if (
      message.type !== EnterpriseRendererMessageType.SessionResponse ||
      typeof message.requestId !== 'string'
    ) {
      return;
    }
    const pending = this.#pending.get(message.requestId);
    if (!pending || !isSessionResult(message.result)) return;
    this.#pending.delete(message.requestId);
    window.clearTimeout(pending.timeout);
    pending.resolve(
      (message as unknown as EnterpriseRendererSessionResponseMessage).result,
    );
  };
}

function isSessionResult(value: unknown): value is EnterpriseSessionResult {
  const result = asRecord(value);
  return result?.ok === true ? asRecord(result.snapshot) !== null : result?.ok === false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}
