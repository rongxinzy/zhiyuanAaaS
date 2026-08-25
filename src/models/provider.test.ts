import type {
  AepSessionState,
  AepTokens,
  AgentModel,
  CurrentIdentity,
  ModelConnection,
} from '@aep/sdk-node';
import { describe, expect, test, vi } from 'vitest';

import { ModelCapabilityStatus } from '../host-contract.js';
import {
  ZhiyuanModelProvider,
  ZHIYUAN_MODEL_PROVIDER_DISPLAY_NAME,
  ZHIYUAN_MODEL_PROVIDER_ID,
} from './provider.js';
import {
  ZhiyuanPasswordSession,
  type PasswordSessionClient,
} from '../session/password-session.js';

describe('ZhiyuanModelProvider', () => {
  test('projects only assigned gateway models and resolves the current gateway token', async () => {
    const client = mockClient({
      listAgentModels: vi.fn(async () => ({
        models: [
          model({
            capabilities: ['text', 'streaming', 'tools', 'vision', 'reasoning'],
            contextWindow: 128_000,
          }),
          model({ id: 'disabled', enabled: false }),
          model({ id: 'local', sourceType: 'local' }),
        ],
      })),
    });
    const session = await authenticatedSession(client);
    const provider = new ZhiyuanModelProvider(session);

    expect(provider.id).toBe(ZHIYUAN_MODEL_PROVIDER_ID);
    expect(provider.displayName).toBe(ZHIYUAN_MODEL_PROVIDER_DISPLAY_NAME);
    await expect(provider.listModels()).resolves.toEqual([
      {
        id: 'enterprise-chat',
        displayName: 'Enterprise Chat',
        protocol: 'openai-compatible',
        capabilities: {
          toolCalling: ModelCapabilityStatus.Supported,
          imageInput: ModelCapabilityStatus.Supported,
          reasoning: ModelCapabilityStatus.Supported,
        },
        contextWindow: 128_000,
        isDefault: true,
      },
    ]);
    await expect(provider.resolveConnection('enterprise-chat')).resolves.toEqual({
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'model-token',
      modelId: 'enterprise-chat',
    });
    expect(client.getModelConnection).toHaveBeenCalledOnce();
  });

  test('signals login changes and remote assignment changes without overlapping polls', async () => {
    let models = [model()];
    let poll: (() => void) | null = null;
    const clearInterval = vi.fn();
    const client = mockClient({
      listAgentModels: vi.fn(async () => ({ models })),
    });
    const session = new ZhiyuanPasswordSession(client);
    const provider = new ZhiyuanModelProvider(session, {
      pollIntervalMs: 10,
      setInterval: callback => {
        poll = callback;
        return { unref: vi.fn() };
      },
      clearInterval,
    });
    const changed = vi.fn();
    const unsubscribe = provider.onDidChange(changed);

    await session.login({ enterpriseId: 'enterprise-1', username: 'admin', password: 'secret' });
    expect(changed).toHaveBeenCalledOnce();
    await provider.listModels();

    models = [model(), model({ id: 'second', displayName: 'Second Model', isDefault: false })];
    poll!();
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));

    unsubscribe();
    unsubscribe();
    expect(clearInterval).toHaveBeenCalledOnce();
  });

  test('rejects a gateway with an incompatible protocol', async () => {
    const session = await authenticatedSession(
      mockClient({
        getModelConnection: vi.fn(async () => ({
          ...connection(),
          protocol: 'anthropic-compatible' as never,
        })),
      }),
    );
    const provider = new ZhiyuanModelProvider(session);

    await expect(provider.resolveConnection('enterprise-chat')).rejects.toThrow(
      'protocol is not supported',
    );
  });

  test('keeps the last successful model list during a control-plane outage', async () => {
    const listAgentModels = vi
      .fn()
      .mockResolvedValueOnce({ models: [model()] })
      .mockRejectedValueOnce(new Error('temporary outage'));
    const provider = new ZhiyuanModelProvider(
      await authenticatedSession(mockClient({ listAgentModels })),
    );

    const initial = await provider.listModels();
    await expect(provider.listModels()).resolves.toEqual(initial);
  });
});

async function authenticatedSession(client: PasswordSessionClient): Promise<ZhiyuanPasswordSession> {
  const session = new ZhiyuanPasswordSession(client);
  await session.login({ enterpriseId: 'enterprise-1', username: 'admin', password: 'secret' });
  return session;
}

function mockClient(overrides: Partial<PasswordSessionClient> = {}): PasswordSessionClient {
  return {
    getSessionState: vi.fn(async (): Promise<AepSessionState> => ({ status: 'signed-out' })),
    restoreSession: vi.fn(async () => null),
    refreshSession: vi.fn(async () => tokens()),
    loginWithPassword: vi.fn(async () => tokens()),
    changePassword: vi.fn(async () => tokens()),
    getCurrentIdentity: vi.fn(async () => identity()),
    listAgentModels: vi.fn(async () => ({ models: [] })),
    getModelConnection: vi.fn(async () => connection()),
    logout: vi.fn(async () => undefined),
    ...overrides,
  };
}

function model(overrides: Partial<AgentModel> = {}): AgentModel {
  return {
    id: 'enterprise-chat',
    displayName: 'Enterprise Chat',
    sourceType: 'gateway',
    protocol: 'openai-compatible',
    capabilities: ['text', 'streaming'],
    isDefault: true,
    enabled: true,
    ...overrides,
  };
}

function connection(): ModelConnection {
  return {
    baseUrl: 'https://gateway.example/v1',
    protocol: 'openai-compatible',
    apiVersion: 'v1',
    apiKey: 'model-token',
    expiresIn: 300,
  };
}

function tokens(): AepTokens {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    modelAccessToken: 'model-token',
    tokenType: 'Bearer',
    expiresIn: 900,
    modelAccessExpiresIn: 300,
    passwordChangeRequired: false,
  };
}

function identity(): CurrentIdentity {
  return {
    user: { id: 'user-1', displayName: 'Administrator' },
    enterprise: { id: 'enterprise-1', name: 'Zhiyuan' },
    roles: ['admin'],
    sessionExpiresAt: '2026-08-25T11:00:00Z',
    passwordChangeRequired: false,
  };
}
