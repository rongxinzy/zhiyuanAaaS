import { Button, Space, Typography } from 'antd';
import { t } from './knowledge-management-support.js';
import type { ManagedKnowledgeBase } from './portal.js';
export function knowledgeBaseColumns(openBase: (id: string) => void) {
  return [
    {
      title: t('name'),
      key: 'name',
      render: (_: unknown, row: ManagedKnowledgeBase) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{row.name}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {row.id}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('descriptionField'),
      dataIndex: 'description',
      key: 'description',
      render: (value: string | undefined) => value || t('notStatistic'),
    },
    // 文档数 / 解析状态 / 使用范围 / 更新时间：取 portal 下发的真实统计；
    // 任一项缺失（老服务、上游没报、刚创建）都按后台设计约定显示「暂未统计」。
    {
      title: t('columnDocs'),
      key: 'documents',
      render: (_: unknown, row: ManagedKnowledgeBase) => {
        // FAQ 库的知识条目落在 chunk 上，上游对 document 型才填 knowledge_count。
        const count = row.type === 'faq' ? row.chunk_count : row.knowledge_count;
        return typeof count === 'number' ? String(count) : t('notStatistic');
      },
    },
    {
      title: t('parse'),
      key: 'parse',
      render: (_: unknown, row: ManagedKnowledgeBase) =>
        typeof row.processing_count !== 'number'
          ? t('notStatistic')
          : row.processing_count > 0
            ? t('parseProcessing').replace('{count}', String(row.processing_count))
            : t('parseCompleted'),
    },
    {
      title: t('columnScope'),
      key: 'scope',
      render: (_: unknown, row: ManagedKnowledgeBase) =>
        row.scope
          ? t('scopeSummary').replace('{users}', String(row.scope.users)).replace('{teams}', String(row.scope.teams))
          : t('notStatistic'),
    },
    {
      title: t('columnUpdated'),
      key: 'updated',
      render: (_: unknown, row: ManagedKnowledgeBase) =>
        row.updated_at ? new Date(row.updated_at).toLocaleString() : t('notStatistic'),
    },
    {
      title: t('knowledgeActions'),
      key: 'actions',
      render: (_: unknown, row: ManagedKnowledgeBase) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => openBase(row.id)}>
          {t('manageDocuments')}
        </Button>
      ),
    },
  ];
}
