import type {
  AepProtectedStorage,
  AepRequest,
  AepResponse,
  AepTokens,
  AepTransport,
  CurrentIdentity,
} from '@aep/sdk-node';
import { describe, expect, test, vi } from 'vitest';

import { createZhiyuanPasswordSession } from './factory.js';

describe('Zhiyuan password session factory', () => {
  test('derives a safe refresh-token key for arbitrary protocol agent IDs', async () => {
    const write = vi.fn(async (_key: string, _value: Uint8Array) => undefined);
    const protectedStorage: AepProtectedStorage = {
      read: vi.fn(async () => null),
      write,
      remove: vi.fn(async () => undefined),
    };
    const session = createZhiyuanPasswordSession({
      baseUrl: 'http://127.0.0.1:8080',
      agentId: 'Agent / Customer Device #1',
      agentVersion: '2026.8.0',
      platform: 'windows',
      protectedStorage,
      transport: fixtureTransport(),
    });

    await expect(
      session.login({
        enterpriseId: 'enterprise-1',
        username: 'admin',
        password: 'secret',
      }),
    ).resolves.toMatchObject({ status: 'authenticated' });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toMatch(/^aep\.refresh-token\.[0-9a-f]{64}$/);
  });
});

function fixtureTransport(): AepTransport {
  return {
    async request<T>(_baseUrl: string, request: AepRequest): Promise<AepResponse<T>> {
      const data = request.path.endsWith('/auth/password/login') ? tokens() : identity();
      return { status: 200, headers: new Headers(), data: data as T };
    },
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
    sessionExpiresAt: '2026-08-24T11:00:00Z',
    passwordChangeRequired: false,
  };
}
