import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Image,
  Input,
  Listy,
  Modal,
  Pagination,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tree,
  Typography,
} from 'antd';
import {
  byteLength,
  byteLimitMessage,
  CONTENT_MAX_BYTES,
  type KnowledgeInspectorState,
  type PreviewState,
  type SpanTreeNode,
  t,
} from './knowledge-management-support.js';
import type { ManagedKnowledgeChunk, ManagedKnowledgeSpans } from './portal.js';

interface InspectorProps {
  inspector: KnowledgeInspectorState;
  chunksLoading: boolean;
  chunkSavingId: string | null;
  chunkEditor: ManagedKnowledgeChunk | null;
  chunkEditorText: string;
  chunkEditorOverLimit: boolean;
  chunkImageURLs: Readonly<Record<string, string>>;
  chunkImageLoading: string | null;
  preview: PreviewState | null;
  writeBlocked: boolean;
  uncertainWrite: boolean;
  saveChunk: (chunk: ManagedKnowledgeChunk, update: { content?: string; is_enabled?: boolean }) => void;
  previewChunkImage: (documentId: string, chunkId: string, index: number) => void;
  changeChunkPage: (page: number, pageSize: number) => void;
  onCloseInspector: () => void;
  onInspectorTabChange: (key: string) => void;
  onEditChunk: (chunk: ManagedKnowledgeChunk) => void;
  onCloseEditor: () => void;
  onEditText: (text: string) => void;
  onClosePreview: () => void;
}

export function KnowledgeDocumentInspector({
  inspector,
  chunksLoading,
  chunkSavingId,
  chunkEditor,
  chunkEditorText,
  chunkEditorOverLimit,
  chunkImageURLs,
  chunkImageLoading,
  preview,
  writeBlocked,
  uncertainWrite,
  saveChunk,
  previewChunkImage,
  changeChunkPage,
  onCloseInspector,
  onInspectorTabChange,
  onEditChunk,
  onCloseEditor,
  onEditText,
  onClosePreview,
}: InspectorProps) {
  const spanTree = (span: ManagedKnowledgeSpans['trace']): SpanTreeNode => ({
    key: span.span_id,
    title: (
      <Space size={6} wrap>
        <Typography.Text>{span.name || span.kind}</Typography.Text>
        <Tag color={span.status === 'failed' ? 'error' : span.status === 'completed' ? 'success' : 'processing'}>
          {span.status || 'unknown'}
        </Tag>
        {span.duration_ms !== undefined && <Typography.Text type="secondary">{span.duration_ms} ms</Typography.Text>}
        {span.error_code && <Typography.Text type="danger">{span.error_code}</Typography.Text>}
      </Space>
    ),
    ...(span.children?.length ? { children: span.children.map(spanTree) } : {}),
  });

  return (
    <>
      <Drawer
        title={inspector?.title}
        placement="right"
        size={720}
        open={inspector !== null}
        onClose={onCloseInspector}
        destroyOnHidden
      >
        <Tabs
          activeKey={inspector?.kind === 'chunks' ? 'chunks' : 'spans'}
          onChange={onInspectorTabChange}
          items={[
            { key: 'spans', label: t('knowledgeSpans') },
            { key: 'chunks', label: t('knowledgeChunks') },
          ]}
        />
        {inspector?.kind === 'chunks' && (
          <Spin spinning={chunksLoading}>
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text type="secondary">
                {t('chunkCount')}: {inspector.total}
              </Typography.Text>
              {inspector.content.length > 0 ? (
                <Listy
                  items={[...inspector.content]}
                  rowKey="id"
                  itemRender={(chunk) => (
                    <div>
                      <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                        <Space wrap>
                          <Typography.Text strong>#{chunk.seq_id}</Typography.Text>
                          <Tag>{chunk.chunk_type || t('chunkText')}</Tag>
                          <Tag color={chunk.is_enabled ? 'success' : 'default'}>
                            {chunk.is_enabled ? t('chunkEnabled') : t('chunkDisabled')}
                          </Tag>
                          <Button
                            size="small"
                            disabled={writeBlocked || uncertainWrite || chunkSavingId !== null}
                            onClick={() => onEditChunk(chunk)}
                          >
                            {t('chunkEdit')}
                          </Button>
                          <Switch
                            size="small"
                            checked={chunk.is_enabled}
                            loading={chunkSavingId === chunk.id}
                            disabled={writeBlocked || uncertainWrite || chunkSavingId !== null}
                            aria-label={chunk.is_enabled ? t('chunkDisabled') : t('chunkEnabled')}
                            onChange={(checked) => void saveChunk(chunk, { is_enabled: checked })}
                          />
                        </Space>
                        <Typography.Paragraph
                          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 0 }}
                        >
                          {chunk.content}
                        </Typography.Paragraph>
                        {chunk.index_status === 'failed' && (
                          <Alert type="warning" showIcon title={t('chunkIndexFailed')} />
                        )}
                        {chunk.images?.map((image) => {
                          const imageKey = `${inspector.documentId}:${chunk.id}:${image.index}`;
                          const imageURL = chunkImageURLs[imageKey];
                          return (
                            <Space key={image.index} orientation="vertical" size={4}>
                              {imageURL ? (
                                <Image src={imageURL} alt={`${t('imagePreview')} ${image.index + 1}`} width={120} />
                              ) : (
                                <Button
                                  size="small"
                                  loading={chunkImageLoading === imageKey}
                                  onClick={() => void previewChunkImage(inspector.documentId, chunk.id, image.index)}
                                >
                                  {t('imagePreview')} {image.index + 1}
                                </Button>
                              )}
                            </Space>
                          );
                        })}
                      </Space>
                    </div>
                  )}
                />
              ) : (
                <Empty description={t('chunkEmpty')} />
              )}
              {inspector.total > inspector.pageSize && (
                <Pagination
                  current={inspector.page}
                  pageSize={inspector.pageSize}
                  total={inspector.total}
                  pageSizeOptions={[20, 50, 100]}
                  showSizeChanger
                  showTotal={(total) => `${t('chunkCount')}: ${total}`}
                  disabled={chunksLoading}
                  onChange={(nextPage, nextPageSize) => void changeChunkPage(nextPage, nextPageSize)}
                />
              )}
            </Space>
          </Spin>
        )}
        {inspector?.kind === 'spans' && (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label={t('parse')}>{inspector.content.parse_status || '—'}</Descriptions.Item>
              <Descriptions.Item label={t('currentStage')}>{inspector.content.current_stage || '—'}</Descriptions.Item>
              <Descriptions.Item label={t('attempt')}>
                {inspector.content.attempt} / {inspector.content.latest_attempt}
              </Descriptions.Item>
            </Descriptions>
            <Tree style={{ width: '100%' }} treeData={[spanTree(inspector.content.trace)]} defaultExpandAll />
          </Space>
        )}
      </Drawer>
      <Modal
        title={t('chunkEdit')}
        open={chunkEditor !== null}
        onCancel={onCloseEditor}
        onOk={() => chunkEditor && void saveChunk(chunkEditor, { content: chunkEditorText })}
        confirmLoading={chunkSavingId === chunkEditor?.id}
        okButtonProps={{
          disabled: writeBlocked || uncertainWrite || !chunkEditorText.trim() || chunkEditorOverLimit,
        }}
        okText={t('save')}
        cancelText={t('cancel')}
        destroyOnHidden
      >
        <Typography.Text type="secondary">
          {t('chunkRevision')}: {chunkEditor?.content_revision}
        </Typography.Text>
        {chunkEditorOverLimit && (
          <Alert
            type="warning"
            showIcon
            title={byteLimitMessage(t('chunkContent'), CONTENT_MAX_BYTES, byteLength(chunkEditorText))}
          />
        )}
        <Input.TextArea
          value={chunkEditorText}
          onChange={(event) => onEditText(event.target.value)}
          rows={10}
          maxLength={CONTENT_MAX_BYTES}
          showCount
        />
      </Modal>
      <Modal
        title={preview?.name ?? t('knowledgePreview')}
        open={preview !== null}
        footer={null}
        onCancel={onClosePreview}
        width={960}
        destroyOnHidden
      >
        {preview &&
          (preview.loading ? (
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                height: '70vh',
                justifyContent: 'center',
              }}
            >
              <Spin />
            </div>
          ) : (
            // 固定高度：不随文件长短跳动；内容超出在框内滚动/缩放。
            <div style={{ height: '70vh', overflow: 'auto' }}>
              {preview.kind === 'text' ? (
                <pre className="whitespace-pre-wrap break-words" style={{ fontSize: 13, margin: 0 }}>
                  {preview.text}
                </pre>
              ) : preview.kind === 'image' ? (
                <img
                  src={preview.url}
                  alt={preview.name}
                  style={{ display: 'block', margin: '0 auto', maxHeight: '100%', maxWidth: '100%' }}
                />
              ) : preview.incompatible ? (
                <Alert
                  type="warning"
                  showIcon
                  title={t('knowledgePreviewUnavailable')}
                  description={`${t('fileName')}: ${preview.name}`}
                />
              ) : (
                <iframe
                  title={preview.name}
                  src={preview.url}
                  style={{ border: 0, display: 'block', height: '100%', width: '100%' }}
                />
              )}
            </div>
          ))}
      </Modal>
    </>
  );
}
