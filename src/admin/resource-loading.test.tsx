// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import type { ReactElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderWithQueryClient } from '../../tests/helpers/query-client.js';
import { Models } from './Models.js';
import { AdminResourceTab, Resources } from './Resources.js';
import { administratorIdentity } from './test-fixtures.js';

const directory = {
  users: [
    { id: 'user-one', username: 'user-one', displayName: '可用的用户', status: 'active', roleIds: [], teamIds: [] },
  ],
  teams: [{ id: 'team-one', name: '可用的团队', enabled: true, memberCount: 1, defaultRoleIds: [] }],
  roles: [{ id: 'role-one', name: '可用的角色', enabled: true, permissions: [] }],
  permissions: [],
  skills: [],
  assignments: [],
};
function fixture() {
  return {
    resources: vi.fn().mockResolvedValue(directory),
    models: vi
      .fn()
      .mockResolvedValue({ models: [{ id: 'model-one', displayName: '可用的模型', enabled: true }], assignments: [] }),
    dataPlane: vi.fn().mockResolvedValue({
      desired: { revision: 'r1', routes: [] },
      status: { state: 'pending', observedRevision: null },
    }),
  };
}
function render(ui: ReactElement) {
  return renderWithQueryClient(
    <ConfigProvider button={{ autoInsertSpace: false }} wave={{ disabled: true }}>
      {ui}
    </ConfigProvider>,
  );
}
afterEach(() => cleanup());

test.each([
  [AdminResourceTab.Users, '可用的用户'],
  [AdminResourceTab.Teams, '可用的团队'],
  [AdminResourceTab.Roles, '可用的角色'],
] as const)('%s list survives a model endpoint outage and retries independently', async (tab, label) => {
  const client = fixture();
  client.models.mockRejectedValueOnce(new Error('model endpoint unavailable'));
  render(<Resources client={client as never} identity={administratorIdentity} tab={tab} />);
  expect(await screen.findByText(label)).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('部分关联数据加载失败');
  expect(screen.queryByText('资源加载失败')).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '重试' }));
  await waitFor(() => expect(client.models).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test('a pending model request cannot hold the user list loading', async () => {
  const client = fixture();
  let resolve!: (value: unknown) => void;
  client.models.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<Resources client={client as never} identity={administratorIdentity} tab={AdminResourceTab.Users} />);
  expect(await screen.findByText('可用的用户')).toBeInTheDocument();
  await act(async () => resolve({ models: [], assignments: [] }));
});

test('missing team data keeps the user list but prevents membership edits', async () => {
  const client = fixture();
  client.resources.mockResolvedValue({ ...directory, teams: [], unavailable: ['teams'] } as never);
  render(<Resources client={client as never} identity={administratorIdentity} tab={AdminResourceTab.Users} />);
  expect(await screen.findByText('可用的用户')).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('部分关联数据加载失败');
  expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
});

test('missing users do not become zero team membership counts', async () => {
  const client = fixture();
  client.resources.mockResolvedValue({ ...directory, users: [], unavailable: ['users'] } as never);
  render(<Resources client={client as never} identity={administratorIdentity} tab={AdminResourceTab.Teams} />);
  expect(await screen.findByText('可用的团队')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '关联数据不可用' })).toBeDisabled();
});

test('model catalog survives a directory outage while dependent assignments are unavailable', async () => {
  const client = fixture();
  client.resources.mockRejectedValueOnce(new Error('directory unavailable'));
  render(<Models client={client as never} identity={administratorIdentity} />);
  expect(await screen.findByText('可用的模型')).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('部分关联数据加载失败');
  expect(screen.queryByRole('button', { name: /分配模型/ })).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '重试' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /分配模型/ })).toBeInTheDocument());
});
