import { createHash } from 'node:crypto';

import {
  AepClient,
  ProtectedRefreshTokenStore,
  type AepProtectedStorage,
  type AepTransport,
} from '@aep/sdk-node';

import { ZhiyuanPasswordSession } from './password-session.js';

export interface ZhiyuanPasswordSessionOptions {
  readonly baseUrl: string;
  readonly agentId: string;
  readonly agentVersion: string;
  readonly platform: 'windows' | 'macos' | 'linux';
  readonly protectedStorage: AepProtectedStorage;
  readonly transport?: AepTransport;
}

export function createZhiyuanPasswordSession(
  options: ZhiyuanPasswordSessionOptions,
): ZhiyuanPasswordSession {
  const tokenStore = new ProtectedRefreshTokenStore(
    options.protectedStorage,
    refreshTokenStorageKey(options.agentId),
  );
  const client = new AepClient({
    baseUrl: options.baseUrl,
    agentId: options.agentId,
    agentVersion: options.agentVersion,
    platform: options.platform,
    tokenStore,
    ...(options.transport ? { transport: options.transport } : {}),
  });
  return new ZhiyuanPasswordSession(client);
}

function refreshTokenStorageKey(agentId: string): string {
  const digest = createHash('sha256').update(agentId, 'utf8').digest('hex');
  return `aep.refresh-token.${digest}`;
}
