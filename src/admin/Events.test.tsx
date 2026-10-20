// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  auditCodeLabel,
  changeFieldLabel,
  changeValueText,
  deliveryStateLabel,
  objectText,
  reasonLabel,
  resultLabel,
} from './audit-labels.js';
import { type AdminAuditPage, type AdminAuditRecord, type AdminEventRecord, AdminRequestError } from './client.js';
import { Events } from './Events.js';
import { formatTimestampSeconds } from './format.js';
import { administratorIdentity } from './test-fixtures.js';

afterEach(cleanup);
function render(ui: ReactNode) {
  return rtlRender(<ConfigProvider button={{ autoInsertSpace: false }}>{ui}</ConfigProvider>);
}

const auditRow = (overrides: Partial<AdminAuditRecord> = {}): AdminAuditRecord => ({
  cursor: '9',
  actorUserId: 'user-a',
  action: 'model.update',
  resourceType: 'model',
  resourceId: 'm1',
  result: 'success',
  createdAt: '2026-10-14T00:00:00Z',
  ...overrides,
});

const auditPage = (overrides: Partial<AdminAuditPage> = {}): AdminAuditPage => ({
  items: [auditRow()],
  nextCursor: null,
  timeRange: { after: '2026-10-08T00:00:00Z', before: null },
  ...overrides,
});

function fixture() {
  return {
    searchAudit: vi.fn().mockResolvedValue({
      items: [
        {
          eventId: 'e1',
          type: 'skill.changed',
          userId: 'user-a',
          resourceType: 'skill',
          resourceId: 'test2',
          result: 'success',
        },
      ],
      nextCursor: null,
    }),
    controlEvents: vi.fn().mockResolvedValue({
      items: [
        {
          eventId: 'control-1',
          type: 'model.catalog.changed',
          state: 'active',
          createdBy: 'user-a',
          createdAt: '2026-10-12T00:00:00Z',
          resource: { type: 'model', id: 'm1', revision: 'r1' },
          deliverySummary: { pending: 0, received: 0, running: 0, succeeded: 2, failed: 1, expired: 0, superseded: 0 },
        },
      ],
      nextCursor: null,
    }),
    deliverySummary: vi.fn().mockResolvedValue({
      items: [
        {
          deliveryId: 'd1',
          eventId: 'control-1',
          state: 'failed',
          attemptCount: 2,
        },
      ],
      nextCursor: null,
    }),
    searchAuthenticationAudit: vi.fn().mockResolvedValue({
      items: [
        {
          cursor: '7',
          userId: 'user-a',
          eventType: 'login.failed',
          outcome: 'failure',
          reason: 'invalid_credentials',
          sourceHash: 'abcdef0123456789',
          createdAt: '2026-10-10T00:00:00Z',
        },
      ],
      nextCursor: null,
    }),
    publishControlEvent: vi.fn(),
    cancelControlEvent: vi.fn(),
    searchAdminAudit: vi.fn().mockResolvedValue(auditPage()),
    users: vi
      .fn()
      .mockResolvedValue([
        { id: 'user-a', username: 'zhangsan', displayName: '张三', kind: 'human', status: 'active' },
      ]),
  };
}

describe('audit terminology', () => {
  test('maps known results, resources, actions and event codes to Chinese', () => {
    expect(resultLabel('success')).toBe('成功');
    expect(resultLabel('failure')).toBe('失败');
    expect(resultLabel('denied')).toBe('已拒绝');
    expect(resultLabel('pending')).toBe('待处理');
    expect(resultLabel('accepted')).toBe('已受理');
    expect(resultLabel('succeeded')).toBe('已完成');
    expect(resultLabel('uncertain')).toBe('结果未知');
    expect(resultLabel('unverified')).toBe('未核实');
    expect(deliveryStateLabel('pending')).toBe('待投递');
    expect(deliveryStateLabel('succeeded')).toBe('已投递');
    expect(deliveryStateLabel('failed')).toBe('失败');
    expect(deliveryStateLabel('expired')).toBe('已过期');
    expect(deliveryStateLabel('superseded')).toBe('已被取代');
    expect(deliveryStateLabel('active')).toBe('生效中');
    expect(auditCodeLabel('skill.updated')).toBe('技能更新');
    expect(auditCodeLabel('model.catalog.changed')).toBe('模型目录变更');
    expect(auditCodeLabel('skill.version.published')).toBe('技能版本发布');
    expect(auditCodeLabel('skill.version.uploaded')).toBe('技能版本上传');
    // 中间段未登记时不猜首尾：quota 不是资源键，gateway_quota 才是。
    expect(auditCodeLabel('gateway.quota.updated')).toBeNull();
    expect(reasonLabel('invalid_credentials')).toBe('凭证无效');
    expect(reasonLabel('unknown_reason_code')).toBe('unknown_reason_code');
    expect(reasonLabel('failure_limit_reached')).toBe('失败次数达上限');
    expect(reasonLabel('backoff_active')).toBe('登录冷却中');
    expect(auditCodeLabel('update')).toBe('更新');
    expect(auditCodeLabel('reset_password')).toBe('重置密码');
    expect(objectText('skill', 'test2')).toBe('技能 / test2');
    // 实码：整段蛇形动作（知识审计没有点分隔）与 409 冲突结果。
    expect(auditCodeLabel('upload_file')).toBe('上传文件');
    expect(auditCodeLabel('cancel_parse')).toBe('取消解析');
    expect(objectText('chunk', 'c1')).toBe('分块 / c1');
    expect(resultLabel('conflict')).toBe('冲突');
    // 点分隔形态同样成立：资源 + 动作尾段。
    expect(auditCodeLabel('document.read_chunks')).toBe('文档读取分块');
    // 英文表同样维护完整，术语不会只剩中文。
    expect(resultLabel('success', 'en')).toBe('Success');
    expect(auditCodeLabel('model.catalog.changed', 'en')).toBe('Model catalog changed');
    expect(objectText('skill', 'test2', 'en')).toBe('Skill / test2');
  });

  test('maps every real portal and control-plane code to Chinese', () => {
    // 清单取自 portal `beginManagedAudit` 的实际调用点（knowledge_managed*.go、knowledge_grants.go、
    // knowledge_runtime_context.go）与后台管理审计的 `adminAuditResourceType`。
    for (const code of [
      'upload_file',
      'create_url',
      'create_manual',
      'cancel_parse',
      'delete_document',
      'set_enabled',
      'read_preview',
      'read_download',
      'read_chunks',
      'read_spans',
      'read_chunk_image',
      'update_chunk',
      'replace_grants',
      'list_grants',
      'create_tag',
      'update_tag',
      'delete_tag',
      'list_tags',
      'list_folders',
      'move_documents',
      'rename_folder',
      'update_document_tags',
      'list_faq',
      'create_faq',
      'update_faq',
      'update_faq_fields',
      'update_faq_tags',
      'delete_faq_entries',
      'employee_search',
      'employee_read_source',
      'runtime_search',
      'runtime_list_bases',
      'runtime_read_base',
      'runtime_list_documents',
      'runtime_read_document',
      'runtime_read_chunks',
      'runtime_wiki_search',
      'runtime_wiki_read_page',
      'runtime_wiki_index',
      'runtime_read',
    ] as const) {
      const label = auditCodeLabel(code);
      expect(label, code).not.toBeNull();
      expect(label, code).not.toBe(code);
      // 英文表同步登记，英文界面不会退回原码。
      expect(auditCodeLabel(code, 'en'), code).not.toBeNull();
    }
    for (const type of [
      'chunk',
      'document_batch',
      'faq_entry',
      'faq_batch',
      'knowledge_tag',
      'knowledge_folder',
      'knowledge_scope',
      'knowledge-base',
      'knowledge_base',
      'user_rbac',
      'model_assignment',
      'skill_assignment',
      'credential_assignment',
      'data_plane',
      'deployment_settings',
      'compute_assignment',
      'compute_tier',
      'gateway',
      'gateway_model',
      'gateway_quota',
      'gateway_limit',
    ] as const) {
      // 资源类型未登记时对象列会原样显示英文码，这里逐一确认已经登记。
      expect(objectText(type, 'x1'), type).not.toBe(`${type} / x1`);
    }
  });

  test('leaves unknown codes and values exactly as they came', () => {
    // 未知事件码原样显示英文码，不写「未知类型」，也不拼半个中文。
    expect(auditCodeLabel('stale.event')).toBeNull();
    expect(auditCodeLabel('device.approved')).toBeNull();
    expect(auditCodeLabel('mystery')).toBeNull();
    expect(auditCodeLabel()).toBeNull();
    expect(resultLabel('weird')).toBe('weird');
    expect(resultLabel()).toBeNull();
    expect(deliveryStateLabel('applied')).toBe('applied');
    expect(objectText('unknown_type', 'x1')).toBe('unknown_type / x1');
    expect(objectText()).toBeNull();
    expect(objectText('skill')).toBe('技能');
  });

  test('annotates known change payload keys and enums, and keeps unknown ones raw', () => {
    expect(changeFieldLabel('displayName')).toBe('显示名称');
    expect(changeFieldLabel('roleIds')).toBe('角色');
    expect(changeFieldLabel('customKey')).toBe('customKey');
    expect(changeValueText('status', 'active')).toBe('启用(active)');
    expect(changeValueText('status', 'disabled')).toBe('停用(disabled)');
    expect(changeValueText('customKey', 'active')).toBe('"active"');
    expect(changeValueText('displayName', '张三')).toBe('"张三"');
  });
});

describe('read-only audit', () => {
  test('loads records by default and never offers protocol mutations', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    expect(await screen.findByText('技能变更')).toBeInTheDocument();
    expect(client.searchAudit).toHaveBeenCalledWith({ limit: 50 });
    expect(screen.queryByRole('button', { name: /发布事件|取消事件/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    expect(await screen.findByText('记录标识')).toBeInTheDocument();
    expect(screen.getByText('e1')).toBeInTheDocument();
    // 原始事件码与原始时间只留在技术详情。
    expect(screen.getByText('skill.changed')).toBeInTheDocument();
    expect(screen.getAllByText('未记录').length).toBeGreaterThan(0);
    expect(client.publishControlEvent).not.toHaveBeenCalled();
  });
  test('filters and cursor-paginates the same query', async () => {
    const client = fixture();
    client.searchAudit
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({
        items: [{ eventId: 'e2', type: 'model.changed' }],
        nextCursor: 'next',
      })
      .mockResolvedValueOnce({
        items: [{ eventId: 'e3', type: 'model.failed' }],
        nextCursor: null,
      });
    render(<Events client={client as never} identity={administratorIdentity} />);
    await screen.findByText('当前条件下暂无记录');
    fireEvent.change(screen.getByLabelText('操作类型'), {
      target: { value: 'model' },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /查询/ })).not.toHaveClass('ant-btn-loading'));
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    expect(await screen.findByText('模型变更')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByText('模型失败')).toBeInTheDocument();
    expect(client.searchAudit).toHaveBeenLastCalledWith({
      type: 'model',
      cursor: 'next',
      limit: 50,
    });
  });
  test('rejects unauthorized read without requesting data', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={{ ...administratorIdentity, roles: [], permissions: [] }} />);
    expect(screen.getByText('没有管理权限')).toBeInTheDocument();
    expect(client.searchAudit).not.toHaveBeenCalled();
  });
  test('distinguishes errors and retries', async () => {
    const client = fixture();
    client.searchAudit.mockRejectedValueOnce(new Error('offline'));
    render(<Events client={client as never} identity={administratorIdentity} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('技能变更')).toBeInTheDocument();
  });
  test('loads execution delivery outcomes separately and retries failure', async () => {
    const client = fixture();
    client.deliverySummary.mockRejectedValueOnce(new Error('offline'));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '配置执行记录' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看执行结果' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('执行结果暂无法获取');
    fireEvent.click(screen.getAllByRole('button', { name: '刷新' }).at(-1)!);
    await waitFor(() => expect(client.deliverySummary).toHaveBeenCalledTimes(2));
    // 投递状态按共用映射中文化。
    expect(await screen.findByText('失败')).toBeInTheDocument();
    expect(client.cancelControlEvent).not.toHaveBeenCalled();
  });
  test('loads persisted login history with actor, reason and source', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    expect(await screen.findByText('登录失败')).toBeInTheDocument();
    expect(client.searchAuthenticationAudit).toHaveBeenCalledWith({ limit: 50 });
    // 用户列两层：主行用户名，次行用户 ID。
    expect(screen.getByText('zhangsan')).toBeInTheDocument();
    expect(screen.getByText('user-a')).toBeInTheDocument();
    expect(screen.getByText('凭证无效')).toBeInTheDocument();
    expect(screen.getByText('abcdef012345')).toBeInTheDocument();
    expect(screen.queryByText('登录历史查询尚未接入')).not.toBeInTheDocument();
  });
  test('states honestly when the control service has no login-history endpoint', async () => {
    const client = fixture();
    client.searchAuthenticationAudit.mockRejectedValueOnce(new AdminRequestError(404, null, null));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    expect(await screen.findByText('登录历史查询尚未接入')).toBeInTheDocument();
  });
  test('page-loads additional login history', async () => {
    const client = fixture();
    client.searchAuthenticationAudit
      .mockResolvedValueOnce({
        items: [{ cursor: '2', eventType: 'login.succeeded', outcome: 'success' }],
        nextCursor: '2',
      })
      .mockResolvedValueOnce({
        items: [{ cursor: '1', eventType: 'login.failed', outcome: 'failure', reason: 'invalid_credentials' }],
        nextCursor: null,
      });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    expect(await screen.findByText('登录成功')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByText('凭证无效')).toBeInTheDocument();
    expect(client.searchAuthenticationAudit).toHaveBeenLastCalledWith({ cursor: '2', limit: 50 });
  });
  test('applies the login filter through the query button', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    await screen.findByText('登录失败');
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: 'user-a' } });
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() =>
      expect(client.searchAuthenticationAudit).toHaveBeenLastCalledWith({ userId: 'user-a', limit: 50 }),
    );
  });
  test('keeps loaded telemetry rows when the next page fails', async () => {
    const client = fixture();
    client.searchAudit
      .mockResolvedValueOnce({
        items: [{ eventId: 'e1', type: 'skill.changed', userId: 'user-a', result: 'success' }],
        nextCursor: 'next',
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [], nextCursor: null });
    render(<Events client={client as never} identity={administratorIdentity} />);
    await screen.findByText('技能变更');
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    // 分页失败只报错，已经加载的记录不丢。
    expect(screen.getByText('技能变更')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('当前条件下暂无记录')).toBeInTheDocument();
    expect(client.searchAudit).toHaveBeenCalledTimes(3);
  });
  test('discards a telemetry page that lands after a newer query', async () => {
    const client = fixture();
    const pending = Promise.withResolvers<{ items: readonly AdminEventRecord[]; nextCursor: string | null }>();
    client.searchAudit
      .mockResolvedValueOnce({ items: [{ eventId: 'e1', type: 'skill.changed' }], nextCursor: 'next' })
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ items: [{ eventId: 'e2', type: 'model.changed' }], nextCursor: null });
    render(<Events client={client as never} identity={administratorIdentity} />);
    await screen.findByText('技能变更');
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    // 分页在途时刷新：旧分页响应必须被丢弃，不能覆盖新查询的结果。
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('模型变更')).toBeInTheDocument();
    pending.resolve({ items: [{ eventId: 'e3', type: 'stale.event' }], nextCursor: null });
    await waitFor(() => expect(client.searchAudit).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('stale.event')).not.toBeInTheDocument();
  });
  test('page-loads control events and reports a failed page', async () => {
    const client = fixture();
    client.controlEvents
      .mockResolvedValueOnce({
        items: [{ eventId: 'control-1', type: 'model.catalog.changed', state: 'active' }],
        nextCursor: 'next',
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [], nextCursor: null });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '配置执行记录' }));
    await screen.findByText('模型目录变更');
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    expect(screen.getByText('模型目录变更')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
    await waitFor(() => expect(client.controlEvents).toHaveBeenLastCalledWith({ cursor: 'next', limit: 50 }));
  });
  test('sends the telemetry filters that were filled in', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    await screen.findByText('技能变更');
    fireEvent.change(screen.getByLabelText('操作类型'), { target: { value: ' model ' } });
    fireEvent.change(screen.getByLabelText('用户'), { target: { value: ' user-a ' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '结果' }));
    const option = await waitFor(() => {
      const node = [
        ...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'),
      ]
        .reverse()
        .find((item) => item.textContent === '失败');
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: /查询/ }));
    await waitFor(() =>
      expect(client.searchAudit).toHaveBeenLastCalledWith({
        type: 'model',
        userId: 'user-a',
        result: 'failure',
        limit: 50,
      }),
    );
  });
  test('reports a failed control-event list and retries it', async () => {
    const client = fixture();
    client.controlEvents
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [{ eventId: 'control-1', type: 'model.catalog.changed' }], nextCursor: null });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '配置执行记录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('模型目录变更')).toBeInTheDocument();
  });
  test('reports a failed login-history read and retries it', async () => {
    const client = fixture();
    client.searchAuthenticationAudit.mockRejectedValueOnce(new Error('offline'));
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('记录加载失败');
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(await screen.findByText('登录失败')).toBeInTheDocument();
  });
  test('renders every login event code without inventing labels', async () => {
    const client = fixture();
    client.searchAuthenticationAudit.mockResolvedValue({
      items: [
        { cursor: '4', eventType: 'session.revoked', outcome: 'denied', createdAt: '2026-10-11T00:00:00Z' },
        { cursor: '3', eventType: 'device.approved', outcome: 'denied', createdAt: '2026-10-11T00:00:00Z' },
        { cursor: '2', eventType: 'password.changed', outcome: 'success', createdAt: '2026-10-11T00:00:00Z' },
        { cursor: '1', eventType: 'login.throttled', outcome: 'denied', createdAt: '2026-10-11T00:00:00Z' },
      ],
      nextCursor: null,
    });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    expect(await screen.findByText('登录受限')).toBeInTheDocument();
    expect(screen.getByText('会话吊销')).toBeInTheDocument();
    expect(screen.getByText('修改密码')).toBeInTheDocument();
    expect(screen.getAllByText('已拒绝')).toHaveLength(3);
    // 未登记的事件代码原样显示，不伪造标签。
    expect(screen.getByText('device.approved')).toBeInTheDocument();
  });
  test('pages execution results inside the delivery drawer and retries a failed page', async () => {
    const client = fixture();
    client.deliverySummary
      .mockResolvedValueOnce({
        items: [{ deliveryId: 'd1', eventId: 'control-1', state: 'failed', attemptCount: 2 }],
        nextCursor: 'd2',
      })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        items: [{ deliveryId: 'd2', eventId: 'control-1', state: 'applied', attemptCount: 1 }],
        nextCursor: 'd3',
      });
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '配置执行记录' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看执行结果' }));
    await screen.findByText('失败');
    fireEvent.click(screen.getAllByRole('button', { name: /加载更多/ }).at(-1)!);
    expect(await screen.findByText('执行结果暂无法获取，请重试。')).toBeInTheDocument();
    expect(client.deliverySummary).toHaveBeenLastCalledWith('control-1', { cursor: 'd2', limit: 50 });
    fireEvent.click(screen.getAllByRole('button', { name: '刷新' }).at(-1)!);
    expect(await screen.findByText('applied')).toBeInTheDocument();
    expect(client.deliverySummary).toHaveBeenLastCalledWith('control-1', { limit: 50 });
    // 失败过的分页按钮仍可继续翻页，成功的页追加到已加载结果后面。
    fireEvent.click(screen.getAllByRole('button', { name: /加载更多/ }).at(-1)!);
    await waitFor(() =>
      expect(client.deliverySummary).toHaveBeenLastCalledWith('control-1', { cursor: 'd3', limit: 50 }),
    );
    await waitFor(() => expect(screen.getAllByText('applied')).toHaveLength(2));
  });
  test('shows the delivery rollup and the honest attempt count on the control-event row', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '配置执行记录' }));
    expect(await screen.findByText('已投递 2 · 失败 1')).toBeInTheDocument();
    // 尝试次数只在投递记录上，控制事件本身没有这个字段。
    expect(screen.getByText('见投递详情')).toBeInTheDocument();
    expect(screen.getByText('模型 / m1')).toBeInTheDocument();
    expect(screen.getByText('zhangsan')).toBeInTheDocument();
    expect(screen.getByText(formatTimestampSeconds('2026-10-12T00:00:00Z'))).toBeInTheDocument();
  });
});
