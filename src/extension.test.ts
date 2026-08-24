import { describe, expect, test } from 'vitest';

import {
  createZhiyuanEnterpriseExtension,
  ZHIYUAN_ENTERPRISE_EXTENSION_ID,
} from './extension.js';
import {
  ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION,
  type ZhiyuanEnterpriseHostContext,
} from './host-contract.js';

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
});

function hostContext(): ZhiyuanEnterpriseHostContext {
  return Object.freeze({
    apiVersion: ZHIYUAN_ENTERPRISE_EXTENSION_API_VERSION,
    appVersion: '2026.8.0',
    isPackaged: false,
    platform: process.platform,
    paths: Object.freeze({
      resources: 'D:\\zhiyuan\\resources',
      userData: 'D:\\zhiyuan\\user-data',
    }),
  });
}
