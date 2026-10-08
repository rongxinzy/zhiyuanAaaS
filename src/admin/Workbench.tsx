// The employee workbench: the regular-user surface hosted inside the
// console app (one deployment, one login, role-switched). Non-admin
// accounts land here directly; administrators switch over from the 管理后台
// shell. The shell reuses the admin layout classes (plain antd tokens —
// deliberately no Tea theme), and the roster follows the 员工工作台
// wireframes: 数字员工 / 用途 / 权限来源 / 状态 / 开始使用.
import { LogoutOutlined, PlusOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, Layout, Row, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { type ReactNode, useEffect, useState } from 'react';
import { ChatHandoffModal, useChatHandoff } from './chat-handoff.js';
import type { AdminConsoleClient, AdminIdentity } from './client.js';
import { formatTimestamp } from './format.js';
import { type AdminLanguage, translate } from './i18n.js';
import {
  isSessionExpired,
  PortalClient,
  type PortalEmployee,
  type PortalEmployeeAccess,
  type PortalMe,
  type PortalRequest,
} from './portal.js';
import { shellCopy as c } from './shell-copy.js';
import { WorkbenchApply, WorkbenchSubmitted } from './WorkbenchApply.js';
import { requestStateTag, WorkbenchRequestDetail, WorkbenchRequests } from './WorkbenchRequests.js';
import { workbenchT } from './workbench-copy.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof workbenchT>[0]): string => workbenchT(key, language);

export function Workbench({
  client,
  identity,
  canManage,
  route,
  themeControl,
  onSignOut,
  signingOut,
  portal,
}: {
  readonly client: AdminConsoleClient;
  readonly identity: AdminIdentity | undefined;
  /** True when the account may switch into the admin console. */
  readonly canManage: boolean;
  /** Current hash route (always in the workbench/... tree). */
  readonly route: string;
  readonly themeControl: ReactNode;
  readonly onSignOut: () => void;
  readonly signingOut: boolean;
  /** Test seam: injected portal client (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
}) {
  const [resolvedPortal] = useState(() => portal ?? new PortalClient(() => client.getAccessToken()));
  const navigate = (next: string) => {
    window.location.hash = next;
  };
  const [, subpage, detail] = route.split('/');
  let content: ReactNode;
  switch (subpage) {
    case 'apply':
      content = <WorkbenchApply portal={resolvedPortal} navigate={navigate} />;
      break;
    case 'submitted':
      content = <WorkbenchSubmitted portal={resolvedPortal} requestId={detail ?? ''} navigate={navigate} />;
      break;
    case 'requests':
      content = detail ? (
        <WorkbenchRequestDetail portal={resolvedPortal} requestId={detail} navigate={navigate} />
      ) : (
        <WorkbenchRequests portal={resolvedPortal} navigate={navigate} />
      );
      break;
    default:
      content = <WorkbenchHome client={client} portal={resolvedPortal} navigate={navigate} onSignOut={onSignOut} />;
  }
  return (
    <Layout className="admin-shell">
      <Layout className="admin-body">
        <Layout.Header className="admin-header">
          <Typography.Text strong>
            <RobotOutlined /> {c.brandShort} · {t('brand')}
          </Typography.Text>
          <Space wrap>
            {canManage && <Button onClick={() => navigate('overview')}>{t('switchToAdmin')}</Button>}
            {themeControl}
            <Typography.Text className="admin-user">{identity?.user.displayName}</Typography.Text>
            <Button aria-label={c.signOut} icon={<LogoutOutlined />} loading={signingOut} onClick={onSignOut}>
              {c.signOut}
            </Button>
          </Space>
        </Layout.Header>
        <Layout.Content className="admin-content">
          <div className="admin-page">{content}</div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

function WorkbenchHome({
  client,
  portal,
  navigate,
  onSignOut,
}: {
  readonly client: AdminConsoleClient;
  readonly portal: PortalClient;
  readonly navigate: (route: string) => void;
  readonly onSignOut: () => void;
}) {
  const [me, setMe] = useState<PortalMe | null>(null);
  const [employees, setEmployees] = useState<readonly PortalEmployee[] | null>(null);
  const [requests, setRequests] = useState<readonly PortalRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [rosterFailed, setRosterFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [revision, refresh] = useState(0);
  const { handoff, openChat, retry, close } = useChatHandoff({ client, portal });

  useEffect(() => {
    let live = true;
    setLoading(true);
    setRosterFailed(false);
    setExpired(false);
    void portal
      .me()
      .then((value) => {
        if (live) setMe(value);
      })
      .catch((error: unknown) => {
        if (live && isSessionExpired(error)) setExpired(true);
      });
    void portal
      .listEmployees()
      .then((items) => {
        if (live) setEmployees(items);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setEmployees(null);
        if (isSessionExpired(error)) setExpired(true);
        else setRosterFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    void portal
      .myRequests()
      .then((items) => {
        if (live) setRequests(items);
      })
      .catch((error: unknown) => {
        if (live && isSessionExpired(error)) setExpired(true);
      });
    return () => {
      live = false;
    };
  }, [portal, revision]);

  const quotaFull = Boolean(me && me.quota.limit > 0 && me.quota.used >= me.quota.limit);
  const applyDisabled = !me || quotaFull || me.policyMode === 'admin-only';
  const applyHint = !me
    ? t('applyLoadFailed')
    : quotaFull
      ? t('applyQuotaFull')
      : me.policyMode === 'admin-only'
        ? t('applyPolicyAdminOnly')
        : undefined;

  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>{t('title')}</Typography.Title>
          <Typography.Paragraph type="secondary">{t('desc')}</Typography.Paragraph>
        </div>
        <Space wrap>
          {me && me.quota.limit > 0 && (
            <Tooltip title={t('quotaHint')}>
              <Typography.Text type="secondary">
                {t('quotaLabel')}：{me.quota.used}/{me.quota.limit}
              </Typography.Text>
            </Tooltip>
          )}
          <Tooltip title={applyHint}>
            <span>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={applyDisabled}
                onClick={() => navigate('workbench/apply')}
              >
                {t('actionApply')}
              </Button>
            </span>
          </Tooltip>
          <Button onClick={() => navigate('workbench/requests')}>{t('actionMyRequests')}</Button>
          <Button
            aria-label={translate(language, 'refresh')}
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => refresh((n) => n + 1)}
          />
        </Space>
      </div>
      {expired && (
        <Alert
          type="error"
          showIcon
          title={t('sessionExpired')}
          action={
            <Button size="small" onClick={onSignOut}>
              {t('signInAgain')}
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      {rosterFailed && <Alert type="warning" showIcon title={t('rosterFailed')} style={{ marginBottom: 16 }} />}
      <Row gutter={[20, 20]}>
        <Col xs={24} xl={16}>
          <Table
            rowKey="name"
            loading={loading}
            dataSource={[...(employees ?? [])]}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('rosterEmpty')} /> }}
            scroll={{ x: 720 }}
            columns={[
              {
                title: t('colEmployee'),
                render: (_, employee) => (
                  <div>
                    <Typography.Text strong>{employee.displayName || employee.name}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary">{employee.name}</Typography.Text>
                  </div>
                ),
              },
              {
                title: t('colPurpose'),
                render: (_, employee) => employee.description || t('purposeMissing'),
              },
              {
                title: t('colAccess'),
                render: (_, employee) => accessText(employee.accessReason, me),
              },
              {
                title: t('colStatus'),
                render: (_, employee) => phaseTag(employee.phase),
              },
              {
                title: t('colAction'),
                render: (_, employee) => {
                  const usable = employee.phase === 'Ready' || employee.phase === 'Sleeping';
                  const hint = usable
                    ? employee.phase === 'Sleeping'
                      ? t('startSleeping')
                      : undefined
                    : t('startUnavailable');
                  const button = (
                    <Button type="primary" size="small" disabled={!usable} onClick={() => void openChat(employee)}>
                      {t('actionStart')}
                    </Button>
                  );
                  return hint ? (
                    <Tooltip title={hint}>
                      <span>{button}</span>
                    </Tooltip>
                  ) : (
                    button
                  );
                },
              },
            ]}
          />
        </Col>
        <Col xs={24} xl={8}>
          <Card
            title={t('myRequestsTitle')}
            extra={
              <Button type="link" size="small" onClick={() => navigate('workbench/requests')}>
                {t('myRequestsViewAll')}
              </Button>
            }
          >
            {requests && requests.length > 0 ? (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                {requests.slice(0, 3).map((request) => (
                  <div key={request.id}>
                    <Typography.Text strong>{request.displayName || request.employeeName}</Typography.Text>
                    <br />
                    <Space size={8}>
                      {requestStateTag(request.state)}
                      <Typography.Text type="secondary">{formatTimestamp(request.createdAt)}</Typography.Text>
                    </Space>
                  </div>
                ))}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('myRequestsEmpty')} />
            )}
          </Card>
        </Col>
      </Row>
      <ChatHandoffModal handoff={handoff} onRetry={retry} onClose={close} />
    </section>
  );
}

// accessReason.kind mirrors the portal's canAccessEmployee branch order;
// legacy-team ids resolve against the caller's own team names.
function accessText(reason: PortalEmployeeAccess | undefined, me: PortalMe | null): string {
  if (!reason) return t('accessUnknown');
  switch (reason.kind) {
    case 'owner':
      return t('accessOwner');
    case 'admin':
      return t('accessAdmin');
    case 'all':
      return t('accessAll');
    case 'user':
      return t('accessUser');
    case 'team':
      return `${t('accessTeam')} · ${reason.teamName || reason.teamId || ''}`;
    case 'legacy-team': {
      const name = me?.teams.find((team) => team.id === reason.teamId)?.name;
      return `${t('accessLegacyTeam')} · ${name || reason.teamId || ''}`;
    }
    default:
      return t('accessUnknown');
  }
}

function phaseTag(phase: string): ReactNode {
  if (phase === 'Ready') return <Tag color="success">{t('phaseReady')}</Tag>;
  if (phase === 'Pending') return <Tag color="processing">{t('phasePending')}</Tag>;
  if (phase === 'Sleeping') return <Tag color="default">💤 {t('phaseSleeping')}</Tag>;
  if (phase === 'Error') return <Tag color="error">{t('phaseError')}</Tag>;
  return <Tag>{phase || t('phaseUnknown')}</Tag>;
}
