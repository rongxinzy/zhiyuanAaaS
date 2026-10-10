import http from 'node:http';
import { afterEach, expect, test } from 'vitest';
import { gatewayOrigin, proxyGatewayTest } from './admin-gateway-proxy.mjs';

const servers = [];
async function serve(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
test('accepts only an operator-owned http(s) origin', () => {
  expect(gatewayOrigin().href).toBe('http://localhost:8090/');
  expect(gatewayOrigin('https://gateway.test').protocol).toBe('https:');
  for (const value of [
    'file:///tmp',
    'http://user:key@gateway.test',
    'http://gateway.test/v1',
    'http://gateway.test?x=1',
    'http://gateway.test#x',
  ])
    expect(() => gatewayOrigin(value)).toThrow();
});
test('streams native responses, isolates headers and never follows redirects', async () => {
  const seen = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const upstream = await serve((request, response) => {
    seen.push({ url: request.url, headers: request.headers });
    if (request.url.includes('messages')) {
      response.writeHead(307, { Location: 'http://forbidden.test', 'set-cookie': 'bad=1' });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream', 'x-request-id': 'r1', 'set-cookie': 'bad=1' });
    response.write('data: first\n\n');
    void gate.then(() => response.end('data: second\n\n'));
  });
  const proxy = await serve((request, response) => {
    if (!proxyGatewayTest(request, response, gatewayOrigin(upstream))) {
      response.writeHead(404);
      response.end();
    }
  });
  const headers = {
    Authorization: 'Bearer disposable-token',
    'Content-Type': 'application/json',
    Cookie: 'admin=secret',
    'X-AEP-User-ID': 'forged',
  };
  const response = await fetch(`${proxy}/aep/gateway-test/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('x-request-id')).toBe('r1');
  expect(response.headers.get('cache-control')).toBe('no-store');
  const reader = response.body.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: first\n\n');
  release();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('second');
  await reader.cancel();
  expect(seen[0].headers.cookie).toBeUndefined();
  expect(seen[0].headers['x-aep-user-id']).toBeUndefined();
  expect(seen[0].headers.authorization).toBe('Bearer disposable-token');
  const redirected = await fetch(`${proxy}/aep/gateway-test/model-a/v1/messages`, {
    method: 'POST',
    headers: { ...headers, 'anthropic-version': '2023-06-01' },
    body: '{}',
    redirect: 'manual',
  });
  expect(redirected.status).toBe(307);
  expect(redirected.headers.get('location')).toBeNull();
  expect(seen[1].headers['anthropic-version']).toBe('2023-06-01');
  expect((await fetch(`${proxy}/other`)).status).toBe(404);
});
test('rejects quota/admin/query/host injection, missing authorization and excessive bodies', async () => {
  let reached = 0;
  const upstream = await serve((request, response) => {
    reached++;
    request.resume();
    request.on('end', () => response.end('{}'));
  });
  const proxy = await serve((request, response) => proxyGatewayTest(request, response, gatewayOrigin(upstream)));
  const headers = { Authorization: 'Bearer disposable-token', 'Content-Type': 'application/json' };
  for (const path of [
    '/quotas/user',
    '//forbidden.test/v1/chat/completions',
    '/v1/chat/completions?url=http://forbidden.test',
    '/admin',
  ])
    expect((await fetch(`${proxy}/aep/gateway-test${path}`, { method: 'POST', headers, body: '{}' })).status).toBe(400);
  expect((await fetch(`${proxy}/aep/gateway-test/v1/chat/completions`)).status).toBe(400);
  expect((await fetch(`${proxy}/aep/gateway-test/v1/chat/completions`, { method: 'POST', body: '{}' })).status).toBe(
    400,
  );
  expect(reached).toBe(0);
  const oversized = await fetch(`${proxy}/aep/gateway-test/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: 'x'.repeat(1024 * 1024 + 1),
  });
  expect(oversized.status).toBe(413);
});
test('returns a redacted transport failure', async () => {
  const dead = await serve(() => {});
  const server = servers.pop();
  await new Promise((resolve) => server.close(resolve));
  const proxy = await serve((request, response) => proxyGatewayTest(request, response, gatewayOrigin(dead)));
  const response = await fetch(`${proxy}/aep/gateway-test/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: 'Bearer disposable-token', 'Content-Type': 'application/json' },
    body: '{}',
  });
  expect(response.status).toBe(502);
  expect(await response.text()).toBe('{"code":"GATEWAY_TEST_UNAVAILABLE"}');
});

test('pins the upstream authority and rejects raw path traversal or encoded route injection', async () => {
  const seen = [];
  let forbiddenReached = 0;
  const forbidden = await serve((request, response) => {
    forbiddenReached++;
    request.resume();
    response.end('{}');
  });
  const upstream = await serve((request, response) => {
    seen.push({ path: request.url, host: request.headers.host });
    request.resume();
    request.on('end', () => response.end('{}'));
  });
  const proxy = await serve((request, response) => proxyGatewayTest(request, response, gatewayOrigin(upstream)));
  const rawRequest = (route) =>
    new Promise((resolve, reject) => {
      const request = http.request(
        proxy,
        {
          method: 'POST',
          path: `/aep/gateway-test${route}`,
          headers: {
            Host: new URL(forbidden).host,
            Authorization: 'Bearer disposable-token',
            'Content-Type': 'application/json',
          },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        },
      );
      request.on('error', reject);
      request.end('{}');
    });
  for (const path of [
    `//${new URL(forbidden).host}/v1/chat/completions`,
    '/model-a/../v1/chat/completions',
    '/model-a%2F..%2Fadmin/v1/messages',
    '/model-a\\..\\admin/v1/messages',
    '/%2e%2e/v1/messages',
    '/model-a/v1/messages?target=http://forbidden.test',
    '/model-a/v1/messages#admin',
  ])
    expect(await rawRequest(path)).toBe(400);
  expect(seen).toEqual([]);
  expect(await rawRequest('/v1/chat/completions')).toBe(200);
  expect(await rawRequest('/model-a_1.2/v1/messages')).toBe(200);
  expect(seen).toEqual([
    { path: '/v1/chat/completions', host: new URL(upstream).host },
    { path: '/model-a_1.2/v1/messages', host: new URL(upstream).host },
  ]);
  expect(forbiddenReached).toBe(0);
});
