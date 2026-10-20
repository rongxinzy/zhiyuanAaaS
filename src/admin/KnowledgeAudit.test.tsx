// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { renderWithQueryClient, withQueryClient } from '../../tests/helpers/query-client.js';
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
  const view = renderWithQueryClient(
    <KnowledgeAudit client={client} portal={portal} directory={directory} knowledgeBaseId="kb-1" />,
  );
  await screen.findByText('知识库 / kb-1');
  expect(request).toHaveBeenLastCalledWith({ knowledgeBaseId: 'kb-1' }, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  await waitFor(() => expect(request).toHaveBeenLastCalledWith({ knowledgeBaseId: 'kb-1', cursor: '12' }));
  fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }));
  await waitFor(() => expect(request).toHaveBeenLastCalledWith({ knowledgeBaseId: 'kb-1' }, expect.any(AbortSignal)));
  view.rerender(
    withQueryClient(
      <KnowledgeAudit client={client} portal={portal} directory={directory} knowledgeBaseId="kb-2" />,
      view.queryClient,
    ),
  );
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
  renderWithQueryClient(
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
  renderWithQueryClient(
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
  renderWithQueryClient(
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

test('renders real knowledge codes in Chinese and keeps the raw codes in the technical details', async () => {
  const rows = [
    {
      ...row,
      cursor: '13',
      operationId: 'kbop-upload',
      action: 'upload_file',
      resourceType: 'chunk',
      resourceId: 'chunk-1',
      outcome: 'conflict',
    },
    {
      ...row,
      cursor: '12',
      operationId: 'kbop-cancel',
      action: 'cancel_parse',
      resourceType: 'document_batch',
      resourceId: 'doc-1',
      outcome: 'uncertain',
    },
  ];
  const request = vi.fn().mockResolvedValue({ items: rows, nextCursor: null });
  renderWithQueryClient(
    <KnowledgeAudit
      client={client}
      portal={{ knowledgeAudit: request } as unknown as PortalClient}
      directory={directory}
    />,
  );
  // 列表必须是中文：整段蛇形动作、资源类型与 409 冲突结果都不留英文码。
  expect(await screen.findByText('上传文件')).toBeInTheDocument();
  expect(screen.getByText('取消解析')).toBeInTheDocument();
  expect(screen.getByText('分块 / chunk-1')).toBeInTheDocument();
  expect(screen.getByText('文档（批量） / doc-1')).toBeInTheDocument();
  expect(screen.getByText('冲突')).toBeInTheDocument();
  expect(screen.queryByText('upload_file')).not.toBeInTheDocument();
  expect(screen.queryByText('cancel_parse')).not.toBeInTheDocument();
  expect(screen.queryByText('conflict')).not.toBeInTheDocument();
  // 技术详情仍是原码：抽屉里保留动作与资源类型的原始码。
  fireEvent.click(screen.getAllByRole('button', { name: '详情' })[0]!);
  expect(await screen.findByText('技术详情')).toBeInTheDocument();
  expect(screen.getByText('kbop-upload')).toBeInTheDocument();
  expect(screen.getByText('upload_file')).toBeInTheDocument();
  expect(screen.getByText('chunk')).toBeInTheDocument();
  // 概览同时给出中文，原始码不回流到列表与概览。
  expect(screen.getAllByText('上传文件').length).toBeGreaterThan(1);
});

test('reports read failure and supports explicit retry', async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error('Audit unavailable'))
    .mockResolvedValue({ items: [row], nextCursor: null });
  renderWithQueryClient(
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
  renderWithQueryClient(
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

test('refresh with unchanged filters drops appended rows even when the first page is shared', async () => {
  // 条件不变点查询即显式刷新：刷新响应与第一页深相等（同一 mock 数据，结构共享
  // 保持同一引用）时，已追加的页与游标也必须作废。
  const firstPage = { items: [row], nextCursor: '12' };
  const request = vi
    .fn()
    .mockResolvedValueOnce(firstPage)
    .mockResolvedValueOnce({ items: [{ ...row, cursor: '11', resourceId: 'kb-2' }], nextCursor: null })
    .mockResolvedValue(firstPage);
  renderWithQueryClient(
    <KnowledgeAudit
      client={client}
      portal={{ knowledgeAudit: request } as unknown as PortalClient}
      directory={directory}
    />,
  );
  expect(await screen.findByText('知识库 / kb-1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(await screen.findByText('知识库 / kb-2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }));
  await waitFor(() => expect(screen.queryByText('知识库 / kb-2')).not.toBeInTheDocument());
  expect(screen.getByText('知识库 / kb-1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  await waitFor(() => expect(request).toHaveBeenLastCalledWith({ cursor: '12' }));
});

test('ignores a stale pagination response after resetting the filter', async () => {
  const pending = Promise.withResolvers<{ items: (typeof row)[]; nextCursor: null }>();
  const request = vi
    .fn()
    .mockResolvedValueOnce({ items: [row], nextCursor: '12' })
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue({ items: [], nextCursor: null });
  renderWithQueryClient(
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
