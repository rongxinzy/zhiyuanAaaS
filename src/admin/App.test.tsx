// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const client = {
  restore: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  overview: vi.fn(),
  resources: vi.fn(),
};

vi.mock('./client.js', () => ({
  AdminConsoleClient: class {
    restore = client.restore;
    login = client.login;
    logout = client.logout;
    overview = client.overview;
  },
  AdminConsoleStatus: {
    SignedOut: 'signed-out',
    Authenticated: 'authenticated',
    Forbidden: 'forbidden',
  },
}));

import { AdminApp } from './App.js';

describe('admin console', () => {
  beforeEach(() => {
    client.restore.mockResolvedValue({ status: 'signed-out' });
    client.login.mockResolvedValue({
      status: 'authenticated',
      identity: {
        user: { id: 'u1', displayName: '管理员' },
        deployment: { id: 'demo', name: '知远' },
        deploymentId: 'demo',
        roles: ['admin'],
        sessionExpiresAt: '2026-08-27T12:00:00Z',
        passwordChangeRequired: false,
      },
    });
    client.overview.mockResolvedValue({ users: 4, teams: 2, skills: 3, models: 1, pendingEvents: 0 });
    client.resources.mockResolvedValue({ users: [], teams: [], roles: [], skills: [], assignments: [] });
    client.logout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test('shows login and submits credentials', async () => {
    render(<AdminApp />);
    expect(await screen.findByRole('heading', { name: '登录企业控制台' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(client.login).toHaveBeenCalledWith({ deploymentId: 'demo', username: 'admin', password: 'secret' }));
    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
  });

  test('blocks non-admin accounts', async () => {
    client.restore.mockResolvedValue({ status: 'forbidden', identity: { user: { displayName: '普通用户' } } });
    render(<AdminApp />);
    expect(await screen.findByText('没有管理权限')).toBeInTheDocument();
    expect(screen.getByText(/普通用户/)).toBeInTheDocument();
  });

  test('renders refreshed overview counts', async () => {
    client.restore.mockResolvedValue({ status: 'authenticated', identity: { user: { displayName: '管理员' } } });
    render(<AdminApp />);
    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(await screen.findByText('服务已连接')).toHaveClass('bg-success-soft', 'text-success');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '刷新' })));
    expect(client.overview).toHaveBeenCalledTimes(2);
  });

  test('uses Tea menu tokens and regular weight for active navigation', async () => {
    client.restore.mockResolvedValue({ status: 'authenticated', identity: { user: { displayName: '管理员' } } });
    render(<AdminApp />);

    const activeItems = await screen.findAllByRole('button', { name: '概览' });
    expect(activeItems).toHaveLength(2);
    for (const item of activeItems) {
      expect(item).toHaveAttribute('aria-current', 'page');
      expect(item).toHaveClass('bg-sidebar-primary', 'text-sidebar-primary-foreground', 'font-normal');
      expect(item).not.toHaveClass('border-border', 'font-medium', 'font-semibold');
    }
  });

  test('keeps the compact header sign-out hover target around its icon', async () => {
    client.restore.mockResolvedValue({ status: 'authenticated', identity: { user: { displayName: '管理员' } } });
    render(<AdminApp />);

    const signOutButtons = await screen.findAllByRole('button', { name: '退出登录' });
    const headerSignOut = signOutButtons.at(-1)!;
    expect(headerSignOut).toHaveClass('size-8', 'rounded-lg', 'p-0', 'md:hidden');
    expect(headerSignOut.querySelector('svg')).toHaveClass('size-4');
  });

  test('uses Zhiyuan line tabs and a sliding indicator for resources', async () => {
    client.restore.mockResolvedValue({ status: 'authenticated', identity: { user: { displayName: '管理员' } } });
    render(<AdminApp />);

    fireEvent.click((await screen.findAllByRole('button', { name: '资源管理' }))[0]!);
    expect(await screen.findByRole('tablist')).toHaveAttribute('data-variant', 'line');
    expect(document.querySelector('[data-slot="tabs-indicator"]')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '用户' })).toHaveAttribute('data-active');

    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveAttribute('data-active');
  });
});
