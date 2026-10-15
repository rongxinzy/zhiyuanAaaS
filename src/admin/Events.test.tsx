// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  type AdminAuditPage,
  type AdminAuditRecord,
  type AdminEventRecord,
  type AdminIdentity,
  AdminPermission,
  AdminRequestError,
} from './client.js';
import { Events } from './Events.js';
import { formatTimestampSeconds } from './format.js';
import { PortalClient } from './portal.js';
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
  test('keeps loaded telemetry rows when the next page fails', async () => {
    const client = fixture();
    client.searchAudit
      .mockResolvedValueOnce({
        items: [{ eventId: 'e1', type: 'skill.changed', userId: 'user-a', result: 'success' }],
        nextCursor: 'next',
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [], nextCursor: null });
    render(<Events client={client as never} identity={administratorIdentity} />);
    await screen.findByText('skill.changed');
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    // 分页失败只报错，已经加载的记录不丢。
    expect(screen.getByText('skill.changed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('当前条件下暂无记录')).toBeInTheDocument();
    expect(client.searchAudit).toHaveBeenCalledTimes(3);
  });
  test('discards a telemetry page that lands after a newer query', async () => {
    const client = fixture();
    let release: (page: { items: readonly AdminEventRecord[]; nextCursor: string | null }) => void = () => undefined;
    const pending = new Promise<{ items: readonly AdminEventRecord[]; nextCursor: string | null }>((resolve) => {
      release = resolve;
    });
    client.searchAudit
      .mockResolvedValueOnce({ items: [{ eventId: 'e1', type: 'skill.changed' }], nextCursor: 'next' })
      .mockReturnValueOnce(pending)
      .mockResolvedValue({ items: [{ eventId: 'e2', type: 'model.changed' }], nextCursor: null });
    render(<Events client={client as never} identity={administratorIdentity} />);
    await screen.findByText('skill.changed');
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    // 分页在途时刷新：旧分页响应必须被丢弃，不能覆盖新查询的结果。
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('model.changed')).toBeInTheDocument();
    release({ items: [{ eventId: 'e3', type: 'stale.event' }], nextCursor: null });
    await waitFor(() => expect(client.searchAudit).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('stale.event')).not.toBeInTheDocument();
  });
  test('page-loads control events and reports a failed page', async () => {
    const client = fixture();
    client.controlEvents
      .mockResolvedValueOnce({
        items: [{ eventId: 'control-1', type: 'model.catalog.changed', state: 'active' }],
        nextCursor: 'next',
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [], nextCursor: null });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '配置执行记录' }));
    await screen.findByText('model.catalog.changed');
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    expect(screen.getByText('model.catalog.changed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    await waitFor(() => expect(client.controlEvents).toHaveBeenLastCalledWith({ cursor: 'next', limit: 50 }));
  });
  test('sends the telemetry filters that were filled in', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    await screen.findByText('skill.changed');
    fireEvent.change(screen.getByLabelText('操作类型'), { target: { value: ' model ' } });
    fireEvent.change(screen.getByLabelText('操作人'), { target: { value: ' user-a ' } });
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
    await waitFor(() =>
      expect(client.searchAudit).toHaveBeenLastCalledWith({
        type: 'model',
        userId: 'user-a',
        result: 'failure',
        limit: 50,
      }),
    );
  });
  test('reports a failed control-event list and retries it', async () => {
    const client = fixture();
    client.controlEvents
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [{ eventId: 'control-1', type: 'model.catalog.changed' }], nextCursor: null });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '配置执行记录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('model.catalog.changed')).toBeInTheDocument();
  });
  test('reports a failed login-history read and retries it', async () => {
    const client = fixture();
    client.searchAuthenticationAudit.mockRejectedValueOnce(new Error('offline'));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('登录失败')).toBeInTheDocument();
  });
  test('renders every login event code without inventing labels', async () => {
    const client = fixture();
    client.searchAuthenticationAudit.mockResolvedValue({
      items: [
        { cursor: '3', eventType: 'session.revoked', outcome: 'denied', createdAt: '2026-10-11T00:00:00Z' },
        { cursor: '2', eventType: 'password.changed', outcome: 'success', createdAt: '2026-10-11T00:00:00Z' },
        { cursor: '1', eventType: 'login.throttled', outcome: 'denied', createdAt: '2026-10-11T00:00:00Z' },
      ],
      nextCursor: null,
    });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    expect(await screen.findByText('登录受限')).toBeInTheDocument();
    expect(screen.getByText('修改密码')).toBeInTheDocument();
    expect(screen.getAllByText('已拒绝')).toHaveLength(2);
    // 未知事件代码原样显示，不伪造标签。
    expect(screen.getByText('session.revoked')).toBeInTheDocument();
  });
  test('pages execution results inside the delivery drawer and retries a failed page', async () => {
    const client = fixture();
    client.deliverySummary
      .mockResolvedValueOnce({
        items: [{ deliveryId: 'd1', eventId: 'control-1', state: 'failed', attemptCount: 2 }],
        nextCursor: 'd2',
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        items: [{ deliveryId: 'd2', eventId: 'control-1', state: 'applied', attemptCount: 1 }],
        nextCursor: 'd3',
      });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '配置执行记录' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看执行结果' }));
    await screen.findByText('failed');
    fireEvent.click(screen.getAllByRole('button', { name: /加载更多/ }).at(-1)!);
    expect(await screen.findByText('执行结果暂无法获取，请重试。')).toBeInTheDocument();
    expect(client.deliverySummary).toHaveBeenLastCalledWith('control-1', { cursor: 'd2', limit: 50 });
    fireEvent.click(screen.getAllByRole('button', { name: '刷新' }).at(-1)!);
    expect(await screen.findByText('applied')).toBeInTheDocument();
    expect(client.deliverySummary).toHaveBeenLastCalledWith('control-1', { limit: 50 });
    // 失败过的分页按钮仍可继续翻页，成功的页追加到已加载结果后面。
    fireEvent.click(screen.getAllByRole('button', { name: /加载更多/ }).at(-1)!);
    await waitFor(() =>
      expect(client.deliverySummary).toHaveBeenLastCalledWith('control-1', { cursor: 'd3', limit: 50 }),
    );
    expect(screen.getAllByText('applied')).toHaveLength(2);
  });
});

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
    await screen.findByText('model.update');
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    expect(screen.getByText('model.update')).toBeInTheDocument();
    expect(screen.queryByText('当前条件下暂无记录')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /加载更多/ })).not.toHaveClass('ant-btn-loading'));
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    expect(await screen.findByText('model.delete')).toBeInTheDocument();
    expect(screen.getByText('model.update')).toBeInTheDocument();
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
    let resolvePage: ((page: typeof firstPage) => void) | undefined;
    const oldPage = new Promise<typeof firstPage>((resolve) => {
      resolvePage = resolve;
    });
    client.searchAdminAudit
      .mockResolvedValueOnce(firstPage)
      .mockReturnValueOnce(oldPage)
      .mockResolvedValueOnce({
        ...firstPage,
        items: [{ cursor: '19', action: 'credential.rotate', resourceType: 'credential', result: 'success' }],
        nextCursor: null,
      });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await waitFor(() => expect(client.searchAdminAudit).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('credential.rotate')).toBeInTheDocument();
    await act(async () => {
      resolvePage?.({
        ...firstPage,
        items: [{ cursor: '8', action: 'stale.operation', resourceType: 'model', result: 'success' }],
        nextCursor: null,
      });
    });
    expect(screen.getByText('credential.rotate')).toBeInTheDocument();
    expect(screen.queryByText('model.update')).not.toBeInTheDocument();
    expect(screen.queryByText('stale.operation')).not.toBeInTheDocument();
    expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ limit: 50 });
  });

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
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    });
    expect(client.searchAdminAudit).toHaveBeenLastCalledWith({ actorUserId: 'user-a', limit: 50 });
    expect(screen.getByText('当前条件: 操作人: 张三')).toBeInTheDocument();
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
    expect(screen.getByLabelText('操作人（姓名或 ID）')).toHaveValue('');
    expect(screen.queryByText('当前条件: 操作人: 张三')).not.toBeInTheDocument();
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
    await screen.findByText('model.update');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    });
    await screen.findByText('model.create');
    await waitFor(() => expect(screen.getByRole('button', { name: /加载更多/ })).not.toHaveClass('ant-btn-loading'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    });
    await screen.findByText('model.delete');
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
    await screen.findByText('model.update');
    const firstRow = screen.getByText('model.update').closest('tr')!;
    const firstKey = firstRow.dataset.rowKey;
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await screen.findByText('credential.rotate');
    const renderedRows = ['model.update', 'model.create', 'credential.rotate', 'model.delete'].map(
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

  test('refuses to query an actor name that matches several users', async () => {
    const client = fixture();
    client.users.mockResolvedValue([
      { id: 'user-a', username: 'zhangsan', displayName: '张三', kind: 'human', status: 'active' },
      { id: 'user-b', username: 'zhangsan-2', displayName: '张三', kind: 'human', status: 'active' },
    ]);
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
    const before = client.searchAdminAudit.mock.calls.length;
    fireEvent.change(screen.getByLabelText('操作人（姓名或 ID）'), { target: { value: '张三' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('姓名为「张三」的用户有多个匹配，请改用用户 ID 查询。')).toBeInTheDocument();
    expect(client.searchAdminAudit.mock.calls.length).toBe(before);
  });

  test('refuses to query an actor when the directory cannot be read', async () => {
    const client = fixture();
    client.users.mockRejectedValue(new Error('offline'));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    // 目录取不到不影响审计查询：操作人如实按 ID 显示。
    expect(await screen.findByText('model.update')).toBeInTheDocument();
    expect(screen.getByText('user-a')).toBeInTheDocument();
    const before = client.searchAdminAudit.mock.calls.length;
    fireEvent.change(screen.getByLabelText('操作人（姓名或 ID）'), { target: { value: '张三' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('无法校验操作人姓名，请改用用户 ID 查询。')).toBeInTheDocument();
    expect(client.searchAdminAudit.mock.calls.length).toBe(before);
    // 目录读取失败后不在页面内缓存，下次查询重新尝试。
    expect(client.users).toHaveBeenCalledTimes(2);
  });

  test('reports a failed next page and keeps the loaded records', async () => {
    const client = fixture();
    client.searchAdminAudit
      .mockResolvedValueOnce(auditPage({ nextCursor: '51' }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(auditPage({ items: [], nextCursor: null }));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    expect(screen.getByText('model.update')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('当前条件下暂无记录')).toBeInTheDocument();
    expect(client.searchAdminAudit).toHaveBeenCalledTimes(3);
  });

  test('trims the action and object filters before querying', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('model.update');
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
});

describe('audit page permissions', () => {
  const identityWith = (...permissions: readonly AdminPermission[]): AdminIdentity => ({
    ...administratorIdentity,
    roles: [],
    permissions: [...permissions],
  });
  /** 知识审计走 PortalClient，这里只固定它在页面里加载成功。 */
  const stubKnowledgeAudit = () =>
    vi.spyOn(PortalClient.prototype, 'knowledgeAudit').mockResolvedValue({ items: [], nextCursor: null });

  test('an audit-only identity sees the audit tabs and never the telemetry tabs', async () => {
    const client = fixture();
    const knowledge = stubKnowledgeAudit();
    render(<Events client={client as never} identity={identityWith(AdminPermission.AuditRead)} />);
    expect(screen.queryByText('没有管理权限')).not.toBeInTheDocument();
    for (const name of ['知识审计', '登录日志', '操作日志'])
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    for (const name of ['业务事件', '配置执行记录'])
      expect(screen.queryByRole('tab', { name })).not.toBeInTheDocument();
    // 没有遥测权限就不该碰遥测接口；默认落在第一个可用 tab。
    expect(screen.getByRole('tab', { name: '知识审计' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(knowledge).toHaveBeenCalled());
    expect(client.searchAudit).not.toHaveBeenCalled();
    expect(client.controlEvents).not.toHaveBeenCalled();
    // 审计类 tab 可以正常使用。
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    expect(await screen.findByText('model.update')).toBeInTheDocument();
  });

  test('an events-only identity sees the telemetry tabs and never the audit tabs', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={identityWith(AdminPermission.EventsRead)} />);
    expect(screen.getByRole('tab', { name: '业务事件' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '配置执行记录' })).toBeInTheDocument();
    for (const name of ['知识审计', '登录日志', '操作日志'])
      expect(screen.queryByRole('tab', { name })).not.toBeInTheDocument();
    // 遥测 tab 如实说明数据来源，不冒充管理审计。
    expect(screen.getByText(/不是后台管理审计/)).toBeInTheDocument();
    expect(await screen.findByText('skill.changed')).toBeInTheDocument();
    expect(client.searchAdminAudit).not.toHaveBeenCalled();
    expect(client.searchAuthenticationAudit).not.toHaveBeenCalled();
    expect(client.users).not.toHaveBeenCalled();
  });

  test('an identity with both permissions sees every tab', async () => {
    const client = fixture();
    stubKnowledgeAudit();
    render(
      <Events
        client={client as never}
        identity={identityWith(AdminPermission.EventsRead, AdminPermission.AuditRead)}
      />,
    );
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '业务事件',
      '配置执行记录',
      '知识审计',
      '登录日志',
      '操作日志',
    ]);
  });
});
