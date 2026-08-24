import type { AepSessionState, AepTokens, CurrentIdentity } from '@aep/sdk-node';
import { describe, expect, test, vi } from 'vitest';

import {
  ZhiyuanPasswordSession,
  type PasswordSessionClient,
} from './password-session.js';

describe('Zhiyuan password session', () => {
  test('coalesces concurrent restoration and returns immutable identity snapshots', async () => {
    let finishRestore: ((tokens: AepTokens) => void) | null = null;
    let signalRestoreStarted: (() => void) | null = null;
    const restoreStarted = new Promise<void>(resolve => {
      signalRestoreStarted = resolve;
    });
    const restoreResult = new Promise<AepTokens>(resolve => {
      finishRestore = resolve;
    });
    const client = mockClient({
      getSessionState: vi.fn(
        async (): Promise<AepSessionState> => ({ status: 'recoverable' }),
      ),
      restoreSession: vi.fn(async () => {
        signalRestoreStarted!();
        return restoreResult;
      }),
    });
    const session = new ZhiyuanPasswordSession(client);

    const first = session.initialize();
    const second = session.initialize();
    expect(first).toBe(second);
    await restoreStarted;
    finishRestore!(tokens());

    await expect(first).resolves.toMatchObject({ status: 'authenticated' });
    expect(client.getSessionState).toHaveBeenCalledTimes(1);
    expect(client.restoreSession).toHaveBeenCalledTimes(1);
    expect(client.getCurrentIdentity).toHaveBeenCalledTimes(1);

    const snapshot = session.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    if (snapshot.status === 'authenticated') {
      expect(Object.isFrozen(snapshot.identity)).toBe(true);
      expect(Object.isFrozen(snapshot.identity.roles)).toBe(true);
    }
  });

  test('keeps a recoverable state when refresh cannot complete', async () => {
    const client = mockClient({
      getSessionState: vi.fn(
        async (): Promise<AepSessionState> => ({ status: 'recoverable' }),
      ),
      restoreSession: vi.fn(async () => {
        throw new Error('service unavailable');
      }),
    });
    const session = new ZhiyuanPasswordSession(client);

    await expect(session.initialize()).rejects.toThrow('service unavailable');
    expect(session.snapshot()).toEqual({ status: 'recoverable' });
  });

  test('serializes password login and logout without exposing credentials', async () => {
    let finishLogin: (() => void) | null = null;
    const loginGate = new Promise<void>(resolve => {
      finishLogin = resolve;
    });
    const client = mockClient({
      loginWithPassword: vi.fn(async () => {
        await loginGate;
        return tokens();
      }),
    });
    const session = new ZhiyuanPasswordSession(client);

    const login = session.login({
      enterpriseId: 'enterprise-1',
      username: 'admin',
      password: 'never-persist-this',
    });
    const logout = session.logout();
    expect(client.logout).not.toHaveBeenCalled();

    finishLogin!();
    await expect(login).resolves.toMatchObject({ status: 'authenticated' });
    await expect(logout).resolves.toEqual({ status: 'signed-out' });
    expect(client.logout).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(session.snapshot())).not.toContain('never-persist-this');
  });

  test('validates password operations before calling the SDK', async () => {
    const client = mockClient();
    const session = new ZhiyuanPasswordSession(client);

    await expect(
      session.login({ enterpriseId: '', username: 'admin', password: 'secret' }),
    ).rejects.toThrow('required');
    await expect(session.changePassword('', 'new-secret')).rejects.toThrow('required');
    expect(client.loginWithPassword).not.toHaveBeenCalled();
    expect(client.changePassword).not.toHaveBeenCalled();
  });
});

function mockClient(overrides: Partial<PasswordSessionClient> = {}): PasswordSessionClient {
  return {
    getSessionState: vi.fn(async (): Promise<AepSessionState> => ({ status: 'signed-out' })),
    restoreSession: vi.fn(async () => null),
    loginWithPassword: vi.fn(async () => tokens()),
    changePassword: vi.fn(async () => tokens()),
    getCurrentIdentity: vi.fn(async () => identity()),
    logout: vi.fn(async () => undefined),
    ...overrides,
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
