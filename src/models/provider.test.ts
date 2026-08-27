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
  ZHIYUAN_MODEL_PROVIDER_KEY,
} from './provider.js';
import {
  ZhiyuanPasswordSession,
  type PasswordSessionClient,
} from '../session/password-session.js';

describe('ZhiyuanModelProvider', () => {
  test('projects assigned gateway models into a managed custom provider snapshot', async () => {
    const client = mockClient({
      listAgentModels: vi.fn(async () => ({
        models: [
          model({ id: 'secondary', displayName: 'Secondary', isDefault: false }),
          model({
            capabilities: ['text', 'streaming', 'tools', 'vision', 'reasoning'],
            reasoningCompatibility: {
              thinkingFormat: 'deepseek',
              supportsReasoningEffort: true,
              requiresReasoningContentOnAssistantMessages: true,
            },
            contextWindow: 128_000,
          }),
          model({ id: 'disabled', enabled: false }),
          model({ id: 'local', sourceType: 'local' }),
        ],
      })),
    });
    const provider = new ZhiyuanModelProvider(await authenticatedSession(client));

    expect(provider.providerKey).toBe(ZHIYUAN_MODEL_PROVIDER_KEY);
    expect(provider.providerKey).toBe('custom_enterprise');
    expect(ZHIYUAN_MODEL_PROVIDER_DISPLAY_NAME).toBe('Zhiyuan');
    expect(provider.exclusive).toBe(true);
    await expect(provider.snapshot()).resolves.toEqual({
      enabled: true,
      userEnabled: true,
      apiKey: 'model-token',
      baseUrl: 'https://gateway.example/v1',
      apiFormat: 'openai',
      displayName: 'Zhiyuan',
      models: [
        {
          id: 'enterprise-chat',
          name: 'Enterprise Chat',
          supportsImage: true,
          capabilities: {
            toolCalling: ModelCapabilityStatus.Supported,
            imageInput: ModelCapabilityStatus.Supported,
            reasoning: ModelCapabilityStatus.Supported,
          },
          contextWindow: 128_000,
          piRuntime: {
            api: 'openai-completions',
            reasoning: true,
            compat: {
              thinkingFormat: 'deepseek',
              supportsReasoningEffort: true,
              requiresReasoningContentOnAssistantMessages: true,
            },
          },
        },
        { id: 'secondary', name: 'Secondary' },
      ],
    });
    expect(client.getModelConnection).toHaveBeenCalledOnce();
  });

  test('signals login changes and remote assignment changes without overlapping polls', async () => {
    let models = [model()];
    let poll: (() => void) | null = null;
    const clearInterval = vi.fn();
    const client = mockClient({ listAgentModels: vi.fn(async () => ({ models })) });
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
    await provider.snapshot();

    models = [model(), model({ id: 'second', displayName: 'Second Model', isDefault: false })];
    poll!();
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));

    unsubscribe();
    unsubscribe();
    expect(clearInterval).toHaveBeenCalledOnce();
  });

  test('rejects a gateway with an incompatible protocol', async () => {
    const provider = new ZhiyuanModelProvider(
      await authenticatedSession(
        mockClient({
          getModelConnection: vi.fn(async () => ({
            ...connection(),
            protocol: 'anthropic-compatible' as never,
          })),
        }),
      ),
    );

    await expect(provider.snapshot()).rejects.toThrow('protocol is not supported');
  });

  test('rejects unsupported reasoning compatibility metadata', async () => {
    const provider = new ZhiyuanModelProvider(
      await authenticatedSession(
        mockClient({
          listAgentModels: vi.fn(async () => ({
            models: [
              model({
                reasoningCompatibility: {
                  thinkingFormat: 'deepseek',
                  // Deliberately violate the protocol type to exercise the
                  // provider's runtime rejection path.
                  supportsReasoningEffort: false as unknown as true,
                  requiresReasoningContentOnAssistantMessages: true,
                },
              }),
            ],
          })),
        }),
      ),
    );

    await expect(provider.snapshot()).rejects.toThrow('reasoning compatibility is not supported');
  });

  test('fails the snapshot during a control-plane outage', async () => {
    const provider = new ZhiyuanModelProvider(
      await authenticatedSession(
        mockClient({ listAgentModels: vi.fn(async () => Promise.reject(new Error('outage'))) }),
      ),
    );

    await expect(provider.snapshot()).rejects.toThrow('outage');
    expect(provider.exclusive).toBe(true);
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

type ReasoningAwareAgentModel = AgentModel & {
  reasoningCompatibility?: {
    thinkingFormat: 'deepseek';
    supportsReasoningEffort: boolean;
    requiresReasoningContentOnAssistantMessages: boolean;
  };
};

function model(overrides: Partial<ReasoningAwareAgentModel> = {}): ReasoningAwareAgentModel {
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
