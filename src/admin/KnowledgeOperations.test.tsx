// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { App, ConfigProvider } from 'antd';
import type { Key, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderWithQueryClient, withQueryClient } from '../../tests/helpers/query-client.js';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { KnowledgeOperations } from './KnowledgeOperations.js';
import { type PortalClient, PortalError } from './portal.js';

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  function TableForOperationsTest({
    columns,
    dataSource,
    rowKey,
    rowSelection,
    locale,
  }: {
    readonly columns: readonly {
      readonly title?: ReactNode;
      readonly dataIndex?: string;
      readonly render?: (value: unknown, record: Record<string, unknown>, index: number) => ReactNode;
    }[];
    readonly dataSource: readonly Record<string, unknown>[];
    readonly rowKey: string;
    readonly rowSelection?: {
      readonly selectedRowKeys: readonly Key[];
      readonly onChange: (keys: Key[]) => void;
    };
    readonly locale?: { readonly emptyText?: ReactNode };
  }) {
    return (
      <table>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index}>{column.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataSource.length ? (
            dataSource.map((record, rowIndex) => {
              const id = record[rowKey] as Key;
              return (
                <tr key={id}>
                  {rowSelection && (
                    <td>
                      <input
                        type="checkbox"
                        checked={rowSelection.selectedRowKeys.includes(id)}
                        onChange={(event) =>
                          rowSelection.onChange(
                            event.currentTarget.checked
                              ? [...rowSelection.selectedRowKeys, id]
                              : rowSelection.selectedRowKeys.filter((selected) => selected !== id),
                          )
                        }
                      />
                    </td>
                  )}
                  {columns.map((column, columnIndex) => {
                    const value = column.dataIndex ? record[column.dataIndex] : undefined;
                    return (
                      <td key={columnIndex}>
                        {column.render ? column.render(value, record, rowIndex) : (value as ReactNode)}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          ) : (
            <tr>
              <td>{locale?.emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }
  return { ...actual, Table: TableForOperationsTest };
});

const labelPattern = (key: Parameters<typeof translate>[1]) =>
  new RegExp([...translate(ADMIN_LANGUAGE, key)].join('\\s*'));

function makePortal(overrides: Partial<PortalClient> = {}) {
  return {
    listManagedKnowledgeTags: vi.fn().mockResolvedValue([]),
    getManagedKnowledgeFolders: vi
      .fn()
      .mockResolvedValue({ root_document_count: 0, total_document_count: 0, folders: [] }),
    listManagedKnowledgeFAQ: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, page_size: 100 }),
    createManagedKnowledgeTag: vi.fn().mockResolvedValue({ data: { id: 'tag-1' }, operationId: 'op-tag' }),
    updateManagedKnowledgeTag: vi.fn().mockResolvedValue({ data: { id: 'tag-1' }, operationId: 'op-tag-edit' }),
    deleteManagedKnowledgeTag: vi.fn().mockResolvedValue({ deleted: true, operationId: 'op-tag-delete' }),
    moveManagedKnowledgeDocuments: vi
      .fn()
      .mockResolvedValue({ data: { outcome: 'succeeded', affectedCount: 1 }, operationId: 'op-move' }),
    renameManagedKnowledgeFolder: vi
      .fn()
      .mockResolvedValue({ data: { outcome: 'succeeded', folderPath: 'renamed' }, operationId: 'op-folder' }),
    saveManagedKnowledgeFAQ: vi.fn().mockResolvedValue({ data: { id: 1 }, operationId: 'op-faq' }),
    updateManagedKnowledgeFAQFields: vi
      .fn()
      .mockResolvedValue({ data: { outcome: 'succeeded' }, operationId: 'op-faq-batch' }),
    updateManagedKnowledgeFAQTags: vi
      .fn()
      .mockResolvedValue({ data: { outcome: 'succeeded' }, operationId: 'op-faq-tags' }),
    deleteManagedKnowledgeFAQEntries: vi
      .fn()
      .mockResolvedValue({ data: { outcome: 'succeeded' }, operationId: 'op-faq-delete' }),
    ...overrides,
  } as unknown as PortalClient;
}

function renderOperations(portal: PortalClient) {
  return renderWithQueryClient(
    <ConfigProvider>
      <App>
        <KnowledgeOperations portal={portal} baseId="kb-1" baseType="faq" documentIds={['doc-1']} />
      </App>
    </ConfigProvider>,
  );
}

describe('KnowledgeOperations', () => {
  afterEach(() => cleanup());
  // 标签管理界面已按设计移除；本页保留文件夹与 FAQ，标签只作为 FAQ 的既有分类读出来。
  test('loads the folder and FAQ surfaces, and no longer offers tag management', async () => {
    const portal = makePortal();
    renderOperations(portal);
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeFoldersEmpty'))).toBeInTheDocument();
    expect(portal.listManagedKnowledgeTags).toHaveBeenCalledWith('kb-1', '', expect.any(AbortSignal));
    expect(portal.getManagedKnowledgeFolders).toHaveBeenCalledWith('kb-1', expect.any(AbortSignal));
    expect(portal.listManagedKnowledgeFAQ).toHaveBeenCalledWith(
      'kb-1',
      { page: 1, pageSize: 20 },
      expect.any(AbortSignal),
    );
    expect(screen.queryByRole('tab', { name: '标签' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建标签' })).not.toBeInTheDocument();
    expect(portal.createManagedKnowledgeTag).not.toHaveBeenCalled();
  });

  test('does not render an empty state when a required operations read fails', async () => {
    const portal = makePortal({
      getManagedKnowledgeFolders: vi.fn().mockRejectedValue(new Error('access denied')),
    });
    renderOperations(portal);
    expect(await screen.findByRole('alert')).toHaveTextContent('access denied');
    expect(screen.queryByText(translate(ADMIN_LANGUAGE, 'knowledgeFoldersEmpty'))).not.toBeInTheDocument();
  });

  test('does not call FAQ endpoints for a document knowledge base', async () => {
    const portal = makePortal();
    renderWithQueryClient(
      <ConfigProvider>
        <App>
          <KnowledgeOperations portal={portal} baseId="kb-1" baseType="document" documentIds={[]} />
        </App>
      </ConfigProvider>,
    );
    expect(await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeFoldersEmpty'))).toBeInTheDocument();
    expect(portal.listManagedKnowledgeFAQ).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: translate(ADMIN_LANGUAGE, 'knowledgeFAQ') })).not.toBeInTheDocument();
  });

  // 读了 A 库又切到 B 库时，A 的迟到响应不能覆盖 B 的文件夹树。
  test('a late read from an old base cannot replace the new base folder tree', async () => {
    let finishOldRead!: (value: unknown) => void;
    const portal = makePortal({
      getManagedKnowledgeFolders: vi.fn().mockImplementation(async (baseId: string) =>
        baseId === 'kb-2'
          ? {
              root_document_count: 0,
              total_document_count: 1,
              folders: [{ path: 'new-base-folder', name: 'new-base-folder', document_count: 1, total_count: 1 }],
            }
          : new Promise((resolve) => {
              finishOldRead = resolve;
            }),
      ),
    });
    const renderBase = (baseId: string) => (
      <ConfigProvider>
        <App>
          <KnowledgeOperations key={baseId} portal={portal} baseId={baseId} baseType="document" documentIds={[]} />
        </App>
      </ConfigProvider>
    );
    const view = renderWithQueryClient(renderBase('kb-1'));
    view.rerender(withQueryClient(renderBase('kb-2'), view.queryClient));
    expect(await screen.findByText('new-base-folder')).toBeInTheDocument();

    finishOldRead({
      root_document_count: 0,
      total_document_count: 1,
      folders: [{ path: 'old-base-folder', name: 'old-base-folder', document_count: 1, total_count: 1 }],
    });
    // kb-1 的读取确实发生过（带 signal），只是它的迟到结果被丢弃。
    await waitFor(() =>
      expect(vi.mocked(portal.getManagedKnowledgeFolders).mock.calls.some((call) => call[0] === 'kb-1')).toBe(true),
    );
    expect(screen.queryByText('old-base-folder')).not.toBeInTheDocument();
    expect(screen.getByText('new-base-folder')).toBeInTheDocument();
  });

  test('shows operation identifiers and blocks blind writes until a read retry succeeds', async () => {
    const portal = makePortal({
      getManagedKnowledgeFolders: vi.fn().mockResolvedValue({
        root_document_count: 0,
        total_document_count: 1,
        folders: [{ path: 'manuals', name: 'manuals', document_count: 1, total_count: 1 }],
      }),
      renameManagedKnowledgeFolder: vi
        .fn()
        .mockRejectedValue(new PortalError(502, 'write outcome unknown', 'UPSTREAM', 'op-unknown', 'folder-99')),
    });
    renderOperations(portal);
    fireEvent.click(screen.getByRole('tab', { name: labelPattern('knowledgeFolders') }));
    expect(await screen.findByText('manuals')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: labelPattern('knowledgeFolderRename') }));
    const dialog = within(screen.getByRole('dialog'));
    const saveButton = dialog.getByRole('button', { name: labelPattern('knowledgeSave') });
    fireEvent.click(saveButton);
    expect(await screen.findByText(/op-unknown/)).toBeInTheDocument();
    expect(screen.getByText(/folder-99/)).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeRetryRead') }));
    await waitFor(() => expect(portal.getManagedKnowledgeFolders).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog')).getByRole('button', { name: labelPattern('knowledgeSave') }),
      ).toBeEnabled(),
    );
  });

  test('creates and batch-updates FAQ entries only for an FAQ base', async () => {
    const entry = {
      id: 10,
      knowledge_id: 'doc-1',
      knowledge_base_id: 'kb-1',
      tag_id: 0,
      tag_name: '',
      is_enabled: true,
      is_recommended: false,
      standard_question: 'How is this managed?',
      similar_questions: [],
      negative_questions: [],
      answers: ['By an admin.'],
      answer_strategy: '',
      updated_at: '',
      created_at: '',
    };
    const portal = makePortal({
      listManagedKnowledgeFAQ: vi.fn().mockResolvedValue({ data: [entry], total: 1, page: 1, page_size: 20 }),
    });
    renderOperations(portal);
    fireEvent.click(screen.getByRole('tab', { name: 'FAQ' }));
    expect(await screen.findByText(entry.standard_question)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeFAQCreate') }));
    const editor = within(screen.getByRole('dialog'));
    fireEvent.change(editor.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeFAQQuestion')), {
      target: { value: 'A new question?' },
    });
    fireEvent.change(editor.getByLabelText(`${translate(ADMIN_LANGUAGE, 'knowledgeFAQAnswer')} 1`), {
      target: { value: 'A new answer.\nSecond line of the same answer.' },
    });
    fireEvent.click(editor.getByRole('button', { name: translate(ADMIN_LANGUAGE, 'knowledgeFAQAddAnswer') }));
    fireEvent.change(editor.getByLabelText(`${translate(ADMIN_LANGUAGE, 'knowledgeFAQAnswer')} 2`), {
      target: { value: 'A second answer.' },
    });
    fireEvent.click(editor.getByRole('button', { name: 'OK' }));
    await waitFor(() =>
      expect(portal.saveManagedKnowledgeFAQ).toHaveBeenCalledWith(
        'kb-1',
        null,
        expect.objectContaining({
          standard_question: 'A new question?',
          // 上游 answers 是「多条答案」：一条答案内的换行原样保留，不拆成多条。
          answers: ['A new answer.\nSecond line of the same answer.', 'A second answer.'],
        }),
      ),
    );
  });

  test('editing an FAQ question preserves similar/negative questions, answer strategy, and answer structure', async () => {
    const entry = {
      id: 10,
      knowledge_id: 'doc-1',
      knowledge_base_id: 'kb-1',
      tag_id: 7,
      tag_name: 'Support',
      is_enabled: true,
      is_recommended: false,
      standard_question: 'Original question?',
      similar_questions: ['An alternate question?', 'Another wording?'],
      negative_questions: ['Not this question?'],
      answers: [
        'Primary answer line one.\nPrimary answer line two.',
        'Secondary answer line one.\nSecondary answer line two.',
      ],
      answer_strategy: 'best_match',
      updated_at: '',
      created_at: '',
    };
    const portal = makePortal({
      listManagedKnowledgeFAQ: vi.fn().mockResolvedValue({ data: [entry], total: 1, page: 1, page_size: 20 }),
    });
    const view = renderOperations(portal);
    fireEvent.click(within(view.container).getByRole('tab', { name: 'FAQ' }));
    const row = await waitFor(() => {
      const candidate = [...view.container.querySelectorAll<HTMLTableRowElement>('tbody tr')].find((item) =>
        item.textContent?.includes(entry.standard_question),
      );
      if (!candidate) throw new Error('FAQ entry did not render');
      return candidate;
    });
    fireEvent.click(within(row).getByRole('button', { name: labelPattern('knowledgeEdit') }));

    // 列表必须完整渲染全部答案（含每条答案内部的换行），而不是只显示第一条。
    const rowText = row.textContent ?? '';
    expect(rowText).toContain(entry.answers[0]!);
    expect(rowText).toContain(entry.answers[1]!);

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error('FAQ editor dialog did not open');
    const editor = within(dialog);
    // 编辑必须完整回填全部答案（含每条答案内部的换行）。
    expect(editor.getByLabelText(`${translate(ADMIN_LANGUAGE, 'knowledgeFAQAnswer')} 1`)).toHaveValue(entry.answers[0]);
    expect(editor.getByLabelText(`${translate(ADMIN_LANGUAGE, 'knowledgeFAQAnswer')} 2`)).toHaveValue(entry.answers[1]);
    fireEvent.change(editor.getByLabelText(translate(ADMIN_LANGUAGE, 'knowledgeFAQQuestion')), {
      target: { value: 'Updated question?' },
    });
    fireEvent.change(editor.getByLabelText(`${translate(ADMIN_LANGUAGE, 'knowledgeFAQAnswer')} 2`), {
      target: { value: 'Edited secondary answer.\nStill two lines.' },
    });
    await act(async () => {
      fireEvent.click(editor.getByRole('button', { name: 'OK' }));
      await waitFor(() =>
        expect(portal.saveManagedKnowledgeFAQ).toHaveBeenCalledWith('kb-1', entry.id, {
          standard_question: 'Updated question?',
          similar_questions: entry.similar_questions,
          negative_questions: entry.negative_questions,
          answers: [entry.answers[0], 'Edited secondary answer.\nStill two lines.'],
          answer_strategy: entry.answer_strategy,
          tag_id: entry.tag_id,
          is_enabled: entry.is_enabled,
          is_recommended: entry.is_recommended,
        }),
      );
    });
  });

  test('batch-updates FAQ fields and tags for selected entries', async () => {
    const entry = {
      id: 10,
      knowledge_id: 'doc-1',
      knowledge_base_id: 'kb-1',
      tag_id: 0,
      tag_name: '',
      is_enabled: true,
      is_recommended: false,
      standard_question: 'How is this managed?',
      similar_questions: [],
      negative_questions: [],
      answers: ['By an admin.'],
      answer_strategy: '',
      updated_at: '',
      created_at: '',
    };
    const portal = makePortal({
      listManagedKnowledgeFAQ: vi.fn().mockResolvedValue({ data: [entry], total: 1, page: 1, page_size: 20 }),
    });
    renderOperations(portal);
    fireEvent.click(screen.getByRole('tab', { name: 'FAQ' }));
    expect(await screen.findByText(entry.standard_question)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: labelPattern('knowledgeFAQToggleAll') }));
    await waitFor(() =>
      expect(portal.updateManagedKnowledgeFAQFields).toHaveBeenCalledWith('kb-1', {
        10: { is_enabled: false },
      }),
    );

    const row = within(screen.getByText(entry.standard_question).closest('tr')!);
    fireEvent.click(row.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: labelPattern('knowledgeFAQSetTags') }));
    await waitFor(() => expect(portal.updateManagedKnowledgeFAQTags).toHaveBeenCalledWith('kb-1', { 10: null }));
    fireEvent.click(screen.getByRole('button', { name: labelPattern('knowledgeFAQDeleteAll') }));
    expect(portal.deleteManagedKnowledgeFAQEntries).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }));
    await waitFor(() => expect(portal.deleteManagedKnowledgeFAQEntries).toHaveBeenCalledWith('kb-1', [10]));
  });

  test('deleting the FAQ page requires a confirmation that states the affected count', async () => {
    const entries = [10, 11].map((id) => ({
      id,
      knowledge_id: 'doc-1',
      knowledge_base_id: 'kb-1',
      tag_id: 0,
      tag_name: '',
      is_enabled: true,
      is_recommended: false,
      standard_question: `Question ${id}?`,
      similar_questions: [],
      negative_questions: [],
      answers: [`Answer ${id}.`],
      answer_strategy: '',
      updated_at: '',
      created_at: '',
    }));
    const portal = makePortal({
      listManagedKnowledgeFAQ: vi.fn().mockResolvedValue({ data: entries, total: 2, page: 1, page_size: 20 }),
    });
    renderOperations(portal);
    fireEvent.click(screen.getByRole('tab', { name: 'FAQ' }));
    expect(await screen.findByText('Question 10?')).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: labelPattern('knowledgeFAQDeleteAll') });
    fireEvent.click(trigger);
    // 未点确认前不得发出删除请求。
    expect(portal.deleteManagedKnowledgeFAQEntries).not.toHaveBeenCalled();
    expect(
      await screen.findByText(translate(ADMIN_LANGUAGE, 'knowledgeFAQDeleteAllConfirm').replace('{count}', '2')),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(portal.deleteManagedKnowledgeFAQEntries).toHaveBeenCalledWith('kb-1', [10, 11]));
  });

  test('renames a folder through the fixed folder endpoint', async () => {
    const portal = makePortal({
      getManagedKnowledgeFolders: vi.fn().mockResolvedValue({
        root_document_count: 0,
        total_document_count: 1,
        folders: [{ path: 'manuals', name: 'manuals', document_count: 1, total_count: 1 }],
      }),
    });
    renderOperations(portal);
    fireEvent.click(screen.getByRole('tab', { name: labelPattern('knowledgeFolders') }));
    expect(await screen.findByText('manuals')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: labelPattern('knowledgeFolderRename') }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: labelPattern('knowledgeSave') }));
    await waitFor(() =>
      expect(portal.renameManagedKnowledgeFolder).toHaveBeenCalledWith('kb-1', 'manuals', 'manuals-renamed'),
    );
  });
});
