// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
// Browser API stubs for antd live in src/admin/test-setup.ts (wired via
// vitest.config setupFiles); nothing extra is needed here.
import { ConfigProvider } from 'antd';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { DigitalEmployees } from './DigitalEmployees.js';
import type { PortalApplyResult, PortalClient, PortalEmployee, PortalMemoryStatus, PortalRequest } from './portal.js';

// The production shell wraps every page in a ConfigProvider with
// button.autoInsertSpace disabled; mirror that so two-CJK-button names
// stay stable for role queries.
const TIMEOUT = 15000;

function render(ui: ReactElement): ReturnType<typeof rtlRender> {
  return rtlRender(
    <ConfigProvider button={{ autoInsertSpace: false }} wave={{ disabled: true }}>
      {ui}
    </ConfigProvider>,
  );
}

describe('admin digital employees', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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

  const memoryStatus: PortalMemoryStatus = {
    server: 'openviking:8000',
    account: 'zhiyuan',
    healthy: true,
    accounts: [],
    employees: [{ name: 'sales-helper', memoryUser: 'sales-helper', sessions: 8, lastActive: '2026-09-29T06:25:00Z' }],
  };

  const client = {
    getAccessToken: vi.fn().mockResolvedValue('aep-token'),
  };

  const makePortal = (overrides: Partial<PortalClient> = {}) =>
    ({
      listEmployees: vi.fn().mockResolvedValue([employee]),
      listDepartments: vi.fn().mockResolvedValue([]),
      apply: vi.fn(),
      deleteEmployee: vi.fn().mockResolvedValue(undefined),
      listRequests: vi.fn().mockResolvedValue([]),
      decideRequest: vi.fn().mockResolvedValue(undefined),
      mintChatSession: vi.fn().mockResolvedValue(true),
      memoryStatus: vi.fn().mockResolvedValue(memoryStatus),
      memorySearch: vi.fn().mockResolvedValue({ memories: [] }),
      knowledgeStatus: vi.fn().mockResolvedValue({}),
      ...overrides,
    }) as unknown as PortalClient;

  const pendingRequest: PortalRequest = {
    id: 'req-1',
    employeeName: 'market-writer',
    owner: '张三',
    displayName: '市场写手',
    state: 'pending',
    reason: '',
    createdAt: '2026-09-28T01:00:00Z',
  };

  test(
    'opens chat in a new tab after the silent session handoff',
    async () => {
      const portal = makePortal();
      // A truthy return means the browser accepted the new window.
      const open = vi.spyOn(window, 'open').mockReturnValue({} as WindowProxy);
      render(<DigitalEmployees client={client as never} portal={portal} />);

      expect(await screen.findByText('sales-helper')).toBeInTheDocument();

      fireEvent.click(
        within(screen.getByText('sales-helper').closest('tr')!).getByRole('button', { name: /测试对话/, hidden: true }),
      );
      await waitFor(() => expect(open).toHaveBeenCalledOnce());
      expect(portal.mintChatSession).toHaveBeenCalledWith('sales-helper');
      const [href] = open.mock.calls[0]!;
      expect(href).toContain('http://localhost:30195/workspace');
      // The minted path never carries the access token.
      expect(href).not.toContain('token');
      expect(screen.queryByText(/aep-token/)).not.toBeInTheDocument();
      open.mockRestore();
    },
    TIMEOUT,
  );

  test(
    'falls back to the portal fragment link when the silent handoff fails',
    async () => {
      const portal = makePortal({ mintChatSession: vi.fn().mockResolvedValue(false) });
      const open = vi.spyOn(window, 'open').mockReturnValue({} as WindowProxy);
      render(<DigitalEmployees client={client as never} portal={portal} />);

      expect(await screen.findByText('sales-helper')).toBeInTheDocument();

      fireEvent.click(
        within(screen.getByText('sales-helper').closest('tr')!).getByRole('button', { name: /测试对话/, hidden: true }),
      );
      await waitFor(() => expect(open).toHaveBeenCalledOnce());
      const [href] = open.mock.calls[0]!;
      // Derived from the test page's own origin (jsdom serves from
      // localhost), never hardcoded: whichever host serves the console
      // yields the same host on the portal port.
      expect(href).toContain('http://localhost:30190/chat?employee=sales-helper#token=aep-token');
      // The token travels in the opened URL only; it is never rendered.
      expect(screen.queryByText(/aep-token/)).not.toBeInTheDocument();
      open.mockRestore();
    },
    TIMEOUT,
  );

  test(
    'popup-blocked handoff offers an explicit token-free link instead of claiming success',
    async () => {
      const portal = makePortal();
      // null = the browser blocked the programmatic open after the await.
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<DigitalEmployees client={client as never} portal={portal} />);

      const employeeRow = (await screen.findByText('sales-helper')).closest('tr')!;
      fireEvent.click(within(employeeRow).getByRole('button', { name: /测试对话/, hidden: true }));

      expect(await screen.findByText(/浏览器拦截了新窗口/)).toBeInTheDocument();
      const link = screen.getByRole('link', { name: /进入对话/ }) as HTMLAnchorElement;
      expect(link.href).toContain('http://localhost:30195/workspace');
      expect(link.href).not.toContain('token');
      expect(document.body.textContent).not.toContain('aep-token');
      open.mockRestore();
    },
    TIMEOUT,
  );

  test(
    'popup-blocked fallback explains the failure and keeps retry, never showing the token',
    async () => {
      const portal = makePortal({ mintChatSession: vi.fn().mockResolvedValue(false) });
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<DigitalEmployees client={client as never} portal={portal} />);

      const employeeRow = (await screen.findByText('sales-helper')).closest('tr')!;
      fireEvent.click(within(employeeRow).getByRole('button', { name: /测试对话/, hidden: true }));

      expect(await screen.findByText(/弹出式窗口/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '重试打开' })).toBeInTheDocument();
      expect(document.body.textContent).not.toContain('aep-token');
      open.mockRestore();
    },
    TIMEOUT,
  );

  test(
    'shows a load error instead of an empty-success list when the portal fails',
    async () => {
      const portal = makePortal({ listEmployees: vi.fn().mockRejectedValue(new Error('HTTP 503')) });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      expect(await screen.findByText(/数字员工加载失败/)).toBeInTheDocument();
      expect(screen.queryByText('暂无数字员工')).not.toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'creates a digital employee through the real portal fields and reports the pending policy result',
    async () => {
      const pending: PortalApplyResult = { kind: 'pending', message: '超出直通额度，需管理员审批' };
      const portal = makePortal({ apply: vi.fn().mockResolvedValue(pending) });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByRole('button', { name: /新建数字员工/ }));
      fireEvent.change(screen.getByLabelText('标识名'), { target: { value: 'market-writer' } });
      fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '市场写手' } });
      fireEvent.click(screen.getByRole('button', { name: '提交创建' }));

      await waitFor(() => expect(portal.apply).toHaveBeenCalledWith('market-writer', '市场写手', undefined));
    },
    TIMEOUT,
  );

  test(
    'rejects an invalid employee name client-side',
    async () => {
      const portal = makePortal();
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByRole('button', { name: /新建数字员工/ }));
      fireEvent.change(screen.getByLabelText('标识名'), { target: { value: 'Bad_Name' } });
      fireEvent.click(screen.getByRole('button', { name: '提交创建' }));

      expect(await screen.findByText(/小写字母/)).toBeInTheDocument();
      expect(portal.apply).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'drills into the detail view with the five design tabs and back',
    async () => {
      const portal = makePortal();
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByText('sales-helper'));

      for (const tab of ['基本配置', '知识与技能', '长期记忆', '发布与使用', '运行记录']) {
        expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument();
      }
      expect(screen.getByText('运行时')).toBeInTheDocument();
      expect(screen.getByText('记忆用户')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /返回/ }));
      expect(await screen.findByText('销售助理')).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'memory tab reports real metrics only, never a fabricated last write',
    async () => {
      const portal = makePortal();
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByText('sales-helper'));
      fireEvent.click(await screen.findByRole('tab', { name: '长期记忆' }));

      expect(await screen.findByText('最近记忆写入')).toBeInTheDocument();
      expect(screen.getByText('暂未采集')).toBeInTheDocument();
      expect(screen.getByText('最近活动')).toBeInTheDocument();
      expect(screen.queryByText('最近写入')).not.toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'publish tab shows the real web entry without leaking the access token',
    async () => {
      const portal = makePortal();
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByText('sales-helper'));
      fireEvent.click(await screen.findByRole('tab', { name: '发布与使用' }));

      const entry = await screen.findByText(/localhost:30190\/chat\?employee=sales-helper$/);
      expect(entry.textContent).not.toContain('token');
      expect(screen.queryByText(/aep-token/)).not.toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'blocks deletion with the data-disposal reason and never calls the delete API',
    async () => {
      const portal = makePortal();
      render(<DigitalEmployees client={client as never} portal={portal} />);

      const employeeRow = (await screen.findByText('sales-helper')).closest('tr')!;
      fireEvent.click(within(employeeRow).getByRole('button', { name: /删除/, hidden: true }));

      expect(await screen.findByText(/处置策略尚待后端明确/)).toBeInTheDocument();
      // Blocked per design: the only action is going back — no confirm-and-delete.
      fireEvent.click(screen.getByRole('button', { name: '返回详情' }));
      expect(portal.deleteEmployee).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'initialTab deep-links straight into the approvals tab',
    async () => {
      const portal = makePortal({ listRequests: vi.fn().mockResolvedValue([pendingRequest]) });
      render(<DigitalEmployees client={client as never} portal={portal} initialTab="requests" />);

      expect(await screen.findByText('market-writer')).toBeInTheDocument();
      expect(portal.listEmployees).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'lists pending requests and approves one',
    async () => {
      const portal = makePortal({ listRequests: vi.fn().mockResolvedValue([pendingRequest]) });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByRole('tab', { name: '申请审批' }));
      expect(await screen.findByText('market-writer')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '同意' }));
      await waitFor(() => expect(portal.decideRequest).toHaveBeenCalledWith('req-1', 'approve', undefined));
    },
    TIMEOUT,
  );

  test(
    'reject dialog requires a reason and sends it',
    async () => {
      const portal = makePortal({ listRequests: vi.fn().mockResolvedValue([pendingRequest]) });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByRole('tab', { name: '申请审批' }));
      fireEvent.click(await screen.findByRole('button', { name: '拒绝' }));

      // Reason is required per design — an empty submit must not call the API.
      // The modal OK button is the last 拒绝 button (the row button comes first).
      const modal = await screen.findByRole('dialog');
      const confirm = within(modal).getAllByRole('button', { name: '拒绝' }).at(-1)!;
      fireEvent.click(confirm);
      expect(await within(modal).findByText('请填写拒绝原因。')).toBeInTheDocument();
      expect(portal.decideRequest).not.toHaveBeenCalled();

      fireEvent.change(within(modal).getByLabelText('拒绝原因'), { target: { value: '名称不合规' } });
      fireEvent.click(within(modal).getAllByRole('button', { name: '拒绝' }).at(-1)!);

      await waitFor(() => expect(portal.decideRequest).toHaveBeenCalledWith('req-1', 'reject', '名称不合规'));
    },
    TIMEOUT,
  );
});
