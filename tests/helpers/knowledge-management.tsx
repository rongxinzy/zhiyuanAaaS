// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { UploadFile } from 'antd';
import { ConfigProvider } from 'antd';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  function UploadForStateTest({
    children,
    onChange,
    directory,
    multiple,
  }: {
    readonly children: ReactNode;
    readonly onChange?: (info: { readonly fileList: UploadFile[] }) => void;
    readonly directory?: boolean;
    readonly multiple?: boolean;
  }) {
    const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.currentTarget.files ?? []);
      if (picked.length === 0) return;
      onChange?.({
        fileList: picked.map((file, index) => ({
          uid: `test-file-${index}`,
          name: file.name,
          originFileObj: file as NonNullable<UploadFile['originFileObj']>,
        })),
      });
    };
    if (directory)
      return (
        <div>
          <input aria-label="test folder picker" type="file" multiple={multiple} onChange={selectFiles} />
          {children}
        </div>
      );
    const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      if (file)
        onChange?.({
          fileList: [
            { uid: 'test-file', name: file.name, originFileObj: file as NonNullable<UploadFile['originFileObj']> },
          ],
        });
    };
    return (
      <div>
        <input aria-label="test file picker" type="file" onChange={selectFile} />
        {children}
      </div>
    );
  }
  // antd's real Dropdown renders its menu in a portal whose popup does not open
  // under this file's mocked module, so the stub renders the trigger plus the
  // menu items inline. Wiring (which item calls which handler) stays covered
  // here; the real popup behaviour is exercised by the pages that use antd
  // unmocked (Resources).
  function DropdownForStateTest({
    children,
    menu,
  }: {
    readonly children: ReactNode;
    readonly menu?: {
      readonly items?: readonly (Record<string, unknown> | null | undefined)[];
      readonly onClick?: (info: { readonly key: string; readonly domEvent: { stopPropagation: () => void } }) => void;
    };
  }) {
    const items = (menu?.items ?? []).filter(
      (item): item is { key: string; label?: ReactNode; disabled?: boolean } =>
        typeof item === 'object' && item !== null && typeof item.key === 'string',
    );
    return (
      <div>
        {children}
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            disabled={item.disabled === true}
            onClick={() => menu?.onClick?.({ key: item.key, domEvent: { stopPropagation: () => {} } })}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  }
  return { ...actual, Dropdown: DropdownForStateTest, Upload: UploadForStateTest };
});

// These parent tests focus on knowledge-base lifecycle state. Each managed
// business surface has its own component tests, and the browser E2E exercises
// their real integration, so keep unrelated tables/forms out of this suite.
vi.mock('../../src/admin/KnowledgeGrants.js', () => ({ KnowledgeGrants: () => null }));
vi.mock('../../src/admin/KnowledgeOperations.js', () => ({ KnowledgeOperations: () => null }));
vi.mock('../../src/admin/KnowledgeRetrieval.js', () => ({ KnowledgeRetrieval: () => null }));

import type { ManagedKnowledgeBase, PortalClient } from '../../src/admin/portal.js';

// 「添加资料」把文件/文件夹/网址/手动合并成一个下拉；测试里 Dropdown 是内联渲染的
// stub，所以直接点菜单项即可（与真实弹层行为由页面自身覆盖）。
async function openAddMaterial(kind: 'file' | 'folder' | 'url' | 'manual') {
  const label = {
    file: /上传文件/,
    folder: /导入文件夹/,
    url: /导入 URL/,
    manual: /手动录入/,
  }[kind];
  fireEvent.click(await screen.findByRole('menuitem', { name: label }));
}

function render(ui: ReactElement): ReturnType<typeof rtlRender> {
  return rtlRender(
    <ConfigProvider wave={{ disabled: true }} theme={{ token: { motion: false } }}>
      {ui}
    </ConfigProvider>,
  );
}

// Bound asynchronous document operations; preview controls are located by their
// explicit accessible label to avoid jsdom's expensive CSS visibility traversal.
const TIMEOUT = 10000;

const base: ManagedKnowledgeBase = {
  id: 'kb-test-1',
  name: 'Research',
  description: 'Test base',
  tenant_id: '10000',
  embedding_model_id: 'embedding-test',
  type: 'document',
};

function makePortal(overrides: Partial<PortalClient> = {}) {
  return {
    managedKnowledgeReadiness: vi.fn().mockResolvedValue({
      deploymentId: 'deployment-test',
      tenantId: '10000',
      tenant: 'verified',
      embeddingModel: { state: 'configured', id: 'embedding-test', availability: 'unverified' },
      storage: 'unverified',
      parser: 'unverified',
    }),
    listManagedKnowledgeBases: vi.fn().mockResolvedValue([base]),
    getManagedKnowledgeBase: vi.fn().mockResolvedValue(base),
    listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 10 }),
    // 详情页的目录树会读文件夹；运营/检索/授权组件在本套件里被 mock 成 null。
    getManagedKnowledgeFolders: vi
      .fn()
      .mockResolvedValue({ root_document_count: 0, total_document_count: 0, folders: [] }),
    listEmployees: vi.fn().mockResolvedValue([]),
    listManagedKnowledgeGrants: vi
      .fn()
      .mockResolvedValue({ knowledge_base_id: base.id, tenant_id: '10000', grants: [] }),
    replaceManagedKnowledgeGrants: vi
      .fn()
      .mockResolvedValue({ knowledge_base_id: base.id, tenant_id: '10000', grants: [] }),
    setManagedKnowledgeDocumentEnabled: vi.fn().mockResolvedValue({
      data: {
        id: 'doc-lifecycle',
        knowledge_base_id: base.id,
        name: 'Lifecycle guide',
        file_name: 'guide.txt',
        parse_status: 'completed',
        enable_status: 'enabled',
        created_at: '2026-10-09T00:00:00Z',
      },
      operationId: 'kbop-enable',
    }),
    getManagedKnowledgeChunkImage: vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' })),
    uploadManagedKnowledgeDocument: vi.fn().mockResolvedValue({
      data: {
        id: 'doc-test-1',
        knowledge_base_id: base.id,
        name: 'notes',
        file_name: 'notes.txt',
        parse_status: 'pending',
        created_at: '2026-10-09T00:00:00Z',
      },
      operationId: 'kbop-upload-test',
    }),
    updateManagedKnowledgeBase: vi.fn(),
    deleteManagedKnowledgeBase: vi.fn(),
    createManagedKnowledgeBase: vi.fn(),
    ...overrides,
  } as unknown as PortalClient;
}
const lifecycleDocument = (parse_status: string) => ({
  id: 'doc-lifecycle',
  knowledge_base_id: base.id,
  name: 'Lifecycle guide',
  file_name: 'guide.txt',
  parse_status,
  created_at: '2026-10-09T00:00:00Z',
});

export { base, lifecycleDocument, makePortal, openAddMaterial, render, TIMEOUT };
