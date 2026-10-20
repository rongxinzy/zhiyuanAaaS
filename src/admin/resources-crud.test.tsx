// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { PlatformUser } from '@aep/sdk-node';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, expect, test, vi } from 'vitest';
import { renderWithQueryClient } from '../../tests/helpers/query-client.js';
import { AdminResourceTab, Resources } from './Resources.js';
import { AdjustOrgModal } from './resources-user-organization.js';
import { administratorIdentity } from './test-fixtures.js';

const user: PlatformUser & { email: null } = {
  id: 'user-multiple-teams',
  username: 'multiple-teams',
  displayName: '多团队用户',
  status: 'active',
  email: null,
  deploymentId: 'demo',
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
  roleIds: ['role-reader'],
  teamIds: ['team-a', 'team-b'],
};
const resources = {
  users: [user],
  permissions: [],
  skills: [],
  assignments: [],
  roles: [{ id: 'role-reader', name: '测试角色', description: '', enabled: true, builtIn: false, permissions: [] }],
  teams: [
    {
      id: 'team-a',
      name: '测试团队甲',
      description: '',
      path: '/team-a',
      depth: 0,
      enabled: true,
      builtIn: false,
      memberCount: 1,
    },
    {
      id: 'team-b',
      name: '测试团队乙',
      description: '',
      path: '/team-b',
      depth: 0,
      enabled: true,
      builtIn: false,
      memberCount: 1,
    },
  ],
};
function makeClient() {
  return {
    resources: vi.fn().mockResolvedValue(resources),
    models: vi.fn().mockResolvedValue({ models: [], assignments: [] }),
    updateUser: vi.fn<(id: string, patch: { displayName: string }) => Promise<void>>().mockResolvedValue(undefined),
    replaceUserRBAC: vi.fn().mockResolvedValue(undefined),
    updateTeam: vi.fn().mockResolvedValue(undefined),
  };
}
function renderList(client: ReturnType<typeof makeClient>, tab: AdminResourceTab = AdminResourceTab.Users) {
  return renderWithQueryClient(
    <ConfigProvider button={{ autoInsertSpace: false }} wave={{ disabled: true }}>
      <Resources client={client as never} identity={administratorIdentity} tab={tab} />
    </ConfigProvider>,
  );
}
async function editUser(client: ReturnType<typeof makeClient>) {
  renderList(client);
  await screen.findByText(user.displayName);
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  return screen.findByRole('dialog');
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});

test('saving an unchanged user preserves every team', async () => {
  const client = makeClient();
  const dialog = await editUser(client);
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(client.replaceUserRBAC).toHaveBeenCalledWith(user.id, {
      roleIds: user.roleIds,
      teamIds: user.teamIds,
    }),
  );
});

test('organization adjustment preserves all teams while replacing RBAC', async () => {
  const client = makeClient();
  const changed = vi.fn().mockResolvedValue(undefined);
  renderWithQueryClient(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <AdjustOrgModal
        client={client as never}
        user={user}
        roles={resources.roles}
        teams={resources.teams}
        open
        onOpenChange={vi.fn()}
        onChanged={changed}
        onError={vi.fn()}
      />
    </ConfigProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(client.replaceUserRBAC).toHaveBeenCalledWith(user.id, {
      roleIds: user.roleIds,
      teamIds: user.teamIds,
    }),
  );
});

test('removing a team is an explicit selection change', async () => {
  const client = makeClient();
  const dialog = await editUser(client);
  const chip = dialog.querySelector('.ant-select-selection-item[title="测试团队乙（team-b）"]');
  expect(chip).not.toBeNull();
  fireEvent.click(chip!.querySelector('.ant-select-selection-item-remove')!);
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(client.replaceUserRBAC).toHaveBeenCalledWith(user.id, {
      roleIds: user.roleIds,
      teamIds: ['team-a'],
    }),
  );
});

test('partial save refreshes the committed profile, keeps the form and supports retry', async () => {
  let storedName = user.displayName;
  const client = makeClient();
  client.resources.mockImplementation(async () => ({ ...resources, users: [{ ...user, displayName: storedName }] }));
  client.updateUser.mockImplementation(async (_id, patch) => {
    storedName = patch.displayName;
  });
  client.replaceUserRBAC.mockRejectedValueOnce(new Error('RBAC write denied'));
  const dialog = await editUser(client);
  fireEvent.change(within(dialog).getByLabelText('显示名称'), { target: { value: '已提交的新名称' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  const warning = await within(dialog).findByRole('alert');
  expect(warning).toHaveTextContent('用户资料已保存，角色与团队未保存');
  expect(storedName).toBe('已提交的新名称');
  await waitFor(() => expect(client.resources.mock.calls.length).toBeGreaterThan(1));
  expect(within(dialog).getByLabelText('显示名称')).toHaveValue('已提交的新名称');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await waitFor(() => expect(within(dialog).getByRole('button', { name: '保存' })).not.toHaveClass('ant-btn-loading'));
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() => expect(client.replaceUserRBAC).toHaveBeenCalledTimes(2));
  expect(client.replaceUserRBAC).toHaveBeenLastCalledWith(user.id, { roleIds: user.roleIds, teamIds: user.teamIds });
});

test('profile failure stops RBAC writes without claiming a partial commit', async () => {
  const client = makeClient();
  client.updateUser.mockRejectedValue(new Error('profile denied'));
  const dialog = await editUser(client);
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() => expect(client.updateUser).toHaveBeenCalled());
  await waitFor(() => expect(within(dialog).getByRole('button', { name: '保存' })).not.toHaveClass('ant-btn-loading'));
  expect(client.replaceUserRBAC).not.toHaveBeenCalled();
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
});

test('team owners are never read from browser storage or represented as persisted data', async () => {
  localStorage.setItem('admin-team-owners', JSON.stringify({ 'team-a': 'stale-other-account-owner' }));
  const client = makeClient();
  renderList(client, AdminResourceTab.Teams);
  await screen.findByText('测试团队甲');
  expect(screen.queryByText('stale-other-account-owner')).not.toBeInTheDocument();
  const row = screen.getByText('测试团队甲').closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: '编辑' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByLabelText('负责人')).toBeDisabled();
  expect(dialog).toHaveTextContent('当前服务未提供团队负责人接口');
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() => expect(client.updateTeam).toHaveBeenCalled());
  expect(client.updateTeam.mock.calls[0]?.[1]).not.toHaveProperty('ownerId');
  expect(localStorage.getItem('admin-team-owners')).toContain('stale-other-account-owner');
});
