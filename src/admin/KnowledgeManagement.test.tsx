// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
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
});
