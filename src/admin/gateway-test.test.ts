import type { AdminModel } from '@aep/sdk-node';
import { afterEach, expect, test, vi } from 'vitest';
import type { AdminConsoleClient } from './client.js';
import type { GatewayTestAccess } from './gateway-api.js';
import { runGatewayCall } from './gateway-test.js';

const model = { id: 'model-a', protocol: 'openai-compatible' } as AdminModel;
const access: GatewayTestAccess = {
  modelId: model.id,
  protocol: model.protocol,
  baseUrl: 'http://gateway.test/v1',
  path: '/chat/completions',
  modelAccessToken: 'disposable-test-model-token',
  expiresAt: '2099-01-01T00:00:00Z',
};
const client = (overrides: Partial<GatewayTestAccess> = {}) =>
  ({
    createGatewayTestAccess: vi.fn().mockResolvedValue({ ...access, ...overrides }),
  }) as unknown as AdminConsoleClient;
const options = () => ({ stream: false, tools: false, signal: new AbortController().signal, onText: vi.fn() });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('calls the same-origin native JSON route with short-lived auth, no cookies or retries', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{"choices":[]}', { headers: { 'x-request-id': 'r1' } }));
  vi.stubGlobal('fetch', fetcher);
  const value = await runGatewayCall(client(), model, 'Hello', options());
  expect(value).toEqual({ status: 200, text: '{"choices":[]}', requestId: 'r1' });
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toBe('/aep/gateway-test/v1/chat/completions');
  expect(init).toMatchObject({
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    headers: { Authorization: `Bearer ${access.modelAccessToken}` },
  });
  expect(JSON.parse(init.body)).toEqual({
    model: model.id,
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 256,
    stream: false,
  });
});
test('streams native SSE unchanged and redacts an authorization split across chunks', async () => {
  const fragments = [
    'data: {"text":"你好"}\n\n',
    access.modelAccessToken.slice(0, 8),
    access.modelAccessToken.slice(8),
    '\nBearer other-secret\n',
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const part of fragments) controller.enqueue(new TextEncoder().encode(part));
      controller.close();
    },
  });
  const fetcher = vi.fn().mockResolvedValue(new Response(stream));
  vi.stubGlobal('fetch', fetcher);
  const opts = { ...options(), stream: true, tools: true };
  const result = await runGatewayCall(client(), model, '工具', opts);
  expect(result.text).toContain('你好');
  expect(result.text).toContain('[REDACTED]');
  for (const [text] of opts.onText.mock.calls) {
    expect(text).not.toContain(access.modelAccessToken.slice(0, 8));
    expect(text).not.toContain('other-secret');
  }
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(body.stream_options).toEqual({ include_usage: true });
  expect(body.tools[0].function.name).toBe('echo');
});
test('uses Anthropic native path, version header and tool schema', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{"content":[]}'));
  vi.stubGlobal('fetch', fetcher);
  await runGatewayCall(
    client({ protocol: 'anthropic', baseUrl: 'http://gateway.test/model-a', path: '/v1/messages' }),
    { ...model, protocol: 'anthropic' },
    'Hello',
    { ...options(), tools: true, stream: true },
  );
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toBe('/aep/gateway-test/model-a/v1/messages');
  expect(init.headers['anthropic-version']).toBe('2023-06-01');
  expect(JSON.parse(init.body).tools[0].input_schema.type).toBe('object');
  expect(JSON.parse(init.body).stream_options).toBeUndefined();
});
test.each([
  { modelId: 'other' },
  { protocol: 'anthropic' },
  { expiresAt: 'bad' },
  { expiresAt: '2000-01-01' },
  { baseUrl: 'file:///v1' },
  { baseUrl: 'http://user:password@gateway.test/v1' },
  { baseUrl: 'http://gateway.test/v1?x=1' },
  { baseUrl: 'http://gateway.test/v1#x' },
  { path: '/quotas' },
  { baseUrl: 'http://gateway.test/forbidden' },
] as Partial<GatewayTestAccess>[])('rejects invalid scope/authorization before inference: %j', async (override) => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(runGatewayCall(client(override), model, 'Hello', options())).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
test('cancellation before inference never makes a model call', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(runGatewayCall(client(), model, 'Hello', { ...options(), signal: controller.signal })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
test('returns native 401 without retry and rejects missing/oversized response bodies', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('denied', { status: 401 }))
    .mockResolvedValueOnce(new Response(null))
    .mockResolvedValueOnce(new Response('x'.repeat(256 * 1024 + 1)));
  vi.stubGlobal('fetch', fetcher);
  expect((await runGatewayCall(client(), model, 'Hello', options())).status).toBe(401);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(runGatewayCall(client(), model, 'Hello', options())).rejects.toThrow('Missing gateway response');
  await expect(runGatewayCall(client(), model, 'Hello', options())).rejects.toThrow('output limit');
});
