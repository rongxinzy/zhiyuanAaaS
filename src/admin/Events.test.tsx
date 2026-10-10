// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AdminRequestError } from './client.js';
import { Events } from './Events.js';
import { administratorIdentity } from './test-fixtures.js';

afterEach(cleanup);
function render(ui: ReactNode) {
  return rtlRender(<ConfigProvider button={{ autoInsertSpace: false }}>{ui}</ConfigProvider>);
}
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
});
