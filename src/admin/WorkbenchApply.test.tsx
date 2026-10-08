/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PortalClient, PortalMe, PortalRequestDetail } from './portal.js';
import { workbenchMe, workbenchPortal } from './test-fixtures.js';
import { WorkbenchApply, WorkbenchSubmitted } from './WorkbenchApply.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderApply(portal: PortalClient = workbenchPortal()) {
  const navigate = vi.fn();
  render(<WorkbenchApply portal={portal} navigate={navigate} />);
  return { portal, navigate };
}

async function fillBasics() {
  // The default-model note only renders once /me resolved, so the form is
  // fully initialized (team preselected) past this point.
  await screen.findByText(/平台默认模型/);
  fireEvent.change(screen.getByLabelText('技术标识'), { target: { value: 'sales-data-assistant' } });
  fireEvent.change(screen.getByLabelText('申请名称'), { target: { value: '销售数据助理' } });
  fireEvent.change(screen.getByLabelText('使用目的'), { target: { value: '整理团队销售数据，辅助制作周报。' } });
}

function detail(overrides: Partial<PortalRequestDetail>): PortalRequestDetail {
  return {
    id: 'req-9',
    employeeName: 'sales-data-assistant',
    displayName: '销售数据助理',
    ownerId: 'user-1',
    owner: '张三',
    state: 'pending',
    reason: '',
    createdAt: '2026-10-08T06:00:00Z',
    decidedAt: null,
    decidedBy: '',
    decidedByName: '',
    description: '整理团队销售数据。',
    teamId: 'sales-dept',
    teamName: '销售团队',
    note: '',
    model: 'bench-glm',
    deploy: { exists: false, phase: '' },
    ...overrides,
  };
}

describe('workbench apply form', () => {
  test('validates the required fields before submitting', async () => {
    const { portal } = renderApply();
    fireEvent.click(await screen.findByRole('button', { name: '提交申请' }));
    expect(await screen.findByText('请输入技术标识。')).toBeInTheDocument();
    expect(screen.getByText('请填写使用目的。')).toBeInTheDocument();
    expect(portal.apply).not.toHaveBeenCalled();
  });

  test('parks the request and navigates to the submitted page', async () => {
    const { portal, navigate } = renderApply(
      workbenchPortal({
        apply: vi.fn().mockResolvedValue({ kind: 'pending', message: '需管理员审批', requestId: 'req-9' }),
      }),
    );
    await fillBasics();
    fireEvent.change(screen.getByLabelText('补充说明'), { target: { value: '仅使用销售团队可见资料。' } });
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('workbench/submitted/req-9'));
    expect(portal.apply).toHaveBeenCalledWith({
      name: 'sales-data-assistant',
      displayName: '销售数据助理',
      description: '整理团队销售数据，辅助制作周报。',
      team: 'sales-dept',
      visibility: { mode: 'restricted', users: ['user-1'] },
      note: '仅使用销售团队可见资料。',
    });
  });

  test('sends the owning team as the audience for my-team scope', async () => {
    const { portal } = renderApply(
      workbenchPortal({ apply: vi.fn().mockResolvedValue({ kind: 'pending', message: 'ok' }) }),
    );
    await fillBasics();
    fireEvent.click(screen.getByRole('radio', { name: '我的团队' }));
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    await waitFor(() =>
      expect(portal.apply).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: { mode: 'restricted', teams: ['sales-dept'] } }),
      ),
    );
  });

  test('offers everyone-scope only under the approval policy and sends it', async () => {
    const { portal } = renderApply(
      workbenchPortal({ apply: vi.fn().mockResolvedValue({ kind: 'pending', message: 'ok' }) }),
    );
    await fillBasics();
    fireEvent.click(screen.getByRole('radio', { name: '全体成员' }));
    expect(await screen.findByText('全员开放需要管理员审批后生效。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    await waitFor(() =>
      expect(portal.apply).toHaveBeenCalledWith(expect.objectContaining({ visibility: { mode: 'all' } })),
    );

    cleanup();
    renderApply(
      workbenchPortal({
        me: vi.fn().mockResolvedValue({ ...workbenchMe, policyMode: 'self-service' } satisfies PortalMe),
      }),
    );
    await screen.findByText(/平台默认模型/);
    expect(screen.queryByRole('radio', { name: '全体成员' })).not.toBeInTheDocument();
  });

  test('anchors server violations to the form and lists the rest', async () => {
    renderApply(
      workbenchPortal({
        apply: vi.fn().mockResolvedValue({
          kind: 'rejected',
          status: 400,
          message: '发布条件校验未通过（2 项）',
          violations: [
            { field: 'team', message: '团队 rd-dept 不存在' },
            { field: 'models', message: '平台默认模型 bench-glm 当前不可用' },
          ],
        }),
      }),
    );
    await fillBasics();
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    expect(await screen.findByText('团队 rd-dept 不存在')).toBeInTheDocument();
    expect(screen.getByText(/平台默认模型 bench-glm 当前不可用/)).toBeInTheDocument();
    expect(screen.getByText('请修正以下问题：')).toBeInTheDocument();
  });

  test('shows the server message for conflicts that carry no violations', async () => {
    renderApply(
      workbenchPortal({
        apply: vi.fn().mockResolvedValue({
          kind: 'rejected',
          status: 409,
          message: 'quota exceeded: 2 digital employees already owned (limit 2)',
        }),
      }),
    );
    await fillBasics();
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));
    expect(await screen.findByText(/quota exceeded/)).toBeInTheDocument();
  });

  test('blocks submission when the account belongs to no team', async () => {
    renderApply(workbenchPortal({ me: vi.fn().mockResolvedValue({ ...workbenchMe, teams: [] } satisfies PortalMe) }));
    expect(await screen.findByText('当前账号未加入任何团队，请联系管理员加入团队后再申请。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交申请' })).toBeDisabled();
  });

  test('disables the form under the admin-only policy', async () => {
    renderApply(
      workbenchPortal({
        me: vi.fn().mockResolvedValue({ ...workbenchMe, policyMode: 'admin-only' } satisfies PortalMe),
      }),
    );
    expect(await screen.findByText('当前平台仅允许管理员创建数字员工，暂不能自助申请。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交申请' })).toBeDisabled();
  });

  test('blocks submission when the quota is exhausted', async () => {
    renderApply(
      workbenchPortal({
        me: vi.fn().mockResolvedValue({
          ...workbenchMe,
          quota: { limit: 2, used: 2, owned: 2, pending: 0 },
        } satisfies PortalMe),
      }),
    );
    expect(await screen.findByText(/申请名额已用完/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交申请' })).toBeDisabled();
  });
});

describe('workbench submitted page', () => {
  test('shows the parked request with the approval/deployment timeline', async () => {
    const portal = workbenchPortal({ getRequest: vi.fn().mockResolvedValue(detail({})) });
    render(<WorkbenchSubmitted portal={portal} requestId="req-9" navigate={vi.fn()} />);

    expect(await screen.findByText('申请已提交')).toBeInTheDocument();
    expect(screen.getByText('待审批')).toBeInTheDocument();
    expect(screen.getByText('待平台管理员审批')).toBeInTheDocument();
    expect(screen.getByText('待部署')).toBeInTheDocument();
  });

  test('reflects an approved request instead of a frozen pending state', async () => {
    const portal = workbenchPortal({
      getRequest: vi.fn().mockResolvedValue(
        detail({
          state: 'approved',
          decidedAt: '2026-10-08T07:00:00Z',
          decidedBy: 'u-owner',
          decidedByName: '李四',
          deploy: { exists: true, phase: 'Ready' },
        }),
      ),
    });
    render(<WorkbenchSubmitted portal={portal} requestId="req-9" navigate={vi.fn()} />);

    expect(await screen.findByText('已通过')).toBeInTheDocument();
    expect(screen.getByText(/审批人：李四/)).toBeInTheDocument();
    expect(screen.getAllByText('已发布').length).toBeGreaterThan(0);
  });
});
