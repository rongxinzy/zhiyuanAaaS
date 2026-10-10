import http from 'node:http';
import https from 'node:https';

const prefix = '/aep/gateway-test';
export function gatewayOrigin(value = 'http://localhost:8090') {
  const target = new URL(value);
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== '/'
  )
    throw new Error('ZHIYUAN_GATEWAY_ORIGIN must be an http(s) origin without credentials or a path.');
  return target;
}

// Same-origin, streaming inference proxy. The destination is operator-owned;
// browsers cannot choose a host, access quota routes, or redirect a model JWT.
export function proxyGatewayTest(request, response, target) {
  if (!request.url?.startsWith(prefix)) return false;
  const path = request.url.slice(prefix.length);
  const allowed = path === '/v1/chat/completions' || /^\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\/v1\/messages$/.test(path);
  if (
    request.method !== 'POST' ||
    !allowed ||
    !/^Bearer \S+$/.test(request.headers.authorization ?? '') ||
    !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')
  ) {
    response.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end('{"code":"INVALID_GATEWAY_TEST_REQUEST"}');
    return true;
  }
  const transport = target.protocol === 'https:' ? https : http;
  const headers = {
    authorization: request.headers.authorization,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...(request.headers['anthropic-version'] ? { 'anthropic-version': request.headers['anthropic-version'] } : {}),
  };
  const upstream = transport.request(new URL(path, target), { method: 'POST', headers }, (result) => {
    response.writeHead(result.statusCode ?? 502, {
      'Content-Type': result.headers['content-type'] ?? 'application/json',
      'Cache-Control': 'no-store',
      ...(result.headers['x-request-id'] ? { 'X-Request-ID': result.headers['x-request-id'] } : {}),
    });
    result.on('error', () => response.destroy());
    result.pipe(response);
  });
  upstream.setTimeout(60_000, () => upstream.destroy(new Error('Gateway test timeout')));
  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end('{"code":"GATEWAY_TEST_UNAVAILABLE"}');
    } else response.destroy();
  });
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => upstream.destroy());
  let received = 0;
  request.on('data', (chunk) => {
    received += chunk.length;
    if (received > 1024 * 1024) {
      request.unpipe(upstream);
      if (!response.headersSent) {
        response.writeHead(413, { 'Cache-Control': 'no-store' });
        response.end();
      } else response.destroy();
      upstream.destroy();
    }
  });
  request.pipe(upstream);
  return true;
}
