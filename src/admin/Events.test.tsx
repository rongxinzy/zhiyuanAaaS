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
});
