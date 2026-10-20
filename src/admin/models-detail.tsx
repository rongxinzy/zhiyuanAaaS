import type { AdminModel, ModelAssignment, PlatformUser } from '@aep/sdk-node';
import { UserOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Drawer, Empty, Popconfirm, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { AdminConsoleClient, AdminDataPlane } from './client.js';
import { translate } from './i18n.js';
import { modelCapabilitiesText } from './model-capabilities.js';
import { ConfigStatusPanel } from './models-config.js';
import { formatDateTime, language, subjectTypeLabel, t } from './models-shared.js';

export function ModelDetailDrawer({
  client,
  model,
  users,
  assignments,
  canWrite,
  canAssign,
  dataPlane,
  dataPlaneError,
  dataPlaneLoading,
  dataPlaneAllowed,
  onDataPlaneRefresh,
  onClose,
  onChanged,
  onError,
  onEdit,
  onGrant,
  onDelete,
}: {
  readonly client: AdminConsoleClient;
  readonly model: AdminModel | null;
  readonly users: readonly PlatformUser[];
  readonly assignments: readonly ModelAssignment[];
  readonly canWrite: boolean;
  readonly canAssign: boolean;
  readonly dataPlane: AdminDataPlane | null;
  readonly dataPlaneError: string | null;
  readonly dataPlaneLoading: boolean;
  readonly dataPlaneAllowed: boolean;
  readonly onDataPlaneRefresh: () => Promise<void>;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onEdit: (model: AdminModel) => void;
  readonly onGrant: (model: AdminModel) => void;
  readonly onDelete: (model: AdminModel) => void;
}) {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const userNames = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const revoke = async (assignmentId: string) => {
    setRevokingId(assignmentId);
    try {
      await client.deleteModelAssignment(assignmentId);
      await onChanged();
    } catch {
      onError();
    } finally {
      setRevokingId(null);
    }
  };
  if (!model) return <Drawer open={false} onClose={onClose} />;

  const accessColumns = [
    {
      title: t('accessColSubject'),
      key: 'subject',
      render: (_: unknown, assignment: ModelAssignment) => {
        const user = userNames.get(assignment.subject.id);
        return user ? `${user.displayName}（${user.username}）` : assignment.subject.id;
      },
    },
    {
      title: t('accessColType'),
      key: 'type',
      width: 90,
      render: (_: unknown, assignment: ModelAssignment) => <Tag>{subjectTypeLabel(assignment.subject.type)}</Tag>,
    },
    {
      title: t('accessColTime'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
    ...(canAssign
      ? [
          {
            title: translate(language, 'actions'),
            key: 'actions',
            align: 'right' as const,
            render: (_: unknown, assignment: ModelAssignment) => (
              <Popconfirm
                title={translate(language, 'revokeConfirmTitle')}
                description={translate(language, 'revokeConfirmDescription')}
                okText={translate(language, 'confirmRevoke')}
                cancelText={translate(language, 'cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => void revoke(assignment.id)}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  disabled={revokingId === assignment.id}
                  onClick={(event) => event.stopPropagation()}
                >
                  {translate(language, 'revoke')}
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <Drawer
      open
      size={720}
      onClose={onClose}
      title={
        <Space size={8}>
          <span>{model.displayName}</span>
          {model.enabled ? <Tag color="success">{t('stateEnabled')}</Tag> : <Tag>{t('stateDisabled')}</Tag>}
          {model.isDefault ? <Tag color="blue">{translate(language, 'defaultModel')}</Tag> : null}
        </Space>
      }
    >
      <Tabs
        defaultActiveKey="basic"
        items={[
          {
            key: 'basic',
            label: t('detailTabBasic'),
            children: (
              <div className="flex flex-col gap-4">
                <Space wrap>
                  {canWrite ? (
                    <>
                      <Button type="primary" onClick={() => onEdit(model)}>
                        {translate(language, 'editModel')}
                      </Button>
                      <Button danger onClick={() => onDelete(model)}>
                        {translate(language, 'delete')}
                      </Button>
                    </>
                  ) : null}
                  {canAssign ? (
                    <Button icon={<UserOutlined />} onClick={() => onGrant(model)}>
                      {translate(language, 'grantModel')}
                    </Button>
                  ) : null}
                </Space>
                <Descriptions
                  bordered
                  size="small"
                  column={1}
                  items={[
                    { key: 'id', label: t('labelModelId'), children: model.id },
                    {
                      key: 'displayName',
                      label: translate(language, 'modelName'),
                      children: model.displayName,
                    },
                    {
                      key: 'upstream',
                      label: t('labelUpstream'),
                      children: model.upstreamModel || model.localModelRef || t('notProvided'),
                    },
                    {
                      key: 'endpoint',
                      label: translate(language, 'modelEndpoint'),
                      children: (
                        <Typography.Text copyable style={{ fontFamily: 'monospace' }}>
                          {model.endpoint || t('notProvided')}
                        </Typography.Text>
                      ),
                    },
                    { key: 'protocol', label: t('labelProtocol'), children: model.protocol },
                    { key: 'source', label: t('labelSource'), children: model.sourceType },
                    {
                      key: 'credential',
                      label: t('labelCredential'),
                      children: model.credentialId ?? t('labelCredentialMissing'),
                    },
                    {
                      key: 'capabilities',
                      label: t('labelCapabilities'),
                      children: modelCapabilitiesText(model),
                    },
                  ]}
                />
                <Alert type="info" showIcon title={t('credentialNote')} />
              </div>
            ),
          },
          {
            key: 'access',
            label: t('detailTabAccess'),
            children: (
              <div className="flex flex-col gap-4">
                <Space wrap>
                  {canAssign ? (
                    <Button type="primary" onClick={() => onGrant(model)}>
                      {t('accessAction')}
                    </Button>
                  ) : null}
                </Space>
                <Alert type="info" showIcon title={t('accessHint')} />
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={assignments}
                  columns={accessColumns}
                  pagination={{ hideOnSinglePage: true }}
                  locale={{
                    emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('accessEmpty')} />,
                  }}
                />
              </div>
            ),
          },
          {
            key: 'employees',
            label: t('detailTabEmployees'),
            children: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('associatedGapTitle')}>
                <Typography.Paragraph type="secondary" style={{ maxWidth: 480, margin: '0 auto' }}>
                  {t('associatedGapDescription')}
                </Typography.Paragraph>
              </Empty>
            ),
          },
          {
            key: 'status',
            label: t('detailTabStatus'),
            children: (
              <ConfigStatusPanel
                model={model}
                dataPlane={dataPlane}
                error={dataPlaneError}
                loading={dataPlaneLoading}
                allowed={dataPlaneAllowed}
                onRefresh={onDataPlaneRefresh}
              />
            ),
          },
        ]}
      />
    </Drawer>
  );
}
