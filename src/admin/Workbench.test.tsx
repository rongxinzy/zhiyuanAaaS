/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { type PortalEmployee, PortalError, type PortalMe } from './portal.js';
import { workbenchClient, workbenchIdentity, workbenchMe, workbenchPortal } from './test-fixtures.js';
import { Workbench } from './Workbench.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function employee(overrides: Partial<PortalEmployee>): PortalEmployee {
  return {
    name: 'helper',
    displayName: '助手',
    phase: 'Ready',
    runtime: 'deerflow',
    model: 'bench-glm',
    models: [],
    owner: '张三',
    ownerId: 'user-1',
    memoryUser: 'helper',
    createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

function renderWorkbench(portal = workbenchPortal(), overrides: Record<string, unknown> = {}) {
  const onSignOut = vi.fn();
  render(
    <Workbench
      client={workbenchClient()}
      identity={workbenchIdentity}
      canManage={false}
      route="workbench"
      themeControl={null}
      onSignOut={onSignOut}
      signingOut={false}
      portal={portal}
      {...overrides}
    />,
  );
  return { onSignOut };
}

describe('workbench shell and roster', () => {
  test('an active model failover is warned on the affected roster row', async () => {
    const portal = workbenchPortal({
      listEmployees: vi.fn().mockResolvedValue([
        employee({
          name: 'sales-helper',
          displayName: '销售助理',
          modelFailover: {
            original: 'bench-qwen38-fast',
            active: 'bench-qwen',
            switchedAt: '2026-10-08T12:30:00Z',
          },
        }),
        employee({ name: 'calm-helper', displayName: '稳定助理' }),
      ]),
    });
    renderWorkbench(portal);

    await screen.findByText('销售助理');
    // Pin the warning to the affected row: counting matches alone would not
    // catch an inverted render condition (warning on the healthy row).
    const affected = screen.getByText('销售助理').closest('tr')!;
    const healthy = screen.getByText('稳定助理').closest('tr')!;
    expect(within(affected).getByText('备用模型运行中')).toBeInTheDocument();
    expect(within(healthy).queryByText('备用模型运行中')).toBeNull();
  });

  test('renders purposes, access reasons and phases from the roster API', async () => {
    const portal = workbenchPortal({
      me: vi.fn().mockResolvedValue({
        ...workbenchMe,
        teams: [
          { id: 'sales-dept', name: '销售团队' },
          { id: 'rd-dept', name: '研发部' },
        ],
      } satisfies PortalMe),
      listEmployees: vi.fn().mockResolvedValue([
        employee({
          name: 'sales-helper',
          displayName: '销售助理',
          description: '客户资料与销售知识问答',
          accessReason: { kind: 'team', teamId: 'sales-dept', teamName: '销售团队' },
        }),
        employee({
          name: 'legacy-helper',
          displayName: '遗留助理',
          phase: 'Pending',
          accessReason: { kind: 'legacy-team', teamId: 'rd-dept' },
        }),
        employee({ name: 'sleepy-helper', displayName: '休眠助理', phase: 'Sleeping' }),
      ]),
    });
    renderWorkbench(portal);

    expect(await screen.findByText('销售助理')).toBeInTheDocument();
    expect(screen.getByText('客户资料与销售知识问答')).toBeInTheDocument();
    expect(screen.getByText('团队 · 销售团队')).toBeInTheDocument();
    // legacy-team ids resolve against the caller's own team names
    expect(screen.getByText('部门成员 · 研发部')).toBeInTheDocument();
    expect(screen.getByText('已发布')).toBeInTheDocument();
    expect(screen.getByText('部署中')).toBeInTheDocument();
    expect(screen.getByText('休眠中', { exact: false })).toBeInTheDocument();
    // Rows whose employee is not usable yet cannot start a conversation.
    // Query by text, not role+name: accessible-name computation over this
    // tooltip-wrapped table button is pathologically slow under coverage
    // (measured 24s+ for one query); the assertion stays identical.
    const startButtons = screen.getAllByText('开始使用').map((el) => el.closest('button')!);
    expect(startButtons).toHaveLength(3);
    expect(startButtons[0]).toBeEnabled();
    expect(startButtons[1]).toBeDisabled();
    expect(startButtons[2]).toBeEnabled();
  });

  test('starts a conversation through the minted chat handoff', async () => {
    const portal = workbenchPortal({
      listEmployees: vi.fn().mockResolvedValue([employee({ name: 'sales-helper', displayName: '销售助理' })]),
    });
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    renderWorkbench(portal);

    fireEvent.click((await screen.findByText('开始使用')).closest('button')!);

    await waitFor(() => expect(portal.mintChatSession).toHaveBeenCalledWith('sales-helper'));
    expect(open).toHaveBeenCalledWith(expect.stringContaining('/workspace'), '_blank', 'noopener');
  });

  test('shows the latest own requests in the side panel', async () => {
    const portal = workbenchPortal({
      myRequests: vi.fn().mockResolvedValue([
        {
          id: 'req-1',
          employeeName: 'sales-data',
          owner: '张三',
          displayName: '销售数据助理',
          state: 'pending',
          reason: '',
          createdAt: '2026-10-08T02:00:00Z',
        },
      ]),
    });
    renderWorkbench(portal);
    expect(await screen.findByText('销售数据助理')).toBeInTheDocument();
  });

  test('keeps the page usable when the roster request fails', async () => {
    const portal = workbenchPortal({ listEmployees: vi.fn().mockRejectedValue(new Error('down')) });
    renderWorkbench(portal);
    expect(await screen.findByText('数字员工列表加载失败。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '我的工作台' })).toBeInTheDocument();
  });

  test('surfaces an expired session with a re-login action', async () => {
    const portal = workbenchPortal({
      me: vi.fn().mockRejectedValue(new PortalError(401, 'expired')),
      listEmployees: vi.fn().mockRejectedValue(new PortalError(401, 'expired')),
      myRequests: vi.fn().mockRejectedValue(new PortalError(401, 'expired')),
    });
    const { onSignOut } = renderWorkbench(portal);

    expect(await screen.findByText('登录状态已过期，请重新登录后再操作。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新登录' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  test('disables the apply entry under the admin-only policy', async () => {
    const portal = workbenchPortal({
      me: vi.fn().mockResolvedValue({ ...workbenchMe, policyMode: 'admin-only' } satisfies PortalMe),
    });
    renderWorkbench(portal);
    const apply = await screen.findByRole('button', { name: /申请数字员工/ });
    await waitFor(() => expect(apply).toBeDisabled());
  });

  test('shows the admin console switch only to managers', async () => {
    renderWorkbench(workbenchPortal());
    await screen.findByRole('heading', { name: '我的工作台' });
    expect(screen.queryByRole('button', { name: '管理后台' })).not.toBeInTheDocument();

    cleanup();
    renderWorkbench(workbenchPortal(), { canManage: true });
    expect(await screen.findByRole('button', { name: '管理后台' })).toBeInTheDocument();
  });
});
