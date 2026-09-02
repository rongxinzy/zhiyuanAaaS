import path from 'node:path';

import type { AepClient, AepProtectedStorage } from '@aep/sdk-node';

import { resolveZhiyuanAgentId } from '../agent-id.js';
import { loadZhiyuanEnterpriseConfig } from '../enterprise-config.js';
import type { ZhiyuanEnterpriseHostContext } from '../host-contract.js';
import { createZhiyuanAepClient, type ZhiyuanPasswordSessionOptions } from './factory.js';
import {
  ProtectedFileStorage,
  SafeStorageProtector,
  type SafeStorageLike,
} from './protected-file-storage.js';
import { ZhiyuanPasswordSession } from './password-session.js';
import { ZhiyuanLicenseActivation } from '../license/activation.js';

export interface SessionRuntimeDependencies {
  readonly loadSafeStorage?: () => Promise<SafeStorageLike>;
  readonly createProtectedStorage?: (
    directory: string,
    safeStorage: SafeStorageLike,
  ) => AepProtectedStorage;
  readonly createClient?: (options: ZhiyuanPasswordSessionOptions) => AepClient;
}

export interface ZhiyuanSessionRuntimeComponents {
  readonly session: ZhiyuanPasswordSession;
  readonly client: AepClient;
  readonly agentId: string;
  readonly platform: 'windows' | 'macos' | 'linux';
  readonly licenseActivation: ZhiyuanLicenseActivation | null;
}

export async function createZhiyuanSessionRuntime(
  context: ZhiyuanEnterpriseHostContext,
  dependencies: SessionRuntimeDependencies = {},
): Promise<ZhiyuanPasswordSession> {
  return (await createZhiyuanSessionRuntimeComponents(context, dependencies)).session;
}

export async function createZhiyuanSessionRuntimeComponents(
  context: ZhiyuanEnterpriseHostContext,
  dependencies: SessionRuntimeDependencies = {},
): Promise<ZhiyuanSessionRuntimeComponents> {
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
  const platform = mapPlatform(context.platform);
  const client = (dependencies.createClient ?? createZhiyuanAepClient)({
    baseUrl: config.aepBaseUrl,
    agentId,
    agentVersion: context.appVersion,
    platform,
    protectedStorage,
  });
  const session = new ZhiyuanPasswordSession(client);
  const licenseActivation = config.license
    ? await ZhiyuanLicenseActivation.create({
        resourcesPath: context.paths.resources,
        config: config.license,
        session,
        client,
      })
    : null;
  return Object.freeze({
    session,
    client,
    agentId,
    platform,
    licenseActivation,
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
