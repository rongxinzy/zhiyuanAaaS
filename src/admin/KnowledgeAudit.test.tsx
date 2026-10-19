// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { AuditDirectory } from './audit-user.js';
import type { AdminConsoleClient } from './client.js';
import { KnowledgeAudit } from './KnowledgeAudit.js';
import type { PortalClient } from './portal.js';

afterEach(cleanup);
const client = {} as AdminConsoleClient;
/** 知识审计页签的用户目录由页面级共享，这里只验证收不到目录时如实按 ID 显示。 */
const directory: AuditDirectory = { users: null, load: async () => null };
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

test('keeps the route-selected base scope through filtering, pagination and reset', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ items: [row], nextCursor: '12' })
    .mockResolvedValue({ items: [], nextCursor: null });
  const portal = { knowledgeAudit: request } as unknown as PortalClient;
  const view = render(<KnowledgeAudit client={client} portal={portal} directory={directory} knowledgeBaseId="kb-1" />);
  await screen.findByText('知识库 / kb-1');
  expect(request).toHaveBeenLastCalledWith({ knowledgeBaseId: 'kb-1' }, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  await waitFor(() => expect(request).toHaveBeenLastCalledWith({ knowledgeBaseId: 'kb-1', cursor: '12' }));
  fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }));
  await waitFor(() => expect(request).toHaveBeenLastCalledWith({ knowledgeBaseId: 'kb-1' }, expect.any(AbortSignal)));
  view.rerender(<KnowledgeAudit client={client} portal={portal} directory={directory} knowledgeBaseId="kb-2" />);
  await waitFor(() => expect(request).toHaveBeenLastCalledWith({ knowledgeBaseId: 'kb-2' }, expect.any(AbortSignal)));
});

test('shows the Chinese action and result, filters and pages within Portal', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ items: [row], nextCursor: '12' })
    .mockResolvedValueOnce({
      items: [{ ...row, cursor: '11', operationId: 'kbop-create', outcome: 'succeeded' }],
      nextCursor: null,
    })
    .mockResolvedValue({ items: [], nextCursor: null });
  render(
    <KnowledgeAudit
      client={client}
      portal={{ knowledgeAudit: request } as unknown as PortalClient}
      directory={directory}
    />,
  );
  // 对象列按「中文资源类型 / 对象 ID」呈现，资源类型不再显示英文码。
  expect(await screen.findByText('知识库 / kb-1')).toBeInTheDocument();
  expect(screen.getByText('删除')).toBeInTheDocument();
  expect(screen.getByText('结果未知')).toBeInTheDocument();
  expect(screen.queryByText('delete')).not.toBeInTheDocument();
  expect(screen.queryByText('uncertain')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(await screen.findByText('已完成')).toBeInTheDocument();
  expect(request).toHaveBeenLastCalledWith({ cursor: '12' });
  // 检索主键是用户名/用户 ID：UUID 形态直接透传，不经过目录。
  const userId = '6f1c6d3a-0f4b-4c2e-9c1f-2f0f2d5b7a11';
  fireEvent.change(screen.getByLabelText('用户'), { target: { value: userId } });
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }));
  await waitFor(() => expect(request).toHaveBeenLastCalledWith({ actorUserId: userId }, expect.any(AbortSignal)));
  fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }));
  await waitFor(() => expect(screen.getByLabelText('用户')).toHaveValue(''));
});

test('refuses a username it cannot verify instead of querying it as an ID', async () => {
  const request = vi.fn().mockResolvedValue({ items: [row], nextCursor: null });
  render(
    <KnowledgeAudit
      client={client}
      portal={{ knowledgeAudit: request } as unknown as PortalClient}
      directory={directory}
    />,
  );
  await screen.findByText('知识库 / kb-1');
  const before = request.mock.calls.length;
  fireEvent.change(screen.getByLabelText('用户'), { target: { value: 'other-user' } });
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }));
  expect(await screen.findByText('用户目录不可用，无法校验用户名，请改用用户 ID 查询。')).toBeInTheDocument();
  expect(request.mock.calls.length).toBe(before);
});

test('keeps the raw codes in the technical details of the drawer', async () => {
  const request = vi.fn().mockResolvedValue({ items: [row], nextCursor: null });
  render(
    <KnowledgeAudit
      client={client}
      portal={{ knowledgeAudit: request } as unknown as PortalClient}
      directory={directory}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: '详情' }));
  expect(await screen.findByText('技术详情')).toBeInTheDocument();
  // 概览是中文，原始码、裸 ID 与原始 ISO 时间只留在技术详情。
  expect(screen.getAllByText('删除').length).toBeGreaterThan(0);
  expect(screen.getByText('delete')).toBeInTheDocument();
  expect(screen.getAllByText('知识库 / kb-1').length).toBeGreaterThan(0);
  expect(screen.getByText('2026-10-11T00:00:00Z')).toBeInTheDocument();
  expect(screen.getByText('记录序号')).toBeInTheDocument();
  expect(screen.getAllByText('操作编号').length).toBeGreaterThan(0);
  expect(screen.getByText('kbop-delete')).toBeInTheDocument();
  expect(screen.getByText('knowledge-base')).toBeInTheDocument();
  // 记录序号与操作标识不同名：序号是 cursor，只有失败行 payload 的 requestId 才叫操作标识。
  expect(screen.queryByText('操作标识')).not.toBeInTheDocument();
  expect(screen.getByText('无变更记录')).toBeInTheDocument();
});

test('reports read failure and supports explicit retry', async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error('Audit unavailable'))
    .mockResolvedValue({ items: [row], nextCursor: null });
  render(
    <KnowledgeAudit
      client={client}
      portal={{ knowledgeAudit: request } as unknown as PortalClient}
      directory={directory}
    />,
  );
  expect(await screen.findByText('Audit unavailable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
  expect(await screen.findByText('知识库 / kb-1')).toBeInTheDocument();
});

test('retains existing audit rows when pagination fails and reports unknown errors', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ items: [row], nextCursor: '12' })
    .mockRejectedValue('unavailable');
  render(
    <KnowledgeAudit
      client={client}
      portal={{ knowledgeAudit: request } as unknown as PortalClient}
      directory={directory}
    />,
  );
  expect(await screen.findByText('知识库 / kb-1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(await screen.findByText('知识审计读取失败')).toBeInTheDocument();
  expect(screen.getByText('知识库 / kb-1')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: /加载更多/ })).not.toHaveClass('ant-btn-loading'));
});

test('ignores a stale pagination response after resetting the filter', async () => {
  const pending = Promise.withResolvers<{ items: (typeof row)[]; nextCursor: null }>();
  const request = vi
    .fn()
    .mockResolvedValueOnce({ items: [row], nextCursor: '12' })
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue({ items: [], nextCursor: null });
  render(
    <KnowledgeAudit
      client={client}
      portal={{ knowledgeAudit: request } as unknown as PortalClient}
      directory={directory}
    />,
  );
  expect(await screen.findByText('知识库 / kb-1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  pending.resolve({ items: [{ ...row, operationId: 'stale-operation' }], nextCursor: null });
  await waitFor(() => expect(screen.queryByText('知识库 / kb-1')).not.toBeInTheDocument());
  expect(screen.queryByText('stale-operation')).not.toBeInTheDocument();
});
