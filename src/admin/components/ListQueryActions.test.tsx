// @vitest-environment jsdom
/**
 * 2026-09-30 LiXiang2019 ListQueryActions 单元测试：查询、重置、导出及 url 模式
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form, Input } from 'antd';
import { afterEach, expect, test, vi } from 'vitest';

import { ListQueryActions } from './ListQueryActions.js';

afterEach(cleanup);

/** 2026-09-30 LiXiang2019 测试用筛选表单挂载壳 */
function Harness({
  onSearch,
  onExport,
  onReset,
  searchUrl,
  exportUrl,
  request,
  initialValues,
  showReset,
}: {
  readonly onSearch?: (values: { q?: string }) => void | Promise<void>;
  readonly onExport?: (values: { q?: string }) => void | Promise<void>;
  readonly onReset?: () => void;
  readonly searchUrl?: string;
  readonly exportUrl?: string;
  readonly initialValues?: { q?: string };
  readonly showReset?: boolean;
  readonly request?: (input: {
    readonly url: string;
    readonly method: 'GET' | 'POST';
    readonly values: { q?: string };
  }) => void | Promise<void>;
}) {
  const [form] = Form.useForm<{ q?: string }>();
  return (
    <Form form={form} initialValues={initialValues ?? { q: 'alpha' }}>
      <Form.Item name="q" label="q">
        <Input aria-label="q" />
      </Form.Item>
      <ListQueryActions
        form={form}
        showReset={showReset}
        search={
          searchUrl && request
            ? { url: searchUrl, method: 'GET', request }
            : { run: onSearch ?? (async () => undefined) }
        }
        export={
          exportUrl && request ? { url: exportUrl, method: 'POST', request } : onExport ? { run: onExport } : undefined
        }
        onReset={onReset}
      />
    </Form>
  );
}

test('search validates the form and invokes the page-supplied run handler', async () => {
  const onSearch = vi.fn().mockResolvedValue(undefined);
  render(<Harness onSearch={onSearch} />);
  fireEvent.click(screen.getByRole('button', { name: /查询/ }));
  await waitFor(() => expect(onSearch).toHaveBeenCalledWith({ q: 'alpha' }));
});

test('reset clears form fields and calls onReset', async () => {
  const onReset = vi.fn();
  // The reset button only renders when the page opts in via showReset.
  render(<Harness onSearch={vi.fn()} onReset={onReset} initialValues={{}} showReset />);
  fireEvent.change(screen.getByLabelText('q'), { target: { value: 'alpha' } });
  expect(screen.getByLabelText('q')).toHaveValue('alpha');
  fireEvent.click(screen.getByRole('button', { name: /重置/ }));
  await waitFor(() => expect(screen.getByLabelText('q')).toHaveValue(''));
  expect(onReset).toHaveBeenCalledTimes(1);
});

test('export invokes the page-supplied run handler with current values', async () => {
  const onExport = vi.fn().mockResolvedValue(undefined);
  render(<Harness onSearch={vi.fn()} onExport={onExport} />);
  fireEvent.click(screen.getByRole('button', { name: /导出/ }));
  await waitFor(() => expect(onExport).toHaveBeenCalledWith({ q: 'alpha' }));
});

test('url mode forwards different endpoints through the shared request adapter', async () => {
  const request = vi.fn().mockResolvedValue(undefined);
  render(<Harness searchUrl="/aep/v1/users/search" exportUrl="/aep/v1/users/export" request={request} />);
  fireEvent.click(screen.getByRole('button', { name: /查询/ }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      url: '/aep/v1/users/search',
      method: 'GET',
      values: { q: 'alpha' },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: /导出/ }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      url: '/aep/v1/users/export',
      method: 'POST',
      values: { q: 'alpha' },
    }),
  );
});

test('hides export when no export action is provided', () => {
  render(<Harness onSearch={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /导出/ })).not.toBeInTheDocument();
});
