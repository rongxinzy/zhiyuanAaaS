// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { type AdminAuditPage, type AdminAuditRecord, AdminPermission, AdminRequestError } from './client.js';
import { Events } from './Events.js';
import { formatTimestampSeconds } from './format.js';
import { administratorIdentity } from './test-fixtures.js';

afterEach(cleanup);
function render(ui: ReactNode) {
  return rtlRender(<ConfigProvider button={{ autoInsertSpace: false }}>{ui}</ConfigProvider>);
}

const auditRow = (overrides: Partial<AdminAuditRecord> = {}): AdminAuditRecord => ({
  cursor: '9',
  actorUserId: 'user-a',
  action: 'model.update',
  resourceType: 'model',
  resourceId: 'm1',
  result: 'success',
  createdAt: '2026-10-14T00:00:00Z',
  ...overrides,
});

const auditPage = (overrides: Partial<AdminAuditPage> = {}): AdminAuditPage => ({
  items: [auditRow()],
  nextCursor: null,
  timeRange: { after: '2026-10-08T00:00:00Z', before: null },
  ...overrides,
});

function fixture() {
  return {
    searchAudit: vi.fn().mockResolvedValue({
      items: [
        {
          eventId: 'e1',
          type: 'skill.changed',
          userId: 'user-a',
          resourceType: 'skill',
          resourceId: 'test2',
          result: 'success',
        },
      ],
      nextCursor: null,
    }),
    controlEvents: vi.fn().mockResolvedValue({
      items: [
        {
          eventId: 'control-1',
          type: 'model.catalog.changed',
          state: 'active',
          createdBy: 'user-a',
          createdAt: '2026-10-12T00:00:00Z',
          resource: { type: 'model', id: 'm1', revision: 'r1' },
          deliverySummary: { pending: 0, received: 0, running: 0, succeeded: 2, failed: 1, expired: 0, superseded: 0 },
        },
      ],
      nextCursor: null,
    }),
    deliverySummary: vi.fn().mockResolvedValue({
      items: [
        {
          deliveryId: 'd1',
          eventId: 'control-1',
          state: 'failed',
          attemptCount: 2,
        },
      ],
      nextCursor: null,
    }),
    searchAuthenticationAudit: vi.fn().mockResolvedValue({
      items: [
        {
          cursor: '7',
          userId: 'user-a',
          eventType: 'login.failed',
          outcome: 'failure',
          reason: 'invalid_credentials',
          sourceHash: 'abcdef0123456789',
          createdAt: '2026-10-10T00:00:00Z',
        },
      ],
      nextCursor: null,
    }),
    publishControlEvent: vi.fn(),
    cancelControlEvent: vi.fn(),
    searchAdminAudit: vi.fn().mockResolvedValue(auditPage()),
    users: vi
      .fn()
      .mockResolvedValue([
        { id: 'user-a', username: 'zhangsan', displayName: '张三', kind: 'human', status: 'active' },
      ]),
  };
}

describe('read-only operations audit', () => {
  test('keeps loaded operations after a page failure and retries the same cursor', async () => {
    const client = fixture();
    const timeRange = { after: '2026-10-08T00:00:00Z', before: null };
    client.searchAdminAudit
      .mockResolvedValueOnce({
        items: [{ cursor: '9', action: 'model.update', resourceType: 'model', result: 'success' }],
        nextCursor: '9',
        timeRange,
      })
      .mockRejectedValueOnce(new Error('page unavailable'))
      .mockResolvedValueOnce({
        items: [{ cursor: '8', action: 'model.delete', resourceType: 'model', result: 'success' }],
        nextCursor: null,
        timeRange,
      });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    expect(screen.getByText('模型更新')).toBeInTheDocument();
    expect(screen.queryByText('当前条件下暂无记录')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /加载更多/ })).not.toHaveClass('ant-btn-loading'));
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    expect(await screen.findByText('模型删除')).toBeInTheDocument();
    expect(screen.getByText('模型更新')).toBeInTheDocument();
    expect(client.searchAdminAudit.mock.calls.slice(1)).toEqual([
      [expect.objectContaining({ cursor: '9', limit: 50 })],
      [expect.objectContaining({ cursor: '9', limit: 50 })],
    ]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument();
  });

  test('ignores an older page response after refreshing the operation list', async () => {
    const client = fixture();
    const firstPage = {
      items: [{ cursor: '9', action: 'model.update', resourceType: 'model', result: 'success' }],
      nextCursor: '9' as string | null,
      timeRange: { after: '2026-10-08T00:00:00Z', before: null },
    };
    const oldPage = Promise.withResolvers<typeof firstPage>();
    client.searchAdminAudit
      .mockResolvedValueOnce(firstPage)
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce({
        ...firstPage,
        items: [{ cursor: '19', action: 'credential.rotate', resourceType: 'credential', result: 'success' }],
        nextCursor: null,
      });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('凭据轮换')).toBeInTheDocument();
    await act(async () => {
      oldPage.resolve({
        ...firstPage,
        items: [{ cursor: '8', action: 'stale.operation', resourceType: 'model', result: 'success' }],
        nextCursor: null,
      });
    });
    expect(screen.getByText('凭据轮换')).toBeInTheDocument();
    expect(screen.queryByText('模型更新')).not.toBeInTheDocument();
    expect(screen.queryByText('stale.operation')).not.toBeInTheDocument();
    expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ limit: 50 });
  });

  test('loads the default seven-day window and states the applied range', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    expect(await screen.findByText('模型更新')).toBeInTheDocument();
    // 默认窗口不携带时间参数，页面展示服务端实际生效的 timeRange。
    expect(client.searchAdminAudit).toHaveBeenCalledWith({ limit: 50 });
    expect(
      screen.getByText(`时间范围: ${dayjs('2026-10-08T00:00:00Z').format('YYYY-MM-DD HH:mm')} ~ 现在`),
    ).toBeInTheDocument();
    // 主表时间到秒并带时区，原始值只留在技术详情；用户列主行用户名、次行用户 ID。
    expect(screen.getByText(formatTimestampSeconds('2026-10-14T00:00:00Z'))).toBeInTheDocument();
    expect(screen.queryByText('2026-10-14T00:00:00Z')).not.toBeInTheDocument();
    expect(screen.getByText('zhangsan')).toBeInTheDocument();
    expect(screen.getByText('user-a')).toBeInTheDocument();
    // 对象列是「中文资源类型 / 对象 ID」，不是英文码。
    expect(screen.getByText('模型 / m1')).toBeInTheDocument();
  });

  test('shows the masked changes, reason and identifiers in operation detail', async () => {
    const client = fixture();
    client.searchAdminAudit.mockResolvedValueOnce(
      auditPage({
        items: [
          auditRow({
            action: 'model.update',
            result: 'failure',
            reason: 'conflict',
            changes: {
              before: { displayName: '旧名', status: 'active', customKey: 'raw' },
              after: { displayName: '新名', status: 'disabled', customKey: 'raw' },
              requestId: 'req-1',
            },
          }),
        ],
      }),
    );
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    fireEvent.click(await screen.findByRole('button', { name: '详情' }));
    expect(await screen.findByText('技术详情')).toBeInTheDocument();
    expect(screen.getByText('conflict')).toBeInTheDocument();
    expect(screen.getByText('变更前')).toBeInTheDocument();
    expect(screen.getByText('变更后')).toBeInTheDocument();
    // 已知键与枚举值中文化，枚举括注原值；未知键原样保留。
    expect(screen.getByText(/显示名称: "旧名"\s+状态: 启用\(active\)\s+customKey: "raw"/)).toBeInTheDocument();
    expect(screen.getByText(/显示名称: "新名"\s+状态: 停用\(disabled\)\s+customKey: "raw"/)).toBeInTheDocument();
    // 变化字段摘要只列变更字段，「变更内容」不再重复整份 JSON。
    expect(screen.getByText('显示名称、状态、customKey')).toBeInTheDocument();
    expect(screen.queryByText(/"requestId"/)).not.toBeInTheDocument();
    // 记录序号（cursor）与操作标识（requestId）不同名。
    expect(screen.getByText('记录序号')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('操作标识')).toBeInTheDocument();
    expect(screen.getByText('req-1')).toBeInTheDocument();
    // 稳定标识与原始时间归技术详情。
    expect(screen.getByText('2026-10-14T00:00:00Z')).toBeInTheDocument();
    expect(screen.getAllByText('user-a').length).toBeGreaterThan(0);
    expect(screen.getByText('model.update')).toBeInTheDocument();
    expect(screen.getByText('model')).toBeInTheDocument();
  });

  test('states honestly when a record carries no change payload', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    fireEvent.click(await screen.findByRole('button', { name: '详情' }));
    expect(await screen.findByText('无变更记录')).toBeInTheDocument();
  });

  test('does not invent before/after values a payload does not carry', async () => {
    const client = fixture();
    client.searchAdminAudit.mockResolvedValue(auditPage({ items: [auditRow({ changes: { note: 'only-a-note' } })] }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    fireEvent.click(await screen.findByRole('button', { name: '详情' }));
    expect(await screen.findByText('变化字段')).toBeInTheDocument();
    expect(screen.queryByText('变更前')).not.toBeInTheDocument();
    expect(screen.queryByText('变更后')).not.toBeInTheDocument();
    // 整份 JSON 不再重复渲染。
    expect(screen.queryByText(/only-a-note/)).not.toBeInTheDocument();
    expect(screen.getAllByText('未记录').length).toBeGreaterThan(0);
  });

  test('renders a non-object change payload exactly as it came', async () => {
    const client = fixture();
    client.searchAdminAudit.mockResolvedValue(
      auditPage({ items: [auditRow({ changes: { before: 'plain', after: 5 } })] }),
    );
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    fireEvent.click(await screen.findByRole('button', { name: '详情' }));
    expect(await screen.findByText('变更前')).toBeInTheDocument();
    expect(screen.getByText('"plain"')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  test('sends the selected result filter', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '结果' }));
    const option = await waitFor(() => {
      const node = [
        ...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'),
      ]
        .reverse()
        .find((item) => item.textContent === '失败');
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ result: 'failure', limit: 50 }));
  });

  test('reports a retryable failure instead of an empty result', async () => {
    const client = fixture();
    client.searchAdminAudit.mockRejectedValueOnce(new Error('offline'));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    expect(screen.queryByText('当前条件下暂无记录')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('模型更新')).toBeInTheDocument();
  });

  test('shows the current conditions and a clear entry when empty', async () => {
    const client = fixture();
    client.searchAdminAudit.mockResolvedValue(auditPage({ items: [] }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    expect(await screen.findByText('当前条件下暂无记录')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: '张三' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    });
    expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ actorUserId: 'user-a', limit: 50 });
    expect(screen.getByText('当前条件: 用户: zhangsan')).toBeInTheDocument();
    // The role/name query inside the empty table spends seconds computing
    // jsdom styles under V8 coverage. Click the same action by its visible text.
    await act(async () => {
      fireEvent.click(screen.getByText('清除筛选'));
    });
    expect(client.searchAdminAudit.mock.calls).toEqual([
      [{ limit: 50 }],
      [{ actorUserId: 'user-a', limit: 50 }],
      [{ limit: 50 }],
    ]);
    expect(screen.getByLabelText('用户')).toHaveValue('');
    expect(screen.queryByText('当前条件: 用户: zhangsan')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument();
  });

  test('degrades to a not-connected state when the endpoint is missing', async () => {
    const client = fixture();
    client.searchAdminAudit.mockRejectedValueOnce(new AdminRequestError(404, null, null));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    expect(await screen.findByText('操作日志查询尚未接入')).toBeInTheDocument();
  });

  test('treats a 200 response without timeRange as an old control service', async () => {
    const client = fixture();
    client.searchAdminAudit.mockResolvedValue(auditPage({ nextCursor: '51', timeRange: null }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    expect(await screen.findByText('控制面版本过旧')).toBeInTheDocument();
    // 不显示「不限 ~ 现在」这类伪窗口，也不允许发送会被忽略的筛选。
    expect(screen.queryByText(/时间范围: /)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '结果' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: '张三' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ actorUserId: 'user-a', limit: 50 }));
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await waitFor(() =>
      expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ actorUserId: 'user-a', cursor: '51', limit: 50 }),
    );
  });

  test('drops an applied result filter once the control service turns out to ignore it', async () => {
    const client = fixture();
    client.searchAdminAudit
      .mockResolvedValueOnce(auditPage())
      .mockResolvedValue(auditPage({ items: [], timeRange: null }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '结果' }));
    const option = await waitFor(() => {
      const node = [
        ...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'),
      ]
        .reverse()
        .find((item) => item.textContent === '失败');
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenCalledWith({ result: 'failure', limit: 50 }));
    // 旧 schema 暴露后条件被摘掉，后续请求不再携带 result。
    expect(await screen.findByText('控制面版本过旧')).toBeInTheDocument();
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ limit: 50 }));
    expect(client.searchAdminAudit).toHaveBeenCalledTimes(3);
  });

  test('keeps the first-page window when paging through the default range', async () => {
    const client = fixture();
    const timeRange = { after: '2026-10-08T00:00:00Z', before: '2026-10-15T00:00:00Z' };
    client.searchAdminAudit
      .mockResolvedValueOnce(auditPage({ nextCursor: '51', timeRange }))
      .mockResolvedValueOnce(
        auditPage({
          items: [auditRow({ cursor: '8', action: 'model.create' })],
          nextCursor: '41',
          timeRange: { after: '2026-10-09T00:00:00Z', before: '2026-10-16T00:00:00Z' },
        }),
      )
      .mockResolvedValueOnce(auditPage({ items: [auditRow({ cursor: '7', action: 'model.delete' })], timeRange }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    });
    await screen.findByText('模型创建');
    await waitFor(() => expect(screen.getByRole('button', { name: /加载更多/ })).not.toHaveClass('ant-btn-loading'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    });
    await screen.findByText('模型删除');
    // 后续每一页都携带首屏的上下界，不能采用后续响应中漂移的窗口。
    const bounds = { createdAfter: timeRange.after, createdBefore: timeRange.before };
    expect(client.searchAdminAudit.mock.calls).toEqual([
      [{ limit: 50 }],
      [{ ...bounds, cursor: '51', limit: 50 }],
      [{ ...bounds, cursor: '41', limit: 50 }],
    ]);
  });

  test('keeps operation rows distinct when cursors and timestamps repeat across pages', async () => {
    const client = fixture();
    client.searchAdminAudit
      .mockResolvedValueOnce(
        auditPage({
          items: [auditRow(), auditRow({ action: 'model.create', resourceId: 'm2' })],
          nextCursor: '51',
        }),
      )
      .mockResolvedValueOnce(
        auditPage({
          items: [
            auditRow({ action: 'credential.rotate', resourceType: 'credential', resourceId: 'c1' }),
            auditRow({ action: 'model.delete', createdAt: '2026-10-13T00:00:00Z' }),
          ],
        }),
      );
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    const firstRow = screen.getByText('模型更新').closest('tr')!;
    const firstKey = firstRow.dataset.rowKey;
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await screen.findByText('凭据轮换');
    const renderedRows = ['模型更新', '模型创建', '凭据轮换', '模型删除'].map(
      (action) => screen.getByText(action).closest('tr')!,
    );
    expect(new Set(renderedRows.map((row) => row.dataset.rowKey)).size).toBe(4);
    // Appending a page must preserve the identity of rows already displayed.
    expect(renderedRows[0]).toBe(firstRow);
    expect(renderedRows[0]?.dataset.rowKey).toBe(firstKey);
  });

  test('carries an explicit range into later pages', async () => {
    const client = fixture();
    client.searchAdminAudit.mockResolvedValue(auditPage({ nextCursor: '51' }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    const start = screen.getByPlaceholderText('Start date');
    fireEvent.mouseDown(start);
    fireEvent.change(start, { target: { value: '2026-10-01 00:00' } });
    fireEvent.keyDown(start, { key: 'Enter' });
    const end = screen.getByPlaceholderText('End date');
    fireEvent.change(end, { target: { value: '2026-10-05 00:00' } });
    fireEvent.keyDown(end, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    const expected = {
      createdAfter: dayjs('2026-10-01 00:00').toISOString(),
      createdBefore: dayjs('2026-10-05 00:00').toISOString(),
    };
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ ...expected, limit: 50 }));
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await waitFor(() =>
      expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ ...expected, cursor: '51', limit: 50 }),
    );
  });

  test('discards a page that arrives after a newer query started', async () => {
    const client = fixture();
    const pending = Promise.withResolvers<AdminAuditPage>();
    client.searchAdminAudit
      .mockResolvedValueOnce(auditPage({ nextCursor: '51' }))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(auditPage({ items: [auditRow({ cursor: '8', action: 'model.create' })] }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    // 分页在途时重新查询（刷新与筛选变化走同一套版本校验），旧分页响应必须被丢弃。
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('模型创建')).toBeInTheDocument();
    pending.resolve(auditPage({ items: [auditRow({ cursor: '7', action: 'stale.action' })], nextCursor: null }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('stale.action')).not.toBeInTheDocument();
  });

  test('resolves a username to a user ID before querying', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: 'zhangsan' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ actorUserId: 'user-a', limit: 50 }));
  });

  test('accepts a display name only when it is the single match', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: '张三' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ actorUserId: 'user-a', limit: 50 }));
  });

  test('passes an ID-shaped actor straight through', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    const id = '6f1c6d3a-0f4b-4c2e-9c1f-2f0f2d5b7a11';
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: id } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ actorUserId: id, limit: 50 }));
  });

  test('refuses to query a username that matches no user', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    const before = client.searchAdminAudit.mock.calls.length;
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: '李四' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('未找到用户名为「李四」的用户，请检查，或改用用户 ID 查询。')).toBeInTheDocument();
    // 姓名没有被当成 ID 发出去。
    expect(client.searchAdminAudit.mock.calls.length).toBe(before);
  });

  test('refuses to query a username that matches several users', async () => {
    const client = fixture();
    client.users.mockResolvedValue([
      { id: 'user-a', username: 'zhangsan', displayName: '张三', kind: 'human', status: 'active' },
      { id: 'user-b', username: 'zhangsan-2', displayName: '张三', kind: 'human', status: 'active' },
    ]);
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    const before = client.searchAdminAudit.mock.calls.length;
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: '张三' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('用户名为「张三」的用户有多个匹配，请改用用户 ID 查询。')).toBeInTheDocument();
    expect(client.searchAdminAudit.mock.calls.length).toBe(before);
  });

  test('refuses to query a username when the directory cannot be read', async () => {
    const client = fixture();
    client.users.mockRejectedValue(new Error('offline'));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    // 目录取不到不影响审计查询：用户列如实按 ID 显示，主表照常渲染。
    expect(await screen.findByText('模型更新')).toBeInTheDocument();
    expect(screen.getByText('user-a')).toBeInTheDocument();
    expect(screen.queryByText('记录加载失败，请重试。')).not.toBeInTheDocument();
    const before = client.searchAdminAudit.mock.calls.length;
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: '张三' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('用户目录不可用，无法校验用户名，请改用用户 ID 查询。')).toBeInTheDocument();
    expect(client.searchAdminAudit.mock.calls.length).toBe(before);
    // 目录读取失败后不在页面内缓存，下次查询重新尝试。
    expect(client.users).toHaveBeenCalledTimes(2);
  });

  test('asks for a user ID instead of guessing when the directory is unavailable', async () => {
    const client = fixture();
    // 只有遥测权限就不会去拉用户目录；此时姓名无法校验，如实要求改用用户 ID。
    render(
      <Events
        client={client as never}
        identity={{ ...administratorIdentity, roles: [], permissions: [AdminPermission.EventsRead] }}
      />,
    );
    await screen.findByText('技能变更');
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: 'zhangsan' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('用户目录不可用，无法校验用户名，请改用用户 ID 查询。')).toBeInTheDocument();
    expect(client.users).not.toHaveBeenCalled();
    expect(client.searchAudit).toHaveBeenCalledTimes(1);
  });
  test('reuses the in-flight user directory when a query starts before it resolves', async () => {
    const client = fixture();
    const directoryEntry = { id: 'user-a', username: 'zhangsan', displayName: '张三', kind: 'human', status: 'active' };
    const listing = Promise.withResolvers<(typeof directoryEntry)[]>();
    client.users.mockReturnValue(listing.promise);
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: 'zhangsan' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    // 目录还在路上：这次查询复用同一个请求，不重复拉取。
    await waitFor(() => expect(client.users).toHaveBeenCalledTimes(1));
    listing.resolve([directoryEntry]);
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ actorUserId: 'user-a', limit: 50 }));
  });
  test('clears the applied filters and the actor warning on every tab', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    // ① 业务事件：用户名解析不出来只提示；重置后提示消失并按无条件重新查询。
    await screen.findByText('技能变更');
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: 'nobody' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('未找到用户名为「nobody」的用户，请检查，或改用用户 ID 查询。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重置/ }));
    expect(screen.queryByText(/未找到用户名为/)).not.toBeInTheDocument();
    await waitFor(() => expect(client.searchAudit).toHaveBeenLastCalledWith({ limit: 50 }));

    // ④ 登录日志：同一套用户口径与重置。
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    await screen.findByText('登录失败');
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: 'nobody' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('未找到用户名为「nobody」的用户，请检查，或改用用户 ID 查询。')).toBeInTheDocument();
    expect(client.searchAuthenticationAudit).toHaveBeenLastCalledWith({ limit: 50 });
    fireEvent.click(screen.getByRole('button', { name: /重置/ }));
    expect(screen.queryByText(/未找到用户名为/)).not.toBeInTheDocument();

    // ⑤ 操作日志：重置同时摘掉已应用条件与提示。
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: 'nobody' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('未找到用户名为「nobody」的用户，请检查，或改用用户 ID 查询。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重置/ }));
    expect(screen.queryByText(/未找到用户名为/)).not.toBeInTheDocument();
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ limit: 50 }));
  });

  test('reports a failed next page and keeps the loaded records', async () => {
    const client = fixture();
    client.searchAdminAudit
      .mockResolvedValueOnce(auditPage({ nextCursor: '51' }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(auditPage({ items: [], nextCursor: null }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    expect(screen.getByText('模型更新')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('当前条件下暂无记录')).toBeInTheDocument();
    expect(client.searchAdminAudit).toHaveBeenCalledTimes(3);
  });

  test('trims the action and object filters before querying', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    fireEvent.change(screen.getByLabelText('操作类型'), { target: { value: ' model.update ' } });
    fireEvent.change(screen.getByLabelText('对象 ID'), { target: { value: ' m1 ' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() =>
      expect(client.searchAdminAudit).toHaveBeenLastCalledWith({
        action: 'model.update',
        resourceId: 'm1',
        limit: 50,
      }),
    );
  });

  test('shows a record without an actor as not recorded', async () => {
    const client = fixture();
    const { actorUserId: _actor, ...row } = auditRow();
    client.searchAdminAudit.mockResolvedValue(auditPage({ items: [row] }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    expect(await screen.findByText('未记录')).toBeInTheDocument();
  });

  test('shows only the user ID when the directory does not know the actor', async () => {
    const client = fixture();
    client.searchAdminAudit.mockResolvedValue(auditPage({ items: [auditRow({ actorUserId: 'gone-user' })] }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    // 目录里查不到（已删除或改名）：只显示用户 ID，主行不留白、不编造。
    expect(await screen.findByText('gone-user')).toBeInTheDocument();
    expect(screen.getAllByText('gone-user')).toHaveLength(1);
  });
});
