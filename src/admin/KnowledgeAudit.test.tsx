// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { AdminConsoleClient } from './client.js';
import { KnowledgeAudit } from './KnowledgeAudit.js';
import type { PortalClient } from './portal.js';

afterEach(cleanup);
const client = {} as AdminConsoleClient;
const row = {
  cursor: '12',
  operationId: 'kbop-delete',
  actorUserId: 'admin-1',
  action: 'delete',
  resourceType: 'knowledge-base',
  resourceId: 'kb-1',
  parentResourceId: '',
  outcome: 'uncertain',
  statusCode: 502,
  createdAt: '2026-10-11T00:00:00Z',
};

test('shows real actor and uncertain result, filters and pages within Portal', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ items: [row], nextCursor: '12' })
    .mockResolvedValueOnce({
      items: [{ ...row, cursor: '11', operationId: 'kbop-create', outcome: 'succeeded' }],
      nextCursor: null,
    })
    .mockResolvedValue({ items: [], nextCursor: null });
  render(<KnowledgeAudit client={client} portal={{ knowledgeAudit: request } as unknown as PortalClient} />);
  expect(await screen.findByText('kbop-delete')).toBeInTheDocument();
  expect(screen.getByText('admin-1')).toBeInTheDocument();
  expect(screen.getByText('uncertain')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(await screen.findByText('kbop-create')).toBeInTheDocument();
  expect(request).toHaveBeenLastCalledWith({ cursor: '12' });
  fireEvent.change(screen.getByLabelText('操作人 ID'), { target: { value: 'other-user' } });
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }));
  await waitFor(() =>
    expect(request).toHaveBeenLastCalledWith(
      { actorUserId: 'other-user', operationId: undefined },
      expect.any(AbortSignal),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }));
  await waitFor(() => expect(screen.getByLabelText('操作人 ID')).toHaveValue(''));
});

test('reports read failure and supports explicit retry', async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error('Audit unavailable'))
    .mockResolvedValue({ items: [row], nextCursor: null });
  render(<KnowledgeAudit client={client} portal={{ knowledgeAudit: request } as unknown as PortalClient} />);
  expect(await screen.findByText('Audit unavailable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
  expect(await screen.findByText('kbop-delete')).toBeInTheDocument();
});

test('retains existing audit rows when pagination fails and reports unknown errors', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ items: [row], nextCursor: '12' })
    .mockRejectedValue('unavailable');
  render(<KnowledgeAudit client={client} portal={{ knowledgeAudit: request } as unknown as PortalClient} />);
  expect(await screen.findByText('kbop-delete')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(await screen.findByText('知识审计读取失败')).toBeInTheDocument();
  expect(screen.getByText('kbop-delete')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: /加载更多/ })).not.toHaveClass('ant-btn-loading'));
});

test('ignores a stale pagination response after resetting the filter', async () => {
  let finish: ((value: { items: (typeof row)[]; nextCursor: null }) => void) | undefined;
  const pending = new Promise<{ items: (typeof row)[]; nextCursor: null }>((resolve) => {
    finish = resolve;
  });
  const request = vi
    .fn()
    .mockResolvedValueOnce({ items: [row], nextCursor: '12' })
    .mockReturnValueOnce(pending)
    .mockResolvedValue({ items: [], nextCursor: null });
  render(<KnowledgeAudit client={client} portal={{ knowledgeAudit: request } as unknown as PortalClient} />);
  expect(await screen.findByText('kbop-delete')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  finish?.({ items: [{ ...row, operationId: 'stale-operation' }], nextCursor: null });
  await waitFor(() => expect(screen.queryByText('kbop-delete')).not.toBeInTheDocument());
  expect(screen.queryByText('stale-operation')).not.toBeInTheDocument();
});
