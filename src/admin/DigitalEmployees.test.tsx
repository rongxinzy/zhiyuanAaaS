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
    models: ['bench-glm'],
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
    teams: vi.fn().mockResolvedValue([{ id: 'rd-dept', name: '研发部' }]),
  };

  const makePortal = (overrides: Partial<PortalClient> = {}) =>
    ({
      listEmployees: vi.fn().mockResolvedValue([employee]),
      listDepartments: vi.fn().mockResolvedValue([{ id: 'rd-dept', name: '研发部' }]),
      apply: vi.fn(),
      deleteEmployee: vi.fn().mockResolvedValue(undefined),
      listRequests: vi.fn().mockResolvedValue([]),
      decideRequest: vi.fn().mockResolvedValue(undefined),
      memoryStatus: vi.fn().mockResolvedValue(memoryStatus),
      memorySearch: vi.fn().mockResolvedValue({ memories: [] }),
      knowledgeStatus: vi.fn().mockResolvedValue({
        knowledgeBases: [{ id: 'kb-1', name: '销售知识库', description: '' }],
      }),
      updateEmployee: vi.fn().mockResolvedValue({ kind: 'updated' }),
      getEmployee: vi.fn().mockResolvedValue(employee),
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
    'warns on the model cell while a failover is serving the employee',
    async () => {
      const failing = {
        ...employee,
        name: 'failover-helper',
        displayName: '切换助手',
        modelFailover: { original: 'bench-qwen38-fast', active: 'bench-qwen', switchedAt: '2026-10-08T12:30:00Z' },
      };
      const portal = makePortal({
        listEmployees: vi.fn().mockResolvedValue([employee, failing]),
      });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      await screen.findByText('failover-helper');
      // Pin the tag to the affected row (a count alone would miss an
      // inverted render condition).
      const affected = screen.getByText('切换助手').closest('tr')!;
      const healthy = screen.getByText('销售助理').closest('tr')!;
      expect(within(affected).getByText('故障切换')).toBeInTheDocument();
      expect(within(healthy).queryByText('故障切换')).toBeNull();
    },
    TIMEOUT,
  );

  test(
    'opens the employee front end deep link in a new tab',
    async () => {
      const portal = makePortal();
      const open = vi.spyOn(window, 'open').mockReturnValue({} as WindowProxy);
      render(<DigitalEmployees client={client as never} portal={portal} />);

      expect(await screen.findByText('sales-helper')).toBeInTheDocument();

      fireEvent.click(
        within(screen.getByText('sales-helper').closest('tr')!).getByRole('button', { name: /测试对话/, hidden: true }),
      );
      await waitFor(() => expect(open).toHaveBeenCalledOnce());
      const [href] = open.mock.calls[0]!;
      // Deep link into the standalone employee front end (own login).
      expect(href).toContain(':30202/#/emp/sales-helper');
      expect(href).not.toContain('token');
      open.mockRestore();
    },
    TIMEOUT,
  );

  test(
    'popup-blocked fallback explains the failure and keeps retry, never showing the token',
    async () => {
      const portal = makePortal();
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<DigitalEmployees client={client as never} portal={portal} />);

      const employeeRow = (await screen.findByText('sales-helper')).closest('tr')!;
      fireEvent.click(within(employeeRow).getByRole('button', { name: /测试对话/, hidden: true }));

      expect(await screen.findByText(/被浏览器拦截/)).toBeInTheDocument();
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
    'detail capabilities and publish tabs render the configured bases, skills, and audience',
    async () => {
      const configured: PortalEmployee = {
        ...employee,
        description: '整理销售资料并辅助生成周报。',
        team: 'sales-dept',
        knowledgeBases: [
          { id: 'kb-1', name: '销售知识库' },
          { id: 'kb-2', name: '产品知识库' },
        ],
        skills: [{ id: 'report-writer', name: '报告撰写', version: '1.2.0' }],
        visibility: {
          mode: 'restricted',
          teams: [{ id: 'sales-dept', name: '销售部' }],
          users: [{ id: 'u-1', name: '李四' }],
        },
      };
      const portal = makePortal({ listEmployees: vi.fn().mockResolvedValue([configured]) });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByText('sales-helper'));
      fireEvent.click(await screen.findByRole('tab', { name: '知识与技能' }));
      expect(await screen.findByText('销售知识库')).toBeInTheDocument();
      expect(screen.getByText('产品知识库')).toBeInTheDocument();
      expect(screen.getByText('报告撰写 · 1.2.0')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('tab', { name: '发布与使用' }));
      expect(await screen.findByText('销售部')).toBeInTheDocument();
      expect(screen.getByText('李四')).toBeInTheDocument();
      expect(screen.getByText('指定范围')).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'publish tab distinguishes everyone-open and legacy audiences',
    async () => {
      const open: PortalEmployee = {
        ...employee,
        visibility: { mode: 'all', teams: [], users: [] },
      };
      const legacy: PortalEmployee = {
        ...employee,
        name: 'legacy-helper',
        displayName: '遗留员工',
        knowledgeBases: [],
        skills: [],
        visibility: null,
      };
      const portal = makePortal({ listEmployees: vi.fn().mockResolvedValue([open, legacy]) });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByText('sales-helper'));
      fireEvent.click(await screen.findByRole('tab', { name: '发布与使用' }));
      expect(await screen.findByText('全员开放')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /返回/ }));
      fireEvent.click(await screen.findByText('legacy-helper'));
      fireEvent.click(await screen.findByRole('tab', { name: '发布与使用' }));
      expect(await screen.findByText(/沿用负责人/)).toBeInTheDocument();
      fireEvent.click(await screen.findByRole('tab', { name: '知识与技能' }));
      expect(await screen.findByText(/未连接知识库/)).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'wizard submits picked knowledge bases and skills with pinned versions',
    async () => {
      const created: PortalApplyResult = { kind: 'created', message: '数字员工已创建' };
      const clientWithSkills = {
        ...client,
        skills: vi.fn().mockResolvedValue([
          {
            id: 'report-writer',
            name: '报告撰写',
            state: 'active',
            enabled: true,
            versions: [
              { version: '1.0.0', state: 'published', sha256: 'a', size: 1 },
              { version: '1.2.0', state: 'published', sha256: 'b', size: 2 },
              { version: '2.0.0', state: 'draft', sha256: 'c', size: 3 },
            ],
          },
        ]),
      };
      const portal = makePortal({ apply: vi.fn().mockResolvedValue(created) });
      render(<DigitalEmployees client={clientWithSkills as never} portal={portal} />);

      fireEvent.click(await screen.findByRole('button', { name: /新建数字员工/ }));
      fireEvent.change(await screen.findByLabelText('标识名'), { target: { value: 'kb-helper' } });
      fireEvent.change(screen.getByLabelText('用途说明'), { target: { value: '整理资料。' } });
      const modal = await screen.findByRole('dialog');
      const comboBoxes = await within(modal).findAllByRole('combobox');
      await pickOption(comboBoxes[0]!, /^李四（lisi）$/);
      await pickOption(comboBoxes[1]!, /^研发部$/);
      await pickOption(comboBoxes[2]!, /^GLM（bench-glm）$/);
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      // Step 2: check the knowledge base and the skill (version defaults to
      // the latest published — the draft 2.0.0 must never be offered).
      await screen.findAllByText('关联知识库');
      fireEvent.click(screen.getByRole('checkbox', { name: /销售知识库/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /报告撰写/ }));
      expect(await within(screen.getByRole('dialog')).findByText('1.2.0')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      await screen.findAllByText('可用团队');
      const scopeCombos = await within(screen.getByRole('dialog')).findAllByRole('combobox');
      await pickOption(scopeCombos[0]!, /^研发部$/);
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      await screen.findAllByText('确认发布');
      // The confirm summary lists resolved names, not raw ids.
      expect(screen.getAllByText(/销售知识库/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/报告撰写 · 1\.2\.0/).length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: '保存并发布' }));

      await waitFor(() =>
        expect(portal.apply).toHaveBeenCalledWith(
          expect.objectContaining({
            knowledgeBases: ['kb-1'],
            skills: [{ id: 'report-writer', version: '1.2.0' }],
          }),
        ),
      );
    },
    TIMEOUT,
  );

  // ---- configuration editor (PATCH with diff-only payloads) ----

  test(
    'edit modal submits only the changed model list and refreshes the detail',
    async () => {
      const configured: PortalEmployee = {
        ...employee,
        models: ['bench-glm'],
        team: 'rd-dept',
        knowledgeBases: [{ id: 'kb-1', name: '销售知识库' }],
        skills: [],
        visibility: { mode: 'restricted', teams: [{ id: 'rd-dept', name: '研发部' }], users: [] },
      };
      const portal = makePortal({
        listEmployees: vi.fn().mockResolvedValue([configured]),
        updateEmployee: vi.fn().mockResolvedValue({ kind: 'updated' }),
        getEmployee: vi.fn().mockResolvedValue(configured),
      });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByText('sales-helper'));
      fireEvent.click(await screen.findByRole('button', { name: /编辑配置/ }));
      const modal = await screen.findByRole('dialog');
      // Modal combobox order: owner, team, models, scope teams, scope users.
      const comboBoxes = await within(modal).findAllByRole('combobox');
      await pickOption(comboBoxes[2]!, /^Bench（bench-anthropic · anthropic）$/);
      fireEvent.click(await within(modal).findByRole('button', { name: /保存修改/ }));

      // Exactly the changed field travels — the untouched knowledge policy,
      // audience, and basics never enter the PATCH body.
      await waitFor(() =>
        expect(portal.updateEmployee).toHaveBeenCalledWith('sales-helper', {
          models: ['bench-glm', 'bench-anthropic'],
        }),
      );
      await waitFor(() => expect(portal.getEmployee).toHaveBeenCalledWith('sales-helper'));
    },
    TIMEOUT,
  );

  test(
    'edit keeps a legacy employee untouched: displayName-only payload and save gating',
    async () => {
      const legacy: PortalEmployee = {
        ...employee,
        name: 'legacy-helper',
        displayName: '遗留员工',
        team: 'rd-dept',
        knowledgeBases: null,
        skills: null,
        visibility: null,
      };
      const portal = makePortal({ listEmployees: vi.fn().mockResolvedValue([legacy]) });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByText('legacy-helper'));
      fireEvent.click(await screen.findByRole('button', { name: /编辑配置/ }));
      const modal = await screen.findByRole('dialog');
      // The legacy hints explain what an edit would convert.
      expect(await within(modal).findByText(/沿用平台既有策略/)).toBeInTheDocument();
      expect(await within(modal).findByText(/负责人 \/ 所属团队规则/)).toBeInTheDocument();

      // No diff yet: save stays disabled instead of sending an empty patch.
      const save = await within(modal).findByRole('button', { name: /保存修改/ });
      expect(save).toBeDisabled();

      fireEvent.change(within(modal).getByLabelText('显示名称'), { target: { value: '改名员工' } });
      await waitFor(() => expect(save).toBeEnabled());
      fireEvent.click(save);

      await waitFor(() =>
        expect(portal.updateEmployee).toHaveBeenCalledWith('legacy-helper', { displayName: '改名员工' }),
      );
    },
    TIMEOUT,
  );

  test(
    'edit empties the knowledge list into an explicit deny-all and surfaces violations',
    async () => {
      const configured: PortalEmployee = {
        ...employee,
        team: 'rd-dept',
        knowledgeBases: [{ id: 'kb-1', name: '销售知识库' }],
        skills: [],
        visibility: { mode: 'restricted', teams: [{ id: 'rd-dept', name: '研发部' }], users: [] },
      };
      const portal = makePortal({
        listEmployees: vi.fn().mockResolvedValue([configured]),
        updateEmployee: vi.fn().mockResolvedValue({
          kind: 'rejected',
          status: 400,
          message: '发布条件校验未通过（1 项）',
          violations: [{ field: 'knowledgeBases', message: '知识服务暂不可用' }],
        }),
      });
      render(<DigitalEmployees client={client as never} portal={portal} />);

      fireEvent.click(await screen.findByText('sales-helper'));
      fireEvent.click(await screen.findByRole('button', { name: /编辑配置/ }));
      const modal = await screen.findByRole('dialog');
      fireEvent.click(await within(modal).findByRole('checkbox', { name: /销售知识库/ }));
      fireEvent.click(await within(modal).findByRole('button', { name: /保存修改/ }));

      // Unchecking the last base is a deliberate deny-all ([]), not "unset".
      await waitFor(() => expect(portal.updateEmployee).toHaveBeenCalledWith('sales-helper', { knowledgeBases: [] }));
      expect(await within(screen.getByRole('dialog')).findByText(/知识服务暂不可用/)).toBeInTheDocument();
      expect(portal.getEmployee).not.toHaveBeenCalled();
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

      const entry = await screen.findByText(/localhost:30202\/#\/emp\/sales-helper$/);
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
