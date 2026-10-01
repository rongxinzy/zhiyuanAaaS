import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const overlayFile = path.join(repositoryRoot, 'build', 'electron-builder.overlay.yml');
const signedConfigFile = path.join(repositoryRoot, 'build', 'electron-builder.overlay-signed.cjs');

const VALID_THUMBPRINT = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

describe('electron-builder.overlay-signed.cjs', () => {
  test('exports the YAML overlay plus Certum signtool options without drift', () => {
    const overlay = yaml.load(fs.readFileSync(overlayFile, 'utf8'));
    const signed = loadSignedConfig({ CERTUM_CERT_THUMBPRINT: VALID_THUMBPRINT });

    expect(signed).toEqual({
      ...overlay,
      win: {
        ...(overlay.win || {}),
        signtoolOptions: {
          certificateSha1: VALID_THUMBPRINT.toUpperCase(),
          signingHashAlgorithms: ['sha256'],
          rfc3161TimeStampServer: 'http://time.certum.pl',
        },
      },
    });
  });

  test('normalizes the thumbprint before injecting it', () => {
    const signed = loadSignedConfig({
      CERTUM_CERT_THUMBPRINT: ` ${VALID_THUMBPRINT.toLowerCase()} `,
    });
    expect(signed.win.signtoolOptions.certificateSha1).toBe(VALID_THUMBPRINT.toUpperCase());
  });

  test('throws when CERTUM_CERT_THUMBPRINT is missing or invalid', () => {
    const missing = requireSignedConfig({});
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('CERTUM_CERT_THUMBPRINT must contain the 40-character SHA-1 thumbprint');

    const invalid = requireSignedConfig({ CERTUM_CERT_THUMBPRINT: 'not-a-thumbprint' });
    expect(invalid.status).not.toBe(0);
    expect(invalid.stderr).toContain('CERTUM_CERT_THUMBPRINT must contain the 40-character SHA-1 thumbprint');
  });
});

function loadSignedConfig(extraEnv) {
  const result = requireSignedConfig(extraEnv, true);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout);
}

function requireSignedConfig(extraEnv, stringify = false) {
  const env = { ...process.env, ...extraEnv };
  if (!('CERTUM_CERT_THUMBPRINT' in extraEnv)) {
    delete env.CERTUM_CERT_THUMBPRINT;
  }
  const expression = stringify
    ? `process.stdout.write(JSON.stringify(require(${JSON.stringify(signedConfigFile)})))`
    : `require(${JSON.stringify(signedConfigFile)})`;
  return spawnSync(process.execPath, ['-e', expression], { encoding: 'utf8', env });
}
