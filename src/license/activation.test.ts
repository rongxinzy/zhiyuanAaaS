import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { ZhiyuanLicenseActivation } from './activation.js';
import { LicenseInvalidReason, LicenseStatus } from './types.js';

describe('ZhiyuanLicenseActivation', () => {
  test('keeps startup usable when the separately deployed license is absent', async () => {
    const resourcesPath = await fs.mkdtemp(path.join(os.tmpdir(), 'zhiyuan-license-'));
    const session = {
      snapshot: () => ({ status: 'signed-out' as const }),
      onDidChange: () => () => undefined,
    };

    const activation = await ZhiyuanLicenseActivation.create({
      resourcesPath,
      config: {
        file: 'license.zylic',
        deploymentId: 'deployment-1',
        trustedKeys: { 'license-prod-1': 'public-key' },
      },
      session: session as never,
      client: { activateEnterpriseLicense: async () => { throw new Error('not expected'); } },
    });

    expect(activation.snapshot()).toMatchObject({
      status: LicenseStatus.Invalid,
      reason: LicenseInvalidReason.Malformed,
    });
  });
});
