// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { client, AdminPermission, hasAdminPermission } = vi.hoisted(() => {
  const permissions = {
    UsersRead: 'users.read', UsersWrite: 'users.write',
    RolesRead: 'roles.read', RolesWrite: 'roles.write',
    TeamsRead: 'teams.read', TeamsWrite: 'teams.write',
    SkillsRead: 'skills.read', SkillsWrite: 'skills.write', SkillsAssign: 'skills.assign',
    ModelsRead: 'models.read', ModelsWrite: 'models.write', ModelsAssign: 'models.assign',
    CredentialsRead: 'credentials.read', CredentialsWrite: 'credentials.write', CredentialsAssign: 'credentials.assign',
    LicensesRead: 'licenses.read', LicensesRevoke: 'licenses.revoke',
    EventsRead: 'events.read', EventsWrite: 'events.write',
    DataPlaneWrite: 'data_plane.write',
  } as const;
  return {
    client: {
      restore: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      overview: vi.fn(),
      resources: vi.fn(),
      models: vi.fn(),
    },
    AdminPermission: permissions,
    hasAdminPermission: (identity: { readonly roles?: readonly string[]; readonly permissions?: readonly string[] } | undefined, permission: string) => {
      if (!identity) return true;
      if (identity.roles?.some(role => role.toLowerCase() === 'admin')) return true;
      return identity.permissions?.includes(permission) ?? false;
    },
  };
});

vi.mock('./client.js', () => ({
  AdminConsoleClient: class {
    restore = client.restore;
    login = client.login;
    logout = client.logout;
    overview = client.overview;
    resources = client.resources;
    models = client.models;
  },
  AdminPermission,
  hasAdminPermission,
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
    client.resources.mockResolvedValue({ users: [], teams: [], roles: [], permissions: [], skills: [], assignments: [] });
    client.models.mockResolvedValue({ models: [], assignments: [] });
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

  test('allows a partial administrator and only shows readable destinations', async () => {
    client.restore.mockResolvedValue({
      status: 'authenticated',
      identity: {
        user: { id: 'u2', displayName: '模型审阅员' },
        deployment: { id: 'demo', name: '知远' },
        deploymentId: 'demo',
        roles: ['model-reader'],
        permissions: ['models.read'],
      },
    });
    render(<AdminApp />);

    expect((await screen.findAllByRole('button', { name: '概览' }))).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '企业模型' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '资源管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '事件与审计' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '平台运维' })).not.toBeInTheDocument();
    expect(screen.getAllByText('企业模型')).toHaveLength(3);
    expect(screen.queryByText('用户')).not.toBeInTheDocument();
    expect(client.overview).toHaveBeenCalledWith(expect.objectContaining({ permissions: ['models.read'] }));
  });

  test('renders refreshed overview counts', async () => {
    client.restore.mockResolvedValue({ status: 'authenticated', identity: { user: { displayName: '管理员' }, roles: ['admin'] } });
    render(<AdminApp />);
    expect(await screen.findByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(await screen.findByText('服务已连接')).toHaveClass('bg-success-soft', 'text-success');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '刷新' })));
    expect(client.overview).toHaveBeenCalledTimes(2);
  });

  test('uses Tea menu tokens and regular weight for active navigation', async () => {
    client.restore.mockResolvedValue({ status: 'authenticated', identity: { user: { displayName: '管理员' }, roles: ['admin'] } });
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
    client.restore.mockResolvedValue({ status: 'authenticated', identity: { user: { displayName: '管理员' }, roles: ['admin'] } });
    render(<AdminApp />);

    const signOutButtons = await screen.findAllByRole('button', { name: '退出登录' });
    const headerSignOut = signOutButtons.at(-1)!;
    expect(headerSignOut).toHaveClass('size-8', 'rounded-lg', 'p-0', 'md:hidden');
    expect(headerSignOut.querySelector('svg')).toHaveClass('size-4');
  });

  test('uses Zhiyuan line tabs and a sliding indicator for resources', async () => {
    client.restore.mockResolvedValue({ status: 'authenticated', identity: { user: { displayName: '管理员' }, roles: ['admin'] } });
    render(<AdminApp />);

    fireEvent.click((await screen.findAllByRole('button', { name: '资源管理' }))[0]!);
    expect(await screen.findByRole('tablist')).toHaveAttribute('data-variant', 'line');
    expect(document.querySelector('[data-slot="tabs-indicator"]')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '用户' })).toHaveAttribute('data-active');

    fireEvent.click(screen.getByRole('tab', { name: 'Team' }));
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveAttribute('data-active');
  });

  test('labels the Role resource tab correctly', async () => {
    client.restore.mockResolvedValue({ status: 'authenticated', identity: { user: { displayName: '管理员' }, roles: ['admin'] } });
    render(<AdminApp />);

    fireEvent.click((await screen.findAllByRole('button', { name: '资源管理' }))[0]!);
    fireEvent.click(screen.getByRole('tab', { name: 'Role' }));

    expect(await screen.findByRole('heading', { name: 'Role' })).toBeInTheDocument();
  });
});
