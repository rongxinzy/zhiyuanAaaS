// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Events } from './Events.js';

const activeEvent = {
  eventId: 'event-1', type: 'model.catalog.changed', scope: { type: 'global' },
  task: { type: 'model.reconcile' }, expiresAt: '2026-09-05T00:00:00Z',
  state: 'active', createdAt: '2026-09-04T00:00:00Z', createdBy: 'admin',
  deliverySummary: { pending: 1, received: 0, running: 0, succeeded: 0, failed: 0, expired: 0, superseded: 0 },
} as const;

describe('admin events', () => {
  afterEach(() => cleanup());

  test('loads event details and cancels an active event', async () => {
    const client = {
      controlEvents: vi.fn().mockResolvedValue({ items: [activeEvent], nextCursor: null }),
      getControlEvent: vi.fn().mockResolvedValue(activeEvent),
      cancelControlEvent: vi.fn().mockResolvedValue({ ...activeEvent, state: 'cancelled' }),
      publishControlEvent: vi.fn(),
      searchAudit: vi.fn(),
    };
    render(<Events client={client as never} />);
    expect(await screen.findByText('model.catalog.changed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看详情' }));
    await waitFor(() => expect(client.getControlEvent).toHaveBeenCalledWith('event-1'));
    expect(await screen.findByText(/"eventId": "event-1"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: '取消事件' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认取消事件' }));
    await waitFor(() => expect(client.cancelControlEvent).toHaveBeenCalledWith('event-1'));
  });

  test('refreshes the event list after publishing', async () => {
    const client = {
      controlEvents: vi.fn()
        .mockResolvedValueOnce({ items: [], nextCursor: null })
        .mockResolvedValueOnce({ items: [activeEvent], nextCursor: null }),
      publishControlEvent: vi.fn().mockResolvedValue({ eventId: 'event-1' }),
      searchAudit: vi.fn(),
    };
    render(<Events client={client as never} />);
    expect(await screen.findByText('暂无管控事件')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '发布' }));
    await waitFor(() => expect(client.publishControlEvent).toHaveBeenCalled());
    await waitFor(() => expect(client.controlEvents).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('model.catalog.changed')).toBeInTheDocument();
  });

  test('publishes a selected scoped event with its mapped task and resource reference', async () => {
    const client = {
      controlEvents: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      publishControlEvent: vi.fn().mockResolvedValue({ eventId: 'event-skill-1' }),
      searchAudit: vi.fn(),
    };
    render(<Events client={client as never} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Skill 清单' }));
    fireEvent.click(screen.getByRole('button', { name: 'User' }));
    fireEvent.change(screen.getByLabelText('事件作用域 ID'), { target: { value: 'user-1' } });
    fireEvent.change(screen.getByLabelText('事件资源 ID'), { target: { value: 'skill-1' } });
    fireEvent.change(screen.getByLabelText('事件资源版本'), { target: { value: '1.2.0' } });
    fireEvent.change(screen.getByLabelText('事件有效期（分钟）'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('事件替代键'), { target: { value: 'skill:skill-1' } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => expect(client.publishControlEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'skill.manifest.changed',
      scope: { type: 'user', id: 'user-1' },
      task: { type: 'skill.reconcile' },
      resource: { type: 'skill', id: 'skill-1', revision: '1.2.0' },
      supersedesKey: 'skill:skill-1',
      expiresAt: expect.any(String),
    })));
  });

  test('rejects a non-global event without a scope target before sending', async () => {
    const client = {
      controlEvents: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      publishControlEvent: vi.fn(),
      searchAudit: vi.fn(),
    };
    render(<Events client={client as never} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Team' }));
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    expect(await screen.findByText('事件字段不完整，请检查作用域、资源引用和有效期。')).toBeInTheDocument();
    expect(client.publishControlEvent).not.toHaveBeenCalled();
  });

  test('filters and paginates audit records', async () => {
    const client = {
      controlEvents: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      publishControlEvent: vi.fn(),
      searchAudit: vi.fn()
        .mockResolvedValueOnce({ items: [{ eventId: 'audit-1', type: 'skill.changed', userId: 'u1', result: 'success' }], nextCursor: 'audit-page-2' })
        .mockResolvedValueOnce({ items: [{ eventId: 'audit-2', type: 'skill.failed', userId: 'u1', result: 'failure' }], nextCursor: null }),
    };
    render(<Events client={client as never} />);
    fireEvent.change(screen.getByLabelText('用户 ID'), { target: { value: 'u1' } });
    fireEvent.change(screen.getByLabelText('资源类型'), { target: { value: 'skill' } });
    const searchButtons = screen.getAllByRole('button', { name: '查询' });
    fireEvent.click(searchButtons.at(-1)!);
    expect(await screen.findByText('skill.changed')).toBeInTheDocument();
    await waitFor(() => expect(client.searchAudit).toHaveBeenCalledWith({ userId: 'u1', resourceType: 'skill', limit: 100 }));
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByText('skill.failed')).toBeInTheDocument();
    await waitFor(() => expect(client.searchAudit).toHaveBeenLastCalledWith({ userId: 'u1', resourceType: 'skill', cursor: 'audit-page-2', limit: 100 }));
  });

  test('filters control events by scope and time', async () => {
    const client = {
      controlEvents: vi.fn()
        .mockResolvedValueOnce({ items: [activeEvent], nextCursor: null })
        .mockResolvedValueOnce({ items: [activeEvent], nextCursor: null }),
      publishControlEvent: vi.fn(),
      searchAudit: vi.fn(),
    };
    render(<Events client={client as never} />);
    expect(await screen.findByText('model.catalog.changed')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('作用域类型'), { target: { value: 'user' } });
    fireEvent.change(screen.getByLabelText('作用域 ID'), { target: { value: 'u1' } });
    fireEvent.click(screen.getAllByRole('button', { name: '查询' }).at(-1)!);
    await waitFor(() => expect(client.controlEvents).toHaveBeenLastCalledWith({ scopeType: 'user', scopeId: 'u1', limit: 100 }));
  });

  test('surfaces delivery lookup failures in the page error state', async () => {
    const client = {
      controlEvents: vi.fn().mockResolvedValue({ items: [activeEvent], nextCursor: null }),
      publishControlEvent: vi.fn().mockResolvedValue({ eventId: 'event-1' }),
      searchAudit: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      deliverySummary: vi.fn().mockRejectedValue(new Error('control service unavailable')),
    };
    render(<Events client={client as never} />);
    expect(await screen.findByText('model.catalog.changed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '发布' }));
    await waitFor(() => expect(client.publishControlEvent).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: '查看投递状态' }));
    await waitFor(() => expect(client.deliverySummary).toHaveBeenCalledWith('event-1', { limit: 100 }));
    expect(await screen.findByText('事件操作失败，请稍后重试。')).toBeInTheDocument();
  });

  test('hides event mutations for a read-only operator', async () => {
    const client = {
      controlEvents: vi.fn().mockResolvedValue({ items: [activeEvent], nextCursor: null }),
      getControlEvent: vi.fn().mockResolvedValue(activeEvent),
      cancelControlEvent: vi.fn(),
      publishControlEvent: vi.fn(),
      searchAudit: vi.fn(),
    };
    render(<Events client={client as never} identity={{ roles: [], permissions: ['events.read'] } as never} />);

    expect(await screen.findByText('model.catalog.changed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发布' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取消事件' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看详情' })).toBeInTheDocument();
  });
});
