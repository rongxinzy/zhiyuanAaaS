/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AdminNotificationKind, AdminNotificationViewport, clearNotification, notify } from './notifications.js';

describe('admin notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearNotification();
  });
  afterEach(() => {
    cleanup();
    clearNotification();
    vi.useRealTimers();
  });

  test('success auto-dismisses after 3s and replaces prior notice', () => {
    render(<AdminNotificationViewport />);
    act(() => notify(AdminNotificationKind.Success, 'saved-1'));
    expect(screen.getByText('saved-1')).toBeInTheDocument();
    act(() => notify(AdminNotificationKind.Success, 'saved-2'));
    expect(screen.queryByText('saved-1')).not.toBeInTheDocument();
    expect(screen.getByText('saved-2')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByText('saved-2')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('saved-2')).not.toBeInTheDocument();
  });

  test('error stays 5s then auto-dismisses', () => {
    render(<AdminNotificationViewport />);
    act(() => notify(AdminNotificationKind.Error, 'boom'));
    expect(screen.getByText('boom')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByText('boom')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});
