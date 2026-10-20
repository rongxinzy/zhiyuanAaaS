import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Descriptions,
  Empty,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import { useState } from 'react';
import {
  type AdminConsoleClient,
  type AdminIdentity,
  AdminPermission,
  type AdminUserSession,
  hasAdminPermission,
} from './client.js';
import { formatTimestamp } from './format.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { EnabledBadge, PAGINATION, t, UnknownText, useMutationRunner } from './resources-shared.js';
import { SessionClientCell, SessionClientDetail } from './session-client.js';

export function UserAccountLinks({
  client,
  identity,
  userId,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly userId: string;
  readonly onError: () => void;
}) {
  const canRead = hasAdminPermission(identity, AdminPermission.IdentityRead);
  const canWrite = hasAdminPermission(identity, AdminPermission.IdentityWrite);
  const linksQuery = useQuery({
    queryKey: ['admin', 'identity-links', userId],
    enabled: canRead,
    gcTime: 0,
    queryFn: async () => {
      const sources = (await client.identitySources()).items;
      const mappings = await Promise.all(sources.map((source) => client.identityMappings(source.id)));
      return sources.flatMap((source, index) =>
        (mappings[index]?.items ?? [])
          .filter((mapping) => mapping.localSubjectId === userId)
          .map((mapping) => ({
            key: `${source.id}:${mapping.externalId}`,
            source,
            externalId: mapping.externalId,
            status: mapping.status,
          })),
      );
    },
  });
  const rows = linksQuery.data ?? null;
  const loading = linksQuery.isFetching;
  const error = linksQuery.isError;
  const load = async () => {
    await linksQuery.refetch();
  };
  if (!canRead) return <Alert type="warning" showIcon title={rc.linksNoPermission} />;
  if (error)
    return (
      <Alert
        type="error"
        showIcon
        title={rc.linksLoadFailed}
        action={
          <Button size="small" onClick={() => void load()}>
            {rc.retry}
          </Button>
        }
      />
    );
  if (loading && !rows)
    return <Spin spinning size="large" style={{ display: 'block', padding: 24, textAlign: 'center', width: '100%' }} />;
  if (!rows || rows.length === 0)
    return (
      <Empty description={rc.linksEmpty}>
        <Typography.Text type="secondary">{rc.linksEmptyHint}</Typography.Text>
      </Empty>
    );
  return (
    <Table
      rowKey="key"
      size="small"
      pagination={false}
      dataSource={[...rows]}
      columns={[
        { title: rc.linkSource, key: 'source', render: (_, row) => row.source.displayName },
        { title: rc.linkExternal, dataIndex: 'externalId', key: 'externalId' },
        {
          title: t('status'),
          key: 'status',
          render: (_, row) => <EnabledBadge enabled={row.status === 'active'} />,
        },
        ...(canWrite
          ? [
              {
                title: t('actions'),
                key: 'actions',
                align: 'right' as const,
                render: (_: unknown, row: (typeof rows)[number]) => (
                  <Popconfirm
                    title={rc.unlinkTitle}
                    description={rc.unlinkImpact}
                    okText={rc.confirmUnlink}
                    cancelText={t('cancel')}
                    okButtonProps={{ danger: true }}
                    onConfirm={() =>
                      void (async () => {
                        try {
                          await client.deleteIdentityMapping(row.source.id, row.externalId);
                          await load();
                        } catch {
                          onError();
                        }
                      })()
                    }
                  >
                    <Button type="link" size="small" danger>
                      {rc.unlinkAction}
                    </Button>
                  </Popconfirm>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

export function UserLoginSessions({
  client,
  identity,
  userId,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly userId: string;
  readonly onError: () => void;
}) {
  const canRevoke = hasAdminPermission(identity, AdminPermission.SessionsWrite);
  const sessionsQuery = useQuery({
    queryKey: ['admin', 'user-sessions', userId],
    gcTime: 0,
    queryFn: () => client.sessions(userId),
  });
  const sessions = sessionsQuery.data ?? null;
  const loading = sessionsQuery.isFetching;
  const error = sessionsQuery.isError;
  const [detail, setDetail] = useState<AdminUserSession | null>(null);
  const load = async () => {
    await sessionsQuery.refetch();
  };
  const { pending, run } = useMutationRunner(load, onError);
  if (error)
    return (
      <Alert
        type="error"
        showIcon
        title={rc.sessionsLoadFailed}
        action={
          <Button size="small" onClick={() => void load()}>
            {rc.retry}
          </Button>
        }
      />
    );
  if (loading && !sessions)
    return <Spin spinning size="large" style={{ display: 'block', padding: 24, textAlign: 'center', width: '100%' }} />;
  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Text type="secondary">{rc.sessionsNote}</Typography.Text>
      {!sessions || sessions.length === 0 ? (
        <Empty description={rc.sessionsEmpty}>
          <Typography.Text type="secondary">{rc.sessionsEmptyHint}</Typography.Text>
        </Empty>
      ) : (
        <Table
          rowKey="sessionId"
          size="small"
          pagination={PAGINATION}
          dataSource={[...sessions]}
          columns={[
            {
              title: rc.sessionClient,
              key: 'client',
              render: (_, session) => (
                <SessionClientCell client={session.client} current={session.sessionId === client.sessionId} />
              ),
            },
            {
              title: rc.sessionLastActive,
              key: 'lastSeenAt',
              render: (_, session) => formatTimestamp(session.lastSeenAt) || <UnknownText />,
            },
            {
              title: t('status'),
              key: 'status',
              render: (_, session) => (
                <Badge
                  status={session.revokedAt ? 'default' : 'success'}
                  text={session.revokedAt ? rc.sessionStateRevoked : rc.sessionStateActive}
                />
              ),
            },
            {
              title: t('actions'),
              key: 'actions',
              align: 'right',
              render: (_, session) => (
                <Space size={0}>
                  <Button type="link" size="small" onClick={() => setDetail(session)}>
                    {rc.view}
                  </Button>
                  {canRevoke && !session.revokedAt ? (
                    session.sessionId === client.sessionId ? (
                      <Tooltip title={t('sessionCurrentRevokeDisabled')}>
                        <span>
                          <Button type="link" size="small" danger disabled>
                            {rc.revokeLogin}
                          </Button>
                        </span>
                      </Tooltip>
                    ) : (
                      <Popconfirm
                        title={rc.revokeLoginTitle}
                        description={rc.revokeLoginImpact}
                        okText={rc.confirmRevokeLogin}
                        cancelText={t('cancel')}
                        okButtonProps={{ danger: true }}
                        onConfirm={() =>
                          void run(async () => {
                            await client.revokeUserSession(session.sessionId);
                          })
                        }
                      >
                        <Button type="link" size="small" danger disabled={pending}>
                          {rc.revokeLogin}
                        </Button>
                      </Popconfirm>
                    )
                  ) : null}
                </Space>
              ),
            },
          ]}
        />
      )}
      <Modal
        open={detail !== null}
        title={rc.sessionDetail}
        footer={
          <Button type="primary" onClick={() => setDetail(null)}>
            {rc.ok}
          </Button>
        }
        onCancel={() => setDetail(null)}
      >
        {detail ? (
          <Descriptions
            column={1}
            size="small"
            items={[
              {
                key: 'sessionId',
                label: t('sessionId'),
                children: <Typography.Text copyable>{detail.sessionId}</Typography.Text>,
              },
              { key: 'userId', label: t('userId'), children: detail.userId },
              { key: 'client', label: rc.sessionClient, children: <SessionClientDetail client={detail.client} /> },
              { key: 'topic', label: rc.sessionSubject, children: detail.topic },
              {
                key: 'createdAt',
                label: rc.sessionCreatedAt,
                children: formatTimestamp(detail.createdAt) || <UnknownText />,
              },
              {
                key: 'lastSeenAt',
                label: rc.sessionLastActive,
                children: formatTimestamp(detail.lastSeenAt) || <UnknownText />,
              },
              ...(detail.revokedAt
                ? [{ key: 'revokedAt', label: rc.sessionRevokedAt, children: formatTimestamp(detail.revokedAt) }]
                : []),
            ]}
          />
        ) : null}
      </Modal>
    </Space>
  );
}
