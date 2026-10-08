/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PortalError, type PortalRequest, type PortalRequestDetail } from './portal.js';
import { workbenchPortal } from './test-fixtures.js';
import { WorkbenchRequestDetail, WorkbenchRequests } from './WorkbenchRequests.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function request(overrides: Partial<PortalRequest>): PortalRequest {
  return {
    id: 'req-1',
    employeeName: 'sales-data',
    owner: '张三',
    displayName: '销售数据助理',
    state: 'pending',
    reason: '',
    createdAt: '2026-10-08T06:00:00Z',
    ...overrides,
  };
}

function detail(overrides: Partial<PortalRequestDetail>): PortalRequestDetail {
  return {
    id: 'req-2',
    employeeName: 'sales-helper',
    displayName: '销售数据助理',
    ownerId: 'user-1',
    owner: '张三',
    state: 'approved',
    reason: '',
    createdAt: '2026-10-08T06:00:00Z',
    decidedAt: '2026-10-08T07:00:00Z',
    decidedBy: 'u-owner',
    decidedByName: '李四',
    description: '整理团队销售数据，辅助制作周报。',
    teamId: 'sales-dept',
    teamName: '销售部',
    note: '仅使用销售团队可见资料。',
    model: 'bench-glm',
    deploy: { exists: true, phase: 'Ready' },
    ...overrides,
  };
}

describe('workbench requests list', () => {
  test('lists own requests with approval and deployment states apart', async () => {
    const myRequests = vi
      .fn()
      .mockResolvedValue([
        request({ id: 'req-1', state: 'pending' }),
        request({ id: 'req-2', state: 'approved', deploy: { exists: true, phase: 'Ready' } }),
        request({ id: 'req-3', state: 'rejected' }),
        request({ id: 'req-4', state: 'deployed', deploy: { exists: false, phase: '' } }),
      ]);
    render(<WorkbenchRequests portal={workbenchPortal({ myRequests })} navigate={vi.fn()} />);

    expect(await screen.findByText('尚未开始')).toBeInTheDocument();
    expect(screen.getByText('已发布')).toBeInTheDocument();
    expect(screen.getByText('未部署')).toBeInTheDocument();
    expect(screen.getByText('部署记录已不存在')).toBeInTheDocument();
    // The pending approval state appears both as a filter and as a row tag.
    expect(screen.getAllByText('待审批').length).toBeGreaterThan(1);
  });

  test('reloads with the selected state filter', async () => {
    const myRequests = vi.fn().mockResolvedValue([]);
    render(<WorkbenchRequests portal={workbenchPortal({ myRequests })} navigate={vi.fn()} />);
    await waitFor(() => expect(myRequests).toHaveBeenCalledWith(undefined));

    // The Segmented filter labels double as row tags; target the radio input.
    fireEvent.click(screen.getByRole('radio', { name: '待审批' }));
    await waitFor(() => expect(myRequests).toHaveBeenCalledWith('pending'));
  });

  test('opens a detail page from a row', async () => {
    const myRequests = vi.fn().mockResolvedValue([request({ id: 'req-2' })]);
    const navigate = vi.fn();
    render(<WorkbenchRequests portal={workbenchPortal({ myRequests })} navigate={navigate} />);
    fireEvent.click(await screen.findByRole('button', { name: '查看' }));
    expect(navigate).toHaveBeenCalledWith('workbench/requests/req-2');
  });
});

describe('workbench request detail', () => {
  test('renders the decoded request with approval and deployment split', async () => {
    const getRequest = vi.fn().mockResolvedValue(detail({}));
    render(<WorkbenchRequestDetail portal={workbenchPortal({ getRequest })} requestId="req-2" navigate={vi.fn()} />);

    expect(await screen.findByText('整理团队销售数据，辅助制作周报。')).toBeInTheDocument();
    expect(screen.getByText('销售部')).toBeInTheDocument();
    expect(screen.getByText('仅使用销售团队可见资料。')).toBeInTheDocument();
    expect(screen.getAllByText('已通过').length).toBeGreaterThan(0);
    expect(screen.getByText(/审批人：李四/)).toBeInTheDocument();
    expect(screen.getAllByText('已发布').length).toBeGreaterThan(0);
  });

  test('shows the rejection reason for rejected requests', async () => {
    const getRequest = vi
      .fn()
      .mockResolvedValue(detail({ state: 'rejected', reason: '超出本季度名额', decidedAt: '2026-10-08T07:00:00Z' }));
    render(<WorkbenchRequestDetail portal={workbenchPortal({ getRequest })} requestId="req-x" navigate={vi.fn()} />);
    expect(await screen.findByText(/驳回原因：超出本季度名额/)).toBeInTheDocument();
    expect(screen.getByText('未部署')).toBeInTheDocument();
  });

  test('renders not-found for foreign or missing requests', async () => {
    const getRequest = vi.fn().mockRejectedValue(new PortalError(404, 'request req-x not found'));
    render(<WorkbenchRequestDetail portal={workbenchPortal({ getRequest })} requestId="req-x" navigate={vi.fn()} />);
    expect(await screen.findByText('申请不存在或无权查看。')).toBeInTheDocument();
  });
});
