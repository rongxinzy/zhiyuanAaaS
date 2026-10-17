// Deterministic channel contracts for browser tests, never platform evidence.
const configurations = new Map();
export function handleChannelFixture(method, pathname, body, response, employees) {
  const match = pathname.match(/^\/api\/v1\/employees\/([^/]+)\/channels(?:\/([^/]+)\/([^/]+))?$/);
  if (!match) return false;
  const employee = employees.find((item) => item.name === decodeURIComponent(match[1]));
  const send = (status, data) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
    return true;
  };
  if (!employee) return send(404, { error: { code: 'EMPLOYEE_UNAVAILABLE' } });
  const providers = ['feishu', 'wecom', 'wechat'];
  if (method === 'GET' && !match[2])
    return send(200, {
      employee: employee.name,
      phase: employee.phase,
      runtimeAvailable: true,
      hibernationEnabled: false,
      providers: providers.map((provider) => {
        const values = configurations.get(`${employee.name}/${provider}`) ?? {};
        const secret = { feishu: 'app_secret', wecom: 'bot_secret', wechat: 'bot_token' }[provider];
        const publicKey = { feishu: 'app_id', wecom: 'bot_id' }[provider];
        return {
          provider,
          enabled: !!employee.channels?.[provider],
          runtimeReady: !!employee.channels?.[provider],
          configured: !!values[secret],
          hasSecret: !!values[secret],
          workerState: 'unknown',
          values: publicKey && values[publicKey] ? { [publicKey]: values[publicKey] } : {},
        };
      }),
    });
  const [, , provider, action] = match;
  if (!providers.includes(provider)) return send(400, { error: { code: 'CHANNEL_PROVIDER_UNSUPPORTED' } });
  const input = body?.length ? JSON.parse(body) : {};
  const key = `${employee.name}/${provider}`;
  if (method === 'PUT' && action === 'activation') {
    employee.channels ??= {};
    employee.channels[provider] = input.enabled;
    if (!input.enabled) configurations.delete(key);
    return send(202, { enabled: input.enabled, pending: true });
  }
  if (method === 'POST' && action === 'runtime-config') {
    configurations.set(key, { ...configurations.get(key), ...input.values });
    return send(200, { accepted: true });
  }
  if (method === 'POST' && action === 'restart') return send(200, { accepted: true });
  return send(404, { error: { code: 'INVALID_REQUEST' } });
}
