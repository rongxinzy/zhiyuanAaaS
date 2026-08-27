import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AepSessionState } from '@aep/sdk-node';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createZhiyuanEnterpriseExtension,
  ZhiyuanAaaSExtension,
  ZHIYUAN_ENTERPRISE_EXTENSION_ID,
  ZHIYUAN_ENTERPRISE_SESSION_GATE_ENTRYPOINT,
  ZHIYUAN_ENTERPRISE_SETTINGS_ENTRYPOINT,
  ZHIYUAN_ENTERPRISE_SETTINGS_PAGES,
} from './extension.js';
import {
  ZHIYUAN_AGENT_CONTROL_CAPABILITY_API_VERSION,
  ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION,
  type ZhiyuanManagedProviderSource,
  type ZhiyuanEnterpriseSessionProvider,
  type ZhiyuanEnterpriseHostContext,
} from './host-contract.js';
import { ZhiyuanPasswordSession } from './session/password-session.js';

describe('Zhiyuan enterprise extension contract', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    vi.useRealTimers();
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

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

  test('registers the renderer session gate and releases it during disposal', async () => {
    const unregister = vi.fn();
    const registerSessionGate = vi.fn(() => unregister);
    const extension = createZhiyuanEnterpriseExtension();

    await extension.initialize(
      hostContext(null, {
        apiVersion: 1,
        registerSessionGate,
      }),
    );

    expect(registerSessionGate).toHaveBeenCalledWith(ZHIYUAN_ENTERPRISE_SESSION_GATE_ENTRYPOINT);
    await extension.dispose();
    await extension.dispose();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  test('registers separate enterprise account and model pages and releases them', async () => {
    const unregister = vi.fn();
    const registerPage = vi.fn(() => unregister);
    const extension = createZhiyuanEnterpriseExtension();

    await extension.initialize(
      hostContext(null, null, {
        apiVersion: 1,
        registerPage,
      }),
    );

    expect(registerPage).toHaveBeenCalledTimes(2);
    expect(registerPage).toHaveBeenNthCalledWith(1, ZHIYUAN_ENTERPRISE_SETTINGS_PAGES[0]);
    expect(registerPage).toHaveBeenNthCalledWith(2, ZHIYUAN_ENTERPRISE_SETTINGS_PAGES[1]);
    expect(ZHIYUAN_ENTERPRISE_SETTINGS_PAGES.every(page =>
      page.entrypoint === ZHIYUAN_ENTERPRISE_SETTINGS_ENTRYPOINT,
    )).toBe(true);
    await extension.dispose();
    await extension.dispose();
    expect(unregister).toHaveBeenCalledTimes(2);
  });

  test('rolls back the first settings page when the second registration fails', async () => {
    const unregisterAccount = vi.fn();
    const registerPage = vi
      .fn()
      .mockReturnValueOnce(unregisterAccount)
      .mockImplementationOnce(() => {
        throw new Error('duplicate models page');
      });
    const extension = createZhiyuanEnterpriseExtension();

    await expect(
      extension.initialize(hostContext(null, null, { apiVersion: 1, registerPage })),
    ).rejects.toThrow('duplicate models page');
    expect(unregisterAccount).toHaveBeenCalledOnce();
  });

  test('registers the AEP managed provider source and releases it during disposal', async () => {
    const unregister = vi.fn();
    const registerSource = vi.fn((_provider: ZhiyuanManagedProviderSource) => unregister);
    const session = passwordSession();
    const extension = new ZhiyuanAaaSExtension({
      createSession: vi.fn(async () => session),
      warn: vi.fn(),
    });

    await extension.initialize(
      hostContext(null, null, null, {
        apiVersion: 1,
        registerSource,
      }),
    );

    expect(registerSource).toHaveBeenCalledOnce();
    const provider = registerSource.mock.calls[0]?.[0];
    expect(provider?.providerKey).toBe('custom_enterprise');
    expect(provider?.exclusive).toBe(true);
    expect(provider?.snapshot).toEqual(expect.any(Function));

    await extension.dispose();
    await extension.dispose();
    expect(unregister).toHaveBeenCalledOnce();
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

  test('fails closed for an incompatible renderer capability', async () => {
    const extension = createZhiyuanEnterpriseExtension();

    await expect(
      extension.initialize(
        hostContext(null, {
          apiVersion: 2,
          registerSessionGate: vi.fn(),
        } as never),
      ),
    ).rejects.toThrow('renderer capability API version is not supported');
  });

  test('fails closed for an incompatible settings capability', async () => {
    const extension = createZhiyuanEnterpriseExtension();
    const registerSessionGate = vi.fn();

    await expect(
      extension.initialize(
        hostContext(null, { apiVersion: 1, registerSessionGate }, {
          apiVersion: 2,
          registerPage: vi.fn(),
        } as never),
      ),
    ).rejects.toThrow('settings capability API version is not supported');
    expect(registerSessionGate).not.toHaveBeenCalled();
  });

  test('fails closed for an incompatible managed provider capability', async () => {
    const extension = createZhiyuanEnterpriseExtension();

    await expect(
      extension.initialize(
        hostContext(null, null, null, {
          apiVersion: 2,
          registerSource: vi.fn(),
        } as never),
      ),
    ).rejects.toThrow('managed provider capability API version is not supported');
  });

  test('starts and stops the Agent control backend through the host capability', async () => {
    vi.useFakeTimers();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiyuan-extension-'));
    temporaryDirectories.push(directory);
    const heartbeat = vi.fn(async () => ({
      serverTime: '2026-08-26T00:00:00.000Z',
      hasPendingControlEvents: false,
      controlEventWatermark: null,
      nextHeartbeatAfterSeconds: 30,
    }));
    const session = passwordSession({ heartbeat });
    const notifySkillsChanged = vi.fn();
    const extension = new ZhiyuanAaaSExtension({
      createSession: vi.fn(async () => session),
      warn: vi.fn(),
    });

    await extension.initialize(
      hostContext(
        null,
        null,
        null,
        null,
        {
          apiVersion: ZHIYUAN_AGENT_CONTROL_CAPABILITY_API_VERSION,
          skillRoot: path.join(directory, 'skills'),
          notifySkillsChanged,
        },
        { userData: path.join(directory, 'user-data') },
      ),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(heartbeat).toHaveBeenCalled();
    await extension.dispose();
    const heartbeatCalls = heartbeat.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heartbeat).toHaveBeenCalledTimes(heartbeatCalls);
    expect(notifySkillsChanged).not.toHaveBeenCalled();
  });

  test('fails closed for an incompatible Agent control capability', async () => {
    const extension = createZhiyuanEnterpriseExtension();

    await expect(
      extension.initialize(
        hostContext(null, null, null, null, {
          apiVersion: 2,
          skillRoot: 'D:\\zhiyuan\\skills',
          notifySkillsChanged: vi.fn(),
        } as never),
      ),
    ).rejects.toThrow('Agent control capability API version is not supported');
  });
});

function hostContext(
  session: ZhiyuanEnterpriseHostContext['capabilities']['session'] = null,
  renderer: ZhiyuanEnterpriseHostContext['capabilities']['renderer'] = null,
  settings: ZhiyuanEnterpriseHostContext['capabilities']['settings'] = null,
  managedProvider: ZhiyuanEnterpriseHostContext['capabilities']['managedProvider'] = null,
  agentControl: ZhiyuanEnterpriseHostContext['capabilities']['agentControl'] = null,
  paths: Partial<ZhiyuanEnterpriseHostContext['paths']> = {},
): ZhiyuanEnterpriseHostContext {
  return Object.freeze({
    apiVersion: ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION,
    appVersion: '2026.8.0',
    isPackaged: false,
    platform: process.platform,
    paths: Object.freeze({
      resources: 'D:\\zhiyuan\\resources',
      userData: 'D:\\zhiyuan\\user-data',
      ...paths,
    }),
    capabilities: Object.freeze({ session, renderer, settings, managedProvider, agentControl }),
  });
}

function passwordSession(
  overrides: Partial<ConstructorParameters<typeof ZhiyuanPasswordSession>[0]> = {},
): ZhiyuanPasswordSession {
  return new ZhiyuanPasswordSession({
    getSessionState: vi.fn(async (): Promise<AepSessionState> => ({ status: 'signed-out' })),
    restoreSession: vi.fn(async () => null),
    refreshSession: vi.fn(),
    loginWithPassword: vi.fn(),
    changePassword: vi.fn(),
    getCurrentIdentity: vi.fn(),
    listAgentModels: vi.fn(async () => ({ models: [] })),
    getModelConnection: vi.fn(async () => ({
      baseUrl: 'https://gateway.example/v1',
      protocol: 'openai-compatible' as const,
      apiVersion: 'v1' as const,
      apiKey: 'model-token',
      expiresIn: 300,
    })),
    getSkillManifest: vi.fn(async () => ({ notModified: true as const, etag: null })),
    downloadSkillPackage: vi.fn(async () => new Uint8Array()),
    reportSkillSyncResult: vi.fn(async () => undefined),
    uploadEventBatch: vi.fn(async () => ({ accepted: [], rejected: [] })),
    heartbeat: vi.fn(async () => ({
      serverTime: '2026-08-26T00:00:00.000Z',
      hasPendingControlEvents: false,
      controlEventWatermark: null,
      nextHeartbeatAfterSeconds: 30,
    })),
    listControlEvents: vi.fn(async () => ({ items: [], nextCursor: null })),
    acknowledgeControlEvent: vi.fn(async () => undefined),
    reportControlEventResult: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    ...overrides,
  });
}
