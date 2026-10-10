// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
// Browser API stubs for antd live in src/admin/test-setup.ts (wired via
// vitest.config setupFiles). The wrapper mirrors the production shell
// (stable button names) and disables wave/motion for jsdom speed.
import { ConfigProvider } from 'antd';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  type ManagedKnowledgeBase,
  type ManagedKnowledgeDocument,
  type PortalClient,
  PortalError,
  type PortalKnowledgeStatus,
  type PortalMemoryStatus,
} from './portal.js';
import { KnowledgeView, MemoryView, ServicesView } from './ServiceStatus.js';

const TIMEOUT = 15000;

function render(ui: ReactElement): ReturnType<typeof rtlRender> {
  return rtlRender(
    <ConfigProvider button={{ autoInsertSpace: false }} wave={{ disabled: true }}>
      {ui}
    </ConfigProvider>,
  );
}

describe('admin service status views', () => {
  afterEach(() => cleanup());

  const client = {
    getAccessToken: vi.fn().mockResolvedValue('aep-token'),
  };

  const memoryStatus: PortalMemoryStatus = {
    server: 'openviking:8000',
    account: 'zhiyuan',
    healthy: true,
    accounts: [{ accountID: 'acc-1', createdAt: '2026-09-01T00:00:00Z', userCount: 3 }],
    employees: [
      { name: 'sales-helper', memoryUser: 'sales-helper', sessions: 8, lastActive: '2026-09-29T06:25:00Z' },
      { name: 'admin-bot', memoryUser: 'admin-bot' },
    ],
  };

  const knowledgeStatus: PortalKnowledgeStatus = {
    uiURL: 'http://kb.example.internal:30163/',
    configured: true,
    healthy: true,
    knowledgeBases: [
      {
        id: 'kb-1',
        name: '销售产品资料',
        description: '产品说明',
        documentCount: 24,
        createdAt: '2026-09-20T02:00:00Z',
      },
      { id: 'kb-2', name: '制度资料', description: '' },
    ],
  };
  const managedBase: ManagedKnowledgeBase = {
    id: 'kb-managed-1',
    name: '销售产品资料',
    description: '产品说明',
    tenant_id: '10000',
    embedding_model_id: 'embedding-1',
    type: 'document',
  };
  const managedDocument: ManagedKnowledgeDocument = {
    id: 'doc-1',
    knowledge_base_id: managedBase.id,
    name: '产品手册',
    file_name: 'manual.pdf',
    parse_status: 'processing',
    created_at: '2026-10-09T00:00:00Z',
  };

  const makePortal = (overrides: Partial<PortalClient> = {}) =>
    ({
      memoryStatus: vi.fn().mockResolvedValue(memoryStatus),
      memorySearch: vi.fn().mockResolvedValue({ memories: [] }),
      knowledgeStatus: vi.fn().mockResolvedValue(knowledgeStatus),
      managedKnowledgeReadiness: vi.fn().mockResolvedValue({
        deploymentId: 'deploy-1',
        tenantId: '10000',
        tenant: 'verified',
        embeddingModel: { state: 'configured', id: 'embedding-1', availability: 'unverified' },
        storage: 'unverified',
        parser: 'unverified',
      }),
      listManagedKnowledgeBases: vi.fn().mockResolvedValue([managedBase]),
      getManagedKnowledgeBase: vi.fn().mockResolvedValue(managedBase),
      listManagedKnowledgeDocuments: vi
        .fn()
        .mockResolvedValue({ data: [managedDocument], total: 1, page: 1, pageSize: 10 }),
      createManagedKnowledgeBase: vi.fn().mockResolvedValue({ data: managedBase, operationId: 'op-create-1' }),
      updateManagedKnowledgeBase: vi.fn().mockResolvedValue({ data: managedBase, operationId: 'op-update-1' }),
      deleteManagedKnowledgeBase: vi.fn().mockResolvedValue({ operationId: 'op-delete-1' }),
      uploadManagedKnowledgeDocument: vi.fn().mockResolvedValue({ data: managedDocument, operationId: 'op-upload-1' }),
      listEmployees: vi.fn().mockResolvedValue([]),
      ...overrides,
    }) as unknown as PortalClient;

  test(
    'MemoryView renders real account and employee metrics without fabricating writes',
    async () => {
      render(<MemoryView client={client as never} portal={makePortal()} />);

      expect(await screen.findByText('acc-1')).toBeInTheDocument();
      expect(screen.getAllByText('sales-helper').length).toBeGreaterThan(0);
      // Absent metrics stay "not provided" — never zero.
      expect(screen.getAllByText('未提供').length).toBeGreaterThan(0);
      // lastActive is activity, never labelled as a memory write here;
      // the write metric itself only appears in the scoped employee view.
      expect(screen.getByText('最近活动')).toBeInTheDocument();
      expect(screen.queryByText('最近写入')).not.toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'MemoryView scoped to one employee shows only that scope and honest write metrics',
    async () => {
      render(
        <MemoryView
          client={client as never}
          portal={makePortal()}
          employee={{ name: 'sales-helper', memoryUser: 'sales-helper' }}
        />,
      );

      expect(await screen.findByText('记忆归属')).toBeInTheDocument();
      expect(screen.getByText('最近记忆写入')).toBeInTheDocument();
      expect(screen.getByText('暂未采集')).toBeInTheDocument();
      // The platform-wide table is not part of the scoped view.
      expect(screen.queryByText('admin-bot')).not.toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'MemoryView scoped error state can be retried directly (review regression)',
    async () => {
      const memoryStatus = vi
        .fn()
        .mockRejectedValueOnce(new Error('HTTP 503'))
        .mockResolvedValue(memoryStatusFixture());
      const portal = makePortal({ memoryStatus });
      render(
        <MemoryView
          client={client as never}
          portal={portal}
          employee={{ name: 'sales-helper', memoryUser: 'sales-helper' }}
        />,
      );

      expect(await screen.findByText(/HTTP 503/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /刷新/ }));
      await waitFor(() => expect(memoryStatus).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('最近记忆写入')).toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'KnowledgeView uses managed APIs, shows parse status, and never links to WeKnora UI',
    async () => {
      const portal = makePortal();
      render(<KnowledgeView client={client as never} portal={portal} />);
      expect(await screen.findAllByText('销售产品资料')).toHaveLength(2);
      expect(await screen.findByText(/解析中 · processing/)).toBeInTheDocument();
      expect(screen.getByText(/可用性未验证/)).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(portal.listManagedKnowledgeBases).toHaveBeenCalled();
      expect(portal.getManagedKnowledgeBase).toHaveBeenCalledWith(managedBase.id, expect.any(AbortSignal));
    },
    TIMEOUT,
  );

  test(
    'KnowledgeView exposes readiness gaps and disables creation without an embedding model',
    async () => {
      const portal = makePortal({
        managedKnowledgeReadiness: vi.fn().mockResolvedValue({
          deploymentId: 'deploy-1',
          tenantId: '10000',
          tenant: 'verified',
          embeddingModel: { state: 'not_configured', id: '', availability: 'unverified' },
          storage: 'unverified',
          parser: 'unverified',
        }),
      });
      render(<KnowledgeView client={client as never} portal={portal} />);
      expect(await screen.findByText(/暂不能新建知识库/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /新建知识库/ })).toBeDisabled();
    },
    TIMEOUT,
  );

  test(
    'KnowledgeView displays managed API authorization errors instead of empty-state',
    async () => {
      const portal = makePortal({
        listManagedKnowledgeBases: vi.fn().mockRejectedValue(new PortalError(403, 'forbidden')),
      });
      render(<KnowledgeView client={client as never} portal={portal} />);
      expect(await screen.findByText('没有权限访问知识库管理。')).toBeInTheDocument();
      expect(screen.queryByText('暂无已登记的知识库')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /新建知识库/ })).toBeDisabled();
    },
    TIMEOUT,
  );

  test(
    'ServicesView probes the two real services and admits the two without probe APIs',
    async () => {
      render(<ServicesView client={client as never} portal={makePortal()} />);

      expect(await screen.findByText('长期记忆')).toBeInTheDocument();
      expect(screen.getByText('知识检索')).toBeInTheDocument();
      // Real probes report healthy.
      expect(screen.getAllByText('正常').length).toBe(2);
      // No probe API exists for these — no invented green checks.
      expect(screen.getAllByText('暂无检测接口').length).toBe(2);
      expect(screen.getAllByText('数字员工运行服务').length).toBeGreaterThan(0);
      expect(screen.getAllByText('模型网关').length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  test(
    'ServicesView shows a failed probe as failed with the reason, never as healthy',
    async () => {
      const portal = makePortal({
        memoryStatus: vi.fn().mockRejectedValue(new Error('connection refused')),
      });
      render(<ServicesView client={client as never} portal={portal} />);

      expect(await screen.findByText('检测失败')).toBeInTheDocument();
      expect(screen.getByText('connection refused')).toBeInTheDocument();
      // The knowledge probe still reports its own real result.
      expect(screen.getAllByText('正常').length).toBe(1);
    },
    TIMEOUT,
  );
});

// Local fixtures for the retry tests (fresh mocks need fresh data).
function memoryStatusFixture(): PortalMemoryStatus {
  return {
    server: 'openviking:8000',
    account: 'zhiyuan',
    healthy: true,
    accounts: [],
    employees: [{ name: 'sales-helper', memoryUser: 'sales-helper', sessions: 8 }],
  };
}
