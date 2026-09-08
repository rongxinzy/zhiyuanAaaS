import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_CONFIG_BYTES = 64 * 1024;

export interface ZhiyuanEnterpriseConfig {
  readonly schemaVersion: 1;
  readonly aepBaseUrl: string;
  readonly allowInsecureHttp: boolean;
}

export async function loadZhiyuanEnterpriseConfig(
  resourcesPath: string,
): Promise<ZhiyuanEnterpriseConfig> {
  const configPath = path.join(path.resolve(resourcesPath), 'zhiyuan-enterprise', 'config.json');
  const file = await fs.readFile(configPath);
  if (file.byteLength === 0 || file.byteLength > MAX_CONFIG_BYTES) {
    throw new Error('Zhiyuan enterprise configuration size is invalid.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(file.toString('utf8'));
  } catch (error) {
    throw new Error('Zhiyuan enterprise configuration is not valid JSON.', { cause: error });
  } finally {
    file.fill(0);
  }
  return parseConfig(parsed);
}

function parseConfig(value: unknown): ZhiyuanEnterpriseConfig {
  const config = asRecord(value);
  if (
    config?.schemaVersion !== 1 ||
    typeof config.aepBaseUrl !== 'string' ||
    typeof config.allowInsecureHttp !== 'boolean'
  ) {
    throw new Error('Zhiyuan enterprise configuration schema is invalid.');
  }

  let url: URL;
  try {
    url = new URL(config.aepBaseUrl);
  } catch (error) {
    throw new Error('Zhiyuan AEP base URL is invalid.', { cause: error });
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Zhiyuan AEP base URL must not contain credentials, query, or fragment.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Zhiyuan AEP base URL protocol is not supported.');
  }
  if (url.protocol === 'http:' && !config.allowInsecureHttp) {
    throw new Error('Zhiyuan insecure HTTP configuration is disabled.');
  }
  return Object.freeze({
    schemaVersion: 1,
    aepBaseUrl: url.toString().replace(/\/+$/, ''),
    allowInsecureHttp: config.allowInsecureHttp,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}
