/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, expect, test, vi } from 'vitest';
import { renderWithQueryClient } from '../../tests/helpers/query-client.js';
import { GatewayUserSelect } from './GatewayUserSelect.js';

afterEach(cleanup);
const users = [
  { id: 'u1', username: 'alice', displayName: '张甲', teamIds: ['sales'], roleIds: ['member'] },
  { id: 'u2', username: 'bob', displayName: '李乙', teamIds: ['sales', 'ops'], roleIds: ['admin'] },
  { id: 'u3', username: 'carol', displayName: '王丙', teamIds: ['ops'], roleIds: ['member'] },
  { id: 'u4', username: 'dave', displayName: '赵丁', teamIds: [], roleIds: [] },
];
const teams = [
  { id: 'sales', name: '销售团队' },
  { id: 'ops', name: '运营团队' },
];
const roles = [
  { id: 'member', name: '成员角色' },
  { id: 'admin', name: '管理员角色' },
];
function setup(extra = {}) {
  const onChange = vi.fn();
  renderWithQueryClient(
    <ConfigProvider>
      <GatewayUserSelect users={users} teams={teams} roles={roles} aria-label="用户" onChange={onChange} {...extra} />
    </ConfigProvider>,
  );
  return onChange;
}
async function open(label: string) {
  const input = screen.getByRole('combobox', { name: label });
  fireEvent.mouseDown(input);
  return waitFor(() => {
    const list = document.getElementById(input.getAttribute('aria-controls') ?? '');
    const menu = list?.closest('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    expect(menu).toBeTruthy();
    return menu!;
  });
}
async function select(label: string, text: string) {
  const menu = await open(label);
  const option = await waitFor(() => {
    const node = [...menu.querySelectorAll('.ant-select-item-option')].find((node) => node.textContent === text);
    expect(node).toBeTruthy();
    return node!;
  });
  fireEvent.click(option);
  fireEvent.keyDown(screen.getByRole('combobox', { name: label }), { key: 'Escape' });
}
async function visibleUsers() {
  const menu = await open('用户');
  return [...menu.querySelectorAll('.ant-select-item-option-content')].map((option) => option.textContent);
}

test('username search remains case-insensitive when the display name is different', async () => {
  const onChange = setup();
  await open('用户');
  fireEvent.change(screen.getByRole('combobox', { name: '用户' }), { target: { value: 'ALICE' } });
  await waitFor(() =>
    expect(
      document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'),
    ).toHaveLength(1),
  );
  await select('用户', '张甲 (alice)');
  expect(onChange).toHaveBeenCalledWith('u1');
});

test('teams are ORed within the filter and intersect with roles; clearing restores all users', async () => {
  setup();
  await select('筛选团队', '销售团队');
  await select('筛选团队', '运营团队');
  await select('筛选角色', '成员角色');
  expect(await visibleUsers()).toEqual(['张甲 (alice)', '王丙 (carol)']);
  fireEvent.keyDown(screen.getByRole('combobox', { name: '用户' }), { key: 'Escape' });
  await select('筛选团队', '销售团队');
  expect(await visibleUsers()).toEqual(['王丙 (carol)']);
  fireEvent.keyDown(screen.getByRole('combobox', { name: '用户' }), { key: 'Escape' });
  await select('筛选团队', '运营团队');
  await select('筛选角色', '成员角色');
  expect(await visibleUsers()).toHaveLength(4);
});

test('changing filters clears an excluded selection but retains a matching user', async () => {
  const onChange = setup({ value: 'u1' });
  await select('筛选团队', '销售团队');
  expect(onChange).not.toHaveBeenCalled();
  await select('筛选角色', '管理员角色');
  expect(onChange).toHaveBeenCalledWith(undefined);
  expect(await visibleUsers()).toEqual(['李乙 (bob)']);
});

test('no matches are explicit and loading or disabled selection cannot be changed', async () => {
  setup();
  await select('筛选团队', '运营团队');
  await select('筛选角色', '管理员角色');
  await open('用户');
  fireEvent.change(screen.getByRole('combobox', { name: '用户' }), { target: { value: 'alice' } });
  expect(await screen.findByText('没有符合条件的用户')).toBeInTheDocument();
  cleanup();
  setup({ loading: true });
  for (const input of screen.getAllByRole('combobox')) expect(input).toBeDisabled();
  cleanup();
  setup({ disabled: true });
  for (const input of screen.getAllByRole('combobox')) expect(input).toBeDisabled();
});
