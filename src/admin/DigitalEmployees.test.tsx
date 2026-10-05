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
const TIMEOUT = 45000;

function render(ui: ReactElement): ReturnType<typeof rtlRender> {
  return rtlRender(
    <ConfigProvider button={{ autoInsertSpace: false }} wave={{ disabled: true }}>
      {ui}
    </ConfigProvider>,
  );
}

// AntD Select option picker: open the combobox, click the option whose label
// matches optionName (model options render as "名称（id · protocol）").
// jsdom never runs the close transition, so every dropdown opened during
// the walk stays mounted without the hidden class — several look "visible"
// at once (the wizard's step-1 team select and the audience step's team
// select offer the same 研发部 option). The freshly opened dropdown is the
// last one in document order (antd portals it to the end of body), so the
// search runs bottom-up.
async function pickOption(combobox: HTMLElement, optionName: RegExp) {
  fireEvent.mouseDown(combobox);
  const option = await waitFor(() => {
    const node = [
      ...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'),
    ]
      .reverse()
      .find((item) => optionName.test(item.textContent ?? ''));
    expect(node).toBeTruthy();
    return node!;
  });
  fireEvent.click(option);
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

  // The create wizard loads the AEP model catalog, user directory, and
  // skill catalog through the console client (gateway models only; active
  // humans for the owner picker; skills with published versions).
  const client = {
    getAccessToken: vi.fn().mockResolvedValue('aep-token'),
    models: vi.fn().mockResolvedValue({
      models: [
        {
          id: 'bench-anthropic',
          displayName: 'Bench',
          enabled: true,
          sourceType: 'gateway',
          protocol: 'anthropic',
        },
        {
          id: 'bench-glm',
          displayName: 'GLM',
          enabled: true,
          sourceType: 'gateway',
          protocol: 'openai-compatible',
        },
      ],
      assignments: [],
    }),
    users: vi
      .fn()
      .mockResolvedValue([{ id: 'u-1', username: 'lisi', displayName: '李四', status: 'active', kind: 'human' }]),
    skills: vi.fn().mockResolvedValue([]),
  };

  const makePortal = (overrides: Partial<PortalClient> = {}) =>
    ({
      listEmployees: vi.fn().mockResolvedValue([employee]),
      listDepartments: vi.fn().mockResolvedValue([{ id: 'rd-dept', name: '研发部' }]),
      apply: vi.fn(),
      deleteEmployee: vi.fn().mockResolvedValue(undefined),
      listRequests: vi.fn().mockResolvedValue([]),
      decideRequest: vi.fn().mockResolvedValue(undefined),
      mintChatSession: vi.fn().mockResolvedValue(true),
      memoryStatus: vi.fn().mockResolvedValue(memoryStatus),
      memorySearch: vi.fn().mockResolvedValue({ memories: [] }),
      knowledgeStatus: vi.fn().mockResolvedValue({
        knowledgeBases: [{ id: 'kb-1', name: '销售知识库', description: '' }],
      }),
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

  // Walk the four wizard steps with the minimal valid payload: fill the
  // basics, skip knowledge/skills, pick one audience team, publish. Antd
  // mounts modal content across frames under jsdom, so every step waits
  // for its content before acting on it.
  async function walkWizard(applyMock: ReturnType<typeof vi.fn>, options?: { readonly models?: boolean }) {
    fireEvent.click(await screen.findByRole('button', { name: /新建数字员工/ }));
    fireEvent.change(await screen.findByLabelText('标识名'), { target: { value: 'market-writer' } });
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '市场写手' } });
    fireEvent.change(screen.getByLabelText('用途说明'), { target: { value: '整理市场资料并生成周报。' } });
    const modal = await screen.findByRole('dialog');
    // Step 1 comboboxes in order: owner, team, models.
    const comboBoxes = await within(modal).findAllByRole('combobox');
    await pickOption(comboBoxes[0]!, /^李四（lisi）$/);
    await pickOption(comboBoxes[1]!, /^研发部$/);
    if (options?.models) {
      // Picked in reverse of the catalog order to prove the wire keeps the
      // selection order rather than re-sorting by id.
      await pickOption(comboBoxes[2]!, /^GLM（bench-glm）$/);
      await pickOption(comboBoxes[2]!, /^Bench（bench-anthropic · anthropic）$/);
    } else {
      await pickOption(comboBoxes[2]!, /^GLM（bench-glm）$/);
    }
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    // Step 2 (knowledge & skills): wait for its section, then continue.
    await screen.findAllByText('关联知识库');
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    // Step 3 (audience): restricted by default — pick one team.
    await screen.findAllByText('可用团队');
    const scopeCombos = await within(screen.getByRole('dialog')).findAllByRole('combobox');
    await pickOption(scopeCombos[0]!, /^研发部$/);
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    // Step 4 (confirm): the release checklist gates the publish button.
    await screen.findAllByText('确认发布');
    fireEvent.click(await screen.findByRole('button', { name: '保存并发布' }));
    await waitFor(() => expect(applyMock).toHaveBeenCalled());
  }

  test(
    'creates a digital employee through the four-step wizard and reports the pending policy result',
    async () => {
      const pending: PortalApplyResult = { kind: 'pending', message: '超出直通额度，需管理员审批' };
      const portal = makePortal({ apply: vi.fn().mockResolvedValue(pending) });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      await walkWizard(portal.apply as unknown as ReturnType<typeof vi.fn>);

      await waitFor(() =>
        expect(portal.apply).toHaveBeenCalledWith({
          name: 'market-writer',
          displayName: '市场写手',
          description: '整理市场资料并生成周报。',
          team: 'rd-dept',
          models: ['bench-glm'],
          owner: 'u-1',
          // The wizard always makes the knowledge policy explicit: no
          // checked bases = deny-all retrieval.
          knowledgeBases: [],
          skills: [],
          visibility: { mode: 'restricted', teams: ['rd-dept'], users: [] },
        }),
      );
    },
    TIMEOUT,
  );

  test(
    'applies with the picked models in selection order as the priority order',
    async () => {
      const created: PortalApplyResult = { kind: 'created', message: '数字员工已创建' };
      const portal = makePortal({ apply: vi.fn().mockResolvedValue(created) });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      await walkWizard(portal.apply as unknown as ReturnType<typeof vi.fn>, { models: true });

      await waitFor(() =>
        expect(portal.apply).toHaveBeenCalledWith(
          expect.objectContaining({ models: ['bench-glm', 'bench-anthropic'] }),
        ),
      );
    },
    TIMEOUT,
  );

  test(
    'rejects an invalid employee name client-side before leaving step one',
    async () => {
      const portal = makePortal();
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByRole('button', { name: /新建数字员工/ }));
      fireEvent.change(screen.getByLabelText('标识名'), { target: { value: 'Bad_Name' } });
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));

      expect(await screen.findByText(/小写字母/)).toBeInTheDocument();
      expect(portal.apply).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'audience step refuses an empty restricted scope and surfaces server violations on reject',
    async () => {
      const portal = makePortal({
        apply: vi.fn().mockResolvedValue({
          kind: 'rejected',
          status: 400,
          message: '发布条件校验未通过（1 项）',
          violations: [{ field: 'knowledgeBases[0]', message: '知识库 kb-x 不存在' }],
        }),
      });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByRole('button', { name: /新建数字员工/ }));
      fireEvent.change(await screen.findByLabelText('标识名'), { target: { value: 'market-writer' } });
      fireEvent.change(screen.getByLabelText('用途说明'), { target: { value: '整理市场资料。' } });
      const modal = await screen.findByRole('dialog');
      const comboBoxes = await within(modal).findAllByRole('combobox');
      await pickOption(comboBoxes[0]!, /^李四（lisi）$/);
      await pickOption(comboBoxes[1]!, /^研发部$/);
      await pickOption(comboBoxes[2]!, /^GLM（bench-glm）$/);
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      await screen.findAllByText('关联知识库');
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      await screen.findAllByText('可用团队');
      // Restricted with no team/user: Next is blocked with the reason.
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      expect(await screen.findByText(/至少包含一个团队或用户/)).toBeInTheDocument();
      expect(portal.apply).not.toHaveBeenCalled();

      // Pick a team, finish, and the server-rejected violations render.
      const scopeCombos = await within(screen.getByRole('dialog')).findAllByRole('combobox');
      await pickOption(scopeCombos[0]!, /^研发部$/);
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      await screen.findAllByText('确认发布');
      fireEvent.click(await screen.findByRole('button', { name: '保存并发布' }));
      expect(await screen.findByText(/知识库 kb-x 不存在/)).toBeInTheDocument();
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
