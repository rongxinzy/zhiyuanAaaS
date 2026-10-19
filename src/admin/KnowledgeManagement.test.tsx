// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  base,
  lifecycleDocument,
  makePortal,
  openAddMaterial,
  render,
} from '../../tests/helpers/knowledge-management.js';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { KnowledgeManagement } from './KnowledgeManagement.js';
import { PortalError } from './portal.js';

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
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
    await openAddMaterial('file');
    const input = screen.getByLabelText('test file picker') as HTMLInputElement;
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole('button', { name: /上传文档/ }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /编辑/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /删除/ })).toBeDisabled();

    rejectUpload(new Error('connection interrupted'));
    expect(await screen.findByText(/操作结果暂不确定/)).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  test('shows document authorization failure instead of a successful empty list', async () => {
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockRejectedValue(new PortalError(403, 'forbidden')),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    expect(await screen.findByText('没有权限访问知识库管理。')).toBeInTheDocument();
    expect(screen.queryByText('暂无文档')).not.toBeInTheDocument();
    // 文档读取被拒时写操作整体锁住，而不是伪装成空列表：统一入口「添加资料」变灰。
    expect(screen.getByRole('button', { name: /添加资料/ })).toBeDisabled();
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

  test('returns to the registry after a confirmed successful base deletion', async () => {
    const remove = vi.fn().mockResolvedValue({ operationId: 'kbop-base-deleted' });
    const portal = makePortal({ deleteManagedKnowledgeBase: remove });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByRole('heading', { name: base.name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /删除/ }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));
    expect(await screen.findByText(/kbop-base-deleted/)).toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith(base.id);
    expect(screen.getByRole('heading', { name: '知识库管理' })).toBeInTheDocument();
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
    expect(screen.getByText('Updated details')).toBeInTheDocument();
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
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByRole('heading', { name: 'Research' })).toBeInTheDocument();
    await openAddMaterial('file');
    const input = screen.getByLabelText('test file picker') as HTMLInputElement;
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

  test('rejects an oversized single file locally and retains the upload dialog', async () => {
    const portal = makePortal();
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    await screen.findByRole('heading', { name: base.name });
    await openAddMaterial('file');
    const file = new File(['synthetic oversized file'], 'large.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { value: 64 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText('test file picker'), { target: { files: [file] } });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /上传文档/ }));
    expect(await within(dialog).findByText(translate(ADMIN_LANGUAGE, 'knowledgeFileLimit'))).toBeInTheDocument();
    expect(portal.uploadManagedKnowledgeDocument).not.toHaveBeenCalled();
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
    await openAddMaterial('folder');

    const picker = screen.getByLabelText('test folder picker') as HTMLInputElement;
    const nested = new File(['day one'], 'day-one.md', { type: 'text/markdown' });
    Object.defineProperty(nested, 'webkitRelativePath', { value: 'handbook/onboarding/day-one.md' });
    const top = new File(['readme'], 'README.md', { type: 'text/markdown' });
    Object.defineProperty(top, 'webkitRelativePath', { value: 'handbook/README.md' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [nested, top] });
    fireEvent.change(picker);

    expect(await screen.findByText('handbook/onboarding/day-one.md')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /上传文件夹/ }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    // The folder structure travels as WeKnora's fileName argument.
    expect(upload).toHaveBeenNthCalledWith(1, base.id, nested, 'handbook/onboarding/day-one.md');
    expect(upload).toHaveBeenNthCalledWith(2, base.id, top, 'handbook/README.md');
    expect(await screen.findByText(/已受理 2 · 失败 0/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
    await openAddMaterial('folder');

    const picker = screen.getByLabelText('test folder picker') as HTMLInputElement;
    const file = new File(['spec'], 'spec.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'docs/spec.txt' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
    fireEvent.change(picker);
    fireEvent.click(screen.getByRole('button', { name: /上传文件夹/ }));

    expect(await screen.findByText(/失败 1/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('文件类型不受支持')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重试失败项/ }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/已受理 1 · 失败 0/)).toBeInTheDocument();
  });

  test('retains a failed file selection in the upload dialog and closes only after acceptance', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new PortalError(400, '文件类型不受支持'))
      .mockResolvedValue({ operationId: 'kbop-retry' });
    const portal = makePortal({ uploadManagedKnowledgeDocument: upload });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    await screen.findByRole('heading', { name: 'Research' });
    await openAddMaterial('file');
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('test file picker'), { target: { files: [file] } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /上传文档/ }));
    await screen.findByText('文件类型不受支持');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /上传文档/ })).not.toHaveClass('ant-btn-loading'));
    fireEvent.click(screen.getByRole('button', { name: /上传文档/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(upload).toHaveBeenNthCalledWith(2, base.id, file, 'notes.txt');
  });

  test('navigates to audit scoped to the current knowledge base', async () => {
    const navigate = vi.fn();
    render(<KnowledgeManagement portal={makePortal()} baseId={base.id} onNavigate={navigate} />);
    fireEvent.click(await screen.findByRole('button', { name: '查看本库操作记录' }));
    expect(navigate).toHaveBeenCalledWith(`audit/knowledge/${base.id}`);
  });

  test('does not retry an uncertain folder upload after a successful list refresh', async () => {
    const upload = vi
      .fn()
      .mockRejectedValue(new PortalError(504, '结果待核实', 'UPSTREAM', 'kbop-pending', 'doc-pending'));
    render(<KnowledgeManagement portal={makePortal({ uploadManagedKnowledgeDocument: upload })} baseId={base.id} />);
    await screen.findByRole('heading', { name: 'Research' });
    await openAddMaterial('folder');
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'docs/notes.txt' });
    fireEvent.change(screen.getByLabelText('test folder picker'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /上传文件夹/ }));
    await screen.findByText(/kbop-pending/);
    expect(screen.getByText(/doc-pending/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试失败项/ })).toBeDisabled();
    expect(upload).toHaveBeenCalledTimes(1);
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
    await openAddMaterial('folder');

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

    fireEvent.click(screen.getByRole('button', { name: /上传文件夹/ }));
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
    await openAddMaterial('url');
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

    await openAddMaterial('manual');
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

  test('renders upstream enums in Chinese for source, document status and base type', async () => {
    const doc = { ...lifecycleDocument('completed'), source: 'file', enable_status: 'enabled' };
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      managedKnowledgeReadiness: vi.fn().mockResolvedValue({
        deploymentId: 'deployment-test',
        tenantId: '10000',
        tenant: 'verified',
        embeddingModel: {
          state: 'configured',
          id: 'embedding-test',
          name: 'bge-small-zh-v1.5',
          availability: 'unverified',
        },
        storage: 'unverified',
        parser: 'unverified',
      }),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    expect(await screen.findByText('Lifecycle guide')).toBeInTheDocument();
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);
    const rowUi = () => within(screen.getByText('Lifecycle guide').closest('tr')!);
    // 来源与文件名/大小合并成「资料名称」的副标题一行，所以按行内容匹配（行内可能多处出现「文件」）。
    expect(rowUi().getAllByText(/文件/).length).toBeGreaterThan(0);
    expect(rowUi().getByText('已启用')).toBeInTheDocument();
    expect(screen.getByText('文档库')).toBeInTheDocument();
    // 有模型名时显示名字，不再甩 UUID。
    expect(screen.getByText('bge-small-zh-v1.5')).toBeInTheDocument();
    expect(screen.queryByText('embedding-test')).not.toBeInTheDocument();
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

  // 设计确定三页签：文档管理 / 检索测试 / 访问与关联；文件夹与 FAQ 归入文档管理，不再有独立运营页签。
  test('moves only selected files and refreshes the document list after confirmation', async () => {
    const doc = lifecycleDocument('completed');
    const move = vi.fn().mockResolvedValue({ operationId: 'kbop-move-file' });
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      moveManagedKnowledgeDocuments: move,
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    fireEvent.click(within((await screen.findByText(doc.name)).closest('tr')!).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /移动$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(move).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: /移\s*动/ }));
    await waitFor(() => expect(move).toHaveBeenCalledWith(base.id, [doc.id], ''));
    expect(await screen.findByText(/kbop-move-file/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(portal.listManagedKnowledgeDocuments).toHaveBeenCalledTimes(4));
    expect(within(screen.getByText(doc.name).closest('tr')!).getByRole('checkbox')).not.toBeChecked();
  });

  test('retains selected files and the operation identifier when a move outcome is uncertain', async () => {
    const doc = lifecycleDocument('completed');
    const move = vi
      .fn()
      .mockRejectedValue(
        new PortalError(502, 'move outcome unknown', 'KNOWLEDGE_WRITE_UNCERTAIN', 'kbop-move-unknown'),
      );
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      moveManagedKnowledgeDocuments: move,
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    fireEvent.click(within((await screen.findByText(doc.name)).closest('tr')!).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /移动$/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /移\s*动/ }));
    expect(await within(dialog).findByText(/kbop-move-unknown/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /移\s*动/ })).toBeDisabled();
    expect(move).toHaveBeenCalledTimes(1);
    expect(within(screen.getByText(doc.name).closest('tr')!).getByRole('checkbox')).toBeChecked();
  });

  test('reprocesses selected files once and retains only failed files for retry', async () => {
    const docs = [
      lifecycleDocument('failed'),
      { ...lifecycleDocument('failed'), id: 'doc-second', name: 'Second guide' },
    ];
    const action = vi
      .fn()
      .mockResolvedValueOnce({ operationId: 'kbop-first' })
      .mockRejectedValueOnce(new PortalError(400, 'parser unavailable'))
      .mockResolvedValueOnce({ operationId: 'kbop-retry' });
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: docs, total: 2, page: 1, pageSize: 10 }),
      runManagedKnowledgeDocumentAction: action,
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    for (const doc of docs)
      fireEvent.click(within((await screen.findByText(doc.name)).closest('tr')!).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /重新处理$/ }));
    expect(await screen.findByText(/Second guide: parser unavailable/)).toBeInTheDocument();
    expect(action.mock.calls).toEqual([
      [docs[0]!.id, 'reparse'],
      [docs[1]!.id, 'reparse'],
    ]);
    expect(within(screen.getByText(docs[0]!.name).closest('tr')!).getByRole('checkbox')).not.toBeChecked();
    expect(within(screen.getByText(docs[1]!.name).closest('tr')!).getByRole('checkbox')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /重新处理$/ }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
    expect(action).toHaveBeenLastCalledWith(docs[1]!.id, 'reparse');
  });

  test('requires confirmation before deleting selected files', async () => {
    const doc = lifecycleDocument('completed');
    const action = vi.fn().mockResolvedValue({ operationId: 'kbop-delete-file' });
    const portal = makePortal({
      listManagedKnowledgeDocuments: vi.fn().mockResolvedValue({ data: [doc], total: 1, page: 1, pageSize: 10 }),
      runManagedKnowledgeDocumentAction: action,
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);
    fireEvent.click(within((await screen.findByText(doc.name)).closest('tr')!).getByRole('checkbox'));
    fireEvent.click(within(screen.getByRole('region', { name: '批量操作' })).getByRole('button', { name: /删\s*除/ }));
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(doc.id, 'delete'));
  });

  test('renders base detail heading summary and the three business tabs', async () => {
    const portal = makePortal();
    render(<KnowledgeManagement portal={portal} baseId={base.id} onNavigate={vi.fn()} />);
    expect(await screen.findByRole('tab', { name: '文档管理' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '检索测试' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '访问与关联' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.queryByRole('tab', { name: '知识运营' })).not.toBeInTheDocument();
    // 对象摘要里 UUID 可复制
    expect(screen.getByText('kb-test-1')).toBeInTheDocument();
  });

  // 设计确认保留的原型统计条：能算的用真实统计，缺契约的（可检索数）显示暂未统计。
  test('summarises the base with real counts and marks the count without a contract', async () => {
    const counted = { ...base, knowledge_count: 7, processing_count: 1, scope: { users: 1, teams: 1 } };
    const portal = makePortal({
      listManagedKnowledgeBases: vi.fn().mockResolvedValue([counted]),
      getManagedKnowledgeBase: vi.fn().mockResolvedValue(counted),
      listManagedKnowledgeDocuments: vi
        .fn()
        .mockImplementation(async (_id: string, query: { readonly parseStatus?: string }) =>
          query.parseStatus === 'failed'
            ? { data: [], total: 2, page: 1, pageSize: 1 }
            : { data: [], total: 0, page: 1, pageSize: 10 },
        ),
      listEmployees: vi.fn().mockResolvedValue([
        { name: 'sales-helper', knowledgeBases: [{ id: base.id, name: 'Research' }] },
        { name: 'other-helper', knowledgeBases: [] },
      ]),
    });
    render(<KnowledgeManagement portal={portal} baseId={base.id} />);

    // 统计条自身有可访问名称，断言限定在条内（页面其他位置也有「暂未统计」占位）。
    const strip = within(await screen.findByRole('region', { name: translate(ADMIN_LANGUAGE, 'knowledgeSummary') }));
    expect(strip.getByText('7 篇资料')).toBeInTheDocument();
    expect(strip.getByText('1 篇处理中')).toBeInTheDocument();
    expect(strip.getByText('2 篇需处理')).toBeInTheDocument();
    expect(strip.getByText('关联 1 个 Agent')).toBeInTheDocument();
    expect(strip.getByText('2 项使用授权')).toBeInTheDocument();
    // 可检索数需要上游按启用状态统计的接口：没有就显示暂未统计，不推断、不用分页长度凑。
    expect(strip.getByText('暂未统计')).toBeInTheDocument();
    expect(portal.listManagedKnowledgeDocuments).toHaveBeenCalledWith(
      base.id,
      { page: 1, pageSize: 1, parseStatus: 'failed' },
      expect.anything(),
    );

    // 异常数量可进入对应筛选：点「需处理」把状态筛选切到 failed 并回到第一页。
    fireEvent.click(screen.getByRole('button', { name: /2 篇需处理/ }));
    await waitFor(() =>
      expect(portal.listManagedKnowledgeDocuments).toHaveBeenCalledWith(
        base.id,
        expect.objectContaining({ parseStatus: 'failed', page: 1 }),
        expect.anything(),
      ),
    );
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
});
