/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render as renderReact,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { AdminConsoleClient } from './client.js';
import { GatewayCall, GatewayLimits, GatewayObservation } from './GatewayWorkbench.js';
import type { GatewayLimit, GatewayMetricQuery, GatewayMetricResult } from './gateway-api.js';
import { formatGatewayNumber } from './gateway-ui.js';
import { administratorIdentity } from './test-fixtures.js';

vi.mock('./notifications.js', () => ({ notify: vi.fn() }));
configure({ asyncUtilTimeout: 5000 });
function render(ui: ReactElement) {
  return renderReact(
    <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }}>
      {ui}
    </ConfigProvider>,
  );
}

const models = [
  { id: 'model-a', displayName: '测试模型', protocol: 'openai-compatible', enabled: true, sourceType: 'gateway' },
  { id: 'model-b', displayName: '第二模型', protocol: 'anthropic', enabled: true, sourceType: 'gateway' },
];
const capabilities = {
  sources: { prometheus: true, loki: true, quota: true, testAccess: true },
  dimensions: ['user', 'team', 'role', 'model'],
  metrics: [
    'calls',
    'failures',
    'input_tokens',
    'output_tokens',
    'first_token_duration',
    'service_duration',
    'downstream_qps',
    'upstream_qps',
    'downstream_success_rate',
    'upstream_success_rate',
    'auth_requests',
  ],
  unsupported: ['cost', 'p95', 'p99'],
};
const rule: GatewayLimit = {
  id: 'rule-a',
  version: 4,
  configuration: {
    kind: 'requests',
    scopeType: 'user',
    scopeId: 'u1',
    modelId: 'model-a',
    maximum: 40,
    interval: 'minute',
    enabled: true,
    expectedVersion: 3,
  },
  updatedAt: '',
};
const logs = (count = 2) => ({
  source: 'loki',
  queriedAt: '',
  data: {
    data: {
      result: [
        {
          stream: { aep_source: 'gateway' },
          values: Array.from({ length: count }, (_, index) => [
            String(1800000000000000000n - BigInt(index)),
            JSON.stringify({
              request_id: `r${index}`,
              user_id: 'u1',
              model_id: 'model-a',
              status: index === 1 ? '200' : '503',
              team_ids: '|dDE|',
              role_ids: '|cm9sZQ|',
              input_token: '17',
              output_token: '3',
              llm_first_token_duration: '5',
              llm_service_duration: '10',
            }),
          ]),
        },
      ],
    },
  },
});
function metrics(query: GatewayMetricQuery): GatewayMetricResult {
  return {
    source: 'prometheus',
    queriedAt: '',
    definition: {
      id: query.metric,
      unit: 'requests',
      aggregation: 'counter_increase',
      windowSeconds: 60,
      groupBy: query.groupBy ?? 'none',
      modelDimension: query.groupBy === 'model' ? 'upstream_model' : 'not_applicable',
    },
    data: {
      data: {
        result: [
          {
            metric:
              query.groupBy === 'none'
                ? {}
                : {
                    [`${query.groupBy}_id`]:
                      query.groupBy === 'model'
                        ? 'model-a'
                        : query.groupBy === 'team'
                          ? 'dDE'
                          : query.groupBy === 'role'
                            ? 'cm9sZQ'
                            : 'u1',
                  },
            values: [
              [1800000000, '11'],
              [1800000060, 'NaN'],
              [1800000120, '23'],
            ],
          },
        ],
      },
    },
  };
}
function stub(overrides: Record<string, unknown> = {}) {
  return {
    models: vi.fn().mockResolvedValue({ models, assignments: [] }),
    gatewaySubjects: vi.fn().mockResolvedValue({
      models,
      users: [{ id: 'u1', displayName: '用户甲' }],
      teams: [{ id: 't1', name: '团队甲' }],
      roles: [{ id: 'role', name: '角色甲' }],
    }),
    getGatewayCapabilities: vi.fn().mockResolvedValue(capabilities),
    getGatewayMonitoringHealth: vi.fn().mockResolvedValue({
      sources: [
        { source: 'prometheus', state: 'healthy' },
        { source: 'loki', state: 'unavailable' },
        { source: 'quota', state: 'disabled' },
      ],
    }),
    queryGatewayMetrics: vi.fn().mockImplementation(metrics),
    searchGatewayRequests: vi.fn().mockResolvedValue(logs()),
    getGatewayRequest: vi.fn().mockResolvedValue(logs()),
    listGatewayLimits: vi.fn().mockResolvedValue({ items: [rule] }),
    getGatewayLimitsStatus: vi.fn().mockResolvedValue({ state: 'applied', revision: 'rev1', runtimeVerified: false }),
    putGatewayLimit: vi
      .fn()
      .mockImplementation((id, configuration) => Promise.resolve({ id, version: 5, configuration })),
    deleteGatewayLimit: vi.fn().mockResolvedValue(undefined),
    publishGatewayLimits: vi.fn().mockResolvedValue({ revision: 'rev2' }),
    getGatewayQuota: vi.fn().mockResolvedValue({ consumer: 'aep.demo.u1', quota: 123 }),
    refreshGatewayQuota: vi.fn().mockResolvedValue({ quota: 1000 }),
    changeGatewayQuota: vi.fn().mockResolvedValue({ quota: 118 }),
    createGatewayTestAccess: vi.fn().mockResolvedValue({
      modelId: 'model-a',
      protocol: 'openai-compatible',
      baseUrl: 'http://gateway.test/v1',
      path: '/chat/completions',
      modelAccessToken: 'disposable-test-token',
      expiresAt: '2099-01-01T00:00:00Z',
    }),
    ...overrides,
  };
}
const typed = (client: ReturnType<typeof stub>) => client as unknown as AdminConsoleClient;
async function select(label: string, option: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  const item = await waitFor(() => {
    for (const menu of document.querySelectorAll<HTMLElement>(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
    )) {
      if (menu.style.pointerEvents === 'none') continue;
      const item = within(menu).queryByText(option, { exact: true });
      if (item) return item;
    }
    throw new Error(`Select option not ready: ${option}`);
  });
  fireEvent.click(item);
}
async function confirm(button: string, title: string) {
  await waitFor(() => expect(screen.getByRole('button', { name: button })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: button }));
  const text = await screen.findByText(title, { exact: true });
  const popup = text.closest('.ant-popover') as HTMLElement;
  fireEvent.click(within(popup).getByRole('button', { name: button }));
  await waitFor(() => expect(popup).not.toBeVisible());
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('active call controls submit native inference, copy only response and navigate to observation', async () => {
  const client = stub();
  const observe = vi.fn();
  const clipboard = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('data: hello\n\n', { headers: { 'x-request-id': 'test-r' } })),
  );
  render(<GatewayCall client={typed(client)} identity={administratorIdentity} onObserve={observe} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '发起测试' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('调用内容'), { target: { value: '测试内容' } });
  fireEvent.click(screen.getByRole('switch', { name: '发送工具定义' }));
  fireEvent.click(screen.getByRole('switch', { name: '流式响应' }));
  fireEvent.click(screen.getByRole('button', { name: '发起测试' }));
  expect(await screen.findByText('HTTP 200')).toBeInTheDocument();
  expect(client.createGatewayTestAccess).toHaveBeenCalledWith('model-a');
  fireEvent.click(screen.getByRole('button', { name: '复制响应' }));
  await waitFor(() => expect(clipboard).toHaveBeenCalledWith('data: hello\n\n'));
  clipboard.mockRejectedValueOnce(new Error('clipboard'));
  fireEvent.click(screen.getByRole('button', { name: '复制响应' }));
  fireEvent.click(screen.getByRole('button', { name: '查看调用观测' }));
  expect(observe).toHaveBeenCalledOnce();
  await select('模型', '第二模型');
  expect(screen.queryByText('HTTP 200')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '刷新模型目录' }));
  await waitFor(() => expect(client.models).toHaveBeenCalledTimes(2));
});
test.each([307, 429])('call displays native HTTP %i as an error without replaying inference', async (status) => {
  const client = stub();
  const fetcher = vi.fn().mockResolvedValue(new Response('native-response', { status }));
  vi.stubGlobal('fetch', fetcher);
  render(<GatewayCall client={typed(client)} onObserve={() => {}} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '发起测试' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '发起测试' }));
  const message = await screen.findByText(`HTTP ${status}`);
  expect(message.closest('.ant-alert')).toHaveClass('ant-alert-error');
  expect(screen.getByRole('region', { name: '原始响应' })).toHaveTextContent('native-response');
  expect(fetcher).toHaveBeenCalledOnce();
});
test('active call cancellation and unmount abort inference; unauthorized scope is recoverable', async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init.signal;
          signal?.addEventListener('abort', () => reject(new Error('cancelled')));
        }),
    ),
  );
  const client = stub();
  const view = render(<GatewayCall client={typed(client)} onObserve={() => {}} />);
  await waitFor(() => expect(screen.getByRole('button', { name: '发起测试' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '发起测试' }));
  await screen.findByRole('button', { name: '停止' });
  await waitFor(() => expect(signal).toBeDefined());
  fireEvent.click(screen.getByRole('button', { name: '停止' }));
  expect(await screen.findByText('调用未完成')).toBeInTheDocument();
  expect(signal?.aborted).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '发起测试' }));
  await waitFor(() => expect(client.createGatewayTestAccess).toHaveBeenCalledTimes(2));
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
test('call catalog/capability failure can retry; no models and unavailable test stay disabled', async () => {
  const client = stub({
    models: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ models: [], assignments: [] }),
    getGatewayCapabilities: vi
      .fn()
      .mockResolvedValue({ ...capabilities, sources: { ...capabilities.sources, testAccess: false } }),
  });
  render(<GatewayCall client={typed(client)} onObserve={() => {}} />);
  await screen.findByText('数据加载失败');
  fireEvent.click(await screen.findByRole('button', { name: '重试' }));
  expect(await screen.findByText('暂无可调用模型')).toBeInTheDocument();
  expect(await screen.findByText('模型调用测试未启用')).toBeInTheDocument();
});
test('observation displays native samples without totals, queries all subjects and keeps infra unscoped', async () => {
  const client = stub();
  render(<GatewayObservation client={typed(client)} identity={administratorIdentity} />);
  await screen.findByRole('row', { name: /r0 / });
  expect(screen.queryByRole('row', { name: /r1 / })).not.toBeInTheDocument();
  expect(screen.getAllByText('23').length).toBeGreaterThan(0);
  expect(screen.queryByText('34')).not.toBeInTheDocument();
  expect(screen.getAllByText('未提供').length).toBeGreaterThan(0);
  expect(screen.getByRole('img', { name: '调用与失败趋势' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: '仅显示 HTTP 错误' }));
  expect(screen.getByRole('row', { name: /r1 / })).toBeInTheDocument();
  for (const [label, name] of [
    ['团队', '团队甲'],
    ['角色', '角色甲'],
    ['用户', '用户甲'],
    ['模型', '测试模型'],
  ])
    await select(label!, name!);
  await waitFor(() =>
    expect(client.queryGatewayMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ metric: 'calls', modelId: 'model-a', userId: 'u1', teamId: 't1', roleId: 'role' }),
    ),
  );
  const infra = client.queryGatewayMetrics.mock.calls.filter(([query]) => query.metric === 'downstream_qps');
  expect(infra.every(([query]) => !query.modelId && !query.userId && !query.teamId && !query.roleId)).toBe(true);
  await select('统计维度', '模型');
  await screen.findAllByText('模型维度采用上游模型标识', { exact: false });
  await select('时间范围', '最近 24 小时');
  await select('采样间隔', '5 分钟');
  await select('错误来源', '鉴权服务');
  await waitFor(() =>
    expect(client.searchGatewayRequests).toHaveBeenCalledWith(expect.objectContaining({ source: 'authorizer' })),
  );
  fireEvent.click(screen.getByRole('button', { name: '刷新查询' }));
  await waitFor(() => expect(client.getGatewayMonitoringHealth).toHaveBeenCalledTimes(2));
});
test('request drawer uses detail API, ignores completion after close and supports detail error', async () => {
  const client = stub();
  render(<GatewayObservation client={typed(client)} identity={administratorIdentity} />);
  await screen.findByRole('row', { name: /r0 / });
  fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0]!);
  await waitFor(() =>
    expect(client.getGatewayRequest).toHaveBeenCalledWith('r0', expect.objectContaining({ source: 'all' })),
  );
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Close|关闭/ }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  let finish: ((value: unknown) => void) | undefined;
  client.getGatewayRequest.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0]!);
  fireEvent.click(screen.getByRole('button', { name: /Close|关闭/ }));
  await act(async () => finish?.(logs()));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  client.getGatewayRequest.mockRejectedValueOnce(new Error('expired'));
  fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0]!);
  expect(await screen.findByText('请求详情无法获取或已过期')).toBeInTheDocument();
});
test('native query failure is visible; refresh recovers without synthesizing data', async () => {
  const client = stub({
    queryGatewayMetrics: vi.fn().mockRejectedValue(new Error('source offline')),
    searchGatewayRequests: vi.fn().mockRejectedValue(new Error('logs offline')),
    getGatewayMonitoringHealth: vi.fn().mockRejectedValue(new Error('health offline')),
  });
  render(<GatewayObservation client={typed(client)} identity={administratorIdentity} />);
  await screen.findAllByText('数据加载失败');
  await waitFor(() => expect(client.queryGatewayMetrics).toHaveBeenCalled());
  client.queryGatewayMetrics.mockImplementation(metrics);
  client.searchGatewayRequests.mockResolvedValue(logs());
  client.getGatewayMonitoringHealth.mockResolvedValue({ sources: [] });
  fireEvent.click(screen.getByRole('button', { name: '刷新查询' }));
  expect(await screen.findByRole('row', { name: /r0 / })).toBeInTheDocument();
});
test('request pagination uses the native nanosecond cursor and keeps errors recoverable', async () => {
  const client = stub({
    searchGatewayRequests: vi
      .fn()
      .mockResolvedValueOnce(logs(200))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(logs(1)),
  });
  render(<GatewayObservation client={typed(client)} identity={administratorIdentity} />);
  fireEvent.click(await screen.findByRole('button', { name: '加载更多请求' }));
  expect(await screen.findByText('数据加载失败')).toBeInTheDocument();
  expect(client.searchGatewayRequests).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: '1799999999999999801' }),
  );
  fireEvent.click(await screen.findByRole('button', { name: '重试' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '加载更多请求' })).not.toBeInTheDocument());
});
test('unconfigured sources show unavailable states with no forged data or enabled organization filters', async () => {
  const client = stub({
    getGatewayCapabilities: vi.fn().mockResolvedValue({ sources: {}, dimensions: [], metrics: [] }),
  });
  render(<GatewayObservation client={typed(client)} identity={administratorIdentity} />);
  await screen.findByText('未接入 Loki，请求记录不可用');
  expect(screen.getByRole('combobox', { name: '团队' })).toBeDisabled();
  expect(client.searchGatewayRequests).not.toHaveBeenCalled();
  expect(client.queryGatewayMetrics).not.toHaveBeenCalled();
});
test('model readers can observe metrics without requesting restricted request logs', async () => {
  const client = stub();
  render(
    <GatewayObservation
      client={typed(client)}
      identity={{ ...administratorIdentity, roles: [], permissions: ['models.read'] }}
    />,
  );
  await screen.findByText('查看请求记录需要日志读取权限');
  await waitFor(() => expect(client.queryGatewayMetrics).toHaveBeenCalled());
  expect(client.searchGatewayRequests).not.toHaveBeenCalled();
  expect(client.getGatewayRequest).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '详情' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '刷新查询' }));
  await waitFor(() => expect(client.getGatewayMonitoringHealth).toHaveBeenCalledTimes(2));
  expect(client.searchGatewayRequests).not.toHaveBeenCalled();
});
test('limit edits preserve version and subject × model; saving never publishes automatically', async () => {
  const client = stub();
  render(<GatewayLimits client={typed(client)} identity={administratorIdentity} />);
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
  expect(screen.getByLabelText('规则 ID')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('最大数量'), { target: { value: '50' } });
  fireEvent.click(screen.getByRole('button', { name: '保存规则' }));
  await waitFor(() =>
    expect(client.putGatewayLimit).toHaveBeenCalledWith(
      'rule-a',
      expect.objectContaining({
        scopeType: 'user',
        scopeId: 'u1',
        modelId: 'model-a',
        maximum: 50,
        expectedVersion: 4,
      }),
    ),
  );
  expect(client.publishGatewayLimits).not.toHaveBeenCalled();
  await screen.findByText('规则已修改，请发布使其同步到网关');
  await confirm('发布配置', '发布当前限流规则？');
  expect(client.publishGatewayLimits).toHaveBeenCalledOnce();
  expect(screen.getByText('后端尚未报告实际请求的运行验证；已应用不代表已验证拦截。')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '新增规则' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '新增规则' }));
  expect(screen.getByLabelText('规则 ID')).toHaveValue('');
});
test('limit creation, scope changes, toggles and deletion use optimistic versions', async () => {
  const client = stub();
  render(<GatewayLimits client={typed(client)} />);
  await screen.findByText('rule-a');
  await waitFor(() => expect(screen.getByRole('button', { name: '保存规则' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('规则 ID'), { target: { value: 'new-rule' } });
  await select('主体维度', '全部请求');
  await select('规则类型', 'Token 速率限流');
  fireEvent.click(screen.getByRole('button', { name: '保存规则' }));
  await waitFor(() =>
    expect(client.putGatewayLimit).toHaveBeenCalledWith(
      'new-rule',
      expect.objectContaining({
        kind: 'tokens',
        scopeType: 'global',
        scopeId: null,
        modelId: null,
        expectedVersion: 0,
      }),
    ),
  );
  await waitFor(() => expect(screen.getByRole('switch', { name: '启用 rule-a' })).toBeEnabled());
  fireEvent.click(screen.getByRole('switch', { name: '启用 rule-a' }));
  await waitFor(() =>
    expect(client.putGatewayLimit).toHaveBeenCalledWith(
      'rule-a',
      expect.objectContaining({ enabled: false, expectedVersion: 4 }),
    ),
  );
  await waitFor(() => expect(client.listGatewayLimits).toHaveBeenCalledTimes(3));
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
  await confirm('删除', '删除此规则？');
  expect(client.deleteGatewayLimit).toHaveBeenCalledWith('rule-a', 4);
  expect(screen.getByLabelText('规则 ID')).toHaveValue('');
});
test('version conflicts retain edits and allow explicit refresh; capabilities and list errors fail visibly', async () => {
  const client = stub({ putGatewayLimit: vi.fn().mockRejectedValue(new Error('VERSION_CONFLICT')) });
  render(<GatewayLimits client={typed(client)} />);
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
  fireEvent.change(screen.getByLabelText('最大数量'), { target: { value: '77' } });
  fireEvent.click(screen.getByRole('button', { name: '保存规则' }));
  expect(await screen.findByText('操作失败')).toBeInTheDocument();
  expect(screen.getByLabelText('最大数量')).toHaveValue('77');
  fireEvent.click(screen.getByRole('button', { name: '刷新' }));
  await waitFor(() => expect(client.listGatewayLimits).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('最大数量')).toHaveValue('77');
});
test('quota actions are per-user, confirmed, accept signed delta and reject negative resets', async () => {
  const client = stub();
  render(<GatewayLimits client={typed(client)} />);
  fireEvent.click(screen.getByText('Token 余额配额', { exact: true }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: '用户' })).toBeEnabled());
  await select('用户', '用户甲');
  expect(await screen.findByText('123')).toBeInTheDocument();
  expect(client.getGatewayQuota).toHaveBeenCalledWith('u1');
  fireEvent.change(screen.getByLabelText('配额值 / 调整量'), { target: { value: '-5' } });
  expect(screen.getByRole('button', { name: '重置余额' })).toBeDisabled();
  await confirm('调整余额', '按输入的正数或负数调整此用户余额？');
  expect(client.changeGatewayQuota).toHaveBeenCalledWith('u1', -5);
  fireEvent.change(screen.getByLabelText('配额值 / 调整量'), { target: { value: '1000' } });
  await confirm('重置余额', '将此用户的配额余额替换为输入值？');
  expect(client.refreshGatewayQuota).toHaveBeenCalledWith('u1', 1000);
  await waitFor(() => expect(screen.getByRole('button', { name: /读取余额/ })).not.toHaveClass('ant-btn-loading'));
  fireEvent.click(screen.getByRole('button', { name: /读取余额/ }));
  await waitFor(() => expect(client.getGatewayQuota.mock.calls.length).toBeGreaterThan(3));
});
test('quota/list/capability failures are retryable and native quota absence stays disabled', async () => {
  const client = stub({
    getGatewayCapabilities: vi.fn().mockRejectedValue(new Error('offline')),
    gatewaySubjects: vi.fn().mockRejectedValue(new Error('offline')),
    listGatewayLimits: vi.fn().mockRejectedValue(new Error('offline')),
    getGatewayLimitsStatus: vi.fn().mockRejectedValue(new Error('offline')),
  });
  render(<GatewayLimits client={typed(client)} />);
  await screen.findAllByText('数据加载失败');
  expect(screen.getByRole('button', { name: '保存规则' })).toBeDisabled();
  fireEvent.click(screen.getByText('Token 余额配额', { exact: true }));
  expect(await screen.findByText('未接入原生配额插件')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '调整余额' })).toBeDisabled();
  expect(formatGatewayNumber(Number.NaN)).toBe('未提供');
  expect(formatGatewayNumber(0)).toBe('0');
});
