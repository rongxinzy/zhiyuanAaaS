import type { PlatformUser } from '@aep/sdk-node';
import { useQuery } from '@tanstack/react-query';
import { Alert, Descriptions, Modal, Space, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { runBatch } from './batch.js';
import { type AdminConsoleClient, type AdminIdentity, AdminPermission, hasAdminPermission } from './client.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { t, UnknownText } from './resources-shared.js';

export function DisableUserModal({
  client,
  identity,
  user,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly user: PlatformUser;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const canRevokeSessions = hasAdminPermission(identity, AdminPermission.SessionsWrite);
  // Disabling the account that backs this console session signs the operator
  // out together with the target, so the confirmation must say so explicitly.
  const isSelf = identity?.user.id === user.id;
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ readonly revoked: number; readonly failed: number } | null>(null);
  useEffect(() => {
    if (open) setResult(null);
  }, [open, user.id]);
  const activeSessionsQuery = useQuery({
    queryKey: ['admin', 'user-active-session-count', user.id],
    enabled: open,
    gcTime: 0,
    queryFn: () =>
      client
        .sessions(user.id)
        .then((sessions) => sessions.filter((session) => !session.revokedAt).length)
        .catch(() => null),
  });
  const activeSessions = activeSessionsQuery.data ?? null;
  const sessionsUnknown = activeSessionsQuery.data === null;
  const disable = async () => {
    setPending(true);
    try {
      await client.updateUser(user.id, { status: 'disabled' });
      let revoked = 0;
      let failed = 0;
      if (canRevokeSessions) {
        try {
          const sessions = await client.sessions(user.id);
          const outcomes = await runBatch(
            sessions.filter((session) => !session.revokedAt).map((session) => session.sessionId),
            (sessionId) => client.revokeUserSession(sessionId),
          );
          revoked = outcomes.filter((outcome) => outcome.ok).length;
          failed = outcomes.length - revoked;
        } catch {
          failed = -1;
        }
      } else {
        failed = -1;
      }
      setResult({ revoked, failed });
      await onChanged();
    } catch {
      onError();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={result ? rc.disableResultTitle : `${rc.disableUserTitle}：${user.displayName}`}
      okText={result ? rc.ok : rc.confirmDisableUser}
      cancelText={t('cancel')}
      okButtonProps={result ? {} : { danger: true }}
      confirmLoading={pending}
      mask={{ closable: false }}
      cancelButtonProps={result ? { style: { display: 'none' } } : {}}
      onOk={() => {
        if (result) onOpenChange(false);
        else void disable();
      }}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      {result ? (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Alert type="success" showIcon title={rc.disableAccountDone} />
          <Alert
            type={result.failed !== 0 ? 'warning' : 'info'}
            showIcon
            title={
              result.failed > 0
                ? rc.disableSessionsFailed
                : result.failed < 0
                  ? canRevokeSessions
                    ? rc.disableSessionsUnknown
                    : rc.disableSessionsNoPermission
                  : result.revoked > 0
                    ? `${rc.disableSessionsRevoked}：${result.revoked}`
                    : rc.disableSessionsNone
            }
          />
          <Typography.Text type="secondary">{rc.disableBoundaryNote}</Typography.Text>
        </Space>
      ) : (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Alert type="warning" showIcon title={rc.disableUserImpact} />
          {isSelf ? <Alert type="error" showIcon title={rc.disableSelfWarning} /> : null}
          <Descriptions
            column={1}
            size="small"
            items={[
              {
                key: 'sessions',
                label: rc.disableUserActiveSessions,
                children:
                  activeSessions !== null ? (
                    String(activeSessions)
                  ) : sessionsUnknown ? (
                    <UnknownText>{rc.disableUserSessionsUnknown}</UnknownText>
                  ) : (
                    <Spin spinning size="small" />
                  ),
              },
            ]}
          />
          <Typography.Text type="secondary">{rc.disableUserOwnershipNote}</Typography.Text>
        </Space>
      )}
    </Modal>
  );
}
