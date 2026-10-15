// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { type AdminAuditPage, type AdminAuditRecord, AdminRequestError } from './client.js';
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
describe('read-only audit', () => {
  test('loads records by default and never offers protocol mutations', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    expect(await screen.findByText('skill.changed')).toBeInTheDocument();
    expect(client.searchAudit).toHaveBeenCalledWith({ limit: 50 });
    expect(screen.queryByRole('button', { name: /发布事件|取消事件/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
    expect(await screen.findByText('记录标识')).toBeInTheDocument();
    expect(screen.getByText('e1')).toBeInTheDocument();
    expect(client.publishControlEvent).not.toHaveBeenCalled();
  });
  test('filters and cursor-paginates the same query', async () => {
    const client = fixture();
    client.searchAudit
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({
        items: [{ eventId: 'e2', type: 'model.changed' }],
        nextCursor: 'next',
      })
      .mockResolvedValueOnce({
        items: [{ eventId: 'e3', type: 'model.failed' }],
        nextCursor: null,
      });
    render(<Events client={client as never} identity={administratorIdentity} />);
    await screen.findByText('当前条件下暂无记录');
    fireEvent.change(screen.getByLabelText('操作类型'), {
      target: { value: 'model' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /查询/ })).not.toHaveClass('ant-btn-loading'));
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('model.changed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByText('model.failed')).toBeInTheDocument();
    expect(client.searchAudit).toHaveBeenLastCalledWith({
      type: 'model',
      cursor: 'next',
      limit: 50,
    });
  });
  test('rejects unauthorized read without requesting data', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={{ ...administratorIdentity, roles: [], permissions: [] }} />);
    expect(screen.getByText('没有管理权限')).toBeInTheDocument();
    expect(client.searchAudit).not.toHaveBeenCalled();
  });
  test('distinguishes errors and retries', async () => {
    const client = fixture();
    client.searchAudit.mockRejectedValueOnce(new Error('offline'));
    render(<Events client={client as never} identity={administratorIdentity} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('skill.changed')).toBeInTheDocument();
  });
  test('loads execution delivery outcomes separately and retries failure', async () => {
    const client = fixture();
    client.deliverySummary.mockRejectedValueOnce(new Error('offline'));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '配置执行记录' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看执行结果' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('执行结果暂无法获取');
    fireEvent.click(screen.getAllByRole('button', { name: '刷新' }).at(-1)!);
    await waitFor(() => expect(client.deliverySummary).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('failed')).toBeInTheDocument();
    expect(client.cancelControlEvent).not.toHaveBeenCalled();
  });
  test('loads persisted login history with actor, reason and source', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    expect(await screen.findByText('登录失败')).toBeInTheDocument();
    expect(client.searchAuthenticationAudit).toHaveBeenCalledWith({ limit: 50 });
    expect(screen.getByText('user-a')).toBeInTheDocument();
    expect(screen.getByText('invalid_credentials')).toBeInTheDocument();
    expect(screen.getByText('abcdef012345')).toBeInTheDocument();
    expect(screen.queryByText('登录历史查询尚未接入')).not.toBeInTheDocument();
  });
  test('states honestly when the control service has no login-history endpoint', async () => {
    const client = fixture();
    client.searchAuthenticationAudit.mockRejectedValueOnce(new AdminRequestError(404, null, null));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    expect(await screen.findByText('登录历史查询尚未接入')).toBeInTheDocument();
  });
  test('page-loads additional login history', async () => {
    const client = fixture();
    client.searchAuthenticationAudit
      .mockResolvedValueOnce({
        items: [{ cursor: '2', eventType: 'login.succeeded', outcome: 'success' }],
        nextCursor: '2',
      })
      .mockResolvedValueOnce({
        items: [{ cursor: '1', eventType: 'login.failed', outcome: 'failure', reason: 'invalid_credentials' }],
        nextCursor: null,
      });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    expect(await screen.findByText('登录成功')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByText('invalid_credentials')).toBeInTheDocument();
    expect(client.searchAuthenticationAudit).toHaveBeenLastCalledWith({ cursor: '2', limit: 50 });
  });
  test('applies the login filter through the query button', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    await screen.findByText('登录失败');
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: 'user-a' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() =>
      expect(client.searchAuthenticationAudit).toHaveBeenLastCalledWith({ userId: 'user-a', limit: 50 }),
    );
  });
});

describe('read-only operations audit', () => {
  test('loads the default seven-day window and states the applied range', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    expect(await screen.findByText('model.update')).toBeInTheDocument();
    // 默认窗口不携带时间参数，页面展示服务端实际生效的 timeRange。
    expect(client.searchAdminAudit).toHaveBeenCalledWith({ limit: 50 });
    expect(
      screen.getByText(`时间范围: ${dayjs('2026-10-08T00:00:00Z').format('YYYY-MM-DD HH:mm')} ~ 现在`),
    ).toBeInTheDocument();
    // 主表时间到秒并带时区，原始值只留在技术详情；目录里能查到就显示姓名。
    expect(screen.getByText(formatTimestampSeconds('2026-10-14T00:00:00Z'))).toBeInTheDocument();
    expect(screen.queryByText('2026-10-14T00:00:00Z')).not.toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
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
            changes: { before: { price: 1 }, after: { price: 2 }, requestId: 'req-1' },
          }),
        ],
      }),
    );
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看详情' }));
    expect(await screen.findByText('技术详情')).toBeInTheDocument();
    expect(screen.getByText('conflict')).toBeInTheDocument();
    expect(screen.getByText('req-1')).toBeInTheDocument();
    expect(screen.getByText('变更前')).toBeInTheDocument();
    expect(screen.getByText('变更后')).toBeInTheDocument();
    expect(screen.getAllByText(/"price": 2/).length).toBeGreaterThan(0);
    // 稳定标识与原始时间归技术详情。
    expect(screen.getByText('2026-10-14T00:00:00Z')).toBeInTheDocument();
    expect(screen.getByText('user-a')).toBeInTheDocument();
  });

  test('states honestly when a record carries no change payload', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看详情' }));
    expect(await screen.findByText('无变更记录')).toBeInTheDocument();
  });

  test('sends the selected result filter', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
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
    expect(await screen.findByText('model.update')).toBeInTheDocument();
  });

  test('shows the current conditions and a clear entry when empty', async () => {
    const client = fixture();
    client.searchAdminAudit.mockResolvedValue(auditPage({ items: [] }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    expect(await screen.findByText('当前条件下暂无记录')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('操作人（姓名或 ID）'), { target: { value: '张三' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('当前条件: 操作人: 张三')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ limit: 50 }));
    expect(screen.queryByText('当前条件: 操作人: 张三')).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('操作人（姓名或 ID）'), { target: { value: '张三' } });
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
    await screen.findByText('model.update');
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
    client.searchAdminAudit.mockResolvedValue(auditPage({ nextCursor: '51' }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    // 第二页显式携带首屏的生效下界，服务端不再重算 now()-7d。
    await waitFor(() =>
      expect(client.searchAdminAudit).toHaveBeenLastCalledWith({
        cursor: '51',
        limit: 50,
        createdAfter: '2026-10-08T00:00:00Z',
      }),
    );
  });

  test('carries an explicit range into later pages', async () => {
    const client = fixture();
    client.searchAdminAudit.mockResolvedValue(auditPage({ nextCursor: '51' }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
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
    let release: (page: AdminAuditPage) => void = () => undefined;
    const pending = new Promise<AdminAuditPage>((resolve) => {
      release = resolve;
    });
    client.searchAdminAudit
      .mockResolvedValueOnce(auditPage({ nextCursor: '51' }))
      .mockReturnValueOnce(pending)
      .mockResolvedValue(auditPage({ items: [auditRow({ cursor: '8', action: 'model.create' })] }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    // 分页在途时重新查询（刷新与筛选变化走同一套版本校验），旧分页响应必须被丢弃。
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('model.create')).toBeInTheDocument();
    release(auditPage({ items: [auditRow({ cursor: '7', action: 'stale.action' })], nextCursor: null }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('stale.action')).not.toBeInTheDocument();
  });

  test('resolves an actor name to a user ID before querying', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
    fireEvent.change(screen.getByLabelText('操作人（姓名或 ID）'), { target: { value: '张三' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ actorUserId: 'user-a', limit: 50 }));
  });

  test('passes an ID-shaped actor straight through', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
    const id = '6f1c6d3a-0f4b-4c2e-9c1f-2f0f2d5b7a11';
    fireEvent.change(screen.getByLabelText('操作人（姓名或 ID）'), { target: { value: id } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ actorUserId: id, limit: 50 }));
  });

  test('refuses to query an actor name that matches no user', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
    const before = client.searchAdminAudit.mock.calls.length;
    fireEvent.change(screen.getByLabelText('操作人（姓名或 ID）'), { target: { value: '李四' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('未找到姓名为「李四」的用户，请检查，或改用用户 ID 查询。')).toBeInTheDocument();
    // 姓名没有被当成 ID 发出去。
    expect(client.searchAdminAudit.mock.calls.length).toBe(before);
  });
});
