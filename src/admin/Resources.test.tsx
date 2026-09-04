// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AdminResourceTab, Resources } from './Resources.js';

describe('admin resources', () => {
  afterEach(() => cleanup());

  test('renders users and toggles status through the client', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({
        users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        teams: [],
        roles: [],
        permissions: [],
        skills: [],
        assignments: [],
      }),
      updateUser: vi.fn().mockResolvedValue(undefined),
      updateSkill: vi.fn(),
      deleteSkillAssignment: vi.fn(),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
    expect(await screen.findByText('张三')).toBeInTheDocument();
    expect(screen.getByText('zhangsan')).toHaveClass('text-tertiary-foreground');
    expect(screen.getByText('启用')).toHaveClass('bg-success-soft', 'text-success');
    fireEvent.click(screen.getByRole('button', { name: '停用' }));
    await waitFor(() => expect(client.updateUser).toHaveBeenCalledWith('u1', { status: 'disabled' }));
  });

  test('renders assignment and revokes it after confirmation', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({ users: [], teams: [], roles: [], permissions: [], skills: [{ id: 's1', name: '写作' }], assignments: [{ id: 'a1', skillId: 's1', subjectType: 'user', subjectId: 'u1' }] }),
      updateUser: vi.fn(),
      updateSkill: vi.fn(),
      deleteSkillAssignment: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
    expect(await screen.findByText('写作')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '撤销授权' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认撤销' }));
    await waitFor(() => expect(client.deleteSkillAssignment).toHaveBeenCalledWith('a1'));
  });

  test('grants a skill to the selected member', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({
        users: [{ id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' }],
        teams: [],
        roles: [],
        permissions: [],
        skills: [{ id: 's1', name: '写作', enabled: true }],
        assignments: [],
      }),
      updateUser: vi.fn(),
      updateSkill: vi.fn(),
      deleteSkillAssignment: vi.fn(),
      createSkillAssignment: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
    expect(await screen.findByText('暂无 Skill 授权')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '授权 Skill' })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: '写作' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /张三/ }));
    fireEvent.click(screen.getByRole('button', { name: '授权' }));
    await waitFor(() => expect(client.createSkillAssignment).toHaveBeenCalledWith({ skillId: 's1', subject: { type: 'user', id: 'u1' } }));
    await waitFor(() => expect(client.resources).toHaveBeenCalledTimes(2));
  });

  test('grants a skill to multiple members', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({
        users: [
          { id: 'u1', displayName: '张三', username: 'zhangsan', status: 'active' },
          { id: 'u2', displayName: '李四', username: 'lisi', status: 'active' },
          { id: 'u3', displayName: '王五', username: 'wangwu', status: 'active' },
        ],
        teams: [],
        roles: [],
        permissions: [],
        skills: [{ id: 's1', name: '写作', enabled: true }],
        assignments: [],
      }),
      updateUser: vi.fn(),
      updateSkill: vi.fn(),
      deleteSkillAssignment: vi.fn(),
      createSkillAssignment: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
    expect(await screen.findByText('暂无 Skill 授权')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '授权 Skill' })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: '写作' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /张三/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /李四/ }));
    fireEvent.click(screen.getByRole('button', { name: '授权' }));
    await waitFor(() => expect(client.createSkillAssignment).toHaveBeenCalledTimes(2));
    expect(client.createSkillAssignment).toHaveBeenCalledWith({ skillId: 's1', subject: { type: 'user', id: 'u1' } });
    expect(client.createSkillAssignment).toHaveBeenCalledWith({ skillId: 's1', subject: { type: 'user', id: 'u2' } });
  });

  test('creates a user with role and team memberships', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({
        users: [],
        teams: [{ id: 'team-1', name: '平台组', description: '平台', builtIn: false, enabled: true, memberCount: 0 }],
        roles: [{ id: 'role-1', name: '管理员', description: '管理权限', builtIn: false, enabled: true, permissions: ['users.read'] }],
        permissions: [],
        skills: [],
        assignments: [],
      }),
      createUser: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
    fireEvent.click(await screen.findByRole('button', { name: '新增用户' }));
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'new-user' } });
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '新用户' } });
    fireEvent.change(screen.getByLabelText('临时密码'), { target: { value: 'temporary-password' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /管理员/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /平台组/ }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.createUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'new-user', displayName: '新用户', temporaryPassword: 'temporary-password', roleIds: ['role-1'], teamIds: ['team-1'], requirePasswordChange: true })));
  });

  test('imports users from a JSON envelope and refreshes the list', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({ users: [], teams: [], roles: [], permissions: [], skills: [], assignments: [] }),
      importUsers: vi.fn().mockResolvedValue({ created: 2, rejected: 1 }),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
    fireEvent.click(await screen.findByRole('button', { name: '导入用户' }));
    const payload = JSON.stringify({ users: [
      { externalRowId: 'row-1', username: 'one', displayName: '用户一', temporaryPassword: 'temporary-password-1' },
      { externalRowId: 'row-2', username: 'two', displayName: '用户二', temporaryPassword: 'temporary-password-2' },
    ] });
    fireEvent.change(screen.getByLabelText('用户 JSON 文件'), { target: { files: [new File([payload], 'users.json', { type: 'application/json' })] } });
    fireEvent.click((await screen.findAllByRole('button', { name: '导入用户' })).at(-1)!);
    await waitFor(() => expect(client.importUsers).toHaveBeenCalledWith(expect.objectContaining({ users: expect.any(Array) })));
    const imported = client.importUsers.mock.calls[0]?.[0] as { readonly users?: readonly unknown[] } | undefined;
    expect(imported?.users).toHaveLength(2);
    await waitFor(() => expect(client.resources).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/已创建用户: 2/)).toBeInTheDocument();
  });

  test('rejects malformed user import before calling the client', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({ users: [], teams: [], roles: [], permissions: [], skills: [], assignments: [] }),
      importUsers: vi.fn(),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
    fireEvent.click(await screen.findByRole('button', { name: '导入用户' }));
    fireEvent.change(screen.getByLabelText('用户 JSON 文件'), { target: { files: [new File(['{"users":[{"username":"missing-fields"}]}'], 'users.json', { type: 'application/json' })] } });
    fireEvent.click((await screen.findAllByRole('button', { name: '导入用户' })).at(-1)!);
    expect(await screen.findByText('用户导入失败，请检查 JSON 格式、必填字段和临时密码长度。')).toBeInTheDocument();
    expect(client.importUsers).not.toHaveBeenCalled();
  });

  test('creates a role with selected permissions', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({ users: [], teams: [], roles: [], permissions: [{ id: 'models.read', description: '读取模型' }], skills: [], assignments: [] }),
      createRole: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Roles} />);
    fireEvent.click(await screen.findByRole('button', { name: '新增 Role' }));
    fireEvent.change(screen.getByLabelText('Role ID'), { target: { value: 'model-reader' } });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '模型读取者' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /models\.read/ }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.createRole).toHaveBeenCalledWith({ id: 'model-reader', name: '模型读取者', description: '', permissions: ['models.read'] }));
  });

  test('updates user profile and replaces RBAC memberships separately', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({
        users: [{ id: 'u1', username: 'existing', displayName: '旧用户', status: 'active', roleIds: [], teamIds: [] }],
        teams: [{ id: 'team-1', name: '平台组', description: '', builtIn: false, enabled: true, memberCount: 1 }],
        roles: [{ id: 'role-1', name: '管理员', description: '', builtIn: false, enabled: true, permissions: [] }],
        permissions: [],
        skills: [],
        assignments: [],
      }),
      updateUser: vi.fn().mockResolvedValue(undefined),
      replaceUserRBAC: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Users} />);
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: '新用户' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /管理员/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /平台组/ }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.updateUser).toHaveBeenCalledWith('u1', { displayName: '新用户', email: null, status: 'active' }));
    await waitFor(() => expect(client.replaceUserRBAC).toHaveBeenCalledWith('u1', { roleIds: ['role-1'], teamIds: ['team-1'] }));
  });

  test('edits a team through the update client method', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({ users: [], teams: [{ id: 'team-1', name: '旧名称', description: '旧描述', builtIn: false, enabled: true, memberCount: 2 }], roles: [], permissions: [], skills: [], assignments: [] }),
      updateTeam: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Teams} />);
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '新名称' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.updateTeam).toHaveBeenCalledWith('team-1', { name: '新名称', description: '旧描述', enabled: true }));
  });

  test('deletes a non-built-in team after confirmation', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({ users: [], teams: [{ id: 'team-1', name: '临时组', description: '', builtIn: false, enabled: true, memberCount: 0 }], roles: [], permissions: [], skills: [], assignments: [] }),
      deleteTeam: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Teams} />);
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));
    const deleteButtons = await screen.findAllByRole('button', { name: '删除' });
    fireEvent.click(deleteButtons.at(-1)!);
    await waitFor(() => expect(client.deleteTeam).toHaveBeenCalledWith('team-1'));
  });

  test('creates a Skill from the lifecycle editor', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({ users: [], teams: [], roles: [], permissions: [], skills: [], assignments: [] }),
      createSkill: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);
    fireEvent.click(await screen.findByRole('button', { name: '新增 Skill' }));
    fireEvent.change(screen.getByLabelText('Skill ID'), { target: { value: 'writing' } });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '写作助手' } });
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '生成文案' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.createSkill).toHaveBeenCalledWith({ id: 'writing', name: '写作助手', description: '生成文案', enabled: true }));
  });

  test('edits and deletes a Skill', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({ users: [], teams: [], roles: [], permissions: [], skills: [{ id: 's1', name: '旧名称', description: '旧描述', enabled: true, versions: [] }], assignments: [] }),
      updateSkill: vi.fn().mockResolvedValue(undefined),
      deleteSkill: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '新名称' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(client.updateSkill).toHaveBeenCalledWith('s1', { name: '新名称', description: '旧描述', enabled: true }));
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));
    const deleteButtons = await screen.findAllByRole('button', { name: '删除' });
    fireEvent.click(deleteButtons.at(-1)!);
    await waitFor(() => expect(client.deleteSkill).toHaveBeenCalledWith('s1'));
  });

  test('uploads and publishes a Skill version', async () => {
    const client = {
      resources: vi.fn()
        .mockResolvedValueOnce({ users: [], teams: [], roles: [], permissions: [], skills: [{ id: 's1', name: '写作', description: '', enabled: true, versions: [] }], assignments: [] })
        .mockResolvedValue({ users: [], teams: [], roles: [], permissions: [], skills: [{ id: 's1', name: '写作', description: '', enabled: true, versions: [{ version: '1.0.0', state: 'draft', sha256: 'a'.repeat(64), size: 3 }] }], assignments: [] }),
      uploadSkillVersion: vi.fn().mockResolvedValue(undefined),
      publishSkillVersion: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);
    fireEvent.click(await screen.findByRole('button', { name: '上传版本' }));
    fireEvent.change(screen.getByLabelText('版本号'), { target: { value: '1.0.0' } });
    const archive = new File(['zip'], 'skill.zip', { type: 'application/zip' });
    fireEvent.change(screen.getByLabelText('Skill ZIP 包'), { target: { files: [archive] } });
    fireEvent.click(screen.getByRole('button', { name: '上传版本' }));
    await waitFor(() => expect(client.uploadSkillVersion).toHaveBeenCalledWith('s1', '1.0.0', expect.any(Uint8Array)));
    fireEvent.click(await screen.findByRole('button', { name: '发布版本' }));
    await waitFor(() => expect(client.publishSkillVersion).toHaveBeenCalledWith('s1', '1.0.0'));
  });

  test('withdraws a Skill version after confirmation and refreshes the list', async () => {
    const client = {
      resources: vi.fn()
        .mockResolvedValueOnce({
          users: [],
          teams: [],
          roles: [],
          permissions: [],
          skills: [{ id: 's1', name: '写作', description: '', enabled: true, versions: [{ version: '1.0.0', state: 'published', sha256: 'a'.repeat(64), size: 3 }] }],
          assignments: [],
        })
        .mockResolvedValue({ users: [], teams: [], roles: [], permissions: [], skills: [{ id: 's1', name: '写作', description: '', enabled: true, versions: [] }], assignments: [] }),
      deleteSkillVersion: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);
    expect(await screen.findByText('1.0.0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '撤回版本' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认撤回版本' }));
    await waitFor(() => expect(client.deleteSkillVersion).toHaveBeenCalledWith('s1', '1.0.0'));
    await waitFor(() => expect(client.resources).toHaveBeenCalledTimes(2));
  });

  test('grants a Skill to a role and a team', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({
        users: [],
        teams: [{ id: 'team-1', name: '平台组', description: '', builtIn: false, enabled: true, memberCount: 0 }],
        roles: [{ id: 'role-1', name: '编辑者', description: '', builtIn: false, enabled: true, permissions: [] }],
        permissions: [],
        skills: [{ id: 's1', name: '写作', enabled: true, versions: [] }],
        assignments: [],
      }),
      createSkillAssignment: vi.fn().mockResolvedValue(undefined),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Assignments} />);
    fireEvent.click((await screen.findAllByRole('button', { name: '授权 Skill' }))[0]!);
    fireEvent.click(await screen.findByRole('button', { name: '写作' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /编辑者/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /平台组/ }));
    fireEvent.click(screen.getByRole('button', { name: '授权' }));
    await waitFor(() => expect(client.createSkillAssignment).toHaveBeenCalledTimes(2));
    expect(client.createSkillAssignment).toHaveBeenCalledWith({ skillId: 's1', subject: { type: 'role', id: 'role-1' } });
    expect(client.createSkillAssignment).toHaveBeenCalledWith({ skillId: 's1', subject: { type: 'team', id: 'team-1' } });
  });

  test('maps the contract state field to the disabled Skill status', async () => {
    const client = {
      resources: vi.fn().mockResolvedValue({
        users: [],
        teams: [],
        roles: [],
        permissions: [],
        skills: [{ id: 's1', name: '已撤回 Skill', state: 'withdrawn', versions: [] }],
        assignments: [],
      }),
    };
    render(<Resources client={client as never} tab={AdminResourceTab.Skills} />);

    expect(await screen.findByText('已撤回 Skill')).toBeInTheDocument();
    expect(screen.getByText('停用')).toBeInTheDocument();
  });
});
