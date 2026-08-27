// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const client = {
  restore: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  overview: vi.fn(),
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
        enterprise: { id: 'demo', name: '知远' },
        roles: ['admin'],
        sessionExpiresAt: '2026-08-27T12:00:00Z',
        passwordChangeRequired: false,
      },
    });
    client.overview.mockResolvedValue({ users: 4, agents: 2, skills: 3, models: 1, pendingEvents: 0 });
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
    await waitFor(() => expect(client.login).toHaveBeenCalledWith({ enterpriseId: 'demo', username: 'admin', password: 'secret' }));
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
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '刷新' })));
    expect(client.overview).toHaveBeenCalledTimes(2);
  });
});
