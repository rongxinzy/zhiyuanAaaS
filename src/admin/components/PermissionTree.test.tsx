// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { PermissionTree } from './PermissionTree.js';

afterEach(cleanup);
const permissions = [
  { id: 'models.read', description: '读取模型' },
  { id: 'models.write', description: '修改模型' },
  { id: 'users.read', description: '读取用户' },
];
const checkbox = (name: string | RegExp) =>
  screen.getByRole('checkbox', { name: typeof name === 'string' ? new RegExp(`${name}$`) : name });

function Editor({ initial = [] }: { initial?: string[] }) {
  const [value, setValue] = useState(initial);
  return <PermissionTree permissions={permissions} value={value} onChange={setValue} />;
}

test('category checks and clears its leaves without changing another category; parents become mixed', () => {
  render(<Editor initial={['users.read']} />);
  expect(checkbox('全部权限')).toBePartiallyChecked();
  fireEvent.click(checkbox('模型管理'));
  expect(checkbox(/models.read/)).toBeChecked();
  expect(checkbox(/models.write/)).toBeChecked();
  expect(checkbox(/users.read/)).toBeChecked();
  expect(checkbox('全部权限')).toBeChecked();
  fireEvent.click(checkbox(/models.write/));
  expect(checkbox('模型管理')).toBePartiallyChecked();
  expect(checkbox('全部权限')).toBePartiallyChecked();
  fireEvent.click(checkbox('模型管理'));
  fireEvent.click(checkbox('模型管理'));
  expect(checkbox(/models.read/)).not.toBeChecked();
  expect(checkbox(/models.write/)).not.toBeChecked();
  expect(checkbox(/users.read/)).toBeChecked();
});

test('all checks and clears every leaf and only emits catalog IDs, even with a folder-like ID', () => {
  const onChange = vi.fn();
  const catalog = [...permissions, { id: '["all"]', description: '' }];
  const { rerender } = render(<PermissionTree permissions={catalog} onChange={onChange} />);
  fireEvent.click(checkbox('全部权限'));
  expect(onChange).toHaveBeenLastCalledWith(catalog.map((p) => p.id));
  rerender(<PermissionTree permissions={catalog} value={catalog.map((p) => p.id)} onChange={onChange} />);
  fireEvent.click(checkbox('全部权限'));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

test('missing catalog entries remain visible and selected until explicitly unchecked', () => {
  const onChange = vi.fn();
  render(
    <PermissionTree
      permissions={permissions}
      existingPermissions={['future.inspect']}
      value={['future.inspect']}
      onChange={onChange}
    />,
  );
  expect(checkbox(/future.inspect/)).toBeChecked();
  expect(screen.getByText(/当前权限目录未提供/)).toBeInTheDocument();
  fireEvent.click(checkbox('模型管理'));
  expect(new Set(onChange.mock.calls[0]![0])).toEqual(new Set(['future.inspect', 'models.read', 'models.write']));
  fireEvent.click(checkbox(/future.inspect/));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

test('supports English, unknown namespaces, no-dot IDs, and disabled checks', () => {
  const onChange = vi.fn();
  render(
    <PermissionTree
      language="en"
      permissions={[
        { id: 'custom.read', description: '' },
        { id: 'standalone', description: '' },
      ]}
      disabled
      onChange={onChange}
    />,
  );
  expect(screen.getAllByText('Other permissions')).toHaveLength(2);
  expect(screen.getByText('custom.read')).toBeInTheDocument();
  expect(screen.getAllByText('Unclassified permission')).toHaveLength(2);
  fireEvent.click(checkbox('All permissions'));
  expect(onChange).not.toHaveBeenCalled();
});

test('empty catalogs explain the empty state rather than offering an all checkbox', () => {
  render(<PermissionTree permissions={[]} />);
  expect(screen.getByText('暂无可选权限')).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

test('permission names use translations while operation IDs stay as secondary text to their right', () => {
  const catalog = [{ id: 'models.read', description: 'Server English description' }];
  const { rerender } = render(<PermissionTree permissions={catalog} />);
  expect(screen.getByText('查看模型')).toBeInTheDocument();
  const operation = screen.getByText('models.read');
  expect(operation).toHaveClass('ant-typography-secondary');
  expect(operation.previousElementSibling).toHaveTextContent('查看模型');
  expect(screen.queryByText('Server English description')).not.toBeInTheDocument();
  rerender(<PermissionTree permissions={catalog} language="en" />);
  expect(screen.getByText('View models')).toBeInTheDocument();
  expect(screen.getByText('models.read')).toHaveClass('ant-typography-secondary');
});
