import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ADMIN_LANGUAGE, translate } from './i18n.js';
import type { ManagedKnowledgeFAQEntry, ManagedKnowledgeFolder, ManagedKnowledgeTag, PortalClient } from './portal.js';
import { PortalError } from './portal.js';

const tr = (key: Parameters<typeof translate>[1]) => translate(ADMIN_LANGUAGE, key);

function operationError(cause: unknown): string {
  const parts = [cause instanceof Error ? cause.message : String(cause)];
  if (cause instanceof PortalError && cause.operationId)
    parts.push(`${tr('knowledgeOperation')}: ${cause.operationId}`);
  if (cause instanceof PortalError && cause.resourceId) parts.push(`${tr('knowledgeResourceId')}: ${cause.resourceId}`);
  if (!(cause instanceof PortalError) || cause.status >= 500) parts.push(tr('knowledgeUncertain'));
  return parts.join(' · ');
}

export function KnowledgeOperations({
  portal,
  baseId,
  documentIds,
  baseType,
  disabled = false,
}: {
  readonly portal: PortalClient;
  readonly baseId: string;
  readonly documentIds: readonly string[];
  readonly baseType: string;
  readonly disabled?: boolean;
}) {
  const { message } = App.useApp();
  const [tags, setTags] = useState<readonly ManagedKnowledgeTag[]>([]);
  const [folders, setFolders] = useState<readonly ManagedKnowledgeFolder[]>([]);
  const [faq, setFaq] = useState<readonly ManagedKnowledgeFAQEntry[]>([]);
  const [faqPage, setFaqPage] = useState(1);
  const [faqTotal, setFaqTotal] = useState(0);
  const [selectedDocs, setSelectedDocs] = useState<readonly string[]>([]);
  const [selectedDocTags, setSelectedDocTags] = useState<readonly string[]>([]);
  const [selectedFAQ, setSelectedFAQ] = useState<readonly number[]>([]);
  const [selectedFAQTag, setSelectedFAQTag] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('');
  const [tagEditor, setTagEditor] = useState<{ readonly id: string } | null>(null);
  const [folderFrom, setFolderFrom] = useState('');
  const [folderTo, setFolderTo] = useState('');
  const [folderEditor, setFolderEditor] = useState(false);
  const [faqEditor, setFaqEditor] = useState<ManagedKnowledgeFAQEntry | null | undefined>(undefined);
  const [faqForm] = Form.useForm<{ question: string; answer: string; tagId?: number | undefined }>();
  const loadGeneration = useRef(0);
  const tagOptions = useMemo(() => tags.map((tag) => ({ value: tag.seq_id, label: tag.name })), [tags]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const generation = ++loadGeneration.current;
      setLoading(true);
      setError(null);
      try {
        const [tagRows, folderTree, faqResult] = await Promise.all([
          portal.listManagedKnowledgeTags(baseId, '', signal),
          portal.getManagedKnowledgeFolders(baseId, signal),
          baseType === 'faq'
            ? portal.listManagedKnowledgeFAQ(baseId, { page: faqPage, pageSize: 20 }, signal)
            : Promise.resolve({ data: [], total: 0, page: 1, page_size: 20 }),
        ]);
        if (!signal?.aborted && generation === loadGeneration.current) {
          setTags(tagRows);
          setFolders(folderTree.folders);
          setFaq(faqResult.data);
          setFaqTotal(faqResult.total);
          setBlocked(false);
        }
      } catch (cause) {
        if (signal?.aborted || generation !== loadGeneration.current) return;
        setError(operationError(cause));
        if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setBlocked(true);
        if (!(cause instanceof PortalError) || cause.status >= 500) setBlocked(true);
      } finally {
        if (!signal?.aborted && generation === loadGeneration.current) setLoading(false);
      }
    },
    [baseId, baseType, faqPage, portal],
  );

  useEffect(() => {
    const controller = new AbortController();
    setTags([]);
    setFolders([]);
    setFaq([]);
    setSelectedDocs([]);
    setSelectedDocTags([]);
    setSelectedFAQ([]);
    void load(controller.signal);
    return () => {
      controller.abort();
      loadGeneration.current += 1;
    };
  }, [load]);

  useEffect(() => {
    setFaqPage(1);
  }, [baseId, baseType]);

  const writesDisabled = disabled || blocked || busy || !!error;
  const mutate = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (disabled || blocked || busy || error) return false;
    setBusy(true);
    try {
      const result = await action();
      const operationId =
        typeof result === 'object' && result !== null && 'operationId' in result
          ? String((result as { operationId: unknown }).operationId)
          : '';
      message.success(
        `${tr('knowledgeOperationDone')}${operationId ? ` · ${tr('knowledgeOperation')}: ${operationId}` : ''}`,
      );
      await load();
      setBlocked(false);
      return true;
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 403)) setBlocked(true);
      setError(operationError(cause));
      if (!(cause instanceof PortalError) || cause.status >= 500) setBlocked(true);
      message.error(tr('knowledgeOperationFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const flatten = (items: readonly ManagedKnowledgeFolder[]): ManagedKnowledgeFolder[] =>
    items.flatMap((item) => [item, ...flatten(item.children ?? [])]);
  const folderRows = flatten(folders);
  const tagColumns: ColumnsType<ManagedKnowledgeTag> = [
    { title: tr('knowledgeTagName'), dataIndex: 'name' },
    { title: tr('knowledgeTagColor'), dataIndex: 'color', render: (value: string) => value || '—' },
    {
      title: tr('knowledgeActions'),
      render: (_, tag) => (
        <Space>
          <Button
            size="small"
            disabled={writesDisabled}
            onClick={() => {
              setTagName(tag.name);
              setTagColor(tag.color);
              setTagEditor({ id: tag.id });
            }}
          >
            {tr('knowledgeEdit')}
          </Button>
          <Popconfirm
            title={tr('knowledgeTagDeleteConfirm')}
            onConfirm={() => void mutate(() => portal.deleteManagedKnowledgeTag(baseId, tag.id))}
          >
            <Button size="small" danger disabled={writesDisabled}>
              {tr('knowledgeDelete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];
  const faqColumns: ColumnsType<ManagedKnowledgeFAQEntry> = [
    { title: tr('knowledgeFAQQuestion'), dataIndex: 'standard_question', ellipsis: true },
    {
      title: tr('knowledgeFAQAnswer'),
      dataIndex: 'answers',
      render: (answers: readonly string[]) => answers[0] ?? '—',
      ellipsis: true,
    },
    {
      title: tr('knowledgeFAQEnabled'),
      dataIndex: 'is_enabled',
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'success' : 'default'}>
          {enabled ? tr('knowledgeChunkEnabled') : tr('knowledgeChunkDisabled')}
        </Tag>
      ),
    },
    {
      title: tr('knowledgeActions'),
      render: (_, entry) => (
        <Space>
          <Button
            size="small"
            disabled={writesDisabled}
            onClick={() => {
              faqForm.setFieldsValue({
                question: entry.standard_question,
                answer: entry.answers[0] ?? '',
                tagId: entry.tag_id || undefined,
              });
              setFaqEditor(entry);
            }}
          >
            {tr('knowledgeEdit')}
          </Button>
          <Popconfirm
            title={tr('knowledgeFAQDeleteConfirm')}
            onConfirm={() => void mutate(() => portal.deleteManagedKnowledgeFAQEntries(baseId, [entry.id]))}
          >
            <Button size="small" danger disabled={writesDisabled}>
              {tr('knowledgeDelete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const saveFAQ = async () => {
    const values = await faqForm.validateFields();
    const succeeded = await mutate(() =>
      portal.saveManagedKnowledgeFAQ(baseId, faqEditor?.id ?? null, {
        standard_question: values.question,
        similar_questions: faqEditor?.similar_questions ?? [],
        negative_questions: faqEditor?.negative_questions ?? [],
        answers: faqEditor
          ? [values.answer, ...faqEditor.answers.slice(1)]
          : values.answer
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean),
        ...(faqEditor ? { answer_strategy: faqEditor.answer_strategy } : {}),
        ...(values.tagId ? { tag_id: values.tagId } : {}),
        is_enabled: faqEditor?.is_enabled ?? true,
        is_recommended: faqEditor?.is_recommended ?? false,
      }),
    );
    if (succeeded) setFaqEditor(undefined);
  };

  return (
    <section aria-label={tr('knowledgeOperations')}>
      <Typography.Title level={5}>{tr('knowledgeOperations')}</Typography.Title>
      {error && <AlertBox text={error} retry={() => void load()} />}
      {!error && (
        <Tabs
          items={[
            {
              key: 'tags',
              label: tr('knowledgeTags'),
              children: (
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <Space wrap>
                    <Input
                      aria-label={tr('knowledgeTagName')}
                      maxLength={128}
                      value={tagName}
                      onChange={(event) => setTagName(event.target.value)}
                      placeholder={tr('knowledgeTagName')}
                    />
                    <Input
                      aria-label={tr('knowledgeTagColor')}
                      maxLength={32}
                      value={tagColor}
                      onChange={(event) => setTagColor(event.target.value)}
                      placeholder={tr('knowledgeTagColor')}
                    />
                    <Button
                      type="primary"
                      disabled={writesDisabled || !tagName.trim()}
                      loading={busy}
                      onClick={() =>
                        void mutate(async () => {
                          const result = await portal.createManagedKnowledgeTag(baseId, {
                            name: tagName.trim(),
                            ...(tagColor ? { color: tagColor } : {}),
                          });
                          setTagName('');
                          setTagColor('');
                          return result;
                        })
                      }
                    >
                      {tr('knowledgeTagCreate')}
                    </Button>
                  </Space>
                  <Table
                    rowKey="id"
                    size="small"
                    loading={loading}
                    columns={tagColumns}
                    dataSource={tags}
                    pagination={false}
                    locale={{ emptyText: tr('knowledgeTagsEmpty') }}
                  />
                </Space>
              ),
            },
            {
              key: 'folders',
              label: tr('knowledgeFolders'),
              children: (
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <Typography.Text type="secondary">{tr('knowledgeMoveHint')}</Typography.Text>
                  <Table<ManagedKnowledgeFolder>
                    rowKey="path"
                    size="small"
                    loading={loading}
                    dataSource={folderRows}
                    pagination={false}
                    columns={[
                      { title: tr('knowledgeFolderPath'), dataIndex: 'path' },
                      { title: tr('knowledgeDocuments'), dataIndex: 'total_count' },
                      {
                        title: tr('knowledgeActions'),
                        render: (_, folder) => (
                          <Button
                            size="small"
                            disabled={writesDisabled}
                            onClick={() => {
                              setFolderFrom(folder.path);
                              setFolderTo(`${folder.path}-renamed`);
                              setFolderEditor(true);
                            }}
                          >
                            {tr('knowledgeFolderRename')}
                          </Button>
                        ),
                      },
                    ]}
                    locale={{ emptyText: tr('knowledgeFoldersEmpty') }}
                  />
                  <Space wrap>
                    <Select
                      mode="multiple"
                      maxTagCount="responsive"
                      value={selectedDocs}
                      options={documentIds.map((id) => ({ value: id, label: id }))}
                      onChange={setSelectedDocs}
                      placeholder={tr('knowledgeSelectDocuments')}
                      style={{ minWidth: 260 }}
                    />
                    <Select
                      mode="multiple"
                      maxTagCount="responsive"
                      value={selectedDocTags}
                      options={tags.map((tag) => ({ value: tag.id, label: tag.name }))}
                      onChange={setSelectedDocTags}
                      placeholder={tr('knowledgeSelectTags')}
                      style={{ minWidth: 220 }}
                    />
                    <Input
                      value={folderTo}
                      onChange={(event) => setFolderTo(event.target.value)}
                      placeholder={tr('knowledgeFolderDestination')}
                      maxLength={512}
                    />
                    <Button
                      disabled={writesDisabled || !selectedDocs.length}
                      loading={busy}
                      onClick={() =>
                        void mutate(() => portal.moveManagedKnowledgeDocuments(baseId, selectedDocs, folderTo))
                      }
                    >
                      {tr('knowledgeMove')}
                    </Button>
                    <Button
                      disabled={writesDisabled || !selectedDocs.length}
                      loading={busy}
                      onClick={() =>
                        void mutate(() =>
                          portal.setManagedKnowledgeDocumentTags(
                            baseId,
                            Object.fromEntries(selectedDocs.map((id) => [id, selectedDocTags])),
                          ),
                        )
                      }
                    >
                      {tr('knowledgeSetDocumentTags')}
                    </Button>
                  </Space>
                </Space>
              ),
            },
            ...(baseType === 'faq'
              ? [
                  {
                    key: 'faq',
                    label: tr('knowledgeFAQ'),
                    children: (
                      <Space orientation="vertical" style={{ width: '100%' }}>
                        <Space wrap>
                          <Button
                            type="primary"
                            disabled={writesDisabled}
                            onClick={() => {
                              faqForm.resetFields();
                              setFaqEditor(null);
                            }}
                          >
                            {tr('knowledgeFAQCreate')}
                          </Button>
                          <Button
                            disabled={writesDisabled || !faq.length}
                            onClick={() =>
                              void mutate(() =>
                                portal.updateManagedKnowledgeFAQFields(
                                  baseId,
                                  Object.fromEntries(faq.map((entry) => [entry.id, { is_enabled: !entry.is_enabled }])),
                                ),
                              )
                            }
                          >
                            {tr('knowledgeFAQToggleAll')}
                          </Button>
                          <Button
                            danger
                            disabled={writesDisabled || !faq.length}
                            onClick={() =>
                              void mutate(() =>
                                portal.deleteManagedKnowledgeFAQEntries(
                                  baseId,
                                  faq.map((entry) => entry.id),
                                ),
                              )
                            }
                          >
                            {tr('knowledgeFAQDeleteAll')}
                          </Button>
                          <Select
                            allowClear
                            value={selectedFAQTag ?? undefined}
                            options={tagOptions}
                            onChange={(value: number | undefined) => setSelectedFAQTag(value ?? null)}
                            placeholder={tr('knowledgeFAQTag')}
                            style={{ minWidth: 180 }}
                          />
                          <Button
                            disabled={writesDisabled || !selectedFAQ.length}
                            loading={busy}
                            onClick={() =>
                              void mutate(() =>
                                portal.updateManagedKnowledgeFAQTags(
                                  baseId,
                                  Object.fromEntries(selectedFAQ.map((id) => [id, selectedFAQTag])),
                                ),
                              )
                            }
                          >
                            {tr('knowledgeFAQSetTags')}
                          </Button>
                        </Space>
                        <Table
                          rowKey="id"
                          size="small"
                          loading={loading}
                          columns={faqColumns}
                          dataSource={faq}
                          pagination={{
                            current: faqPage,
                            pageSize: 20,
                            total: faqTotal,
                            onChange: setFaqPage,
                            showTotal: (total) => `${tr('knowledgeFAQ')}: ${total}`,
                          }}
                          rowSelection={{
                            selectedRowKeys: [...selectedFAQ],
                            onChange: (keys) => setSelectedFAQ(keys.map(Number)),
                          }}
                          locale={{ emptyText: tr('knowledgeFAQEmpty') }}
                        />
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
      <Modal
        title={tr('knowledgeTagEdit')}
        open={tagEditor !== null}
        onCancel={() => setTagEditor(null)}
        okText={tr('knowledgeSave')}
        cancelText={tr('knowledgeCancel')}
        onOk={() => {
          if (tagEditor)
            void mutate(() =>
              portal.updateManagedKnowledgeTag(baseId, tagEditor.id, { name: tagName.trim(), color: tagColor }),
            ).then((succeeded) => {
              if (succeeded) setTagEditor(null);
            });
        }}
        confirmLoading={busy}
        okButtonProps={{ disabled: writesDisabled || !tagName.trim() }}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Input
            aria-label={tr('knowledgeTagName')}
            maxLength={128}
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
          />
          <Input
            aria-label={tr('knowledgeTagColor')}
            maxLength={32}
            value={tagColor}
            onChange={(event) => setTagColor(event.target.value)}
          />
        </Space>
      </Modal>
      <Modal
        title={tr('knowledgeFolderRename')}
        open={folderEditor}
        onCancel={() => setFolderEditor(false)}
        okText={tr('knowledgeSave')}
        cancelText={tr('knowledgeCancel')}
        onOk={() => {
          void mutate(() => portal.renameManagedKnowledgeFolder(baseId, folderFrom, folderTo)).then((succeeded) => {
            if (succeeded) setFolderEditor(false);
          });
        }}
        confirmLoading={busy}
        okButtonProps={{ disabled: writesDisabled || !folderFrom.trim() || !folderTo.trim() }}
        destroyOnHidden
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Input
            aria-label={tr('knowledgeFolderPath')}
            value={folderFrom}
            onChange={(event) => setFolderFrom(event.target.value)}
          />
          <Input
            aria-label={tr('knowledgeFolderDestination')}
            value={folderTo}
            onChange={(event) => setFolderTo(event.target.value)}
            maxLength={512}
          />
        </Space>
      </Modal>
      <Modal
        title={faqEditor ? tr('knowledgeFAQEdit') : tr('knowledgeFAQCreate')}
        open={faqEditor !== undefined}
        onCancel={() => setFaqEditor(undefined)}
        onOk={() => void saveFAQ()}
        confirmLoading={busy}
        okButtonProps={{ disabled: writesDisabled }}
        destroyOnHidden
      >
        <Form form={faqForm} layout="vertical">
          <Form.Item
            name="question"
            label={tr('knowledgeFAQQuestion')}
            rules={[{ required: true, whitespace: true, max: 2000 }]}
          >
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <Form.Item
            name="answer"
            label={tr('knowledgeFAQAnswer')}
            rules={[{ required: true, whitespace: true, max: 20000 }]}
          >
            <Input.TextArea rows={6} maxLength={20000} />
          </Form.Item>
          <Form.Item name="tagId" label={tr('knowledgeFAQTag')}>
            <Select allowClear options={tagOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}

function AlertBox({ text, retry }: { readonly text: string; readonly retry: () => void }) {
  return (
    <div role="alert">
      <Typography.Text type="danger">{text}</Typography.Text>{' '}
      <Button size="small" onClick={retry}>
        {tr('knowledgeRetryRead')}
      </Button>
    </div>
  );
}
