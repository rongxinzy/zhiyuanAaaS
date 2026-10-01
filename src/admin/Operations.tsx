import type {
  AdminModel,
  CredentialAssignment,
  CredentialMetadata,
  DataPlaneRoute,
  DataPlaneStatus,
  License,
  LicenseImportRequest,
  PlatformUser,
  Role,
  Team,
} from '@aep/sdk-node';
import {
  DeleteOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Result,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { runBatch } from './batch.js';
import {
  type AdminConsoleClient,
  type AdminCredentials,
  type AdminDataPlane,
  type AdminDataPlaneCatalogComparison,
  type AdminDeploymentSettings,
  type AdminDeploymentSettingValue,
  type AdminIdentity,
  AdminModelGatewayUrlProblem,
  AdminPermission,
  AdminRequestError,
  AdminSubjectType,
  type AdminUserSession,
  hasAdminPermission,
  modelGatewayBaseUrlProblem,
} from './client.js';
/** 2026-09-30 LiXiang2019 列表查询按钮组（查询/重置/导出） */
import { ListQueryActions } from './components/ListQueryActions.js';
import { formatTimestamp } from './format.js';
import { type AdminLanguage, translate } from './i18n.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { operationsCopy as copy } from './operations-copy.js';
import { SessionClientCell, SessionClientDetail } from './session-client.js';

const language: AdminLanguage = 'zh';

/** 2026-09-30 LiXiang2019 登录会话列表筛选表单字段 */
interface SessionListFilters {
  readonly userId?: string;
  readonly status?: string;
}

const NO_USERS: readonly PlatformUser[] = [];
const NO_ROLES: readonly Role[] = [];
const NO_TEAMS: readonly Team[] = [];

type CredentialGrantTarget = {
  readonly credential: CredentialMetadata;
  readonly assignments: readonly CredentialAssignment[];
};

/**
 * Product licensing section. `section` selects which system-management page to
 * render when this module is embedded; the default is product licensing.
 */
export function Operations({
  client,
  identity,
  section = 'licenses' as 'licenses' | 'credentials' | 'status',
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly section?: 'licenses' | 'credentials' | 'status';
}) {
  if (section === 'credentials') return <CredentialPanel client={client} identity={identity} />;
  if (section === 'status') return <ConfigurationStatusPanel client={client} identity={identity} />;
  return <LicensePanel client={client} identity={identity} />;
}

/** Login sessions (登录会话). A valid credential does not mean the user is online right now. */
export function SessionsView({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  return <SessionPanel client={client} identity={identity} />;
}

/** Connection configuration (接入配置): shared service endpoints and credentials. */
export function CredentialsView({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  return <CredentialPanel client={client} identity={identity} />;
}

/** Configuration status (配置生效详情): desired vs applied revisions, read-only. */
export function ConfigurationStatusView({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  return <ConfigurationStatusPanel client={client} identity={identity} />;
}

/** Deployment runtime settings (部署运行时设置): model gateway override. */
export function DeploymentSettingsView({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  return <DeploymentSettingsPanel client={client} identity={identity} />;
}

function ModuleHeading({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Typography.Title level={4} style={{ marginBottom: 4 }}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary">
          <InfoCircleOutlined style={{ marginInlineEnd: 6 }} />
          {description}
        </Typography.Text>
      </div>
      {children ? <Space wrap>{children}</Space> : null}
    </div>
  );
}

/* --------------------------------- licenses -------------------------------- */

function LicensePanel({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const canImport = hasAdminPermission(identity, AdminPermission.LicensesWrite);
  const canRevoke = hasAdminPermission(identity, AdminPermission.LicensesRevoke);
  const [licenses, setLicenses] = useState<readonly License[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [revoking, setRevoking] = useState<License | null>(null);
  const [detail, setDetail] = useState<License | null>(null);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    void client
      .licenses()
      .then((items) => {
        if (live) setLicenses(items);
      })
      .catch(() => {
        if (live) {
          setFailed(true);
          setLicenses(null);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, revision]);

  const columns = useMemo(
    () => [
      {
        title: copy.licenseColumn,
        key: 'license',
        render: (_: unknown, license: License) => (
          <Space orientation="vertical" size={0}>
            <Typography.Text code>{license.licenseId}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {license.customerId} · {license.keyId}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: translate(language, 'licenseStatus'),
        key: 'status',
        render: (_: unknown, license: License) =>
          license.status === 'active' ? (
            <Tag color="success">{copy.licenseValid}</Tag>
          ) : (
            <Tag color="default">{copy.licenseRevoked}</Tag>
          ),
      },
      {
        title: copy.validUntil,
        key: 'expiresAt',
        render: (_: unknown, license: License) =>
          license.expiresAt ? (
            formatTimestamp(license.expiresAt)
          ) : (
            <Typography.Text type="secondary">{copy.perpetual}</Typography.Text>
          ),
      },
      {
        title: copy.userScope,
        key: 'users',
        render: (_: unknown, license: License) => license.activeUsers,
      },
      {
        title: translate(language, 'actions'),
        key: 'actions',
        render: (_: unknown, license: License) => (
          <Space size={0}>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(license)}>
              {copy.view}
            </Button>
            {canRevoke && license.status === 'active' ? (
              <Button type="link" size="small" danger onClick={() => setRevoking(license)}>
                {translate(language, 'revokeLicense')}
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [canRevoke],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <ModuleHeading title={copy.licensesTitle} description={copy.licensesDescription}>
        {canImport ? (
          <Button type="primary" icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
            {copy.importLicenseAction}
          </Button>
        ) : null}
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refresh((value) => value + 1)}>
          {translate(language, 'refresh')}
        </Button>
      </ModuleHeading>

      {failed ? (
        <Alert
          type="error"
          showIcon
          title={translate(language, 'licensesLoadFailed')}
          action={
            <Button size="small" onClick={() => refresh((value) => value + 1)}>
              {copy.retry}
            </Button>
          }
        />
      ) : null}

      {failed && licenses === null ? null : (
        <Table
          rowKey="licenseId"
          columns={columns}
          dataSource={licenses ? [...licenses] : []}
          loading={loading && licenses === null}
          scroll={{ x: 760 }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={translate(language, 'noLicenses')} />,
          }}
          pagination={{ hideOnSinglePage: true, showSizeChanger: false }}
        />
      )}

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={copy.licenseDetail}
        size="large"
        destroyOnHidden
      >
        {detail ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={copy.licenseColumn}>
              <Typography.Text code>{detail.licenseId}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="customerId">{detail.customerId}</Descriptions.Item>
            <Descriptions.Item label="deploymentId">{detail.deploymentId}</Descriptions.Item>
            <Descriptions.Item label="keyId">{detail.keyId}</Descriptions.Item>
            <Descriptions.Item label={translate(language, 'licenseStatus')}>
              {detail.status === 'active' ? (
                <Tag color="success">{copy.licenseValid}</Tag>
              ) : (
                <Tag>{copy.licenseRevoked}</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={copy.issuedAtLabel}>{formatTimestamp(detail.issuedAt)}</Descriptions.Item>
            <Descriptions.Item label={copy.validUntil}>
              {detail.expiresAt ? formatTimestamp(detail.expiresAt) : copy.perpetual}
            </Descriptions.Item>
            <Descriptions.Item label={copy.graceUntil}>{formatTimestamp(detail.graceEndsAt)}</Descriptions.Item>
            <Descriptions.Item label={copy.userScope}>{detail.activeUsers}</Descriptions.Item>
            <Descriptions.Item label={copy.moduleScope}>
              <Space wrap>
                {detail.features.map((feature) => (
                  <Tag key={feature}>{feature}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>

      {canImport ? (
        <LicenseImportModal
          client={client}
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onChanged={() => refresh((value) => value + 1)}
        />
      ) : null}
      {canRevoke && revoking ? (
        <RevokeLicenseModal
          client={client}
          license={revoking}
          onClose={() => setRevoking(null)}
          onChanged={() => refresh((value) => value + 1)}
        />
      ) : null}
    </div>
  );
}

function LicenseImportModal({
  client,
  open,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (open) {
      setFile(null);
      setFailed(false);
    }
  }, [open]);
  const submit = async () => {
    if (!file) {
      setFailed(true);
      return;
    }
    setPending(true);
    setFailed(false);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const envelope = extractLicenseEnvelope(parsed);
      if (!envelope) throw new Error('Invalid license envelope');
      await client.importLicense({ license: envelope });
      notify(AdminNotificationKind.Success, translate(language, 'changesSaved'));
      onClose();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={copy.importLicenseAction}
      okText={copy.importLicenseAction}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      destroyOnHidden
      onCancel={() => {
        if (!pending) onClose();
      }}
      onOk={() => void submit()}
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {failed ? <Alert type="error" showIcon title={translate(language, 'licenseImportFailed')} /> : null}
        <div>
          <Typography.Text strong>{translate(language, 'licenseFile')}</Typography.Text>
          <input
            type="file"
            accept=".json,application/json"
            aria-label={translate(language, 'licenseFile')}
            disabled={pending}
            style={{ display: 'block', marginTop: 8 }}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <Alert type="info" showIcon title={copy.licenseImportNote} />
      </Space>
    </Modal>
  );
}

function extractLicenseEnvelope(value: unknown): LicenseImportRequest['license'] | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = 'license' in value && value.license && typeof value.license === 'object' ? value.license : value;
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  if (
    record.format !== 'zhiyuan-license-v1' ||
    typeof record.keyId !== 'string' ||
    typeof record.signature !== 'string' ||
    !record.payload ||
    typeof record.payload !== 'object'
  )
    return null;
  return candidate as LicenseImportRequest['license'];
}

function RevokeLicenseModal({
  client,
  license,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly license: License;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async () => {
    setPending(true);
    setFailed(false);
    try {
      await client.revokeLicense(license.licenseId);
      onClose();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open
      title={translate(language, 'revokeLicenseTitle')}
      okText={translate(language, 'confirmRevokeLicense')}
      okButtonProps={{ danger: true }}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={() => {
        if (!pending) onClose();
      }}
      onOk={() => void submit()}
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {failed ? <Alert type="error" showIcon title={copy.revokeFailed} /> : null}
        <Space orientation="vertical" size={2}>
          <span>
            {copy.licenseColumn}：<Typography.Text code>{license.licenseId}</Typography.Text>
          </span>
        </Space>
        <Alert type="warning" showIcon title={copy.revokeLicenseImpact} />
        <Typography.Text type="secondary">{translate(language, 'revokeLicenseDescription')}</Typography.Text>
      </Space>
    </Modal>
  );
}

/* --------------------------------- sessions -------------------------------- */

function SessionPanel({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const canRevoke = hasAdminPermission(identity, AdminPermission.SessionsWrite);
  const canReadUsers = hasAdminPermission(identity, AdminPermission.UsersRead);
  // The console's own session never changes while it stays signed in.
  const currentSessionId = client.sessionId;
  const [sessions, setSessions] = useState<readonly AdminUserSession[] | null>(null);
  const [users, setUsers] = useState<readonly PlatformUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // 2026-09-30 LiXiang2019 登录会话筛选：点查询后才请求/过滤
  const [filterForm] = Form.useForm<SessionListFilters>();
  const [filters, setFilters] = useState<SessionListFilters>({});
  const [detail, setDetail] = useState<AdminUserSession | null>(null);
  const [revoking, setRevoking] = useState<AdminUserSession | null>(null);
  const [revision, refresh] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    const userId = filters.userId?.trim() || undefined;
    const loadUsers = canReadUsers ? client.users().catch(() => null) : Promise.resolve(null);
    void Promise.all([client.sessions(userId), loadUsers])
      .then(([items, knownUsers]) => {
        if (!live) return;
        setSessions(items);
        setUsers(knownUsers);
      })
      .catch(() => {
        if (live) {
          setFailed(true);
          setSessions(null);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, canReadUsers, filters.userId, revision]);

  const usersById = useMemo(() => new Map((users ?? NO_USERS).map((user) => [user.id, user])), [users]);

  const userCell = useCallback(
    (userId: string) => {
      const user = usersById.get(userId);
      if (user) {
        return (
          <Space orientation="vertical" size={0}>
            <span>{user.displayName}</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {userId}
            </Typography.Text>
          </Space>
        );
      }
      return <span>{userId}</span>;
    },
    [usersById],
  );

  const rows = useMemo(() => {
    if (!sessions) return [];
    if (!filters.status) return [...sessions];
    return [...sessions].filter((session) =>
      filters.status === 'revoked' ? Boolean(session.revokedAt) : !session.revokedAt,
    );
  }, [sessions, filters.status]);

  const columns = useMemo(
    () => [
      {
        title: copy.userColumn,
        key: 'user',
        render: (_: unknown, session: AdminUserSession) => userCell(session.userId),
      },
      {
        title: copy.clientColumn,
        key: 'client',
        render: (_: unknown, session: AdminUserSession) => (
          <SessionClientCell client={session.client} current={session.sessionId === currentSessionId} />
        ),
      },
      {
        title: copy.lastActive,
        key: 'lastActive',
        render: (_: unknown, session: AdminUserSession) => formatTimestamp(session.lastSeenAt),
      },
      {
        title: translate(language, 'status'),
        key: 'status',
        render: (_: unknown, session: AdminUserSession) =>
          session.revokedAt ? (
            <Tag>{copy.sessionStateRevoked}</Tag>
          ) : (
            <Tag color="success">{copy.sessionStateActive}</Tag>
          ),
      },
      {
        title: translate(language, 'actions'),
        key: 'actions',
        render: (_: unknown, session: AdminUserSession) => (
          <Space size={0}>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(session)}>
              {copy.view}
            </Button>
            {canRevoke && !session.revokedAt ? (
              session.sessionId === currentSessionId ? (
                <Tooltip title={translate(language, 'sessionCurrentRevokeDisabled')}>
                  <span>
                    <Button type="link" size="small" danger disabled>
                      {copy.revokeLogin}
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button type="link" size="small" danger onClick={() => setRevoking(session)}>
                  {copy.revokeLogin}
                </Button>
              )
            ) : null}
          </Space>
        ),
      },
    ],
    [canRevoke, userCell, currentSessionId],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <ModuleHeading title={copy.sessionsTitle} description={copy.sessionsDescription}>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refresh((value) => value + 1)}>
          {translate(language, 'refresh')}
        </Button>
      </ModuleHeading>

      {/* 2026-09-30 LiXiang2019 登录会话筛选条件 + 查询/重置按钮组 */}
      <Form form={filterForm} layout="inline" style={{ gap: 12 }}>
        <Form.Item name="userId" style={{ marginInlineEnd: 0 }}>
          <Input allowClear placeholder={translate(language, 'filterUserId')} style={{ width: 280 }} />
        </Form.Item>
        <Form.Item name="status" style={{ marginInlineEnd: 0 }}>
          <Select
            allowClear
            placeholder={translate(language, 'status')}
            style={{ minWidth: 140 }}
            options={[
              { value: 'active', label: copy.sessionStateActive },
              { value: 'revoked', label: copy.sessionStateRevoked },
            ]}
          />
        </Form.Item>
        <Form.Item style={{ marginInlineEnd: 0 }}>
          <ListQueryActions
            form={filterForm}
            searching={loading}
            search={{
              // exactOptionalPropertyTypes: spread instead of assigning
              // undefined, which `userId?: string` forbids.
              run: (values) =>
                setFilters({
                  ...(values.userId?.trim() ? { userId: values.userId.trim() } : {}),
                  ...(values.status ? { status: values.status } : {}),
                }),
            }}
            onReset={() => setFilters({})}
          />
        </Form.Item>
      </Form>

      {failed ? (
        <Alert
          type="error"
          showIcon
          title={copy.sessionsLoadFailed}
          action={
            <Button size="small" onClick={() => refresh((value) => value + 1)}>
              {copy.retry}
            </Button>
          }
        />
      ) : null}

      {failed && sessions === null ? null : (
        <Table
          rowKey="sessionId"
          columns={columns}
          dataSource={rows}
          loading={loading && sessions === null}
          scroll={{ x: 760 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={copy.sessionsEmpty} /> }}
          pagination={{ hideOnSinglePage: true, showSizeChanger: false }}
        />
      )}

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={copy.sessionDetail}
        size="large"
        destroyOnHidden
      >
        {detail ? (
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={copy.userColumn}>{userCell(detail.userId)}</Descriptions.Item>
              <Descriptions.Item label={copy.clientColumn}>
                <SessionClientDetail client={detail.client} />
              </Descriptions.Item>
              <Descriptions.Item label={translate(language, 'status')}>
                {detail.revokedAt ? (
                  <Tag>{copy.sessionStateRevoked}</Tag>
                ) : (
                  <Tag color="success">{copy.sessionStateActive}</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label={copy.lastActive}>{formatTimestamp(detail.lastSeenAt)}</Descriptions.Item>
              <Descriptions.Item label={copy.sessionCreatedAt}>{formatTimestamp(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label={copy.sessionRevokedAt}>{formatTimestamp(detail.revokedAt)}</Descriptions.Item>
              <Descriptions.Item label={copy.sessionSubject}>{detail.topic}</Descriptions.Item>
              <Descriptions.Item label="sessionId">
                <Typography.Text code copyable={{ text: detail.sessionId }}>
                  {detail.sessionId}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
            <Alert type="info" showIcon title={copy.sessionsDescription} />
            {canRevoke && !detail.revokedAt ? (
              detail.sessionId === currentSessionId ? (
                <Tooltip title={translate(language, 'sessionCurrentRevokeDisabled')}>
                  <span>
                    <Button danger type="primary" disabled>
                      {copy.revokeLogin}
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button
                  danger
                  type="primary"
                  onClick={() => {
                    setRevoking(detail);
                    setDetail(null);
                  }}
                >
                  {copy.revokeLogin}
                </Button>
              )
            ) : null}
          </Space>
        ) : null}
      </Drawer>

      {canRevoke && revoking ? (
        <RevokeSessionModal
          client={client}
          session={revoking}
          userLabel={usersById.get(revoking.userId)?.displayName ?? revoking.userId}
          onClose={() => setRevoking(null)}
          onChanged={() => refresh((value) => value + 1)}
        />
      ) : null}
    </div>
  );
}

function RevokeSessionModal({
  client,
  session,
  userLabel,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly session: AdminUserSession;
  readonly userLabel: string;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async () => {
    setPending(true);
    setFailed(false);
    try {
      await client.revokeUserSession(session.sessionId);
      notify(AdminNotificationKind.Success, copy.revokeLogin);
      onClose();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open
      title={copy.revokeLoginTitle}
      okText={copy.confirmRevokeLogin}
      okButtonProps={{ danger: true }}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={() => {
        if (!pending) onClose();
      }}
      onOk={() => void submit()}
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {failed ? <Alert type="error" showIcon title={copy.revokeFailed} /> : null}
        <Space orientation="vertical" size={2}>
          <span>
            {copy.userColumn}：<strong>{userLabel}</strong>
          </span>
          <span>
            {copy.clientColumn}：<SessionClientDetail client={session.client} />
          </span>
        </Space>
        <Alert type="warning" showIcon title={copy.revokeLoginImpact} />
      </Space>
    </Modal>
  );
}

/* -------------------------------- credentials ------------------------------- */

function CredentialPanel({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const canWrite = hasAdminPermission(identity, AdminPermission.CredentialsWrite);
  const canAssign = hasAdminPermission(identity, AdminPermission.CredentialsAssign);
  const canReadModels = hasAdminPermission(identity, AdminPermission.ModelsRead);
  const [state, setState] = useState<AdminCredentials | null>(null);
  // null = references unknown (no models.read permission or the model list
  // failed); an empty map = known to have no references.
  const [references, setReferences] = useState<{
    readonly known: boolean;
    readonly byCredential: ReadonlyMap<string, readonly AdminModel[]>;
  } | null>(null);
  const [users, setUsers] = useState<readonly PlatformUser[]>(NO_USERS);
  const [roles, setRoles] = useState<readonly Role[]>(NO_ROLES);
  const [teams, setTeams] = useState<readonly Team[]>(NO_TEAMS);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CredentialMetadata | null>(null);
  const [rotating, setRotating] = useState<CredentialMetadata | null>(null);
  const [deleting, setDeleting] = useState<CredentialMetadata | null>(null);
  const [detail, setDetail] = useState<CredentialMetadata | null>(null);
  const [granting, setGranting] = useState<CredentialGrantTarget | null>(null);
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);
  const [revision, refresh] = useState(0);

  const toggleEnabled = async (credential: CredentialMetadata) => {
    setPendingToggleId(credential.id);
    try {
      await client.updateCredential(credential.id, { enabled: !credential.enabled });
      refresh((value) => value + 1);
    } catch {
      notify(AdminNotificationKind.Error, copy.connectionsSaveFailed);
    } finally {
      setPendingToggleId(null);
    }
  };

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    // Subject names only enrich the grant picker; a resources failure must
    // not fake an empty connection list as success.
    const loadResources = client.resources(identity).catch(() => null);
    // Model references are read through the model list (model.credentialId).
    // Without models.read or on failure the references stay "unknown", never 0.
    const loadModels = canReadModels ? client.models(identity).catch(() => null) : Promise.resolve(null);
    void Promise.all([client.credentials(identity), loadResources, loadModels])
      .then(([credentials, resources, models]) => {
        if (!live) return;
        setState(credentials);
        if (resources) {
          setUsers(resources.users);
          setRoles(resources.roles);
          setTeams(resources.teams);
        }
        if (models) {
          const map = new Map<string, AdminModel[]>();
          for (const model of models.models) {
            if (!model.credentialId) continue;
            const list = map.get(model.credentialId) ?? [];
            map.set(model.credentialId, [...list, model]);
          }
          setReferences({ known: true, byCredential: map });
        } else {
          setReferences({ known: false, byCredential: new Map() });
        }
      })
      .catch(() => {
        if (live) {
          setFailed(true);
          setState(null);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, identity, canReadModels, revision]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const assignmentsByCredential = useMemo(() => {
    const map = new Map<string, readonly CredentialAssignment[]>();
    for (const assignment of state?.assignments ?? []) {
      const list = map.get(assignment.resourceId) ?? [];
      map.set(assignment.resourceId, [...list, assignment]);
    }
    return map;
  }, [state]);

  const subjectLabel = useCallback(
    (assignment: CredentialAssignment): string => {
      if (assignment.subject.type === AdminSubjectType.User) {
        const user = usersById.get(assignment.subject.id);
        return user
          ? `${user.displayName}（${user.username || user.id}）`
          : `${subjectTypeLabel(assignment.subject.type)}：${assignment.subject.id}`;
      }
      return `${subjectTypeLabel(assignment.subject.type)}：${assignment.subject.id}`;
    },
    [usersById],
  );

  /** Models referencing a credential; null means the references are unknown. */
  const referencesOf = useCallback(
    (credential: CredentialMetadata): readonly AdminModel[] | null => {
      if (!references?.known) return null;
      return references.byCredential.get(credential.id) ?? [];
    },
    [references],
  );

  const columns = useMemo(
    () => [
      {
        title: translate(language, 'credentialName'),
        key: 'name',
        render: (_: unknown, credential: CredentialMetadata) => (
          <Space orientation="vertical" size={0}>
            <span>{credential.name}</span>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {credential.id} · {credential.maskedValue}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: copy.serviceColumn,
        key: 'service',
        render: (_: unknown, credential: CredentialMetadata) => credential.service,
      },
      {
        title: copy.authColumn,
        key: 'auth',
        render: (_: unknown, credential: CredentialMetadata) =>
          credential.maskedValue ? <Tag>{copy.authSet}</Tag> : <Tag>{copy.valueUnknown}</Tag>,
      },
      {
        title: copy.referencedModels,
        key: 'models',
        render: (_: unknown, credential: CredentialMetadata) => <ReferenceTags references={referencesOf(credential)} />,
      },
      {
        title: translate(language, 'status'),
        key: 'status',
        render: (_: unknown, credential: CredentialMetadata) =>
          credential.enabled ? (
            <Tag color="success">{translate(language, 'enabled')}</Tag>
          ) : (
            <Tag>{translate(language, 'disabled')}</Tag>
          ),
      },
      {
        title: translate(language, 'actions'),
        key: 'actions',
        render: (_: unknown, credential: CredentialMetadata) => (
          <Space size={0} wrap>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(credential)}>
              {copy.view}
            </Button>
            {canWrite ? (
              <>
                <Button type="link" size="small" onClick={() => setEditing(credential)}>
                  {translate(language, 'edit')}
                </Button>
                <Button type="link" size="small" onClick={() => setRotating(credential)}>
                  {copy.updateKey}
                </Button>
                {credential.enabled ? (
                  <Popconfirm
                    title={translate(language, 'disable')}
                    description={copy.disableConnectionNote}
                    okText={translate(language, 'disable')}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void toggleEnabled(credential)}
                  >
                    <Button type="link" size="small" disabled={pendingToggleId !== null}>
                      {translate(language, 'disable')}
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button
                    type="link"
                    size="small"
                    disabled={pendingToggleId !== null}
                    onClick={() => void toggleEnabled(credential)}
                  >
                    {translate(language, 'enable')}
                  </Button>
                )}
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => setDeleting(credential)}
                >
                  {translate(language, 'delete')}
                </Button>
              </>
            ) : null}
            {canAssign ? (
              <Button
                type="link"
                size="small"
                icon={<TeamOutlined />}
                onClick={() =>
                  setGranting({ credential, assignments: assignmentsByCredential.get(credential.id) ?? [] })
                }
              >
                {copy.grantAccess}
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [canWrite, canAssign, assignmentsByCredential, referencesOf, client],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <ModuleHeading title={copy.credentialsTitle} description={copy.credentialsDescription}>
        {canWrite ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            {copy.addConnection}
          </Button>
        ) : null}
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refresh((value) => value + 1)}>
          {translate(language, 'refresh')}
        </Button>
      </ModuleHeading>

      {savedNotice ? (
        <Alert
          type="success"
          showIcon
          closable={{ onClose: () => setSavedNotice(false) }}
          title={copy.configSaved}
          description={copy.savedNotApplied}
        />
      ) : null}
      {failed ? (
        <Alert
          type="error"
          showIcon
          title={copy.connectionsLoadFailed}
          action={
            <Button size="small" onClick={() => refresh((value) => value + 1)}>
              {copy.retry}
            </Button>
          }
        />
      ) : null}

      {failed && state === null ? null : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={state ? [...state.credentials] : []}
          loading={loading && state === null}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={copy.connectionsEmpty} /> }}
          pagination={{ hideOnSinglePage: true, showSizeChanger: false }}
          expandable={{
            expandedRowRender: (credential: CredentialMetadata) => {
              const assignments = assignmentsByCredential.get(credential.id) ?? [];
              return assignments.length === 0 ? (
                <Typography.Text type="secondary">
                  {copy.usageSubjects}：{copy.notCollected}
                </Typography.Text>
              ) : (
                <Space wrap size={8}>
                  {assignments.map((assignment) => (
                    <CredentialAssignmentChip
                      key={assignment.id}
                      assignment={assignment}
                      label={subjectLabel(assignment)}
                      canAssign={canAssign}
                      client={client}
                      onChanged={() => refresh((value) => value + 1)}
                    />
                  ))}
                </Space>
              );
            },
          }}
        />
      )}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {translate(language, 'credentialSecretHint')}
      </Typography.Text>

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={copy.connectionDetail}
        size="large"
        destroyOnHidden
      >
        {detail ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={translate(language, 'credentialName')}>{detail.name}</Descriptions.Item>
            <Descriptions.Item label="id">
              <Typography.Text code copyable={{ text: detail.id }}>
                {detail.id}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={copy.serviceColumn}>{detail.service}</Descriptions.Item>
            <Descriptions.Item label={copy.authColumn}>
              {detail.maskedValue ? `${copy.authSet}（${detail.maskedValue}）` : copy.valueUnknown}
            </Descriptions.Item>
            <Descriptions.Item label={copy.deliveryModeLabel}>
              {translate(language, detail.deliveryMode === 'client' ? 'clientDelivery' : 'serverOnlyDelivery')}
            </Descriptions.Item>
            <Descriptions.Item label={translate(language, 'status')}>
              {detail.enabled ? (
                <Tag color="success">{translate(language, 'enabled')}</Tag>
              ) : (
                <Tag>{translate(language, 'disabled')}</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={copy.referencedModels}>
              <ReferenceTags references={referencesOf(detail)} />
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>

      {canWrite && creating ? (
        <ConnectionEditorModal
          client={client}
          open
          onClose={() => setCreating(false)}
          onChanged={() => {
            setSavedNotice(true);
            refresh((value) => value + 1);
          }}
        />
      ) : null}
      {canWrite && editing ? (
        <ConnectionEditorModal
          client={client}
          credential={editing}
          open
          onClose={() => setEditing(null)}
          onChanged={() => {
            setSavedNotice(true);
            refresh((value) => value + 1);
          }}
        />
      ) : null}
      {canWrite && rotating ? (
        <RotateKeyModal
          client={client}
          credential={rotating}
          affected={referencesOf(rotating)}
          open
          onClose={() => setRotating(null)}
          onChanged={() => {
            setSavedNotice(true);
            refresh((value) => value + 1);
          }}
        />
      ) : null}
      {canWrite && deleting ? (
        <DeleteConnectionModal
          client={client}
          credential={deleting}
          references={referencesOf(deleting)}
          open
          onClose={() => setDeleting(null)}
          onChanged={() => refresh((value) => value + 1)}
        />
      ) : null}
      {canAssign && granting ? (
        <GrantAccessModal
          client={client}
          target={granting}
          users={users}
          roles={roles}
          teams={teams}
          open
          onClose={() => setGranting(null)}
          onChanged={() => refresh((value) => value + 1)}
        />
      ) : null}
    </div>
  );
}

/** Model references for a connection; null keeps them explicitly unknown. */
function ReferenceTags({ references }: { readonly references: readonly AdminModel[] | null }) {
  if (references === null) {
    return (
      <span title={copy.referencesUnknownNote}>
        <Typography.Text type="secondary">{copy.valueUnknown}</Typography.Text>
      </span>
    );
  }
  if (references.length === 0) {
    return <Typography.Text type="secondary">{copy.noReferences}</Typography.Text>;
  }
  return (
    <Space wrap size={[4, 4]}>
      {references.map((model) => (
        <Tag key={model.id}>{model.displayName}</Tag>
      ))}
    </Space>
  );
}

function CredentialAssignmentChip({
  assignment,
  label,
  canAssign,
  client,
  onChanged,
}: {
  readonly assignment: CredentialAssignment;
  readonly label: string;
  readonly canAssign: boolean;
  readonly client: AdminConsoleClient;
  readonly onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const revoke = async () => {
    setPending(true);
    try {
      await client.deleteCredentialAssignment(assignment.id);
      onChanged();
    } catch {
      notify(AdminNotificationKind.Error, translate(language, 'credentialAssignmentFailed'));
    } finally {
      setPending(false);
    }
  };
  return (
    <Space size={4}>
      <Tag>{label}</Tag>
      {canAssign ? (
        <Popconfirm
          title={translate(language, 'revokeConfirmTitle')}
          description={translate(language, 'revokeConfirmDescription')}
          okText={translate(language, 'confirmRevoke')}
          okButtonProps={{ danger: true }}
          onConfirm={() => void revoke()}
        >
          <Button
            type="text"
            size="small"
            icon={<StopOutlined />}
            loading={pending}
            aria-label={translate(language, 'revoke')}
          />
        </Popconfirm>
      ) : null}
    </Space>
  );
}

function ConnectionEditorModal({
  client,
  credential,
  open,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly credential?: CredentialMetadata | undefined;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const editing = Boolean(credential);
  const [form] = Form.useForm<{
    name: string;
    service: string;
    deliveryMode: 'server_only' | 'client';
    enabled: boolean;
    value?: string;
  }>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({
        name: credential?.name ?? '',
        service: credential?.service ?? '',
        deliveryMode: credential?.deliveryMode ?? 'server_only',
        enabled: credential?.enabled !== false,
        value: '',
      });
      setFailed(false);
    }
  }, [open, credential, form]);
  const submit = async (values: {
    name: string;
    service: string;
    deliveryMode: 'server_only' | 'client';
    enabled: boolean;
    value?: string;
  }) => {
    setPending(true);
    setFailed(false);
    try {
      if (credential) {
        await client.updateCredential(credential.id, {
          name: values.name.trim(),
          service: values.service.trim(),
          deliveryMode: values.deliveryMode,
          enabled: values.enabled,
        });
      } else {
        await client.createCredential({
          name: values.name.trim(),
          service: values.service.trim(),
          type: 'api_key',
          deliveryMode: values.deliveryMode,
          value: values.value ?? '',
          enabled: true,
        });
      }
      onClose();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={editing ? translate(language, 'editCredential') : copy.addConnection}
      okText={translate(language, 'save')}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      destroyOnHidden
      onCancel={() => {
        if (!pending) onClose();
      }}
      onOk={() => void form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)} disabled={pending}>
        {failed ? (
          <Alert type="error" showIcon style={{ marginBottom: 16 }} title={copy.connectionsSaveFailed} />
        ) : null}
        <Form.Item
          name="name"
          label={translate(language, 'credentialName')}
          rules={[{ required: true, message: copy.nameRequired }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="service"
          label={copy.serviceColumn}
          rules={[{ required: true, message: copy.serviceRequired }]}
        >
          <Input />
        </Form.Item>
        {!editing ? (
          <Form.Item name="value" label={copy.newKey} rules={[{ required: true, message: copy.keyRequired }]}>
            <Input.Password autoComplete="new-password" placeholder={copy.newKeyPlaceholder} />
          </Form.Item>
        ) : (
          <Alert type="info" showIcon style={{ marginBottom: 16 }} title={copy.keyManagedViaRotate} />
        )}
        <Form.Item name="deliveryMode" label={copy.deliveryModeLabel} rules={[{ required: true }]}>
          <Radio.Group>
            <Radio.Button value="server_only">{translate(language, 'serverOnlyDelivery')}</Radio.Button>
            <Radio.Button value="client">{translate(language, 'clientDelivery')}</Radio.Button>
          </Radio.Group>
        </Form.Item>
        {editing ? (
          <Form.Item name="enabled" label={translate(language, 'status')} valuePropName="checked">
            <Switch
              checkedChildren={translate(language, 'enabled')}
              unCheckedChildren={translate(language, 'disabled')}
            />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}

function RotateKeyModal({
  client,
  credential,
  affected,
  open,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly credential: CredentialMetadata;
  readonly affected: readonly AdminModel[] | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const [form] = Form.useForm<{ value: string }>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (open) {
      // Keep the typed value on failure so the operator can fix and retry.
      form.resetFields();
      setFailed(false);
    }
  }, [open, form]);
  const submit = async (values: { value: string }) => {
    setPending(true);
    setFailed(false);
    try {
      await client.rotateCredential(credential.id, { value: values.value });
      onClose();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={copy.updateKeyTitle}
      okText={copy.updateKey}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      destroyOnHidden={false}
      onCancel={() => {
        if (!pending) onClose();
      }}
      onOk={() => void form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)} disabled={pending}>
        {failed ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            title={translate(language, 'credentialRotateFailed')}
            description={copy.rotateRetryNote}
          />
        ) : null}
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title={copy.affectedModels}
          description={
            affected === null
              ? `${copy.valueUnknown}（${copy.referencesUnknownNote}）`
              : affected.length > 0
                ? affected.map((model) => model.displayName).join('、')
                : copy.noReferences
          }
        />
        <Form.Item
          name="value"
          label={copy.newKey}
          rules={[{ required: true, message: copy.keyRequired }]}
          extra={copy.updateKeyNote}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function DeleteConnectionModal({
  client,
  credential,
  references,
  open,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly credential: CredentialMetadata;
  readonly references: readonly AdminModel[] | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  // A connection with known references must not be deleted; replace or remove
  // the reference on each model first. Unknown references never count as zero.
  const blocked = references !== null && references.length > 0;
  const submit = async () => {
    setPending(true);
    setFailed(false);
    try {
      await client.deleteCredential(credential.id);
      onClose();
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={copy.deleteConnectionTitle}
      okText={copy.confirmDeleteConnection}
      okButtonProps={{ danger: true, disabled: blocked }}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={() => {
        if (!pending) onClose();
      }}
      onOk={() => void submit()}
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {failed ? <Alert type="error" showIcon title={copy.connectionsDeleteFailed} /> : null}
        <span>
          {translate(language, 'credentialName')}：<strong>{credential.name}</strong>（{credential.service}）
        </span>
        {blocked ? (
          <Alert
            type="error"
            showIcon
            title={copy.deleteBlockedMessage}
            description={<ReferenceTags references={references} />}
          />
        ) : (
          <Alert type="warning" showIcon title={copy.deleteConnectionDescription} />
        )}
        {references === null ? <Alert type="info" showIcon title={copy.deleteReferencesUnverified} /> : null}
      </Space>
    </Modal>
  );
}

function GrantAccessModal({
  client,
  target,
  users,
  roles,
  teams,
  open,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly target: CredentialGrantTarget;
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [pending, setPending] = useState(false);
  const [failedSubjects, setFailedSubjects] = useState<readonly string[] | null>(null);
  const excluded = useMemo(
    () => new Set(target.assignments.map((item) => `${item.subject.type}:${item.subject.id}`)),
    [target],
  );
  const options = useMemo(
    () => [
      {
        label: translate(language, 'userScope'),
        options: users
          .filter((user) => !excluded.has(`user:${user.id}`))
          .map((user) => ({
            value: `user:${user.id}`,
            label: `${user.displayName}${user.username ? `（${user.username}）` : `（${user.id}）`}`,
          })),
      },
      {
        label: translate(language, 'role'),
        options: roles
          .filter((role) => !excluded.has(`role:${role.id}`))
          .map((role) => ({ value: `role:${role.id}`, label: role.name ?? role.id })),
      },
      {
        label: translate(language, 'teamScope'),
        options: teams
          .filter((team) => !excluded.has(`team:${team.id}`))
          .map((team) => ({ value: `team:${team.id}`, label: team.name ?? team.id })),
      },
    ],
    [users, roles, teams, excluded],
  );
  useEffect(() => {
    if (open) {
      setSelected([]);
      setFailedSubjects(null);
    }
  }, [open, target.credential.id]);
  const optionLabel = useCallback(
    (key: string): string => {
      for (const group of options) {
        const found = group.options.find((option) => option.value === key);
        if (found) return found.label;
      }
      return key;
    },
    [options],
  );
  const submit = async () => {
    if (selected.length === 0) return;
    setPending(true);
    setFailedSubjects(null);
    const results = await runBatch([...selected], async (key) => {
      const separator = key.indexOf(':');
      const type = key.slice(0, separator) as 'user' | 'role' | 'team';
      const id = key.slice(separator + 1);
      await client.createCredentialAssignment({ credentialId: target.credential.id, subject: { type, id } });
    });
    const failures = results.filter((result) => !result.ok).map((result) => result.item);
    setPending(false);
    if (failures.length > 0) {
      // Keep only the failed subjects selected so the operator can retry them.
      setSelected(failures);
      setFailedSubjects(failures.map((key) => optionLabel(key)));
      onChanged();
      return;
    }
    onClose();
    onChanged();
  };
  return (
    <Modal
      open={open}
      title={`${copy.grantAccess} · ${target.credential.name}`}
      okText={translate(language, pending ? 'granting' : 'grant')}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      okButtonProps={{ disabled: selected.length === 0 }}
      destroyOnHidden
      onCancel={() => {
        if (!pending) onClose();
      }}
      onOk={() => void submit()}
    >
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {failedSubjects ? (
          <Alert
            type="error"
            showIcon
            title={translate(language, 'credentialAssignmentFailed')}
            description={
              <div>
                <div>
                  {translate(language, 'grantFailedSubjects')}：{failedSubjects.join('、')}
                </div>
                <div>{copy.grantFailedRetryHint}</div>
              </div>
            }
          />
        ) : null}
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder={translate(language, 'grantCredentialDescription')}
          value={[...selected]}
          onChange={(values) => setSelected(values)}
          options={options}
          showSearch={{ optionFilterProp: 'label' }}
        />
      </Space>
    </Modal>
  );
}

function subjectTypeLabel(type: string): string {
  if (type === AdminSubjectType.User) return translate(language, 'userScope');
  if (type === AdminSubjectType.Role) return translate(language, 'role');
  if (type === AdminSubjectType.Team) return translate(language, 'teamScope');
  return type;
}

/* --------------------------- configuration status --------------------------- */

const DataPlaneStateLabels: readonly (readonly [DataPlaneStatus['state'], keyof typeof copy])[] = [
  ['ready', 'stateApplied'],
  ['applying', 'stateApplying'],
  ['pending', 'statePending'],
  ['degraded', 'stateDegraded'],
  ['error', 'stateApplyFailed'],
];

function dataPlaneStateLabel(state: DataPlaneStatus['state']): string {
  const found = DataPlaneStateLabels.find(([candidate]) => candidate === state);
  return found ? copy[found[1]] : copy.stateUnknown;
}

function dataPlaneStateTag(state: DataPlaneStatus['state']) {
  if (state === 'ready') return <Tag color="success">{copy.stateApplied}</Tag>;
  if (state === 'error') return <Tag color="error">{copy.stateApplyFailed}</Tag>;
  if (state === 'degraded') return <Tag color="warning">{copy.stateDegraded}</Tag>;
  if (state === 'applying' || state === 'pending') return <Tag color="processing">{dataPlaneStateLabel(state)}</Tag>;
  return <Tag>{copy.stateUnknown}</Tag>;
}

function driftFieldLabel(field: string): string {
  switch (field) {
    case 'enabled':
      return copy.driftFieldEnabled;
    case 'endpoint':
      return copy.driftFieldEndpoint;
    case 'upstreamModel':
      return copy.driftFieldUpstreamModel;
    case 'providerType':
      return copy.driftFieldProviderType;
    case 'credentialRef':
      return copy.driftFieldCredentialRef;
    default:
      return field;
  }
}

function CatalogComparisonAlert({ comparison }: { readonly comparison: AdminDataPlaneCatalogComparison }) {
  const hasDrift = comparison.missing.length > 0 || comparison.extra.length > 0 || comparison.mismatched.length > 0;
  return (
    <Alert
      type={hasDrift ? 'warning' : 'success'}
      showIcon
      title={hasDrift ? copy.catalogDrift : copy.catalogInSync}
      description={
        <Space orientation="vertical" size={2}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {copy.catalogComparisonNote}
          </Typography.Text>
          {comparison.missing.length > 0 ? (
            <span>
              {copy.catalogMissing}：{comparison.missing.join('、')}
            </span>
          ) : null}
          {comparison.extra.length > 0 ? (
            <span>
              {copy.catalogExtra}：{comparison.extra.join('、')}
            </span>
          ) : null}
          {comparison.mismatched.map((item) => (
            <span key={item.modelId}>
              {copy.catalogMismatched}：{item.modelId}（{item.fields.map(driftFieldLabel).join('、')}）
            </span>
          ))}
        </Space>
      }
    />
  );
}

function ConfigurationStatusPanel({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const allowed = hasAdminPermission(identity, AdminPermission.DataPlaneWrite);
  const [state, setState] = useState<AdminDataPlane | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    setLoading(true);
    setFailed(false);
    void client
      .dataPlane()
      .then((next) => {
        if (live) setState(next);
      })
      .catch(() => {
        if (live) {
          setFailed(true);
          setState(null);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, allowed, revision]);

  if (!allowed) {
    return <Result status="403" title={copy.statusNoPermission} />;
  }

  const desired = state?.desired;
  const status = state?.status;
  const observed = status?.observedRevision ?? '';
  const inSync = observed ? (
    desired?.revision === observed ? (
      <Tag color="success">{copy.consistencyMatch}</Tag>
    ) : (
      <Tag color="warning">{copy.consistencyMismatch}</Tag>
    )
  ) : (
    <Tag>{copy.valueUnknown}</Tag>
  );

  const routeColumns = [
    {
      title: copy.routeModelColumn,
      key: 'modelId',
      render: (_: unknown, route: DataPlaneRoute) => (
        <Space orientation="vertical" size={0}>
          <span>{route.modelId}</span>
          {route.upstreamModel ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {route.upstreamModel}
            </Typography.Text>
          ) : null}
        </Space>
      ),
    },
    { title: copy.routeEndpointColumn, dataIndex: 'endpoint', key: 'endpoint' },
    {
      title: copy.routeProviderColumn,
      key: 'providerType',
      render: (_: unknown, route: DataPlaneRoute) =>
        route.providerType === 'deepseek'
          ? translate(language, 'deepSeekProvider')
          : translate(language, 'openAiProvider'),
    },
    {
      title: translate(language, 'status'),
      key: 'enabled',
      render: (_: unknown, route: DataPlaneRoute) =>
        route.enabled ? (
          <Tag color="success">{translate(language, 'enabled')}</Tag>
        ) : (
          <Tag>{translate(language, 'disabled')}</Tag>
        ),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-4">
      <ModuleHeading title={copy.statusTitle} description={copy.statusDescription}>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refresh((value) => value + 1)}>
          {translate(language, 'refresh')}
        </Button>
      </ModuleHeading>

      {failed ? (
        <Alert
          type="error"
          showIcon
          title={translate(language, 'dataPlaneLoadFailed')}
          action={
            <Button size="small" onClick={() => refresh((value) => value + 1)}>
              {copy.retry}
            </Button>
          }
        />
      ) : null}

      <Alert type="info" showIcon title={copy.modelCheckGap} />

      {loading && state === null ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : state ? (
        <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label={copy.desiredRevision}>
            <Typography.Text code>{desired?.revision ?? copy.valueUnknown}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label={copy.appliedRevision}>
            {observed ? (
              <Typography.Text code>{observed}</Typography.Text>
            ) : (
              <Typography.Text type="secondary">{copy.valueUnknown}</Typography.Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={copy.consistency}>{inSync}</Descriptions.Item>
          <Descriptions.Item label={copy.configState}>
            {status ? dataPlaneStateTag(status.state) : <Tag>{copy.stateUnknown}</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label={copy.lastSync}>
            {status?.lastAppliedAt ? (
              formatTimestamp(status.lastAppliedAt)
            ) : (
              <Typography.Text type="secondary">{copy.valueUnknown}</Typography.Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={copy.publishedAt}>
            {desired?.publishedAt ? (
              formatTimestamp(desired.publishedAt)
            ) : (
              <Typography.Text type="secondary">{copy.valueUnknown}</Typography.Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={copy.resourceCount}>
            {status?.resourceCount ?? <Typography.Text type="secondary">{copy.notCollected}</Typography.Text>}
          </Descriptions.Item>
          <Descriptions.Item label={copy.executor}>
            <Typography.Text type="secondary">{copy.executorUnknown}</Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      ) : null}

      {status?.message ? (
        <Alert
          type={status.state === 'error' ? 'error' : 'warning'}
          showIcon
          title={copy.errorMessage}
          description={status.message}
        />
      ) : null}

      {status?.catalogComparison ? <CatalogComparisonAlert comparison={status.catalogComparison} /> : null}

      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {copy.routesReadonlyNote}
        </Typography.Text>
        <Table
          style={{ marginTop: 8 }}
          rowKey={(route) => `${route.modelId}-${route.endpoint}`}
          columns={routeColumns}
          dataSource={desired ? [...desired.routes] : []}
          loading={loading && state === null}
          scroll={{ x: 640 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={copy.routesEmpty} /> }}
          pagination={{ hideOnSinglePage: true, showSizeChanger: false }}
        />
      </div>
    </div>
  );
}

/* --------------------------- deployment settings --------------------------- */

function deploymentSourceTag(source: AdminDeploymentSettingValue['source']) {
  if (source === 'override') return <Tag color="processing">{copy.sourceOverride}</Tag>;
  if (source === 'env') return <Tag>{copy.sourceEnv}</Tag>;
  return <Tag color="warning">{copy.sourceUnset}</Tag>;
}

function DeploymentSettingsPanel({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const canRead = hasAdminPermission(identity, AdminPermission.DeploymentRead);
  const canWrite = hasAdminPermission(identity, AdminPermission.DeploymentWrite);
  const [settings, setSettings] = useState<AdminDeploymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<{ readonly title: string; readonly detail: string | null } | null>(null);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    if (!canRead) return;
    let live = true;
    setLoading(true);
    setFailed(false);
    setForbidden(false);
    void client
      .deploymentSettings()
      .then((next) => {
        if (live) setSettings(next);
      })
      .catch((error: unknown) => {
        if (!live) return;
        // A 403 here means the role check passed locally but the server
        // denied the read; surface the same no-permission state instead of a
        // generic load failure.
        if (error instanceof AdminRequestError && error.status === 403) setForbidden(true);
        else setFailed(true);
        setSettings(null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, canRead, revision]);

  const save = async (value: string) => {
    setPending(true);
    setSaveError(null);
    try {
      await client.updateDeploymentSettings({ modelGatewayBaseUrl: value.trim() });
      notify(AdminNotificationKind.Success, translate(language, 'changesSaved'));
      setEditing(false);
      refresh((current) => current + 1);
    } catch (error) {
      // A 422 carries the server-side validation detail; keep the draft open
      // so the operator can fix the value instead of retyping it.
      setSaveError({
        title:
          error instanceof AdminRequestError && error.status === 422
            ? copy.deploymentSettingsRejected
            : copy.deploymentSettingsSaveFailed,
        detail: error instanceof AdminRequestError ? error.detail : null,
      });
    } finally {
      setPending(false);
    }
  };

  const clear = async () => {
    setPending(true);
    setSaveError(null);
    try {
      await client.updateDeploymentSettings({ modelGatewayBaseUrl: null });
      notify(AdminNotificationKind.Success, translate(language, 'changesSaved'));
      refresh((current) => current + 1);
    } catch (error) {
      setSaveError({
        title: copy.deploymentSettingsSaveFailed,
        detail: error instanceof AdminRequestError ? error.detail : null,
      });
    } finally {
      setPending(false);
    }
  };

  if (!canRead || forbidden) {
    return <Result status="403" title={copy.deploymentNoPermission} />;
  }

  const gateway = settings?.modelGatewayBaseUrl;
  return (
    <div className="flex w-full flex-col gap-4">
      <ModuleHeading title={copy.deploymentSettingsTitle} description={copy.deploymentSettingsDescription}>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => refresh((current) => current + 1)}>
          {translate(language, 'refresh')}
        </Button>
      </ModuleHeading>

      <Alert type="info" showIcon title={copy.effectTimingHint} />

      {failed ? (
        <Alert
          type="error"
          showIcon
          title={copy.deploymentSettingsLoadFailed}
          action={
            <Button size="small" onClick={() => refresh((current) => current + 1)}>
              {copy.retry}
            </Button>
          }
        />
      ) : null}

      {loading && settings === null ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : settings && gateway ? (
        <>
          <Descriptions bordered column={1} size="small" title={copy.modelGatewayLabel}>
            <Descriptions.Item label={copy.currentEffectiveValue}>
              {gateway.effectiveValue ? (
                <Typography.Text code style={{ wordBreak: 'break-all' }}>
                  {gateway.effectiveValue}
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary">{copy.noEffectiveValue}</Typography.Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={copy.valueSource}>{deploymentSourceTag(gateway.source)}</Descriptions.Item>
            <Descriptions.Item label={copy.overrideValue}>
              {gateway.override ? (
                <Typography.Text code style={{ wordBreak: 'break-all' }}>
                  {gateway.override}
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary">{copy.noEffectiveValue}</Typography.Text>
              )}
            </Descriptions.Item>
          </Descriptions>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {copy.modelGatewayDescription}
          </Typography.Text>

          {saveError && !editing ? (
            <Alert type="error" showIcon title={saveError.title} description={saveError.detail ?? undefined} />
          ) : null}

          {canWrite ? (
            editing ? (
              <DeploymentSettingsEditor
                initial={gateway.override ?? gateway.effectiveValue ?? ''}
                pending={pending}
                error={saveError}
                onSubmit={save}
                onCancel={() => {
                  if (!pending) {
                    setEditing(false);
                    setSaveError(null);
                  }
                }}
              />
            ) : (
              <Space wrap>
                <Button
                  type="primary"
                  onClick={() => {
                    setEditing(true);
                    setSaveError(null);
                  }}
                >
                  {copy.editOverride}
                </Button>
                {gateway.override ? (
                  <Popconfirm
                    title={copy.clearOverride}
                    description={copy.clearOverrideConfirm}
                    okText={copy.clearOverride}
                    okButtonProps={{ danger: true }}
                    cancelText={translate(language, 'cancel')}
                    onConfirm={() => void clear()}
                  >
                    <Button danger disabled={pending}>
                      {copy.clearOverride}
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            )
          ) : (
            <Alert type="info" showIcon title={copy.deploymentReadonlyHint} />
          )}
        </>
      ) : null}
    </div>
  );
}

function DeploymentSettingsEditor({
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  readonly initial: string;
  readonly pending: boolean;
  readonly error: { readonly title: string; readonly detail: string | null } | null;
  readonly onSubmit: (value: string) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const [form] = Form.useForm<{ gateway: string }>();
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ gateway: initial }}
      disabled={pending}
      onFinish={(values) => void onSubmit(values.gateway)}
      style={{ maxWidth: 560 }}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={error.title}
          description={error.detail ?? undefined}
        />
      ) : null}
      <Form.Item
        name="gateway"
        label={copy.modelGatewayLabel}
        rules={[
          {
            validator: (_, value: unknown) => {
              const problem = modelGatewayBaseUrlProblem(typeof value === 'string' ? value : '');
              if (problem === AdminModelGatewayUrlProblem.ClusterInternal) {
                return Promise.reject(new Error(copy.clusterInternalGatewayUrl));
              }
              if (problem) return Promise.reject(new Error(copy.invalidGatewayUrl));
              return Promise.resolve();
            },
          },
        ]}
      >
        <Input placeholder={copy.overridePlaceholder} allowClear />
      </Form.Item>
      <Space>
        <Button type="primary" htmlType="submit" loading={pending}>
          {copy.saveOverride}
        </Button>
        <Button onClick={onCancel}>{translate(language, 'cancel')}</Button>
      </Space>
    </Form>
  );
}
