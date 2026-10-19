import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createAdminFixture } from './admin-browser-fixture.mjs';

test('browser channel fixture preserves credentials and never fabricates connectivity', async (t) => {
  const server = createAdminFixture();
  t.after(() => server.close());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const path = '/api/v1/employees/sales-helper/channels';
  async function request(method, suffix = '', body) {
    const response = await fetch(origin + path + suffix, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  const before = await request('GET');
  assert.equal(before.status, 200);
  assert.equal(before.body.providers.length, 3);
  assert.equal(
    (
      await request('POST', '/wecom/runtime-config', {
        values: { bot_id: 'fixture-bot', bot_secret: 'synthetic-fixture-secret' },
      })
    ).status,
    200,
  );
  await request('POST', '/wecom/runtime-config', { values: { bot_id: 'fixture-bot-updated' } });
  const after = await request('GET');
  const wecom = after.body.providers.find((item) => item.provider === 'wecom');
  assert.equal(wecom.hasSecret, true);
  assert.equal(wecom.values.bot_id, 'fixture-bot-updated');
  assert.equal(wecom.workerState, 'unknown');
  assert.equal(JSON.stringify(after.body).includes('synthetic-fixture-secret'), false);
  assert.equal((await request('POST', '/wecom/restart')).status, 200);
  assert.equal((await request('PUT', '/wecom/activation', { enabled: false })).status, 202);
  const disabled = (await request('GET')).body.providers.find((item) => item.provider === 'wecom');
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.hasSecret, false);
});
