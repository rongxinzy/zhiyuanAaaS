import { FilePdfOutlined, FileTextOutlined, MoreOutlined } from '@ant-design/icons';
import type { MenuProps, theme } from 'antd';
import { Button, Dropdown, type Modal, Space, Switch, Tag, Typography } from 'antd';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import {
  type CopyKey,
  formatFileSize,
  formatTimestamp,
  pollable,
  sourceCopy,
  t,
} from './knowledge-management-support.js';
import type { ManagedKnowledgeDocument } from './portal.js';

type ColumnOptions = {
  readonly token: ReturnType<typeof theme.useToken>['token'];
  readonly modal: ReturnType<typeof Modal.useModal>[0];
  readonly deletionSync: {
    readonly entries: readonly { readonly id: string; readonly stalled: boolean; readonly uncertain?: boolean }[];
  };
  readonly documentActionBusy: (id: string) => boolean;
  readonly writeBlocked: boolean;
  readonly uploading: boolean;
  readonly importing: boolean;
  readonly inspectDocument: (document: ManagedKnowledgeDocument, kind: 'chunks' | 'spans') => Promise<void>;
  readonly openDocumentFile: (document: ManagedKnowledgeDocument, kind: 'preview' | 'download') => Promise<void>;
  readonly setDocumentEnabled: (document: ManagedKnowledgeDocument, enabled: boolean) => Promise<void>;
  readonly runDocumentAction: (
    document: ManagedKnowledgeDocument,
    action: 'delete' | 'reparse' | 'cancel-parse',
  ) => Promise<void>;
};

export function knowledgeDocumentColumns({
  token,
  modal,
  deletionSync,
  documentActionBusy,
  writeBlocked,
  uploading,
  importing,
  inspectDocument,
  openDocumentFile,
  setDocumentEnabled,
  runDocumentAction,
}: ColumnOptions) {
  return [
    {
      // 资料主列：名称 + 次级信息（文件名、大小、来源）；上游 DTO 暂无 folder_path，
      // 所以路径不进副标题（补契约后再加）。
      title: t('docName'),
      key: 'name',
      render: (_: unknown, row: ManagedKnowledgeDocument) => {
        const secondary = [
          row.file_name,
          formatFileSize(row.file_size),
          row.source ? (sourceCopy[row.source] ? t(sourceCopy[row.source]!) : row.source) : (row.type ?? ''),
        ]
          .filter((part): part is string => Boolean(part))
          .join(' · ');
        const isPdf = (row.file_type ?? row.file_name ?? '').toLowerCase().includes('pdf');
        return (
          <Space orientation="vertical" size={0}>
            <Space size={6}>
              {isPdf ? (
                <FilePdfOutlined style={{ color: token.colorError }} />
              ) : (
                <FileTextOutlined style={{ color: token.colorPrimary }} />
              )}
              <Typography.Link onClick={() => void inspectDocument(row, 'spans')}>
                {row.name || row.file_name}
              </Typography.Link>
            </Space>
            {secondary ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {secondary}
              </Typography.Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      // 按原型：状态只说「能不能被检索」，启停动作移入行操作菜单。
      title: t('parse'),
      key: 'parse_status',
      render: (_: unknown, row: ManagedKnowledgeDocument) => {
        const pendingDeletion = deletionSync.entries.find((item) => item.id === row.id);
        if (pendingDeletion || row.parse_status === 'deleting') {
          return (
            <Tag color={pendingDeletion?.stalled || pendingDeletion?.uncertain ? 'warning' : 'processing'}>
              {pendingDeletion?.stalled || pendingDeletion?.uncertain
                ? translate(ADMIN_LANGUAGE, 'knowledgeDeleteUnconfirmed')
                : t('deleting')}
            </Tag>
          );
        }
        const completed = row.parse_status === 'completed';
        const disabled = completed ? row.enable_status === 'disabled' : row.manual_disabled === true;
        return (
          <Space orientation="vertical" size={2}>
            <Tag color={completed ? 'success' : row.parse_status === 'failed' ? 'error' : 'processing'}>
              {pollable.has(row.parse_status) || ['completed', 'failed', 'cancelled'].includes(row.parse_status)
                ? t(row.parse_status as CopyKey)
                : t('unknown')}
            </Tag>
            <Space size={4}>
              <Typography.Text type="secondary">
                {disabled
                  ? t('enableDisabled')
                  : row.enable_status === 'enabled'
                    ? t('enableEnabled')
                    : t('notStatistic')}
              </Typography.Text>
              <Switch
                checked={completed ? row.enable_status === 'enabled' : row.manual_disabled === true}
                aria-label={
                  completed
                    ? row.enable_status === 'enabled'
                      ? t('disableDocument')
                      : t('enableDocument')
                    : t('keepDisabledAfterParse')
                }
                loading={documentActionBusy(row.id)}
                disabled={
                  writeBlocked ||
                  uploading ||
                  importing ||
                  documentActionBusy(row.id) ||
                  (!completed && (row.manual_disabled === undefined || row.manual_disabled))
                }
                onChange={(next) => void setDocumentEnabled(row, completed ? next : false)}
              />
            </Space>
          </Space>
        );
      },
    },
    {
      title: t('createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string) => formatTimestamp(value),
    },
    {
      title: t('knowledgeActions'),
      key: 'actions',
      fixed: 'right' as const,
      render: (_: unknown, row: ManagedKnowledgeDocument) => {
        const actionBusy = documentActionBusy(row.id);
        const canCancel = ['pending', 'processing', 'finalizing'].includes(row.parse_status);
        const writesDisabled = writeBlocked || actionBusy || uploading || importing;
        const completed = row.parse_status === 'completed';
        const enabled = completed ? row.enable_status === 'enabled' : row.manual_disabled !== true;
        const moreItems: MenuProps['items'] = [
          { key: 'chunks', label: t('knowledgeChunks'), disabled: actionBusy },
          { key: 'spans', label: t('knowledgeSpans'), disabled: actionBusy },
          { key: 'download', label: t('knowledgeDownload'), disabled: !row.file_name || actionBusy },
          { type: 'divider' },
          { key: 'reparse', label: t('knowledgeRetryParse'), disabled: writesDisabled },
          ...(canCancel ? [{ key: 'cancel-parse', label: t('knowledgeCancelParse'), disabled: writesDisabled }] : []),
          {
            key: 'toggle',
            label: enabled ? t('disableDocument') : t('enableDocument'),
            disabled: writesDisabled || (!completed && (row.manual_disabled === undefined || enabled)),
          },
          { type: 'divider' },
          { key: 'delete', label: t('knowledgeDeleteDocument'), danger: true, disabled: writesDisabled },
        ];
        return (
          <Space size={4}>
            <Button
              type="link"
              size="small"
              aria-label={t('knowledgePreview')}
              disabled={actionBusy}
              onClick={() => void openDocumentFile(row, 'preview')}
            >
              {t('viewDocument')}
            </Button>
            <Dropdown
              menu={{
                items: moreItems,
                onClick: ({ key, domEvent }) => {
                  domEvent.stopPropagation();
                  if (key === 'download') return void openDocumentFile(row, 'download');
                  if (key === 'chunks') return void inspectDocument(row, 'chunks');
                  if (key === 'spans') return void inspectDocument(row, 'spans');
                  if (key === 'toggle') return void setDocumentEnabled(row, !enabled);
                  if (key === 'delete')
                    return modal.confirm({
                      title: t('knowledgeDeleteDocument'),
                      content: t('knowledgeDeleteDocumentHint'),
                      okText: t('knowledgeDeleteConfirm'),
                      cancelText: t('cancel'),
                      okButtonProps: { danger: true },
                      onOk: () => runDocumentAction(row, 'delete'),
                    });
                  return void runDocumentAction(row, key === 'cancel-parse' ? 'cancel-parse' : 'reparse');
                },
              }}
            >
              <Button type="text" size="small" aria-label={t('moreActions')} icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];
}
