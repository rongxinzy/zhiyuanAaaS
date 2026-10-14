// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import type { UploadFile } from 'antd';
import { ConfigProvider } from 'antd';
import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

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
vi.mock('./KnowledgeGrants.js', () => ({ KnowledgeGrants: () => null }));
vi.mock('./KnowledgeOperations.js', () => ({ KnowledgeOperations: () => null }));
vi.mock('./KnowledgeRetrieval.js', () => ({ KnowledgeRetrieval: () => null }));

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { KnowledgeManagement } from './KnowledgeManagement.js';
import { type ManagedKnowledgeBase, type PortalClient, PortalError } from './portal.js';

function render(ui: ReactElement): ReturnType<typeof rtlRender> {
  return rtlRender(<ConfigProvider wave={{ disabled: true }}>{ui}</ConfigProvider>);
}

// The detail page (Tabs + Descriptions + a row menu) makes antd's cssinjs
// style computation noticeably heavier in jsdom, so the tests that open a
// document Modal get an explicit budget instead of the default 5 s.
const TIMEOUT = 60000;

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

describe('KnowledgeManagement component state', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('keeps base edits/deletes locked during upload and prevents retry after uncertain result', async () => {
    let rejectUpload!: (reason: Error) => void;
    const upload = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectUpload = reject;
        }),
    );
    const portal = makePortal({ uploadManagedKnowledgeDocument: upload });
    const { container } = render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] });
    fireEvent.change(input!);
    fireEvent.click(screen.getByRole('button', { name: /上传文档/ }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /编辑/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /删除/ })).toBeDisabled();

    rejectUpload(new Error('connection interrupted'));
    expect(await screen.findByText(/操作结果暂不确定/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上传文档/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /编辑/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /删除/ })).toBeDisabled();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  test('shows document authorization failure instead of a successful empty list', async () => {
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockRejectedValue(new PortalError(403, 'forbidden')),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    expect(await screen.findByText('没有权限访问知识库管理。')).toBeInTheDocument();
    expect(screen.queryByText('暂无文档')).not.toBeInTheDocument();
    // 文档读取被拒时写操作整体锁住，而不是伪装成空列表。
    expect(screen.getByRole('button', { name: /上传文档/ })).toBeDisabled();
  });

  test('keeps a referenced knowledge base selected when protected delete is rejected', async () => {
    const portal = makePortal({
      deleteManagedKnowledgeBase: vi.fn().mockRejectedValue(new PortalError(409, 'in use', 'KNOWLEDGE_BASE_IN_USE')),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /删除/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    expect(await screen.findByText('受保护：仍有关联，不能删除。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Research' })).toBeInTheDocument();
    expect(portal.deleteManagedKnowledgeBase).toHaveBeenCalledWith(base.id);
  });

  test('creates a registered knowledge base and displays the returned operation id', async () => {
    const created = { ...base, id: 'kb-created-1', name: 'New research', description: 'Created in console' };
    const portal = makePortal({
      listManagedKnowledgeBases: vi.fn().mockResolvedValueOnce([base]).mockResolvedValue([base, created]),
      getManagedKnowledgeBase: vi.fn().mockResolvedValueOnce(base).mockResolvedValue(created),
      createManagedKnowledgeBase: vi.fn().mockResolvedValue({ data: created, operationId: 'kbop-create-test' }),
    });
    render(<KnowledgeManagement portal={portal} baseId={null} />);

    expect(await screen.findByText('Research')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /新建知识库/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: 'New research' } });
    fireEvent.change(within(dialog).getByLabelText('描述'), { target: { value: 'Created in console' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));

    expect(await screen.findByRole('heading', { name: 'New research' })).toBeInTheDocument();
    expect(await screen.findByText(/kbop-create-test/)).toBeInTheDocument();
    expect(portal.createManagedKnowledgeBase).toHaveBeenCalledWith({
      name: 'New research',
      description: 'Created in console',
      type: 'document',
    });
  });

  test('updates the selected detail from the server response after editing', async () => {
    const updated = { ...base, name: 'Renamed research', description: 'Updated details' };
    const portal = makePortal({
      listManagedKnowledgeBases: vi.fn().mockResolvedValueOnce([base]).mockResolvedValue([updated]),
      updateManagedKnowledgeBase: vi.fn().mockResolvedValue({ data: updated, operationId: 'kbop-update-test' }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /编辑/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('名称'), { target: { value: 'Renamed research' } });
    fireEvent.change(within(dialog).getByLabelText('描述'), { target: { value: 'Updated details' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));

    expect(await screen.findByRole('heading', { name: 'Renamed research' })).toBeInTheDocument();
    expect(screen.getAllByText('Updated details').some((element) => element.tagName === 'DIV')).toBe(true);
    expect(portal.updateManagedKnowledgeBase).toHaveBeenCalledWith(base.id, {
      name: 'Renamed research',
      description: 'Updated details',
    });
  });

  test('shows accepted upload and the server-provided pending parse state', async () => {
    const doc = {
      id: 'doc-uploaded',
      knowledge_base_id: base.id,
      name: 'spec',
      file_name: 'spec.txt',
      parse_status: 'pending',
      created_at: '2026-10-09T00:00:00Z',
    };
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi
        .fn()
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 10 })
        .mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      uploadManagedKnowledgeDocument: vi.fn().mockResolvedValue({ data: doc, operationId: 'kbop-upload-success' }),
    });
    const { container } = render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['spec'], 'spec.txt', { type: 'text/plain' })],
    });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole('button', { name: /上传文档/ }));

    expect(await screen.findByText(/文件已受理/)).toBeInTheDocument();
    expect(await screen.findByText('排队中')).toBeInTheDocument();
    expect(portal.uploadManagedKnowledgeDocument).toHaveBeenCalledTimes(1);
  });

  test('uploads a picked folder file by file, keeping each relative path', async () => {
    const upload = vi.fn().mockResolvedValue({
      data: {
        id: 'doc-folder',
        knowledge_base_id: base.id,
        name: 'day-one.md',
        file_name: 'day-one.md',
        parse_status: 'pending',
        created_at: '2026-10-13T00:00:00Z',
      },
      operationId: 'kbop-folder-1',
    });
    const portal = makePortal({ uploadManagedKnowledgeDocument: upload });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();

    const picker = screen.getByLabelText('test folder picker') as HTMLInputElement;
    const nested = new File(['day one'], 'day-one.md', { type: 'text/markdown' });
    Object.defineProperty(nested, 'webkitRelativePath', { value: 'handbook/onboarding/day-one.md' });
    const top = new File(['readme'], 'README.md', { type: 'text/markdown' });
    Object.defineProperty(top, 'webkitRelativePath', { value: 'handbook/README.md' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [nested, top] });
    fireEvent.change(picker);

    expect(await screen.findByText('handbook/onboarding/day-one.md')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /上传文件夹 \(2\)/ }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    // The folder structure travels as WeKnora's fileName argument.
    expect(upload).toHaveBeenNthCalledWith(1, base.id, nested, 'handbook/onboarding/day-one.md');
    expect(upload).toHaveBeenNthCalledWith(2, base.id, top, 'handbook/README.md');
    expect(await screen.findByText(/已受理 2 · 失败 0/)).toBeInTheDocument();
  });

  test('keeps failed folder files queued for a retry', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new PortalError(400, '文件类型不受支持'))
      .mockResolvedValue({
        data: {
          id: 'doc-retry',
          knowledge_base_id: base.id,
          name: 'spec.txt',
          file_name: 'spec.txt',
          parse_status: 'pending',
          created_at: '2026-10-13T00:00:00Z',
        },
        operationId: 'kbop-retry',
      });
    const portal = makePortal({ uploadManagedKnowledgeDocument: upload });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();

    const picker = screen.getByLabelText('test folder picker') as HTMLInputElement;
    const file = new File(['spec'], 'spec.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'docs/spec.txt' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
    fireEvent.change(picker);
    fireEvent.click(screen.getByRole('button', { name: /上传文件夹 \(1\)/ }));

    expect(await screen.findByText(/失败 1/)).toBeInTheDocument();
    expect(screen.getByText('文件类型不受支持')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重试失败项/ }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/已受理 1 · 失败 0/)).toBeInTheDocument();
  });

  test('skips oversized files in a folder pick and keeps the rest queued', async () => {
    const upload = vi.fn().mockResolvedValue({
      data: {
        id: 'doc-small',
        knowledge_base_id: base.id,
        name: '正常.txt',
        file_name: '正常.txt',
        parse_status: 'pending',
        created_at: '2026-10-13T00:00:00Z',
      },
      operationId: 'kbop-small',
    });
    const portal = makePortal({ uploadManagedKnowledgeDocument: upload });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();

    const picker = screen.getByLabelText('test folder picker') as HTMLInputElement;
    const big = new File(['x'], '大文件.txt', { type: 'text/plain' });
    Object.defineProperty(big, 'size', { value: 64 * 1024 * 1024 });
    Object.defineProperty(big, 'webkitRelativePath', { value: '边界/大文件.txt' });
    const small = new File(['ok'], '正常.txt', { type: 'text/plain' });
    Object.defineProperty(small, 'webkitRelativePath', { value: '边界/正常.txt' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [big, small] });
    fireEvent.change(picker);

    expect(await screen.findByText('边界/正常.txt')).toBeInTheDocument();
    expect(screen.queryByText('边界/大文件.txt')).not.toBeInTheDocument();
    expect(screen.getByText(/单文件需小于等于 63 MiB/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /上传文件夹 \(1\)/ }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledWith(base.id, small, '边界/正常.txt');
  });

  test('imports a URL and manual text through the fixed managed document actions', async () => {
    const portal = makePortal({
      importManagedKnowledgeURL: vi.fn().mockResolvedValue({
        data: { id: 'doc-url', knowledge_base_id: base.id, name: 'URL item', file_name: '', parse_status: 'pending' },
        operationId: 'kbop-url-import',
      }),
      importManagedKnowledgeManual: vi.fn().mockResolvedValue({
        data: {
          id: 'doc-manual',
          knowledge_base_id: base.id,
          name: 'Manual item',
          file_name: '',
          parse_status: 'pending',
        },
        operationId: 'kbop-manual-import',
      }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /导入 URL/ })[0]!);
    let dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('来源 URL'), {
      target: { value: 'https://docs.example.test/guide' },
    });
    fireEvent.change(within(dialog).getByLabelText('标题'), { target: { value: 'URL item' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /导\s*入/ }));

    expect(await screen.findByText(/kbop-url-import/)).toBeInTheDocument();
    expect(portal.importManagedKnowledgeURL).toHaveBeenCalledWith(base.id, {
      url: 'https://docs.example.test/guide',
      title: 'URL item',
    });

    fireEvent.click(screen.getAllByRole('button', { name: /手动录入/ })[0]!);
    dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('标题'), { target: { value: 'Manual item' } });
    fireEvent.change(within(dialog).getByLabelText('正文（Markdown）'), { target: { value: '# Internal notes' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /导\s*入/ }));

    expect(await screen.findByText(/kbop-manual-import/)).toBeInTheDocument();
    expect(portal.importManagedKnowledgeManual).toHaveBeenCalledWith(base.id, {
      title: 'Manual item',
      content: '# Internal notes',
    });
  });

  const lifecycleDocument = (parse_status: string) => ({
    id: 'doc-lifecycle',
    knowledge_base_id: base.id,
    name: 'Lifecycle guide',
    file_name: 'guide.txt',
    parse_status,
    created_at: '2026-10-09T00:00:00Z',
  });

  test('renders upstream enums in Chinese for source, document status and base type', async () => {
    const doc = { ...lifecycleDocument('completed'), source: 'file', enable_status: 'enabled' };
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);
    const rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    expect(rowUi().getByText('文件')).toBeInTheDocument();
    expect(rowUi().getByText('已启用')).toBeInTheDocument();
    expect(screen.getByText('文档库')).toBeInTheDocument();
    // 原始枚举值不再直接展示（退到 title 属性）。
    expect(screen.queryByText('enabled')).not.toBeInTheDocument();
    expect(screen.queryByText('file')).not.toBeInTheDocument();
  });

  test('persists keep-disabled intent for processing documents without enabling them', async () => {
    const doc = { ...lifecycleDocument('processing'), enable_status: 'disabled', manual_disabled: false };
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      setManagedKnowledgeDocumentEnabled: vi.fn().mockResolvedValue({
        data: { ...doc, enable_status: 'disabled', manual_disabled: true },
        operationId: 'kbop-disable',
      }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const row = screen.getByText('Lifecycle guide').closest('tr')!;
    const toggle = within(row).getByRole('switch', { name: '解析完成后保持停用' });
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(portal.setManagedKnowledgeDocumentEnabled).toHaveBeenCalledWith(doc.id, false));
    expect(within(row).getByRole('switch', { name: '解析完成后保持停用' })).toBeChecked();
  });

  test('explains an upstream that lacks the enable-status API instead of leaking the raw message', async () => {
    const doc = { ...lifecycleDocument('completed'), enable_status: 'enabled' };
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      setManagedKnowledgeDocumentEnabled: vi
        .fn()
        .mockRejectedValue(
          new PortalError(502, '资料状态响应无法安全验证', 'KNOWLEDGE_UPSTREAM_INVALID', 'kbop-1791948895062669018'),
        ),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const row = screen.getByText('Lifecycle guide').closest('tr')!;
    fireEvent.click(within(row).getByRole('switch', { name: '停用资料' }));
    expect(
      await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeUpstreamInvalidManaged').slice(0, 12), {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/kbop-1791948895062669018/)).toBeInTheDocument();
    expect(screen.queryByText(/资料状态响应无法安全验证/)).not.toBeInTheDocument();
  });

  test('retries parsing through the managed action', async () => {
    const doc = lifecycleDocument('failed');
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      runManagedKnowledgeDocumentAction: vi.fn().mockResolvedValue({ operationId: 'kbop-doc-action' }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const _rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /重新解析/ }));
    await waitFor(() => expect(portal.runManagedKnowledgeDocumentAction).toHaveBeenCalledWith(doc.id, 'reparse'));
  });

  test('confirms document deletion through the managed action', async () => {
    const doc = lifecycleDocument('failed');
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      runManagedKnowledgeDocumentAction: vi.fn().mockResolvedValue({ operationId: 'kbop-doc-action' }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const _rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /删除资料/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(portal.runManagedKnowledgeDocumentAction).toHaveBeenCalledWith(doc.id, 'delete'));
  });

  test('shows cancel only for active parsing and uses the managed cancel action', async () => {
    const doc = lifecycleDocument('pending');
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      runManagedKnowledgeDocumentAction: vi.fn().mockResolvedValue({ operationId: 'kbop-cancel' }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const _rowUi = within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /取消解析/ }));
    await waitFor(() => expect(portal.runManagedKnowledgeDocumentAction).toHaveBeenCalledWith(doc.id, 'cancel-parse'));
  });

  test('renders base detail heading summary and business tabs', async () => {
    const portal = makePortal();
    render(<KnowledgeManagement portal={portal} baseId={base.id} onNavigate={vi.fn()} />);
    expect(await screen.findByRole('tab', { name: '文档管理' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '检索与来源' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '知识库访问授权' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '知识运营' })).toBeInTheDocument();
    // 对象摘要里 UUID 可复制
    expect(screen.getByText('kb-test-1')).toBeInTheDocument();
  });

  test('renders chunk content as readable managed details', async () => {
    const doc = lifecycleDocument('failed');
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      listManagedKnowledgeChunks: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'chunk-1',
            knowledge_id: doc.id,
            seq_id: 1,
            content: 'source excerpt',
            chunk_type: 'text',
            is_enabled: true,
          },
        ],
      }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const _rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /分块与来源/ }));
    expect(await screen.findByText('source excerpt')).toBeInTheDocument();
  });

  test('renders parser spans as readable managed details', async () => {
    const doc = lifecycleDocument('failed');
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      getManagedKnowledgeSpans: vi.fn().mockResolvedValue({
        knowledge_id: doc.id,
        attempt: 1,
        latest_attempt: 1,
        parse_status: 'completed',
        current_stage: 'completed',
        trace: {
          knowledge_id: doc.id,
          attempt: 1,
          span_id: 'span-1',
          name: 'parse',
          kind: 'parser',
          status: 'completed',
        },
      }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const _rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /处理过程/ }));
    expect(await screen.findByText('parse')).toBeInTheDocument();
    expect(screen.getAllByText('completed').length).toBeGreaterThan(0);
  });

  test('previews only Portal-projected chunk images and does not render external image URLs', async () => {
    const doc = lifecycleDocument('completed');
    const createURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:managed-image');
    const getImage = vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    const portal = makePortal({
      getManagedKnowledgeChunkImage: getImage,
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      listManagedKnowledgeChunks: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'chunk-image',
            knowledge_id: doc.id,
            seq_id: 1,
            content: 'diagram source',
            chunk_type: 'text',
            is_enabled: true,
            images: [{ index: 0, url: `/api/v1/knowledge/managed/documents/${doc.id}/chunks/chunk-image/images/0` }],
          },
          {
            id: 'chunk-external',
            knowledge_id: doc.id,
            seq_id: 2,
            content: 'external source https://example.invalid/image.png',
            chunk_type: 'text',
            is_enabled: true,
            images: [],
          },
        ],
        total: 2,
        page: 1,
        pageSize: 50,
      }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const _row = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /分块与来源/ }));
    expect(await screen.findByText('diagram source')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /查看分块图片 1/ }));
    await waitFor(() => expect(getImage).toHaveBeenCalledOnce());
    expect(getImage.mock.calls[0]?.slice(0, 3)).toEqual([doc.id, 'chunk-image', 0]);
    expect(await screen.findByRole('img', { name: '查看分块图片 1' })).toHaveAttribute('src', 'blob:managed-image');
    expect(screen.queryByRole('img', { name: /example\.invalid/ })).not.toBeInTheDocument();
    expect(createURL).toHaveBeenCalledOnce();
  });

  test(
    'edits a chunk with its content revision and reports failed indexing separately',
    async () => {
      const doc = lifecycleDocument('completed');
      const chunk = {
        id: 'chunk-edit',
        knowledge_id: doc.id,
        seq_id: 1,
        content: 'original body',
        chunk_type: 'text',
        is_enabled: true,
        content_revision: 4,
        index_status: 'ready' as const,
        images: [],
      };
      const updateChunk = vi.fn().mockResolvedValue({
        data: { ...chunk, content: 'updated body', content_revision: 5, index_status: 'failed' },
        operationId: 'op-chunk-edit',
      });
      const portal = makePortal({
        listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
        listManagedKnowledgeChunks: vi.fn().mockResolvedValue({ data: [chunk], total: 1, page: 1, pageSize: 50 }),
        updateManagedKnowledgeChunk: updateChunk,
      });
      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
      // 行内次级动作在「更多」菜单里（测试替身把菜单项内联渲染）。
      fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(translate(ADMIN_LANGUAGE, 'knowledgeChunks')) }));
      expect(await screen.findByText('original body')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeChunkEdit') }));
      // jsdom 下按 accessible name 查大 DOM 极慢，这里直接按结构取最后一个弹层。
      const editorModal = [...document.querySelectorAll('.ant-modal')].at(-1)!;
      fireEvent.change(editorModal.querySelector('textarea')!, { target: { value: 'updated body' } });
      fireEvent.click(editorModal.querySelector('.ant-btn-primary')!);
      await waitFor(() =>
        expect(updateChunk).toHaveBeenCalledWith(doc.id, chunk.id, {
          content: 'updated body',
          expected_revision: 4,
        }),
      );
      expect(
        await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeChunkIndexFailed'), undefined, {
          timeout: TIMEOUT,
        }),
      ).toBeInTheDocument();
      expect(screen.getAllByText('updated body').length).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  test('aborts chunk image reads on unmount and discards late responses', async () => {
    const doc = lifecycleDocument('completed');
    let resolveImage!: (blob: Blob) => void;
    const getImage = vi.fn(
      (_documentId: string, _chunkId: string, _index: number, _signal?: AbortSignal) =>
        new Promise<Blob>((resolve) => {
          resolveImage = resolve;
        }),
    );
    const createURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late-image');
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      listManagedKnowledgeChunks: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'chunk-image',
            knowledge_id: doc.id,
            seq_id: 1,
            content: 'diagram source',
            chunk_type: 'text',
            is_enabled: true,
            images: [{ index: 0, url: `/api/v1/knowledge/managed/documents/${doc.id}/chunks/chunk-image/images/0` }],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
      }),
      getManagedKnowledgeChunkImage: getImage,
    });
    const view = render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const _row = within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /分块与来源/ }));
    expect(await screen.findByText('diagram source')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /查看分块图片 1/ }));
    await waitFor(() => expect(getImage).toHaveBeenCalledOnce());
    const signal = getImage.mock.calls[0]![3] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolveImage(new Blob(['late'], { type: 'image/png' })));
    expect(createURL).not.toHaveBeenCalled();
  });

  test('loads chunk pages beyond the first 50 and reports the total chunk count', async () => {
    const doc = lifecycleDocument('completed');
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `chunk-${index + 1}`,
      knowledge_id: doc.id,
      seq_id: index + 1,
      content: `chunk text ${index + 1}`,
      chunk_type: 'text',
      is_enabled: true,
    }));
    const lastPage = [
      {
        id: 'chunk-51',
        knowledge_id: doc.id,
        seq_id: 51,
        content: 'chunk text 51',
        chunk_type: 'text',
        is_enabled: true,
      },
    ];
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      listManagedKnowledgeChunks: vi
        .fn()
        .mockResolvedValueOnce({ data: firstPage, total: 51, page: 1, pageSize: 50 })
        .mockResolvedValueOnce({ data: lastPage, total: 51, page: 2, pageSize: 50 }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const _rowUi = within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(screen.getByRole('menuitem', { name: /分块与来源/ }));
    expect(await screen.findByText('chunk text 1')).toBeInTheDocument();
    expect((await screen.findAllByText(/分块总数:\s*51/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('2'));

    expect(await screen.findByText('chunk text 51')).toBeInTheDocument();
    expect(portal.listManagedKnowledgeChunks).toHaveBeenNthCalledWith(2, doc.id, {
      page: 2,
      pageSize: 50,
    });
  });

  test(
    'renders the selected text original inline instead of framing it',
    async () => {
      const doc = lifecycleDocument('failed');
      const objectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-preview');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const portal = makePortal({
        listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
        getManagedKnowledgeFile: vi.fn().mockResolvedValue(new Blob(['original'])),
      });
      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
      const rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
      fireEvent.click(rowUi().getByRole('button', { name: /预览/ }));
      // 文本走内联渲染：内容出现、没有 iframe、也不用建 object URL。
      const body = await screen.findByText('original', undefined, { timeout: TIMEOUT });
      // 弹窗正文固定高度，不随文件长短跳动。
      expect((body.parentElement as HTMLElement).style.height).toBe('70vh');
      expect(screen.queryByTitle('guide.txt')).not.toBeInTheDocument();
      expect(portal.getManagedKnowledgeFile).toHaveBeenCalledWith(doc.id, 'preview');
      expect(objectUrl).not.toHaveBeenCalled();
      expect(revokeObjectUrl).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'frames a PDF original from a blob URL without a sandbox',
    async () => {
      const pdf = { ...lifecycleDocument('completed'), id: 'doc-pdf', name: 'Manual', file_name: 'manual.pdf' };
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-pdf');
      const portal = makePortal({
        listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [pdf], total: 1, page: 1, pageSize: 10 }),
        getManagedKnowledgeFile: vi.fn().mockResolvedValue(new Blob(['%PDF-1.4'])),
      });
      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findByText('Manual')).toBeInTheDocument();
      fireEvent.click(within(screen.getByText('Manual').closest('tr')!).getByRole('button', { name: /预览/ }));
      const frame = await screen.findByTitle('manual.pdf', undefined, { timeout: TIMEOUT });
      expect(frame).toHaveAttribute('src', 'blob:test-pdf');
      expect(frame).not.toHaveAttribute('sandbox');
    },
    TIMEOUT,
  );

  test(
    'reuses the cached original when the same document is previewed again',
    async () => {
      const doc = lifecycleDocument('failed');
      const getFile = vi.fn().mockResolvedValue(new Blob(['original']));
      const portal = makePortal({
        listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
        getManagedKnowledgeFile: getFile,
      });
      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
      const rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
      fireEvent.click(rowUi().getByRole('button', { name: /预览/ }));
      expect(await screen.findByText('original', undefined, { timeout: TIMEOUT })).toBeInTheDocument();
      // 再点一次同一条：命中缓存，不再走网络。
      fireEvent.click(rowUi().getByRole('button', { name: /预览/ }));
      expect(await screen.findByText('original', undefined, { timeout: TIMEOUT })).toBeInTheDocument();
      expect(getFile).toHaveBeenCalledTimes(1);
    },
    TIMEOUT,
  );

  test(
    'shows an image original directly instead of framing it',
    async () => {
      const image = { ...lifecycleDocument('completed'), id: 'doc-image', name: 'Chart', file_name: 'chart.png' };
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-image');
      const portal = makePortal({
        listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [image], total: 1, page: 1, pageSize: 10 }),
        getManagedKnowledgeFile: vi.fn().mockResolvedValue(new Blob(['png'])),
      });
      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findByText('Chart')).toBeInTheDocument();
      fireEvent.click(within(screen.getByText('Chart').closest('tr')!).getByRole('button', { name: /预览/ }));
      expect(await screen.findByAltText('chart.png', undefined, { timeout: TIMEOUT })).toHaveAttribute(
        'src',
        'blob:test-image',
      );
    },
    TIMEOUT,
  );

  test('downloads only the selected document original through the managed API', async () => {
    const doc = lifecycleDocument('failed');
    const objectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-download');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.isConnected).toBe(true);
      expect(this.href).toBe('blob:test-download');
    });
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      getManagedKnowledgeFile: vi.fn().mockResolvedValue(new Blob(['original'])),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const _rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    const realSetTimeout = window.setTimeout.bind(window);
    let releaseDownloadUrl: (() => void) | undefined;
    const timeout = vi.spyOn(window, 'setTimeout').mockImplementation((handler, delay, ...args) => {
      if (delay === 1000 && typeof handler === 'function') {
        releaseDownloadUrl = () => handler(...args);
        return 0 as unknown as ReturnType<typeof window.setTimeout>;
      }
      return realSetTimeout(handler, delay, ...args) as unknown as ReturnType<typeof window.setTimeout>;
    });
    fireEvent.click(screen.getByRole('menuitem', { name: /下载原文件/ }));
    await waitFor(() => expect(anchorClick).toHaveBeenCalled());
    expect(portal.getManagedKnowledgeFile).toHaveBeenCalledWith(doc.id, 'download');
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    expect(releaseDownloadUrl).toBeDefined();
    act(() => releaseDownloadUrl!());
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test-download');
    timeout.mockRestore();
    expect(objectUrl).toHaveBeenCalledOnce();
  });

  test(
    'dismisses the document hint and keeps it dismissed on the next visit',
    async () => {
      const hint = translate(ADMIN_LANGUAGE, 'knowledgeDocumentEnableHint');
      localStorage.removeItem('admin-knowledge-doc-hint-dismissed');
      const portal = makePortal();
      const view = render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findByText(hint)).toBeInTheDocument();

      fireEvent.click(screen.getByText(hint).closest('.ant-alert')!.querySelector('.ant-alert-close-icon')!);
      await waitFor(() => expect(screen.queryByText(hint)).not.toBeInTheDocument());
      expect(localStorage.getItem('admin-knowledge-doc-hint-dismissed')).toBe('1');
      view.unmount();

      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findAllByText('Research')).not.toHaveLength(0);
      expect(screen.queryByText(hint)).not.toBeInTheDocument();
    },
    TIMEOUT,
  );
});
