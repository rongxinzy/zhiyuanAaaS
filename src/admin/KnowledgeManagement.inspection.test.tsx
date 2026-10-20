// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  base,
  lifecycleDocument,
  makePortal,
  openAddMaterial,
  render,
  TIMEOUT,
} from '../../tests/helpers/knowledge-management.js';
import { withQueryClient } from '../../tests/helpers/query-client.js';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { KnowledgeManagement } from './KnowledgeManagement.js';
import { type ManagedKnowledgeBase, PortalError } from './portal.js';

describe('KnowledgeManagement component state', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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
      fireEvent.click(rowUi().getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgePreview'), { selector: 'button' }));
      // 文本走内联渲染：内容出现、没有 iframe、也不用建 object URL。
      const body = await screen.findByText('original', undefined, { timeout: TIMEOUT });
      // 弹窗正文固定高度，不随文件长短跳动。
      expect((body.parentElement as HTMLElement).style.height).toBe('70vh');
      expect(screen.queryByTitle('guide.txt')).not.toBeInTheDocument();
      expect(portal.getManagedKnowledgeFile).toHaveBeenCalledWith(doc.id, 'preview');
      expect(objectUrl).not.toHaveBeenCalled();
      expect(revokeObjectUrl).not.toHaveBeenCalled();
    },
    TIMEOUT * 2,
  );

  test(
    'frames a PDF original from a blob URL without a sandbox',
    async () => {
      const pdf = { ...lifecycleDocument('completed'), id: 'doc-pdf', name: 'Manual', file_name: 'manual.pdf' };
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-pdf');
      const portal = makePortal({
        listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [pdf], total: 1, page: 1, pageSize: 10 }),
        getManagedKnowledgeFile: vi.fn().mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
      });
      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findByText('Manual')).toBeInTheDocument();
      fireEvent.click(
        within(screen.getByText('Manual').closest('tr')!).getByLabelText(
          translate(ADMIN_LANGUAGE, 'knowledgePreview'),
          { selector: 'button' },
        ),
      );
      const frame = await screen.findByTitle('manual.pdf', undefined, { timeout: TIMEOUT });
      expect(frame).toHaveAttribute('src', 'blob:test-pdf');
      expect(frame).not.toHaveAttribute('sandbox');
    },
    TIMEOUT * 3,
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
      // 在预览正文中核对缓存结果。
      const previewText = () => document.querySelector('.ant-modal pre')?.textContent ?? '';
      fireEvent.click(rowUi().getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgePreview'), { selector: 'button' }));
      await waitFor(() => expect(previewText()).toBe('original'));
      // 再点一次同一条：命中缓存，不再走网络。
      fireEvent.click(rowUi().getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgePreview'), { selector: 'button' }));
      await waitFor(() => expect(previewText()).toBe('original'));
      expect(getFile).toHaveBeenCalledTimes(1);
    },
    TIMEOUT,
  );

  test(
    'refuses to frame a PDF original whose blob is not application/pdf',
    async () => {
      const pdf = { ...lifecycleDocument('completed'), id: 'doc-fake-pdf', name: 'Manual', file_name: 'manual.pdf' };
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
      const portal = makePortal({
        listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [pdf], total: 1, page: 1, pageSize: 10 }),
        // 服务端声称是 PDF，却回了 HTML：控制台不能把它塞进 iframe 当文档执行。
        getManagedKnowledgeFile: vi.fn().mockResolvedValue(new Blob(['<html>oops</html>'], { type: 'text/html' })),
      });
      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findByText('Manual')).toBeInTheDocument();
      fireEvent.click(
        within(screen.getByText('Manual').closest('tr')!).getByLabelText(
          translate(ADMIN_LANGUAGE, 'knowledgePreview'),
          { selector: 'button' },
        ),
      );
      expect(await screen.findByText(/未在框架中打开/, undefined, { timeout: TIMEOUT })).toBeInTheDocument();
      expect(screen.queryByTitle('manual.pdf')).not.toBeInTheDocument();
      expect(createObjectUrl).not.toHaveBeenCalled();
    },
    TIMEOUT,
  );

  test(
    'does not reopen the preview modal when an in-flight response lands after close',
    async () => {
      const doc = lifecycleDocument('failed');
      let resolveFile!: (blob: Blob) => void;
      const getFile = vi.fn(
        () =>
          new Promise<Blob>((resolve) => {
            resolveFile = resolve;
          }),
      );
      const portal = makePortal({
        listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
        getManagedKnowledgeFile: getFile,
      });
      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
      fireEvent.click(
        within(screen.getByText('Lifecycle guide').closest('tr')!).getByLabelText(
          translate(ADMIN_LANGUAGE, 'knowledgePreview'),
          { selector: 'button' },
        ),
      );
      await waitFor(() => expect(getFile).toHaveBeenCalledTimes(1));
      // 关闭弹窗：此时请求还在途。
      fireEvent.click(document.querySelector('.ant-modal-close')!);
      await waitFor(() => expect(screen.queryByText('original')).not.toBeInTheDocument());
      // 在途响应此刻才到，不能把弹窗重新弹开。
      await act(async () => {
        resolveFile(new Blob(['original'], { type: 'text/plain' }));
      });
      expect(screen.queryByText('original')).not.toBeInTheDocument();
    },
    TIMEOUT,
  );

  test(
    'keeps the cached original when an older in-flight preview finishes later',
    async () => {
      const docA = { ...lifecycleDocument('failed'), id: 'doc-alpha', name: 'Alpha doc', file_name: 'alpha.txt' };
      const docB = { ...lifecycleDocument('failed'), id: 'doc-beta', name: 'Beta doc', file_name: 'beta.txt' };
      let resolveA!: (blob: Blob) => void;
      const getFile = vi.fn((id: string) => {
        if (id === docA.id)
          return new Promise<Blob>((resolve) => {
            resolveA = resolve;
          });
        return Promise.resolve(new Blob(['beta-content'], { type: 'text/plain' }));
      });
      const portal = makePortal({
        listManagedKnowledgeDocuments: vi
          .fn()
          .mockResolvedValue({ data: [docA, docB], total: 2, page: 1, pageSize: 10 }),
        getManagedKnowledgeFile: getFile,
      });
      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      // 等两行文档都渲染出来（页面里不止一个表格，按行名判断更稳）。
      await waitFor(() => expect(screen.getAllByText(/Alpha doc|Beta doc/)).toHaveLength(2));
      const previewText = () => document.querySelector('.ant-modal pre')?.textContent ?? '';
      const rowUi = (name: string) => within(screen.getByText(name).closest('tr')!);
      // 先把 B 缓存下来。
      fireEvent.click(
        rowUi('Beta doc').getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgePreview'), { selector: 'button' }),
      );
      await waitFor(() => expect(previewText()).toBe('beta-content'));
      // 再点 A：请求在途，弹窗先占位。
      fireEvent.click(
        rowUi('Alpha doc').getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgePreview'), { selector: 'button' }),
      );
      await waitFor(() => expect(getFile).toHaveBeenCalledWith(docA.id, 'preview'));
      // 回到已缓存的 B。
      fireEvent.click(
        rowUi('Beta doc').getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgePreview'), { selector: 'button' }),
      );
      await waitFor(() => expect(previewText()).toBe('beta-content'));
      // A 迟到：不能把 B 盖回去。
      await act(async () => {
        resolveA(new Blob(['alpha-content'], { type: 'text/plain' }));
      });
      await waitFor(() => expect(previewText()).toBe('beta-content'));
      // 结构断言，别在整棵大树上做文本查询。
      expect(previewText()).not.toContain('alpha-content');
    },
    TIMEOUT,
  );

  test(
    'revokes the replaced blob URL when the same document is previewed concurrently',
    async () => {
      const doc = { ...lifecycleDocument('completed'), id: 'doc-concurrent', name: 'Manual', file_name: 'manual.pdf' };
      const created = ['blob:first', 'blob:second'];
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => created.shift()!);
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      let resolveFirst!: (blob: Blob) => void;
      const getFile = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Blob>((resolve) => {
              resolveFirst = resolve;
            }),
        )
        .mockImplementationOnce(() => Promise.resolve(new Blob(['%PDF-2.0'], { type: 'application/pdf' })));
      const portal = makePortal({
        listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
        getManagedKnowledgeFile: getFile,
      });
      render(<KnowledgeManagement portal={portal} baseId={base.id} />);
      expect(await screen.findByText('Manual')).toBeInTheDocument();
      const rowUi = () => within(screen.getByText('Manual').closest('tr')!);
      // 同一条资料连点两次：第一次在途，第二次先返回并占用缓存。
      // 两次点击放在同一个 act 里，避免第一次点击后行内按钮被置灰而吞掉第二次（真实双击同理）。
      const previewButton = rowUi().getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgePreview'), {
        selector: 'button',
      });
      await act(async () => {
        fireEvent.click(previewButton);
        fireEvent.click(previewButton);
      });
      await waitFor(() => expect(getFile).toHaveBeenCalledTimes(2));
      expect(await screen.findByTitle('manual.pdf', undefined, { timeout: TIMEOUT })).toBeInTheDocument();
      expect(createObjectUrl).toHaveBeenCalledTimes(1);
      // 第一次返回后用新条目覆盖缓存：旧的 blob URL 必须被回收，否则泄漏一份文件大小的内容。
      await act(async () => {
        resolveFirst(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
      });
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:first');
      expect(createObjectUrl).toHaveBeenCalledTimes(2);
    },
    TIMEOUT,
  );

  test('renders the document, parse, scope and updated columns the portal reports', async () => {
    const counted: ManagedKnowledgeBase = {
      ...base,
      knowledge_count: 8,
      processing_count: 2,
      updated_at: '2026-10-15T06:18:30Z',
      scope: { users: 2, teams: 1 },
    };
    const portal = makePortal({ listManagedKnowledgeBases: vi.fn().mockResolvedValue([counted]) });
    render(<KnowledgeManagement portal={portal} baseId={null} />);

    expect(await screen.findByText('Research')).toBeInTheDocument();
    const row = screen.getAllByRole('row').find((node) => node.textContent?.includes('Research'))!;
    expect(within(row).getByText('8')).toBeInTheDocument();
    expect(within(row).getByText('处理中 2 份')).toBeInTheDocument();
    expect(within(row).getByText('2 个用户 · 1 个团队')).toBeInTheDocument();
    expect(within(row).getByText(new Date('2026-10-15T06:18:30Z').toLocaleString())).toBeInTheDocument();
    // 有真实统计时不能再显示占位。
    expect(within(row).queryByText('暂未统计')).not.toBeInTheDocument();
  });

  // FAQ 库的条目落在 chunk 上，上游对 document 型才填 knowledge_count，
  // 所以 FAQ 行必须按 chunk_count 统计而不是显示 0。
  test('counts a FAQ base by its chunk count', async () => {
    const faq: ManagedKnowledgeBase = {
      ...base,
      id: 'kb-faq',
      name: 'FAQ base',
      type: 'faq',
      knowledge_count: 0,
      chunk_count: 5,
    };
    const portal = makePortal({ listManagedKnowledgeBases: vi.fn().mockResolvedValue([faq]) });
    render(<KnowledgeManagement portal={portal} baseId={null} />);

    expect(await screen.findByText('FAQ base')).toBeInTheDocument();
    const row = screen.getAllByRole('row').find((node) => node.textContent?.includes('FAQ base'))!;
    expect(within(row).getByText('5')).toBeInTheDocument();
  });

  test('keeps 暂未统计 for a base without statistics instead of showing zero', async () => {
    const portal = makePortal();
    render(<KnowledgeManagement portal={portal} baseId={null} />);

    expect(await screen.findByText('Research')).toBeInTheDocument();
    const row = screen.getAllByRole('row').find((node) => node.textContent?.includes('Research'))!;
    expect(within(row).getAllByText('暂未统计')).toHaveLength(4);
  });

  test('keeps the knowledge base list usable when the readiness probe fails', async () => {
    // portal 把 readiness 字段改名/探针报错时，不能让列表和详情一起不可用。
    const portal = makePortal({
      managedKnowledgeReadiness: vi.fn().mockRejectedValue(new Error('readiness probe unavailable')),
    });
    render(<KnowledgeManagement portal={portal} baseId={null} />);

    expect(await screen.findByText('Research')).toBeInTheDocument();
    expect(portal.listManagedKnowledgeBases).toHaveBeenCalled();
    // readiness 失败只降级顶部横幅，不落成页面级错误。
    expect(screen.queryByText('readiness probe unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText('知识库操作失败')).not.toBeInTheDocument();
  });

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
      fireEvent.click(
        within(screen.getByText('Chart').closest('tr')!).getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgePreview'), {
          selector: 'button',
        }),
      );
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

  // 断网/5xx 之后的「结果不确定」写锁必须能靠一次成功读取复位：否则编辑、删除、上传、
  // 导入、开关、分块保存会永久禁用，连点「刷新」也回不来。
  test('re-enables write actions after a successful refresh once a write result was uncertain', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('connection interrupted'));
    const portal = makePortal({ uploadManagedKnowledgeDocument: upload });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();

    await openAddMaterial('file');
    const input = screen.getByLabelText('test file picker') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['notes'], 'notes.txt', { type: 'text/plain' })],
    });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole('button', { name: /上传文档/ }));

    expect(await screen.findByText(/操作结果暂不确定/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /添加资料/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /编辑/ })).toBeDisabled();

    // 刷新成功 = 上游重新可达：解锁并告知管理员已恢复。
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'statusRefresh') }));

    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeWriteRecovered'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /添加资料/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /编辑/ })).toBeEnabled();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  // 资料级动作按行记账：上一个库在途的请求不能把新库的行锁住，切库时也必须清干净残留状态。
  test('keeps document actions usable after an in-flight request from another knowledge base', async () => {
    const other = { ...base, id: 'kb-test-2', name: 'Second base' };
    const docA = { ...lifecycleDocument('failed'), id: 'doc-alpha', name: 'Alpha guide', file_name: 'alpha.txt' };
    const docB = { ...lifecycleDocument('failed'), id: 'doc-beta', name: 'Beta guide', file_name: 'beta.txt' };
    const runAction = vi.fn().mockResolvedValue({ operationId: 'kbop-doc-action' });
    const portal = makePortal({
      listManagedKnowledgeBases: vi.fn().mockResolvedValue([base, other]),
      getManagedKnowledgeBase: vi
        .fn()
        .mockImplementation((id: string) => Promise.resolve(id === other.id ? other : base)),
      listManagedKnowledgeDocuments: vi
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve({ data: id === other.id ? [docB] : [docA], total: 1, page: 1, pageSize: 10 }),
        ),
      // 分块读取一直不返回：模拟「上一个库的请求还在途时切库」。
      listManagedKnowledgeChunks: vi.fn(() => new Promise<never>(() => {})),
      runManagedKnowledgeDocumentAction: runAction,
    });
    const view = render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Alpha guide')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /分块与来源/ }));

    const showBase = (id: string) =>
      view.rerender(
        withQueryClient(
          <ConfigProvider wave={{ disabled: true }}>
            <KnowledgeManagement portal={portal} baseId={id} />
          </ConfigProvider>,
        ),
      );

    showBase(other.id);
    expect(await screen.findByText('Beta guide')).toBeInTheDocument();
    // 别的行不能被上一行的在途动作静默吞掉（旧实现里守卫只判 documentActionId 真值）。
    fireEvent.click(screen.getByRole('menuitem', { name: /重新解析/ }));
    await waitFor(() => expect(runAction).toHaveBeenCalledWith(docB.id, 'reparse'));

    // 切回原库：那一行的行锁已被切库清掉，不再显示残留的忙碌状态。
    showBase(base.id);
    expect(await screen.findByText('Alpha guide')).toBeInTheDocument();
    const alphaRow = screen.getByText('Alpha guide').closest('tr')!;
    expect(within(alphaRow).getByRole('switch').className).not.toContain('ant-switch-loading');
  });

  // 详情横幅的「重试」必须重放失败的那个请求，并在成功后清掉 detailError（否则整页一直只读）。
  test('retries the failed detail read instead of reloading the base list', async () => {
    const getBase = vi.fn().mockRejectedValueOnce(new PortalError(503, '知识库详情读取失败')).mockResolvedValue(base);
    const portal = makePortal({ getManagedKnowledgeBase: getBase });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    expect(await screen.findByText('知识库详情读取失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeRetryRead') }));

    await waitFor(() => expect(getBase).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('知识库详情读取失败')).not.toBeInTheDocument());
    expect(portal.listManagedKnowledgeBases).toHaveBeenCalledTimes(1);
  });

  // 文件夹队列必须带库归属：切库就丢弃，绝不能把 A 库挑的文件静默传进 B 库。
  test('drops the queued folder upload when the knowledge base changes', async () => {
    const other = { ...base, id: 'kb-test-2', name: 'Second base' };
    const upload = vi.fn().mockResolvedValue({
      data: {
        id: 'doc-folder',
        knowledge_base_id: other.id,
        name: 'spec.txt',
        file_name: 'spec.txt',
        parse_status: 'pending',
        created_at: '2026-10-13T00:00:00Z',
      },
      operationId: 'kbop-folder',
    });
    const portal = makePortal({
      listManagedKnowledgeBases: vi.fn().mockResolvedValue([base, other]),
      getManagedKnowledgeBase: vi
        .fn()
        .mockImplementation((id: string) => Promise.resolve(id === other.id ? other : base)),
      uploadManagedKnowledgeDocument: upload,
    });
    const view = render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
    await openAddMaterial('folder');

    const picker = screen.getByLabelText('test folder picker') as HTMLInputElement;
    const file = new File(['spec'], 'spec.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'docs/spec.txt' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
    fireEvent.change(picker);
    expect(await screen.findByText('docs/spec.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上传文件夹/ })).toBeInTheDocument();

    view.rerender(
      withQueryClient(
        <ConfigProvider wave={{ disabled: true }}>
          <KnowledgeManagement portal={portal} baseId={other.id} />
        </ConfigProvider>,
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Second base' })).toBeInTheDocument();

    expect(screen.queryByText('docs/spec.txt')).not.toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  // 403 也可能是租户/部署错配（portal 用 403 + code 返回）：先按 code 映射，不能一律说成「没有权限」。
  test('maps a 403 with a recognizable code to its configuration message', async () => {
    const portal = makePortal({
      getManagedKnowledgeBase: vi.fn().mockRejectedValue(new PortalError(403, '上游拒绝', 'KNOWLEDGE_TENANT_MISMATCH')),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeTenantMismatchManaged'))).toBeInTheDocument();
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeForbiddenManaged'))).not.toBeInTheDocument();
  });

  // portal 用 Go 的 len() 校验（UTF-8 字节）：67 个汉字就是 201 字节，前端必须同口径拦下并说清字段与字节数。
  test('rejects base fields over the server byte limits with the offending field and size', async () => {
    const name = '知'.repeat(66);
    const create = vi
      .fn()
      .mockResolvedValue({ data: { ...base, id: 'kb-created-bytes', name }, operationId: 'kbop-bytes' });
    const portal = makePortal({ createManagedKnowledgeBase: create });
    render(<KnowledgeManagement portal={portal} baseId={null} />);
    expect(await screen.findByText('Research')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /新建知识库/ }));
    const dialog = screen.getByRole('dialog');
    const nameInput = within(dialog).getByLabelText('名称');
    fireEvent.change(nameInput, { target: { value: '知'.repeat(67) } });
    fireEvent.change(within(dialog).getByLabelText('描述'), { target: { value: '描述' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));

    expect(await screen.findByText(/超出长度上限/)).toBeInTheDocument();
    expect(screen.getByText(/名称 201 字节/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.change(nameInput, { target: { value: name } });
    fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toMatchObject({ name });
  });

  // URL 导入的后端口径：只放行可公开访问的 http(s)，拒 ftp、拒 userinfo、拒本机/内网。
  test('pre-validates an imported URL against the portal rules before submitting', async () => {
    const importURL = vi.fn().mockResolvedValue({
      data: { id: 'doc-url', knowledge_base_id: base.id, name: 'URL item', file_name: '', parse_status: 'pending' },
      operationId: 'kbop-url-import',
    });
    const portal = makePortal({ importManagedKnowledgeURL: importURL });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();

    await openAddMaterial('url');
    const dialog = screen.getByRole('dialog');
    const urlInput = within(dialog).getByLabelText('来源 URL');
    const submit = () => fireEvent.click(within(dialog).getByRole('button', { name: /导\s*入/ }));

    fireEvent.change(urlInput, { target: { value: 'ftp://files.example.test/a.txt' } });
    submit();
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeURLScheme'))).toBeInTheDocument();

    fireEvent.change(urlInput, { target: { value: 'https://user:pw@example.test/guide' } });
    submit();
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeURLUserInfo'))).toBeInTheDocument();

    fireEvent.change(urlInput, { target: { value: 'http://[::ffff:127.0.0.1]/private' } });
    submit();
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeURLPrivateHost'))).toBeInTheDocument();

    fireEvent.change(urlInput, { target: { value: 'http://kb.localhost/guide' } });
    submit();
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeURLPrivateHost'))).toBeInTheDocument();
    expect(importURL).not.toHaveBeenCalled();

    fireEvent.change(urlInput, { target: { value: 'https://docs.example.test/guide' } });
    submit();
    await waitFor(() => expect(importURL).toHaveBeenCalledWith(base.id, { url: 'https://docs.example.test/guide' }));
  });
});
