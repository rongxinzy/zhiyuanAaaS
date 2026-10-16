import { afterEach, expect, test, vi } from 'vitest';
import { PortalClient } from './portal.js';

afterEach(() => vi.unstubAllGlobals());

function setup(data: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue({ status, json: async () => data });
  vi.stubGlobal('fetch', fetcher);
  return { client: new PortalClient(async () => 'test-access'), fetcher };
}

test('channel client calls authenticated same-origin APIs and strips unknown credential fields', async () => {
  const providers = ['feishu', 'wecom', 'wechat'].map((provider) => ({
    provider,
    enabled: true,
    runtimeReady: true,
    configured: true,
    workerState: 'unknown',
    hasSecret: true,
    values: { app_id: 'cli-demo', app_secret: 'must-not-expose', bot_secret: 'must-not-expose' },
  }));
  const { client, fetcher } = setup({ employee: 'hr-bot', phase: 'Ready', runtimeAvailable: true, providers });
  const result = await client.employeeChannels('hr-bot');
  expect(result.providers[0]?.values).toEqual({ app_id: 'cli-demo' });
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/employees/hr-bot/channels',
    expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer test-access' } }),
  );
});

test('malformed or duplicate providers do not become successful status', async () => {
  const { client } = setup({
    employee: 'hr-bot',
    phase: 'Ready',
    runtimeAvailable: true,
    providers: [null, null, null],
  });
  await expect(client.employeeChannels('hr-bot')).rejects.toThrow('Invalid channel response');
});

test('activation is a separate 202 operation with a boolean feature gate', async () => {
  const { client, fetcher } = setup({ pending: true }, 202);
  await client.activateChannel('hr-bot', 'wechat', true);
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/employees/hr-bot/channels/wechat/activation',
    expect.objectContaining({ method: 'PUT', body: '{"enabled":true}' }),
  );
});

test('configure and restart require an explicit accepted response', async () => {
  const { client, fetcher } = setup({ accepted: true });
  await client.configureChannel('hr-bot', 'feishu', { app_id: 'test', app_secret: 'fixture' });
  expect(fetcher).toHaveBeenCalledWith(
    '/api/v1/employees/hr-bot/channels/feishu/runtime-config',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ values: { app_id: 'test', app_secret: 'fixture' } }),
    }),
  );
  await client.restartChannel('hr-bot', 'wecom');
});

test('legacy runtime failures propagate rather than returning fake success', async () => {
  const { client } = setup({ error: { code: 'CHANNEL_RUNTIME_UPGRADE_REQUIRED', message: 'Upgrade required' } }, 403);
  await expect(client.configureChannel('hr-bot', 'wecom', {})).rejects.toThrow();
});
