// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { DigitalEmployees } from './DigitalEmployees.js';
import type { PortalApplyResult, PortalClient, PortalEmployee } from './portal.js';

describe('admin digital employees', () => {
  afterEach(() => cleanup());

  const employee: PortalEmployee = {
    name: 'sales-helper',
    displayName: '销售助理',
    phase: 'Ready',
    runtime: 'deerflow',
    model: 'bench-glm',
    owner: '张三',
    ownerId: 'u1',
    memoryUser: 'sales-helper',
    createdAt: '2026-09-27T16:02:10Z',
  };

  const client = {
    getAccessToken: vi.fn().mockResolvedValue('aep-token'),
  };

  const makePortal = (overrides: Partial<PortalClient> = {}) =>
    ({
      listEmployees: vi.fn().mockResolvedValue([employee]),
      apply: vi.fn(),
      deleteEmployee: vi.fn().mockResolvedValue(undefined),
      listRequests: vi.fn().mockResolvedValue([]),
      decideRequest: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }) as unknown as PortalClient;

  test('renders the employee list and opens chat via the portal fragment link', async () => {
    const portal = makePortal();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<DigitalEmployees client={client as never} portal={portal} />);

    expect(await screen.findByText('sales-helper')).toBeInTheDocument();
    expect(screen.getByText('销售助理')).toBeInTheDocument();
    expect(screen.getByText('bench-glm')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '打开对话' }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    const [href] = open.mock.calls[0]!;
    // Derived from the test page's own origin (jsdom serves from
    // localhost), never hardcoded: whichever host serves the console
    // yields the same host on the portal port.
    expect(href).toContain('http://localhost:30190/chat?employee=sales-helper#token=aep-token');
    open.mockRestore();
  });

  test('applies for a new digital employee and shows the pending policy message', async () => {
    const pending: PortalApplyResult = { kind: 'pending', message: '超出直通额度，需管理员审批' };
    const portal = makePortal({ apply: vi.fn().mockResolvedValue(pending) });
    render(<DigitalEmployees client={client as never} portal={portal} />);

    fireEvent.click(await screen.findByRole('button', { name: '申请数字员工' }));
    fireEvent.change(screen.getByLabelText('标识名'), { target: { value: 'market-writer' } });
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '市场写手' } });
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    await waitFor(() => expect(portal.apply).toHaveBeenCalledWith('market-writer', '市场写手'));
  });

  test('rejects an invalid employee name client-side', async () => {
    const portal = makePortal();
    render(<DigitalEmployees client={client as never} portal={portal} />);

    fireEvent.click(await screen.findByRole('button', { name: '申请数字员工' }));
    fireEvent.change(screen.getByLabelText('标识名'), { target: { value: 'Bad_Name' } });
    fireEvent.click(screen.getByRole('button', { name: '提交申请' }));

    expect(await screen.findByText(/小写字母/)).toBeInTheDocument();
    expect(portal.apply).not.toHaveBeenCalled();
  });

  test('drills into the detail panel and back', async () => {
    const portal = makePortal();
    render(<DigitalEmployees client={client as never} portal={portal} />);

    fireEvent.click(await screen.findByText('sales-helper'));
    expect(screen.getByText('运行时')).toBeInTheDocument();
    expect(screen.getByText('记忆用户')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(await screen.findByText('销售助理')).toBeInTheDocument();
  });

  test('lists pending requests and approves one', async () => {
    const portal = makePortal({
      listRequests: vi.fn().mockResolvedValue([
        {
          id: 'req-1',
          employeeName: 'market-writer',
          owner: '张三',
          displayName: '市场写手',
          state: 'pending',
          reason: '',
          createdAt: '2026-09-28T01:00:00Z',
        },
      ]),
    });
    render(<DigitalEmployees client={client as never} portal={portal} />);

    fireEvent.click(await screen.findByRole('tab', { name: '申请与审批' }));
    expect(await screen.findByText('market-writer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '批准' }));
    await waitFor(() => expect(portal.decideRequest).toHaveBeenCalledWith('req-1', 'approve', undefined));
  });

  test('reject dialog sends the reason', async () => {
    const portal = makePortal({
      listRequests: vi.fn().mockResolvedValue([
        {
          id: 'req-2',
          employeeName: 'market-writer',
          owner: '张三',
          displayName: '市场写手',
          state: 'pending',
          reason: '',
          createdAt: '2026-09-28T01:00:00Z',
        },
      ]),
    });
    render(<DigitalEmployees client={client as never} portal={portal} />);

    fireEvent.click(await screen.findByRole('tab', { name: '申请与审批' }));
    fireEvent.click(await screen.findByRole('button', { name: '驳回' }));
    fireEvent.change(screen.getByLabelText('理由'), { target: { value: '名称不合规' } });
    const rejectButtons = screen.getAllByRole('button', { name: '驳回' });
    fireEvent.click(rejectButtons[rejectButtons.length - 1]!);

    await waitFor(() => expect(portal.decideRequest).toHaveBeenCalledWith('req-2', 'reject', '名称不合规'));
  });
});
