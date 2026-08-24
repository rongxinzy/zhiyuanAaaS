import type { AepSessionState } from '@aep/sdk-node';
import { describe, expect, test, vi } from 'vitest';

import {
  createZhiyuanEnterpriseExtension,
  ZhiyuanAaaSExtension,
  ZHIYUAN_ENTERPRISE_EXTENSION_ID,
} from './extension.js';
import {
  ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION,
  type ZhiyuanEnterpriseSessionProvider,
  type ZhiyuanEnterpriseHostContext,
} from './host-contract.js';
import { ZhiyuanPasswordSession } from './session/password-session.js';

describe('Zhiyuan enterprise extension contract', () => {
  test('exports the API v1 factory expected by the public host', async () => {
    const extension = createZhiyuanEnterpriseExtension();
    const context = hostContext();

    expect(extension.apiVersion).toBe(ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION);
    expect(extension.id).toBe(ZHIYUAN_ENTERPRISE_EXTENSION_ID);
    await expect(extension.initialize(context)).resolves.toBeUndefined();
    await expect(extension.dispose()).resolves.toBeUndefined();
  });

  test('rejects incompatible hosts and duplicate initialization', async () => {
    const incompatible = createZhiyuanEnterpriseExtension();
    await expect(
      incompatible.initialize({ ...hostContext(), apiVersion: 2 } as never),
    ).rejects.toThrow('API version is not supported');

    const extension = createZhiyuanEnterpriseExtension();
    await extension.initialize(hostContext());
    await expect(extension.initialize(hostContext())).rejects.toThrow('cannot initialize from active');
  });

  test('registers the password provider and unregisters it during disposal', async () => {
    const unregister = vi.fn();
    const registerProvider = vi.fn((_provider: ZhiyuanEnterpriseSessionProvider) => unregister);
    const session = passwordSession();
    const extension = new ZhiyuanAaaSExtension({
      createSession: vi.fn(async () => session),
      warn: vi.fn(),
    });

    await extension.initialize(
      hostContext({
        apiVersion: 1,
        registerProvider,
      }),
    );

    expect(registerProvider).toHaveBeenCalledTimes(1);
    const provider = registerProvider.mock.calls[0]?.[0];
    expect(await provider?.snapshot()).toEqual({ status: 'signed-out' });

    await extension.dispose();
    await extension.dispose();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  test('keeps the provider available when startup restoration is deferred', async () => {
    const registerProvider = vi.fn((_provider: ZhiyuanEnterpriseSessionProvider) => vi.fn());
    const warn = vi.fn();
    const session = passwordSession({
      getSessionState: vi.fn(async () => {
        throw new Error('service unavailable');
      }),
    });
    const extension = new ZhiyuanAaaSExtension({
      createSession: vi.fn(async () => session),
      warn,
    });

    await expect(
      extension.initialize(hostContext({ apiVersion: 1, registerProvider })),
    ).resolves.toBeUndefined();
    expect(registerProvider).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[EnterpriseSession] Session restoration could not complete and remains retryable.',
    );
  });

  test('fails closed for an incompatible session capability', async () => {
    const extension = new ZhiyuanAaaSExtension({
      createSession: vi.fn(async () => passwordSession()),
      warn: vi.fn(),
    });

    await expect(
      extension.initialize(
        hostContext({
          apiVersion: 2,
          registerProvider: vi.fn(),
        } as never),
      ),
    ).rejects.toThrow('session capability API version is not supported');
  });
});

function hostContext(
  session: ZhiyuanEnterpriseHostContext['capabilities']['session'] = null,
): ZhiyuanEnterpriseHostContext {
  return Object.freeze({
    apiVersion: ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION,
    appVersion: '2026.8.0',
    isPackaged: false,
    platform: process.platform,
    paths: Object.freeze({
      resources: 'D:\\zhiyuan\\resources',
      userData: 'D:\\zhiyuan\\user-data',
    }),
    capabilities: Object.freeze({ session }),
  });
}

function passwordSession(
  overrides: Partial<ConstructorParameters<typeof ZhiyuanPasswordSession>[0]> = {},
): ZhiyuanPasswordSession {
  return new ZhiyuanPasswordSession({
    getSessionState: vi.fn(async (): Promise<AepSessionState> => ({ status: 'signed-out' })),
    restoreSession: vi.fn(async () => null),
    loginWithPassword: vi.fn(),
    changePassword: vi.fn(),
    getCurrentIdentity: vi.fn(),
    logout: vi.fn(async () => undefined),
    ...overrides,
  });
}
