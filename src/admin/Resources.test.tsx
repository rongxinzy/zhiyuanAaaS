// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { cloneElement, type ReactElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AdminResourceTab, Resources } from './Resources.js';
import { administratorIdentity } from './test-fixtures.js';

// Match the production button labels and disable decorative waves in jsdom.
const TIMEOUT = 15000;

function render(ui: ReactElement<{ readonly identity?: typeof administratorIdentity }>) {
  const withIdentity = cloneElement(ui, { identity: ui.props.identity ?? administratorIdentity });
  return rtlRender(
    <ConfigProvider button={{ autoInsertSpace: false }} wave={{ disabled: true }}>
      {withIdentity}
    </ConfigProvider>,
  );
}

// antd icon buttons expose "<icon-name> <text>" as their accessible name, so
// icon-bearing buttons are matched with regexes throughout this file.
function modalButton(name: RegExp | string) {
  return screen.getAllByRole('button', { name }).at(-1)!;
}

// The users row "更多" menu is an antd Dropdown with the default hover
// trigger; React synthesizes mouseenter from a native mouseover.
function openRowMenu(label: string | RegExp, index = 0) {
  const trigger = screen.getAllByRole('button', { name: label })[index]!;
  fireEvent.mouseOver(trigger);
  fireEvent.mouseEnter(trigger);
}

function fileInput(scope: HTMLElement | Document = document) {
  return scope.querySelector('input[type="file"]') as HTMLElement;
}

function jsonFile(content: string, name = 'users.json') {
  const file = new File([content], name, { type: 'application/json' });
  if (typeof (file as { text?: unknown }).text !== 'function')
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  return file;
}

async function pickSkillInGrantModal(modal: HTMLElement, optionName: string) {
  fireEvent.mouseDown(within(modal).getByRole('combobox'));
  const option = await waitFor(() => {
    const node = [...document.querySelectorAll('.ant-select-item-option')].find(
      (item) => item.textContent === optionName,
    );
    expect(node).toBeTruthy();
    return node!;
  });
  fireEvent.click(option);
}

// AntD Select option picker: open the combobox, click the option whose label
// contains optionName (role options render as "名称（id）").
async function pickOption(combobox: HTMLElement, optionName: string) {
  fireEvent.mouseDown(combobox);
  const option = await waitFor(() => {
    const node = [...document.querySelectorAll('.ant-select-item-option')].find((item) =>
      item.textContent?.includes(optionName),
    );
    expect(node).toBeTruthy();
    return node!;
  });
  fireEvent.click(option);
}

const emptyResources = { users: [], teams: [], roles: [], permissions: [], skills: [], assignments: [] };

const activeSession = (id: string, revokedAt: string | null = null) => ({
  sessionId: id,
  userId: 'u1',
  topic: 'terminal',
  createdAt: '2026-09-28T00:00:00Z',
  lastSeenAt: '2026-09-29T00:00:00Z',
  revokedAt,
});

describe('admin resources', () => {
  afterEach(() => cleanup());

  test(
    'renders users and disables an account through the dedicated confirmation',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        }),
        updateUser: vi.fn().mockResolvedValue(undefined),
        sessions: vi.fn().mockResolvedValue([]),
        revokeUserSession: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      expect(await screen.findByText('张三')).toBeInTheDocument();
      expect(screen.getByText('zhangsan')).toBeInTheDocument();
      expect(screen.getByText('已启用')).toBeInTheDocument();
      openRowMenu('更多');
      fireEvent.click(await screen.findByRole('menuitem', { name: /停用/ }));
      // Status changes only through the dedicated entry: the row menu opens a
      // confirmation instead of toggling the account directly.
      expect(await screen.findByText('停用用户：张三')).toBeInTheDocument();
      expect(client.updateUser).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole('button', { name: '确认停用' }));
      await waitFor(() => expect(client.updateUser).toHaveBeenCalledWith('u1', { status: 'disabled' }));
    },
    TIMEOUT,
  );

  test(
    'shows deduplicated effective Skill and model access across User, Role, and Team',
    async () => {
      const resources = {
        users: [
          { id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active', roleIds: ['r1'], teamIds: ['t1'] },
          { id: 'u2', displayName: '李四', username: 'lisi', status: 'disabled', roleIds: ['r1'], teamIds: ['t1'] },
        ],
        teams: [{ id: 't1', name: '平台组', description: '', builtIn: false, enabled: true, memberCount: 2 }],
        roles: [{ id: 'r1', name: '编辑者', description: '', builtIn: false, enabled: true, permissions: [] }],
        permissions: [],
        skills: [
          { id: 's-direct', name: '直接 Skill', enabled: true, state: 'active', versions: [] },
          { id: 's-role', name: 'Role Skill', enabled: true, state: 'active', versions: [] },
          { id: 's-disabled', name: '停用 Skill', enabled: false, state: 'active', versions: [] },
          { id: 's-withdrawn', name: '撤回 Skill', enabled: true, state: 'withdrawn', versions: [] },
        ],
        assignments: [
          { id: 'sa-1', skillId: 's-direct', subjectType: 'user', subjectId: 'u1' },
          { id: 'sa-2', skillId: 's-direct', subjectType: 'team', subjectId: 't1' },
          { id: 'sa-3', skillId: 's-role', subjectType: 'role', subjectId: 'r1' },
          { id: 'sa-4', skillId: 's-disabled', subjectType: 'user', subjectId: 'u1' },
          { id: 'sa-5', skillId: 's-withdrawn', subjectType: 'user', subjectId: 'u1' },
        ],
      };
      const client = {
        resources: vi.fn().mockResolvedValue(resources),
        models: vi.fn().mockResolvedValue({
          models: [
            {
              id: 'm1',
              displayName: '企业对话',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'deepseek-chat',
              enabled: true,
              isDefault: false,
            },
            {
              id: 'm2',
              displayName: '停用模型',
              endpoint: 'http://localhost:8081/v1',
              upstreamModel: 'disabled',
              enabled: false,
              isDefault: false,
            },
          ],
          assignments: [
            { id: 'ma-1', resourceType: 'model', resourceId: 'm1', subject: { type: 'user', id: 'u1' } },
            { id: 'ma-2', resourceType: 'model', resourceId: 'm1', subject: { type: 'role', id: 'r1' } },
            { id: 'ma-3', resourceType: 'model', resourceId: 'm2', subject: { type: 'team', id: 't1' } },
          ],
        }),
      };

      // Users expose effective access through the detail drawer's access tab.
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      expect(await screen.findByText('张三')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: '查看' })[0]!);
      fireEvent.click(await screen.findByRole('tab', { name: '访问权限' }));
      expect((await screen.findAllByText('直接 Skill')).length).toBeGreaterThan(0);
      expect(screen.getAllByText('直接授权').length).toBeGreaterThan(0);
      expect(screen.getByText('Role Skill')).toBeInTheDocument();
      expect(screen.getAllByText('角色：编辑者')).toHaveLength(2);
      expect(screen.getAllByText('企业对话').length).toBeGreaterThan(0);
      // Disabled and withdrawn skills are never effective, and the reason is shown.
      expect(screen.getAllByText('资源已停用')).toHaveLength(3);

      cleanup();
      render(<Resources client={client as never} tab={AdminResourceTab.Roles} />);
      expect(await screen.findByText('编辑者')).toBeInTheDocument();
      expect(screen.getByText('1 技能')).toBeInTheDocument();
      expect(screen.getByText('1 企业模型')).toBeInTheDocument();

      cleanup();
      render(<Resources client={client as never} tab={AdminResourceTab.Teams} />);
      expect(await screen.findByText('平台组')).toBeInTheDocument();
      expect(screen.getByText('1 技能')).toBeInTheDocument();
      expect(screen.getByText('0 企业模型')).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'renders assignment and revokes it after confirmation',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          skills: [{ id: 's1', name: '写作', enabled: true, state: 'active', versions: [] }],
          assignments: [{ id: 'a1', skillId: 's1', subjectType: 'user', subjectId: 'u1' }],
        }),
        updateUser: vi.fn(),
        updateSkill: vi.fn(),
        deleteSkillAssignment: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
      expect(await screen.findByText('写作')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '撤销授权' }));
      fireEvent.click(await screen.findByRole('button', { name: '确认撤销' }));
      await waitFor(() => expect(client.deleteSkillAssignment).toHaveBeenCalledWith('a1'));
    },
    TIMEOUT,
  );

  test(
    'grants a skill to the selected member',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
          skills: [{ id: 's1', name: '写作', enabled: true, state: 'active', versions: [] }],
        }),
        updateUser: vi.fn(),
        updateSkill: vi.fn(),
        deleteSkillAssignment: vi.fn(),
        createSkillAssignment: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
      expect(await screen.findByText('暂无技能授权')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: /授权技能/ })[0]!);
      const modal = await screen.findByRole('dialog');
      await pickSkillInGrantModal(modal, '写作');
      fireEvent.click(screen.getByRole('checkbox', { name: /张三/ }));
      fireEvent.click(within(modal).getByRole('button', { name: '授权' }));
      await waitFor(() =>
        expect(client.createSkillAssignment).toHaveBeenCalledWith({
          skillId: 's1',
          subject: { type: 'user', id: 'u1' },
        }),
      );
      await waitFor(() => expect(client.resources).toHaveBeenCalledTimes(2));
    },
    TIMEOUT,
  );

  test(
    'grants a skill to multiple members',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [
            { id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' },
            { id: 'u2', displayName: '李四', username: 'lisi', status: 'active' },
            { id: 'u3', displayName: '王五', username: 'wangwu', status: 'active' },
          ],
          skills: [{ id: 's1', name: '写作', enabled: true, state: 'active', versions: [] }],
        }),
        updateUser: vi.fn(),
        updateSkill: vi.fn(),
        deleteSkillAssignment: vi.fn(),
        createSkillAssignment: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
      expect(await screen.findByText('暂无技能授权')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: /授权技能/ })[0]!);
      const modal = await screen.findByRole('dialog');
      await pickSkillInGrantModal(modal, '写作');
      fireEvent.click(screen.getByRole('checkbox', { name: /张三/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /李四/ }));
      fireEvent.click(within(modal).getByRole('button', { name: '授权' }));
      await waitFor(() => expect(client.createSkillAssignment).toHaveBeenCalledTimes(2));
      expect(client.createSkillAssignment).toHaveBeenCalledWith({ skillId: 's1', subject: { type: 'user', id: 'u1' } });
      expect(client.createSkillAssignment).toHaveBeenCalledWith({ skillId: 's1', subject: { type: 'user', id: 'u2' } });
    },
    TIMEOUT,
  );

  test(
    'creates a user with role and team memberships',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          teams: [{ id: 'team-1', name: '平台组', description: '平台', builtIn: false, enabled: true, memberCount: 0 }],
          roles: [
            {
              id: 'role-1',
              name: '管理员',
              description: '管理权限',
              builtIn: false,
              enabled: true,
              permissions: ['users.read'],
            },
          ],
        }),
        createUser: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      fireEvent.click(await screen.findByRole('button', { name: /新增用户/ }));
      const modal = await screen.findByRole('dialog');
      fireEvent.change(within(modal).getByLabelText('用户名'), { target: { value: 'new-user' } });
      fireEvent.change(within(modal).getByLabelText('显示名称'), { target: { value: '新用户' } });
      fireEvent.change(within(modal).getByLabelText('临时密码'), { target: { value: 'temporary-password' } });
      const comboBoxes = within(modal).getAllByRole('combobox');
      await pickOption(comboBoxes[0]!, '管理员');
      await pickOption(comboBoxes[1]!, '平台组');
      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.createUser).toHaveBeenCalledWith(
          expect.objectContaining({
            username: 'new-user',
            displayName: '新用户',
            temporaryPassword: 'temporary-password',
            roleIds: ['role-1'],
            teamIds: ['team-1'],
            requirePasswordChange: true,
          }),
        ),
      );
    },
    TIMEOUT,
  );

  test(
    'resets a password from the row menu',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        }),
        resetUserPassword: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      expect(await screen.findByText('张三')).toBeInTheDocument();
      openRowMenu('更多');
      fireEvent.click(await screen.findByRole('menuitem', { name: /重置密码/ }));
      const modal = await screen.findByRole('dialog');
      fireEvent.change(within(modal).getByLabelText('临时密码'), { target: { value: 'fresh-temporary-password' } });
      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.resetUserPassword).toHaveBeenCalledWith('u1', {
          temporaryPassword: 'fresh-temporary-password',
          requirePasswordChange: true,
        }),
      );
    },
    TIMEOUT,
  );

  test(
    'imports users from a JSON envelope and refreshes the list',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          teams: [{ id: 'team-1', name: '平台组', description: '', builtIn: false, enabled: true, memberCount: 0 }],
          roles: [{ id: 'role-1', name: '管理员', description: '', builtIn: false, enabled: true, permissions: [] }],
        }),
        importUsers: vi.fn().mockResolvedValue({ created: 2, rejected: 1, errors: ['row-3: username already exists'] }),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      fireEvent.click(await screen.findByRole('button', { name: /导入用户/ }));
      const modal = await screen.findByRole('dialog');
      const payload = JSON.stringify({
        users: [
          {
            externalRowId: 'row-1',
            username: 'one',
            displayName: '用户一',
            temporaryPassword: 'temporary-password-1',
            roleIds: ['role-1'],
            teamIds: ['team-1'],
          },
          {
            externalRowId: 'row-2',
            username: 'two',
            displayName: '用户二',
            temporaryPassword: 'temporary-password-2',
            roleIds: ['role-1'],
            teamIds: ['team-1'],
          },
        ],
      });
      fireEvent.change(fileInput(modal), { target: { files: [jsonFile(payload)] } });
      fireEvent.click(within(modal).getByRole('button', { name: /导入用户/ }));
      await waitFor(() =>
        expect(client.importUsers).toHaveBeenCalledWith(expect.objectContaining({ users: expect.any(Array) })),
      );
      const imported = client.importUsers.mock.calls[0]?.[0] as { readonly users?: readonly unknown[] } | undefined;
      expect(imported?.users).toHaveLength(2);
      await waitFor(() => expect(client.resources).toHaveBeenCalledTimes(2));
      expect(await screen.findByText(/已创建用户: 2/)).toBeInTheDocument();
      expect(screen.getByText('row-3: username already exists')).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'rejects user import rows without Role and Team memberships',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({ ...emptyResources }),
        importUsers: vi.fn(),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      fireEvent.click(await screen.findByRole('button', { name: /导入用户/ }));
      const modal = await screen.findByRole('dialog');
      const payload = JSON.stringify({
        users: [
          { externalRowId: 'row-1', username: 'one', displayName: '用户一', temporaryPassword: 'temporary-password-1' },
        ],
      });
      fireEvent.change(fileInput(modal), { target: { files: [jsonFile(payload)] } });
      fireEvent.click(within(modal).getByRole('button', { name: /导入用户/ }));
      expect(
        await within(modal).findByText('用户导入失败，请检查 JSON 格式、必填字段和临时密码长度。'),
      ).toBeInTheDocument();
      expect(client.importUsers).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'rejects malformed user import before calling the client',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({ ...emptyResources }),
        importUsers: vi.fn(),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      fireEvent.click(await screen.findByRole('button', { name: /导入用户/ }));
      const modal = await screen.findByRole('dialog');
      fireEvent.change(fileInput(modal), {
        target: { files: [jsonFile('{"users":[{"username":"missing-fields"}]}')] },
      });
      fireEvent.click(within(modal).getByRole('button', { name: /导入用户/ }));
      expect(
        await within(modal).findByText('用户导入失败，请检查 JSON 格式、必填字段和临时密码长度。'),
      ).toBeInTheDocument();
      expect(client.importUsers).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'creates a role with selected permissions',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          permissions: [{ id: 'models.read', description: '读取模型' }],
        }),
        createRole: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Roles} />);
      fireEvent.click(await screen.findByRole('button', { name: /新增角色/ }));
      const modal = await screen.findByRole('dialog');
      fireEvent.change(within(modal).getByLabelText('角色 ID'), { target: { value: 'model-reader' } });
      fireEvent.change(within(modal).getByLabelText('名称'), { target: { value: '模型读取者' } });
      fireEvent.click(within(modal).getByRole('checkbox', { name: /models\.read/ }));
      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.createRole).toHaveBeenCalledWith({
          id: 'model-reader',
          name: '模型读取者',
          description: '',
          permissions: ['models.read'],
        }),
      );
    },
    TIMEOUT,
  );

  test(
    'edits and deletes a non-built-in role',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          roles: [
            { id: 'role-1', name: '旧角色', description: '旧描述', builtIn: false, enabled: true, permissions: [] },
          ],
        }),
        updateRole: vi.fn().mockResolvedValue(undefined),
        deleteRole: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Roles} />);
      fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
      const modal = await screen.findByRole('dialog');
      fireEvent.change(within(modal).getByLabelText('名称'), { target: { value: '新角色' } });
      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.updateRole).toHaveBeenCalledWith(
          'role-1',
          expect.objectContaining({ name: '新角色', description: '旧描述', enabled: true, permissions: [] }),
        ),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      fireEvent.click(await screen.findByRole('button', { name: '删除' }));
      expect(await screen.findByText('删除这个角色？')).toBeInTheDocument();
      fireEvent.click(modalButton('删除'));
      await waitFor(() => expect(client.deleteRole).toHaveBeenCalledWith('role-1'));
    },
    TIMEOUT,
  );

  test(
    'updates user profile and replaces RBAC memberships separately',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [
            { id: 'u1', username: 'existing', displayName: '旧用户', status: 'active', roleIds: [], teamIds: [] },
          ],
          teams: [{ id: 'team-1', name: '平台组', description: '', builtIn: false, enabled: true, memberCount: 1 }],
          roles: [{ id: 'role-1', name: '管理员', description: '', builtIn: false, enabled: true, permissions: [] }],
        }),
        updateUser: vi.fn().mockResolvedValue(undefined),
        replaceUserRBAC: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
      const modal = await screen.findByRole('dialog');
      fireEvent.change(within(modal).getByLabelText('显示名称'), { target: { value: '新用户' } });
      const comboBoxes = within(modal).getAllByRole('combobox');
      await pickOption(comboBoxes[0]!, '管理员');
      await pickOption(comboBoxes[1]!, '平台组');
      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      // The editor no longer touches account status; profile and RBAC are separate calls.
      await waitFor(() => expect(client.updateUser).toHaveBeenCalledWith('u1', { displayName: '新用户', email: null }));
      await waitFor(() =>
        expect(client.replaceUserRBAC).toHaveBeenCalledWith('u1', { roleIds: ['role-1'], teamIds: ['team-1'] }),
      );
    },
    TIMEOUT,
  );

  test(
    'blocks a user save when no Role or Team is selected',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [
            { id: 'u1', username: 'existing', displayName: '旧用户', status: 'active', roleIds: [], teamIds: [] },
          ],
          teams: [{ id: 'team-1', name: '平台组', description: '', builtIn: false, enabled: true, memberCount: 0 }],
          roles: [{ id: 'role-1', name: '管理员', description: '', builtIn: false, enabled: true, permissions: [] }],
        }),
        updateUser: vi.fn(),
        replaceUserRBAC: vi.fn(),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
      const modal = await screen.findByRole('dialog');
      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      expect(await within(modal).findByText('请至少选择一个角色。')).toBeInTheDocument();
      expect(within(modal).getByText('请至少选择一个团队。')).toBeInTheDocument();
      expect(client.updateUser).not.toHaveBeenCalled();
      expect(client.replaceUserRBAC).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'edits a team through the update client method',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          teams: [
            { id: 'team-1', name: '旧名称', description: '旧描述', builtIn: false, enabled: true, memberCount: 2 },
          ],
        }),
        updateTeam: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Teams} />);
      fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
      const modal = await screen.findByRole('dialog');
      fireEvent.change(within(modal).getByLabelText('名称'), { target: { value: '新名称' } });
      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.updateTeam).toHaveBeenCalledWith('team-1', {
          name: '新名称',
          description: '旧描述',
          enabled: true,
        }),
      );
    },
    TIMEOUT,
  );

  test(
    'deletes a non-built-in team after confirmation',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          teams: [{ id: 'team-1', name: '临时组', description: '', builtIn: false, enabled: true, memberCount: 0 }],
        }),
        deleteTeam: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Teams} />);
      fireEvent.click(await screen.findByRole('button', { name: '删除' }));
      expect(await screen.findByText('删除这个团队？')).toBeInTheDocument();
      fireEvent.click(modalButton('删除'));
      await waitFor(() => expect(client.deleteTeam).toHaveBeenCalledWith('team-1'));
    },
    TIMEOUT,
  );

  test(
    'creates a Skill from the lifecycle editor',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({ ...emptyResources }),
        createSkill: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);
      fireEvent.click(await screen.findByRole('button', { name: /新增技能/ }));
      const modal = await screen.findByRole('dialog');
      fireEvent.change(within(modal).getByLabelText('技能 ID'), { target: { value: 'writing' } });
      fireEvent.change(within(modal).getByLabelText('名称'), { target: { value: '写作助手' } });
      fireEvent.change(within(modal).getByLabelText('描述'), { target: { value: '生成文案' } });
      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.createSkill).toHaveBeenCalledWith({ id: 'writing', name: '写作助手', description: '生成文案' }),
      );
    },
    TIMEOUT,
  );

  test(
    'edits and deletes a Skill',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          skills: [{ id: 's1', name: '旧名称', description: '旧描述', enabled: true, state: 'active', versions: [] }],
        }),
        updateSkill: vi.fn().mockResolvedValue(undefined),
        deleteSkill: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);
      fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
      const modal = await screen.findByRole('dialog');
      fireEvent.change(within(modal).getByLabelText('名称'), { target: { value: '新名称' } });
      fireEvent.click(within(modal).getByRole('button', { name: '保存' }));
      await waitFor(() =>
        expect(client.updateSkill).toHaveBeenCalledWith('s1', { name: '新名称', description: '旧描述', enabled: true }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      fireEvent.click(await screen.findByRole('button', { name: '删除' }));
      expect(await screen.findByText('确认删除技能')).toBeInTheDocument();
      fireEvent.click(modalButton('删除'));
      await waitFor(() => expect(client.deleteSkill).toHaveBeenCalledWith('s1'));
    },
    TIMEOUT,
  );

  test(
    'blocks skill deletion while known assignments reference the skill',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
          skills: [{ id: 's1', name: '写作', description: '', enabled: true, state: 'active', versions: [] }],
          assignments: [{ id: 'a1', skillId: 's1', subjectType: 'user', subjectId: 'u1' }],
        }),
        deleteSkill: vi.fn(),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);
      expect(await screen.findByText('写作')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '删除' }));
      expect(await screen.findByText('无法删除被引用的技能')).toBeInTheDocument();
      expect(screen.getByText('张三')).toBeInTheDocument();
      expect(client.deleteSkill).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'uploads and publishes a Skill version',
    async () => {
      const client = {
        resources: vi
          .fn()
          .mockResolvedValueOnce({
            ...emptyResources,
            skills: [{ id: 's1', name: '写作', description: '', enabled: true, state: 'active', versions: [] }],
          })
          .mockResolvedValue({
            ...emptyResources,
            skills: [
              {
                id: 's1',
                name: '写作',
                description: '',
                enabled: true,
                state: 'active',
                versions: [{ version: '1.0.0', state: 'draft', sha256: 'a'.repeat(64), size: 3 }],
              },
            ],
          }),
        uploadSkillVersion: vi.fn().mockResolvedValue(undefined),
        publishSkillVersion: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);
      expect(await screen.findByText('写作')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '查看' }));
      fireEvent.click(await screen.findByRole('tab', { name: /版本记录/ }));
      fireEvent.change(await screen.findByLabelText('版本号'), { target: { value: '1.0.0' } });
      const archive = new File(['zip'], 'skill.zip', { type: 'application/zip' });
      Object.defineProperty(archive, 'arrayBuffer', { value: async () => new Uint8Array([1, 2, 3]).buffer });
      fireEvent.change(fileInput(), { target: { files: [archive] } });
      fireEvent.click(screen.getByRole('button', { name: '上传版本' }));
      await waitFor(() =>
        expect(client.uploadSkillVersion).toHaveBeenCalledWith('s1', '1.0.0', expect.any(Uint8Array)),
      );
      await waitFor(() => expect(client.resources).toHaveBeenCalledTimes(2));
      fireEvent.click(await screen.findByText('发布', { selector: 'button span' }));
      await waitFor(() => expect(client.publishSkillVersion).toHaveBeenCalledWith('s1', '1.0.0'));
    },
    TIMEOUT,
  );

  test(
    'keeps a failed Skill version publish retryable',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          skills: [
            {
              id: 's1',
              name: '写作',
              description: '',
              enabled: true,
              state: 'active',
              versions: [{ version: '1.0.0', state: 'draft', sha256: 'a'.repeat(64), size: 3 }],
            },
          ],
        }),
        publishSkillVersion: vi.fn().mockRejectedValueOnce(new Error('publish failed')).mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);
      expect(await screen.findByText('写作')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '查看' }));
      fireEvent.click(await screen.findByRole('tab', { name: /版本记录/ }));
      fireEvent.click(await screen.findByText('发布', { selector: 'button span' }));
      await waitFor(() => expect(client.publishSkillVersion).toHaveBeenCalledTimes(1));
      // The failure must not leave the version stuck in a loading state: the
      // publish button becomes clickable again and a retry goes through.
      await waitFor(() =>
        expect(screen.getByText('发布', { selector: 'button span' }).closest('button')).not.toHaveClass(
          'ant-btn-loading',
        ),
      );
      fireEvent.click(screen.getByText('发布', { selector: 'button span' }));
      await waitFor(() => expect(client.publishSkillVersion).toHaveBeenCalledTimes(2));
    },
    TIMEOUT,
  );

  test(
    'withdraws a Skill version after confirmation and refreshes the list',
    async () => {
      const client = {
        resources: vi
          .fn()
          .mockResolvedValueOnce({
            ...emptyResources,
            skills: [
              {
                id: 's1',
                name: '写作',
                description: '',
                enabled: true,
                state: 'active',
                versions: [{ version: '1.0.0', state: 'published', sha256: 'a'.repeat(64), size: 3 }],
              },
            ],
          })
          .mockResolvedValue({
            ...emptyResources,
            skills: [{ id: 's1', name: '写作', description: '', enabled: true, state: 'active', versions: [] }],
          }),
        deleteSkillVersion: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);
      expect(await screen.findByText('1.0.0')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '查看' }));
      fireEvent.click(await screen.findByRole('tab', { name: /版本记录/ }));
      fireEvent.click(screen.getByText('撤回', { selector: 'button span' }));
      fireEvent.click(await screen.findByText('确认撤回版本', { selector: 'button span' }));
      await waitFor(() => expect(client.deleteSkillVersion).toHaveBeenCalledWith('s1', '1.0.0'));
      await waitFor(() => expect(client.resources).toHaveBeenCalledTimes(2));
    },
    TIMEOUT,
  );

  test(
    'grants a Skill to a role and a team',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          teams: [{ id: 'team-1', name: '平台组', description: '', builtIn: false, enabled: true, memberCount: 0 }],
          roles: [{ id: 'role-1', name: '编辑者', description: '', builtIn: false, enabled: true, permissions: [] }],
          skills: [{ id: 's1', name: '写作', enabled: true, state: 'active', versions: [] }],
        }),
        createSkillAssignment: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
      fireEvent.click((await screen.findAllByRole('button', { name: /授权技能/ }))[0]!);
      const modal = await screen.findByRole('dialog');
      await pickSkillInGrantModal(modal, '写作');
      fireEvent.click(screen.getByRole('checkbox', { name: /编辑者/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /平台组/ }));
      fireEvent.click(within(modal).getByRole('button', { name: '授权' }));
      await waitFor(() => expect(client.createSkillAssignment).toHaveBeenCalledTimes(2));
      expect(client.createSkillAssignment).toHaveBeenCalledWith({
        skillId: 's1',
        subject: { type: 'role', id: 'role-1' },
      });
      expect(client.createSkillAssignment).toHaveBeenCalledWith({
        skillId: 's1',
        subject: { type: 'team', id: 'team-1' },
      });
    },
    TIMEOUT,
  );

  test(
    'keeps failed grant subjects selected for retry instead of faking success',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [
            { id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' },
            { id: 'u2', displayName: '李四', username: 'lisi', status: 'active' },
          ],
          skills: [{ id: 's1', name: '写作', enabled: true, state: 'active', versions: [] }],
        }),
        createSkillAssignment: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('assign failed'))
          .mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
      expect(await screen.findByText('暂无技能授权')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: /授权技能/ })[0]!);
      const modal = await screen.findByRole('dialog');
      await pickSkillInGrantModal(modal, '写作');
      fireEvent.click(screen.getByRole('checkbox', { name: /张三/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /李四/ }));
      fireEvent.click(within(modal).getByRole('button', { name: '授权' }));
      expect(await within(modal).findByText('授权失败，请稍后重试。')).toBeInTheDocument();
      expect(within(modal).getByText(/失败主体: user:u2/)).toBeInTheDocument();
      // The modal stays open with the failed subject still selected, so the
      // partial batch can be retried.
      expect(within(modal).getByRole('checkbox', { name: /李四/ })).toBeChecked();
      await waitFor(() =>
        expect(within(modal).getByText('授权', { selector: 'button span' }).closest('button')).not.toHaveClass(
          'ant-btn-loading',
        ),
      );
      fireEvent.click(within(modal).getByText('授权', { selector: 'button span' }));
      await waitFor(() => expect(client.createSkillAssignment).toHaveBeenCalledTimes(3));
      expect(client.createSkillAssignment).toHaveBeenLastCalledWith({
        skillId: 's1',
        subject: { type: 'user', id: 'u2' },
      });
    },
    TIMEOUT,
  );

  test(
    'disables an account, revokes its active sessions, and reports both outcomes',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        }),
        updateUser: vi.fn().mockResolvedValue(undefined),
        sessions: vi
          .fn()
          .mockResolvedValue([
            activeSession('sess-active-1'),
            activeSession('sess-active-2'),
            activeSession('sess-revoked', '2026-09-28T01:00:00Z'),
          ]),
        revokeUserSession: vi.fn().mockResolvedValue(undefined),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      expect(await screen.findByText('张三')).toBeInTheDocument();
      openRowMenu('更多');
      fireEvent.click(await screen.findByRole('menuitem', { name: /停用/ }));
      fireEvent.click(await screen.findByRole('button', { name: '确认停用' }));
      await waitFor(() => expect(client.updateUser).toHaveBeenCalledWith('u1', { status: 'disabled' }));
      // Only the still-active sessions are revoked; already-revoked ones are skipped.
      await waitFor(() => expect(client.revokeUserSession).toHaveBeenCalledTimes(2));
      expect(client.revokeUserSession).toHaveBeenCalledWith('sess-active-1');
      expect(client.revokeUserSession).toHaveBeenCalledWith('sess-active-2');
      expect(client.revokeUserSession).not.toHaveBeenCalledWith('sess-revoked');
      // Disable and revocation are reported separately.
      expect(await screen.findByText('账号已停用')).toBeInTheDocument();
      expect(screen.getByText('已撤销有效会话：2')).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'reports partial session revocation failure without faking success',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        }),
        updateUser: vi.fn().mockResolvedValue(undefined),
        sessions: vi.fn().mockResolvedValue([activeSession('sess-a'), activeSession('sess-b')]),
        revokeUserSession: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('revoke failed')),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      expect(await screen.findByText('张三')).toBeInTheDocument();
      openRowMenu('更多');
      fireEvent.click(await screen.findByRole('menuitem', { name: /停用/ }));
      fireEvent.click(await screen.findByRole('button', { name: '确认停用' }));
      await waitFor(() => expect(client.updateUser).toHaveBeenCalledWith('u1', { status: 'disabled' }));
      await waitFor(() => expect(client.revokeUserSession).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('部分会话撤销失败，请到登录会话页处理。')).toBeInTheDocument();
      expect(screen.getByText('账号已停用')).toBeInTheDocument();
      expect(screen.queryByText(/已撤销有效会话/)).not.toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'marks the console session in the login sessions tab and disables its revocation',
    async () => {
      const client = {
        sessionId: 'sess-self',
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        }),
        sessions: vi.fn().mockResolvedValue([
          {
            ...activeSession('sess-self'),
            client: { name: 'zhiyuan-enterprise', version: '0.8.0', deviceId: '7b7d02c4-2c4f-4f6f-9d3c-9d6f8a1b2c3d' },
          },
          { ...activeSession('sess-other'), client: { name: 'curl' } },
        ]),
        revokeUserSession: vi.fn(),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      expect(await screen.findByText('张三')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: '查看' })[0]!);
      fireEvent.click(await screen.findByRole('tab', { name: '登录会话' }));

      // testing-library waitFor (MutationObserver) wedges on this drawer/tab/table
      // combination in jsdom, so the async settle uses vi.waitFor instead.
      await vi.waitFor(() => {
        expect(screen.getByText('zhiyuan-enterprise 0.8.0')).toBeInTheDocument();
      });
      expect(screen.getByText('7b7d02c4…')).toBeInTheDocument();
      expect(screen.getByText('当前会话')).toBeInTheDocument();
      expect(screen.getByText('curl')).toBeInTheDocument();

      // getByRole accessible-name computation crashes the jsdom worker on this
      // drawer table; match the button label text and step up to the button.
      const selfRow = screen.getByText('zhiyuan-enterprise 0.8.0').closest('tr')!;
      const selfRevoke = within(selfRow).getByText('撤销登录').closest('button')!;
      expect(selfRevoke).toBeDisabled();
      fireEvent.click(selfRevoke);
      expect(client.revokeUserSession).not.toHaveBeenCalled();

      const otherRow = screen.getByText('curl').closest('tr')!;
      expect(within(otherRow).getByText('撤销登录').closest('button')).toBeEnabled();
    },
    TIMEOUT,
  );

  test(
    'warns when disabling the account backing the current console session',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'admin-1', displayName: '管理员', username: 'admin', status: 'active' }],
        }),
        updateUser: vi.fn(),
        sessions: vi.fn().mockResolvedValue([]),
        revokeUserSession: vi.fn(),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      expect(await screen.findByText('管理员')).toBeInTheDocument();
      openRowMenu('更多');
      fireEvent.click(await screen.findByRole('menuitem', { name: /停用/ }));
      expect(await screen.findByText('停用用户：管理员')).toBeInTheDocument();
      expect(screen.getByText('该账号正用于当前控制台，停用后你将同时被注销。')).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: '取消' }).at(-1)!);
    },
    TIMEOUT,
  );

  test(
    'omits the self-disable warning for a different account',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        }),
        updateUser: vi.fn(),
        sessions: vi.fn().mockResolvedValue([]),
        revokeUserSession: vi.fn(),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      expect(await screen.findByText('张三')).toBeInTheDocument();
      openRowMenu('更多');
      fireEvent.click(await screen.findByRole('menuitem', { name: /停用/ }));
      expect(await screen.findByText('停用用户：张三')).toBeInTheDocument();
      expect(screen.queryByText('该账号正用于当前控制台，停用后你将同时被注销。')).not.toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'row edit and disable entries do not open the detail drawer',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        }),
        updateUser: vi.fn(),
        sessions: vi.fn().mockResolvedValue([]),
        revokeUserSession: vi.fn(),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
      expect(await screen.findByText('张三')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '编辑' }));
      const editor = await screen.findByRole('dialog');
      expect(within(editor).getByText('编辑用户')).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: '基本信息' })).not.toBeInTheDocument();
      fireEvent.click(within(editor).getAllByRole('button', { name: '取消' }).at(-1)!);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      openRowMenu('更多');
      fireEvent.click(await screen.findByRole('menuitem', { name: /停用/ }));
      expect(await screen.findByText('停用用户：张三')).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: '基本信息' })).not.toBeInTheDocument();
      expect(client.updateUser).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'allows granting but not editing Skills with SkillsAssign but no SkillsWrite',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          skills: [{ id: 's1', name: '写作', description: '', enabled: true, state: 'active', versions: [] }],
        }),
        createSkillAssignment: vi.fn().mockResolvedValue(undefined),
      };
      const identity = { ...administratorIdentity, roles: [], permissions: ['skills.read', 'skills.assign'] };
      render(<Resources client={client as never} identity={identity} tab={AdminResourceTab.Skills} />);
      expect(await screen.findByText('写作')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /授权技能/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /新增技能/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '停用' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /授权技能/ }));
      expect(await screen.findByText('为成员授权技能')).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'allows editing but not granting Skills with SkillsWrite but no SkillsAssign',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          skills: [{ id: 's1', name: '写作', description: '', enabled: true, state: 'active', versions: [] }],
        }),
      };
      const identity = { ...administratorIdentity, roles: [], permissions: ['skills.read', 'skills.write'] };
      render(<Resources client={client as never} identity={identity} tab={AdminResourceTab.Skills} />);
      expect(await screen.findByText('写作')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /新增技能/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /授权技能/ })).not.toBeInTheDocument();

      cleanup();
      render(<Resources client={client as never} identity={identity} tab={AdminResourceTab.Assignments} />);
      expect(await screen.findByText('暂无技能授权')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /授权技能/ })).not.toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'maps the contract state field to the disabled Skill status',
    async () => {
      const client = {
        resources: vi.fn().mockResolvedValue({
          ...emptyResources,
          skills: [{ id: 's1', name: '已撤回 Skill', state: 'withdrawn', versions: [] }],
        }),
      };
      render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);

      expect(await screen.findByText('已撤回 Skill')).toBeInTheDocument();
      expect(screen.getByText('已停用')).toBeInTheDocument();
    },
    TIMEOUT,
  );
});
