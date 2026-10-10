import type { AdminModel } from '@aep/sdk-node';
import type { AdminConsoleClient } from './client.js';

export interface GatewayCallResult {
  status: number;
  text: string;
  requestId: string | null;
}
export async function runGatewayCall(
  client: AdminConsoleClient,
  model: AdminModel,
  prompt: string,
  options: { stream: boolean; tools: boolean; signal: AbortSignal; onText: (text: string) => void },
): Promise<GatewayCallResult> {
  const access = await client.createGatewayTestAccess(model.id);
  options.signal.throwIfAborted();
  const endpoint = new URL(access.baseUrl);
  const anthropic = model.protocol === 'anthropic';
  if (
    access.modelId !== model.id ||
    access.protocol !== model.protocol ||
    !access.modelAccessToken ||
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !Number.isFinite(Date.parse(access.expiresAt)) ||
    Date.parse(access.expiresAt) <= Date.now() ||
    access.path !== (anthropic ? '/v1/messages' : '/chat/completions')
  )
    throw new Error('Invalid model test authorization');
  const path = endpoint.pathname.replace(/\/$/, '') + access.path;
  if (
    !(anthropic
      ? path === `/${model.id}/v1/messages` && /^\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\/v1\/messages$/.test(path)
      : path === '/v1/chat/completions')
  )
    throw new Error('Unsupported gateway test path');
  const schema = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } as const;
  const response = await fetch(`/aep/gateway-test${path}`, {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(60_000)]),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${access.modelAccessToken}`,
      ...(anthropic ? { 'anthropic-version': '2023-06-01' } : {}),
    },
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
      stream: options.stream,
      ...(!anthropic && options.stream ? { stream_options: { include_usage: true } } : {}),
      ...(options.tools
        ? {
            tools: anthropic
              ? [{ name: 'echo', description: 'Return the supplied text', input_schema: schema }]
              : [
                  {
                    type: 'function',
                    function: { name: 'echo', description: 'Return the supplied text', parameters: schema },
                  },
                ],
          }
        : {}),
    }),
  });
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing gateway response');
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  const redact = (value: string) =>
    value.replaceAll(access.modelAccessToken, '[REDACTED]').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  const safeStreamText = (value: string) => {
    // Hold incomplete authorization prefixes until the next chunk resolves them.
    for (let length = Math.min(value.length, access.modelAccessToken.length - 1); length > 0; length--) {
      if (value.endsWith(access.modelAccessToken.slice(0, length))) return redact(value.slice(0, -length));
    }
    return redact(value.replace(/(?:B|Be|Bea|Bear|Beare|Bearer)\s*$/i, ''));
  };
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 256 * 1024) throw new Error('Gateway response exceeds the test output limit');
      text += decoder.decode(chunk.value, { stream: true });
      options.onText(safeStreamText(text));
    }
    text += decoder.decode();
    return {
      status: response.status,
      text: safeStreamText(text),
      requestId: response.headers.get('x-request-id') ? redact(response.headers.get('x-request-id') ?? '') : null,
    };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
