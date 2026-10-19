// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { type AdminAuditPage, type AdminAuditRecord, type AdminIdentity, AdminPermission } from './client.js';
import { Events } from './Events.js';
import { PortalClient } from './portal.js';
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

/** 五个页签的表头，用来核对列名口径一致。 */
const headers = () => screen.getAllByRole('columnheader').map((node) => node.textContent);

describe('audit user column', () => {
  test('names the user column the same way on every tab', async () => {
    const client = fixture();
    vi.spyOn(PortalClient.prototype, 'knowledgeAudit').mockResolvedValue({ items: [], nextCursor: null });
    render(<Events client={client as never} identity={administratorIdentity} />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '业务事件',
      '配置执行记录',
      '知识审计',
      '登录日志',
      '操作日志',
    ]);
    for (const [tab, row] of [
      ['业务事件', '技能变更'],
      ['配置执行记录', '模型目录变更'],
      ['登录日志', '登录失败'],
      ['操作日志', '模型更新'],
    ] as const) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      expect(await screen.findByText(row)).toBeInTheDocument();
      expect(headers()).toContain('用户');
      expect(headers()).not.toContain('操作人');
      expect(headers()).not.toContain('操作人（姓名或 ID）');
      expect(headers()).not.toContain('操作人 ID');
    }
    fireEvent.click(screen.getByRole('tab', { name: '知识审计' }));
    await waitFor(() => expect(headers()).toContain('用户'));
    expect(headers()).not.toContain('操作人 ID');
  });

  test('loads the shared user directory once for the audit tabs', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={administratorIdentity} />);
    fireEvent.click(screen.getByRole('tab', { name: '登录日志' }));
    await screen.findByText('登录失败');
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    await screen.findByText('模型更新');
    expect(client.users).toHaveBeenCalledTimes(1);
  });
});

describe('audit page permissions', () => {
  const identityWith = (...permissions: readonly AdminPermission[]): AdminIdentity => ({
    ...administratorIdentity,
    roles: [],
    permissions: [...permissions],
  });
  /** 知识审计走 PortalClient，这里只固定它在页面里加载成功。 */
  const stubKnowledgeAudit = () =>
    vi.spyOn(PortalClient.prototype, 'knowledgeAudit').mockResolvedValue({ items: [], nextCursor: null });

  test('an audit-only identity sees the audit tabs and never the telemetry tabs', async () => {
    const client = fixture();
    const knowledge = stubKnowledgeAudit();
    render(<Events client={client as never} identity={identityWith(AdminPermission.AuditRead)} />);
    expect(screen.queryByText('没有管理权限')).not.toBeInTheDocument();
    for (const name of ['知识审计', '登录日志', '操作日志'])
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    for (const name of ['业务事件', '配置执行记录'])
      expect(screen.queryByRole('tab', { name })).not.toBeInTheDocument();
    // 没有遥测权限就不该碰遥测接口；默认落在第一个可用 tab。
    expect(screen.getByRole('tab', { name: '知识审计' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(knowledge).toHaveBeenCalled());
    expect(client.searchAudit).not.toHaveBeenCalled();
    expect(client.controlEvents).not.toHaveBeenCalled();
    // 审计类 tab 可以正常使用。
    fireEvent.click(screen.getByRole('tab', { name: '操作日志' }));
    expect(await screen.findByText('模型更新')).toBeInTheDocument();
  });

  test('an events-only identity sees the telemetry tabs and never the audit tabs', async () => {
    const client = fixture();
    render(<Events client={client as never} identity={identityWith(AdminPermission.EventsRead)} />);
    expect(screen.getByRole('tab', { name: '业务事件' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '配置执行记录' })).toBeInTheDocument();
    for (const name of ['知识审计', '登录日志', '操作日志'])
      expect(screen.queryByRole('tab', { name })).not.toBeInTheDocument();
    // 遥测 tab 如实说明数据来源，不冒充管理审计。
    expect(screen.getByText(/不是后台管理审计/)).toBeInTheDocument();
    expect(await screen.findByText('技能变更')).toBeInTheDocument();
    expect(client.searchAdminAudit).not.toHaveBeenCalled();
    expect(client.searchAuthenticationAudit).not.toHaveBeenCalled();
    // 没有审计权限就不拉用户目录。
    expect(client.users).not.toHaveBeenCalled();
  });

  test('an identity with both permissions sees every tab', async () => {
    const client = fixture();
    stubKnowledgeAudit();
    render(
      <Events
        client={client as never}
        identity={identityWith(AdminPermission.EventsRead, AdminPermission.AuditRead)}
      />,
    );
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '业务事件',
      '配置执行记录',
      '知识审计',
      '登录日志',
      '操作日志',
    ]);
  });
});
