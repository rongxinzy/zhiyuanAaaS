import path from 'node:path';

import type { AepProtectedStorage } from '@aep/sdk-node';

import { resolveZhiyuanAgentId } from '../agent-id.js';
import { loadZhiyuanEnterpriseConfig } from '../enterprise-config.js';
import type { ZhiyuanEnterpriseHostContext } from '../host-contract.js';
import { createZhiyuanPasswordSession } from './factory.js';
import {
  ProtectedFileStorage,
  SafeStorageProtector,
  type SafeStorageLike,
} from './protected-file-storage.js';
import type { ZhiyuanPasswordSession } from './password-session.js';

export interface SessionRuntimeDependencies {
  readonly loadSafeStorage?: () => Promise<SafeStorageLike>;
  readonly createProtectedStorage?: (
    directory: string,
    safeStorage: SafeStorageLike,
  ) => AepProtectedStorage;
}

export async function createZhiyuanSessionRuntime(
  context: ZhiyuanEnterpriseHostContext,
  dependencies: SessionRuntimeDependencies = {},
): Promise<ZhiyuanPasswordSession> {
  const [config, agentId, safeStorage] = await Promise.all([
    loadZhiyuanEnterpriseConfig(context.paths.resources),
    resolveZhiyuanAgentId(context.paths.userData),
    (dependencies.loadSafeStorage ?? loadElectronSafeStorage)(),
  ]);
  const protectedStorage = (
    dependencies.createProtectedStorage ?? createDefaultProtectedStorage
  )(
    path.join(context.paths.userData, 'zhiyuan-enterprise', 'secrets'),
    safeStorage,
  );
  return createZhiyuanPasswordSession({
    baseUrl: config.aepBaseUrl,
    agentId,
    agentVersion: context.appVersion,
    platform: mapPlatform(context.platform),
    protectedStorage,
  });
}

function createDefaultProtectedStorage(
  directory: string,
  safeStorage: SafeStorageLike,
): AepProtectedStorage {
  return new ProtectedFileStorage(directory, new SafeStorageProtector(safeStorage));
}

async function loadElectronSafeStorage(): Promise<SafeStorageLike> {
  const electron = await import('electron');
  return electron.safeStorage;
}

function mapPlatform(platform: NodeJS.Platform): 'windows' | 'macos' | 'linux' {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  throw new Error(`Zhiyuan enterprise platform ${platform} is not supported.`);
}
