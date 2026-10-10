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
  }: {
    readonly children: ReactNode;
    readonly onChange?: (info: { readonly fileList: UploadFile[] }) => void;
  }) {
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
  return { ...actual, Upload: UploadForStateTest };
});

import { KnowledgeManagement } from './KnowledgeManagement.js';
import { type ManagedKnowledgeBase, type PortalClient, PortalError } from './portal.js';

function render(ui: ReactElement): ReturnType<typeof rtlRender> {
  return rtlRender(<ConfigProvider wave={{ disabled: true }}>{ui}</ConfigProvider>);
}

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
    const { container } = render(<KnowledgeManagement portal={portal} />);

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
    render(<KnowledgeManagement portal={portal} />);

    expect(await screen.findByText('没有权限访问知识库管理。')).toBeInTheDocument();
    expect(screen.queryByText('暂无文档')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建知识库/ })).toBeDisabled();
  });

  test('keeps a referenced knowledge base selected when protected delete is rejected', async () => {
    const portal = makePortal({
      deleteManagedKnowledgeBase: vi.fn().mockRejectedValue(new PortalError(409, 'in use', 'KNOWLEDGE_BASE_IN_USE')),
    });
    render(<KnowledgeManagement portal={portal} />);

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
    render(<KnowledgeManagement portal={portal} />);

    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
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
    });
  });

  test('updates the selected detail from the server response after editing', async () => {
    const updated = { ...base, name: 'Renamed research', description: 'Updated details' };
    const portal = makePortal({
      listManagedKnowledgeBases: vi.fn().mockResolvedValueOnce([base]).mockResolvedValue([updated]),
      updateManagedKnowledgeBase: vi.fn().mockResolvedValue({ data: updated, operationId: 'kbop-update-test' }),
    });
    render(<KnowledgeManagement portal={portal} />);

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
    const { container } = render(<KnowledgeManagement portal={portal} />);
    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['spec'], 'spec.txt', { type: 'text/plain' })],
    });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole('button', { name: /上传文档/ }));

    expect(await screen.findByText(/文件已受理/)).toBeInTheDocument();
    expect(await screen.findByText(/排队中 · pending/)).toBeInTheDocument();
    expect(portal.uploadManagedKnowledgeDocument).toHaveBeenCalledTimes(1);
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
    render(<KnowledgeManagement portal={portal} />);

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

  test('persists keep-disabled intent for processing documents without enabling them', async () => {
    const doc = { ...lifecycleDocument('processing'), enable_status: 'disabled', manual_disabled: false };
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      setManagedKnowledgeDocumentEnabled: vi.fn().mockResolvedValue({
        data: { ...doc, enable_status: 'disabled', manual_disabled: true },
        operationId: 'kbop-disable',
      }),
    });
    render(<KnowledgeManagement portal={portal} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const row = screen.getByText('Lifecycle guide').closest('tr')!;
    const toggle = within(row).getByRole('switch', { name: '解析完成后保持停用' });
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(portal.setManagedKnowledgeDocumentEnabled).toHaveBeenCalledWith(doc.id, false));
    expect(within(row).getByRole('switch', { name: '解析完成后保持停用' })).toBeChecked();
  });

  test('retries parsing and confirms document deletion through managed actions', async () => {
    const doc = lifecycleDocument('failed');
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      runManagedKnowledgeDocumentAction: vi.fn().mockResolvedValue({ operationId: 'kbop-doc-action' }),
    });
    render(<KnowledgeManagement portal={portal} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(rowUi().getByRole('button', { name: /重新解析/ }));
    await waitFor(() => expect(portal.runManagedKnowledgeDocumentAction).toHaveBeenCalledWith(doc.id, 'reparse'));
    fireEvent.click(rowUi().getByRole('button', { name: /删除资料/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(portal.runManagedKnowledgeDocumentAction).toHaveBeenCalledWith(doc.id, 'delete'));
  });

  test('shows cancel only for active parsing and uses the managed cancel action', async () => {
    const doc = lifecycleDocument('pending');
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      runManagedKnowledgeDocumentAction: vi.fn().mockResolvedValue({ operationId: 'kbop-cancel' }),
    });
    render(<KnowledgeManagement portal={portal} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const rowUi = within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(rowUi.getByRole('button', { name: /取消解析/ }));
    await waitFor(() => expect(portal.runManagedKnowledgeDocumentAction).toHaveBeenCalledWith(doc.id, 'cancel-parse'));
  });

  test('renders chunks and parser spans as readable managed details', async () => {
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
    render(<KnowledgeManagement portal={portal} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    const closeTopModal = () => fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    fireEvent.click(rowUi().getByRole('button', { name: /分块与来源/ }));
    expect(await screen.findByText('source excerpt')).toBeInTheDocument();
    closeTopModal();
    fireEvent.click(rowUi().getByRole('button', { name: /处理过程/ }));
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
    render(<KnowledgeManagement portal={portal} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const row = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(row().getByRole('button', { name: /分块与来源/ }));
    expect(await screen.findByText('diagram source')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /查看分块图片 1/ }));
    await waitFor(() => expect(getImage).toHaveBeenCalledOnce());
    expect(getImage.mock.calls[0]?.slice(0, 3)).toEqual([doc.id, 'chunk-image', 0]);
    expect(await screen.findByRole('img', { name: '查看分块图片 1' })).toHaveAttribute('src', 'blob:managed-image');
    expect(screen.queryByRole('img', { name: /example\.invalid/ })).not.toBeInTheDocument();
    expect(createURL).toHaveBeenCalledOnce();
  });

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
    const view = render(<KnowledgeManagement portal={portal} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const row = within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(row.getByRole('button', { name: /分块与来源/ }));
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
    render(<KnowledgeManagement portal={portal} />);

    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const rowUi = within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(rowUi.getByRole('button', { name: /分块与来源/ }));
    expect(await screen.findByText('chunk text 1')).toBeInTheDocument();
    expect((await screen.findAllByText(/分块总数:\s*51/)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('2'));

    expect(await screen.findByText('chunk text 51')).toBeInTheDocument();
    expect(portal.listManagedKnowledgeChunks).toHaveBeenNthCalledWith(2, doc.id, {
      page: 2,
      pageSize: 50,
    });
  });

  test('previews and downloads only the selected document original through managed APIs', async () => {
    const doc = lifecycleDocument('failed');
    const objectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-preview');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.isConnected).toBe(true);
      expect(this.href).toBe('blob:test-preview');
    });
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      getManagedKnowledgeFile: vi.fn().mockResolvedValue(new Blob(['original'])),
    });
    render(<KnowledgeManagement portal={portal} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    const rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    fireEvent.click(rowUi().getByRole('button', { name: /预览/ }));
    expect(await screen.findByTitle('guide.txt')).toHaveAttribute('src', 'blob:test-preview');
    expect(portal.getManagedKnowledgeFile).toHaveBeenCalledWith(doc.id, 'preview');
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    revokeObjectUrl.mockClear();
    const realSetTimeout = window.setTimeout.bind(window);
    let releaseDownloadUrl: (() => void) | undefined;
    const timeout = vi.spyOn(window, 'setTimeout').mockImplementation((handler, delay, ...args) => {
      if (delay === 1000 && typeof handler === 'function') {
        releaseDownloadUrl = () => handler(...args);
        return 0 as unknown as ReturnType<typeof window.setTimeout>;
      }
      return realSetTimeout(handler, delay, ...args) as unknown as ReturnType<typeof window.setTimeout>;
    });
    fireEvent.click(rowUi().getByRole('button', { name: /下载原文件/ }));
    await waitFor(() => expect(anchorClick).toHaveBeenCalled());
    expect(portal.getManagedKnowledgeFile).toHaveBeenCalledWith(doc.id, 'download');
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    expect(releaseDownloadUrl).toBeDefined();
    act(() => releaseDownloadUrl!());
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test-preview');
    timeout.mockRestore();
    expect(objectUrl).toHaveBeenCalledTimes(2);
  });
});
