import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AepProtectedStorage } from '@aep/sdk-node';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ZhiyuanEnterpriseHostContext } from '../host-contract.js';
import { createZhiyuanSessionRuntime } from './runtime.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Zhiyuan session runtime', () => {
  test('composes fixed configuration, stable Agent ID, and protected storage', async () => {
    const root = createTemporaryDirectory();
    const context = hostContext(root);
    const configDirectory = path.join(context.paths.resources, 'zhiyuan-enterprise');
    fs.mkdirSync(configDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(configDirectory, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        aepBaseUrl: 'http://127.0.0.1:8080',
        allowInsecureHttp: true,
      }),
    );
    const protectedStorage: AepProtectedStorage = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const createProtectedStorage = vi.fn(() => protectedStorage);

    const session = await createZhiyuanSessionRuntime(context, {
      loadSafeStorage: vi.fn(async () => ({
        isEncryptionAvailable: () => true,
        encryptString: (value: string) => Buffer.from(value),
        decryptString: (value: Buffer) => value.toString('utf8'),
      })),
      createProtectedStorage,
    });

    await expect(session.initialize()).resolves.toEqual({ status: 'signed-out' });
    expect(createProtectedStorage).toHaveBeenCalledWith(
      path.join(context.paths.userData, 'zhiyuan-enterprise', 'secrets'),
      expect.any(Object),
    );
    expect(
      fs.readFileSync(path.join(context.paths.userData, 'zhiyuan-enterprise', 'agent-id'), 'utf8'),
    ).toMatch(/[0-9a-f-]{36}/);
  });
});

function hostContext(root: string): ZhiyuanEnterpriseHostContext {
  return {
    apiVersion: 1,
    appVersion: '2026.8.0',
    isPackaged: true,
    platform: 'win32',
    paths: {
      resources: path.join(root, 'resources'),
      userData: path.join(root, 'user-data'),
    },
    capabilities: { session: null, renderer: null },
  };
}

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zhiyuan-session-runtime-'));
  temporaryDirectories.push(directory);
  return directory;
}
