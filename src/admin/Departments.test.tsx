// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Departments } from './Departments.js';
import type { PortalDepartment } from './portal.js';

afterEach(cleanup);

const departments: readonly PortalDepartment[] = [
  { id: 'rd-dept', name: '研发部' },
  { id: 'sales-dept', name: '销售部' },
];

function makePortal(overrides: Record<string, unknown> = {}) {
  return {
    listDepartments: vi.fn().mockResolvedValue(departments),
    listDepartmentMembers: vi.fn().mockResolvedValue([{ userId: 'u1', username: 'zhangsan', displayName: '张三' }]),
    deleteDepartment: vi.fn().mockResolvedValue(undefined),
    createDepartment: vi.fn().mockResolvedValue({ phase: 'ready' }),
    renameDepartment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('departments management', () => {
  test('lists departments and opens the members drawer', async () => {
    const portal = makePortal();
    render(<Departments portal={portal as never} />);

    expect(await screen.findByText('研发部')).toBeInTheDocument();
    expect(screen.getByText('sales-dept')).toBeInTheDocument();
    expect(portal.listDepartments).toHaveBeenCalledTimes(1);

    const row = screen.getByRole('row', { name: /研发部/ });
    fireEvent.click(within(row).getAllByRole('button')[0]!);
    const drawer = await screen.findByRole('dialog');
    await waitFor(() => expect(within(drawer).getByText('张三')).toBeInTheDocument());
    expect(portal.listDepartmentMembers).toHaveBeenCalledWith('rd-dept');
  });

  test('creates a department through the modal and reloads', async () => {
    const portal = makePortal();
    render(<Departments portal={portal as never} />);
    await screen.findByText('研发部');

    fireEvent.click(screen.getByRole('button', { name: /创建部门/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/部门 ID|ID/), { target: { value: 'ops-dept' } });
    fireEvent.change(within(dialog).getByLabelText(/部门名称/), { target: { value: '运维部' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /确 定|OK/i }));

    await waitFor(() => expect(portal.createDepartment).toHaveBeenCalledWith('ops-dept', '运维部'));
    await waitFor(() => expect(portal.listDepartments).toHaveBeenCalledTimes(2));
  });

  test('renames a department through the modal', async () => {
    const portal = makePortal();
    render(<Departments portal={portal as never} />);
    await screen.findByText('研发部');

    const row = screen.getByRole('row', { name: /研发部/ });
    fireEvent.click(within(row).getAllByRole('button')[1]!);
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(/部门名称/);
    fireEvent.change(input, { target: { value: '平台研发部' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /确 定|OK/i }));

    await waitFor(() => expect(portal.renameDepartment).toHaveBeenCalledWith('rd-dept', '平台研发部'));
  });

  test('deletes a department after confirmation and reloads', async () => {
    const portal = makePortal();
    render(<Departments portal={portal as never} />);
    await screen.findByText('研发部');

    const row = screen.getByRole('row', { name: /研发部/ });
    fireEvent.click(within(row).getAllByRole('button')[2]!);
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: /确 定|OK/i }));

    await waitFor(() => expect(portal.deleteDepartment).toHaveBeenCalledWith('rd-dept'));
    await waitFor(() => expect(portal.listDepartments).toHaveBeenCalledTimes(2));
  });

  test('shows the load error when listing fails', async () => {
    const portal = makePortal({
      listDepartments: vi.fn().mockRejectedValue(new Error('HTTP 503')),
    });
    render(<Departments portal={portal as never} />);
    expect(await screen.findByText('HTTP 503')).toBeInTheDocument();
  });

  test('create modal surfaces the portal failure message', async () => {
    const portal = makePortal({
      createDepartment: vi.fn().mockResolvedValue({ kind: 'rejected', message: 'weknora: down' }),
    });
    render(<Departments portal={portal as never} />);
    await screen.findByText('研发部');

    fireEvent.click(screen.getByRole('button', { name: /创建部门/ }));
    await screen.findByLabelText(/部门 ID|ID/);
    fireEvent.change(screen.getByLabelText(/部门 ID|ID/), { target: { value: 'ops-dept' } });
    fireEvent.change(screen.getByLabelText(/部门名称/), { target: { value: '运维部' } });
    fireEvent.click(screen.getAllByRole('button', { name: /确 定|OK/i }).at(-1)!);

    expect(await screen.findByText('weknora: down')).toBeInTheDocument();
  });
});
