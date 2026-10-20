import { expect, test, vi } from 'vitest';
import { createResourcesApi } from './client-resources.js';
import { administratorIdentity } from './test-fixtures.js';

function fixture() {
  const sdk = { listPermissions: vi.fn().mockResolvedValue({ permissions: [] }) };
  const context = {
    requireClient: () => sdk,
    listAllUsers: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
    listAllTeams: vi.fn().mockResolvedValue([{ id: 'team-1' }]),
    listAllRoles: vi.fn().mockResolvedValue([{ id: 'role-1' }]),
    listAllSkills: vi.fn().mockResolvedValue({ skills: [] }),
    request: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  };
  return { sdk, context, api: createResourcesApi(context as never) };
}

test('a scoped user list survives a failed auxiliary skill catalog without claiming an empty catalog', async () => {
  const { context, api } = fixture();
  context.listAllSkills.mockRejectedValue(new Error('skill service unavailable'));
  const result = await api.resources(administratorIdentity, 'users');
  expect(result.users).toEqual([{ id: 'user-1' }]);
  expect(result.teams).toEqual([{ id: 'team-1' }]);
  expect(result.unavailable).toEqual(['skills']);
});
test('the primary collection still fails visibly', async () => {
  const { context, api } = fixture();
  context.listAllUsers.mockRejectedValue(new Error('users unavailable'));
  await expect(api.resources(administratorIdentity, 'users')).rejects.toThrow('users unavailable');
});
test('legacy aggregate consumers still require complete data', async () => {
  const { context, api } = fixture();
  context.listAllSkills.mockRejectedValue(new Error('skills unavailable'));
  await expect(api.resources(administratorIdentity)).rejects.toThrow('skills unavailable');
});
test('a model assignment directory does not query unrelated skills, permissions or grants', async () => {
  const { sdk, context, api } = fixture();
  const result = await api.resources(administratorIdentity, 'directory');
  expect(result.users).toHaveLength(1);
  expect(result.roles).toHaveLength(1);
  expect(result.teams).toHaveLength(1);
  expect(context.listAllSkills).not.toHaveBeenCalled();
  expect(sdk.listPermissions).not.toHaveBeenCalled();
  expect(context.request).not.toHaveBeenCalled();
});
test('an incomplete assignment directory cannot be used as complete data', async () => {
  const { context, api } = fixture();
  context.listAllRoles.mockRejectedValue(new Error('roles unavailable'));
  await expect(api.resources(administratorIdentity, 'directory')).rejects.toThrow('roles unavailable');
});
test('permission checks still precede all directory requests', async () => {
  const { sdk, context, api } = fixture();
  const result = await api.resources({ ...administratorIdentity, roles: [], permissions: ['users.read'] }, 'users');
  expect(result.users).toHaveLength(1);
  expect(context.listAllTeams).not.toHaveBeenCalled();
  expect(context.listAllRoles).not.toHaveBeenCalled();
  expect(context.listAllSkills).not.toHaveBeenCalled();
  expect(sdk.listPermissions).not.toHaveBeenCalled();
  expect(context.request).not.toHaveBeenCalled();
});
