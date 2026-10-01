import {
  AppstoreOutlined,
  AuditOutlined,
  BookOutlined,
  DashboardOutlined,
  LogoutOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Breadcrumb,
  Button,
  Card,
  Col,
  ConfigProvider,
  Form,
  Input,
  Layout,
  Menu,
  Result,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Typography,
  theme,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react';
import {
  AdminConsoleClient,
  AdminConsoleStatus,
  type AdminEventRecord,
  type AdminIdentity,
  AdminMetadataError,
  type AdminOverview,
  type AdminSession,
  hasAdminPermission,
  AdminPermission as P,
} from './client.js';
import { translate } from './i18n.js';
import { AdminNotificationViewport } from './notifications.js';
import { PortalClient, type PortalEmployee } from './portal.js';
import { shellCopy as c } from './shell-copy.js';
import {
  type AdminThemeMode,
  applyAdminTheme,
  initialAdminTheme,
  persistAdminTheme,
  subscribeToSystemTheme,
} from './theme.js';

const Resources = lazy(() => import('./Resources.js').then((m) => ({ default: m.Resources })));
const Identity = lazy(() => import('./Identity.js').then((m) => ({ default: m.Identity })));
const Models = lazy(() => import('./Models.js').then((m) => ({ default: m.Models })));
const Employees = lazy(() =>
  import('./DigitalEmployees.js').then((m) => ({
    default: m.DigitalEmployees,
  })),
);
const Knowledge = lazy(() => import('./ServiceStatus.js').then((m) => ({ default: m.KnowledgeView })));
const Services = lazy(() => import('./ServiceStatus.js').then((m) => ({ default: m.ServicesView })));
const Operations = lazy(() => import('./Operations.js').then((m) => ({ default: m.Operations })));
const Sessions = lazy(() => import('./Operations.js').then((m) => ({ default: m.SessionsView })));
const Credentials = lazy(() => import('./Operations.js').then((m) => ({ default: m.CredentialsView })));
const ConfigurationStatus = lazy(() =>
  import('./Operations.js').then((m) => ({
    default: m.ConfigurationStatusView,
  })),
);
const DeploymentSettings = lazy(() =>
  import('./Operations.js').then((m) => ({
    default: m.DeploymentSettingsView,
  })),
);
const Events = lazy(() => import('./Events.js').then((m) => ({ default: m.Events })));

const modules = [
  {
    key: 'overview',
    label: c.overview,
    icon: <DashboardOutlined />,
    permissions: [],
  },
  {
    key: 'employees',
    label: c.employees,
    icon: <RobotOutlined />,
    permissions: [],
  },
  {
    key: 'knowledge',
    label: c.knowledge,
    icon: <BookOutlined />,
    permissions: [],
  },
  {
    key: 'skills',
    label: c.skills,
    icon: <AppstoreOutlined />,
    permissions: [P.SkillsRead],
  },
  {
    key: 'users',
    label: c.users,
    icon: <TeamOutlined />,
    permissions: [P.UsersRead, P.TeamsRead, P.RolesRead, P.IdentityRead],
  },
  {
    key: 'audit',
    label: c.audit,
    icon: <AuditOutlined />,
    permissions: [P.EventsRead],
  },
  {
    key: 'system',
    label: c.system,
    icon: <SettingOutlined />,
    permissions: [P.ModelsRead, P.CredentialsRead, P.LicensesRead, P.DataPlaneWrite, P.DeploymentRead],
  },
] as const;
const legacyRoutes: Record<string, string> = {
  resources: 'users',
  identity: 'users/accounts',
  'digital-employees': 'employees',
  memory: 'system/services',
  models: 'system/models',
  events: 'audit',
  operations: 'system/licenses',
};
function readRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '') || 'overview';
  if (raw === 'system/connections') return 'system/models/connections';
  if (raw === 'system/configuration') return 'system/models/configuration';
  if (raw === 'resources/skills') return 'skills';
  const [first = 'overview', ...rest] = raw.split('/');
  return `${legacyRoutes[first] ?? first}${rest.length ? `/${rest.join('/')}` : ''}`;
}
function navigate(route: string) {
  window.location.hash = route;
}
const t = (key: Parameters<typeof translate>[1]) => translate('zh', key);

export function AdminApp() {
  const [mode, setMode] = useState<AdminThemeMode>(initialAdminTheme);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const update = () => {
      applyAdminTheme(mode);
      setDark(document.documentElement.classList.contains('dark'));
    };
    update();
    return subscribeToSystemTheme(update);
  }, [mode]);
  return (
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        cssVar: { key: 'zhiyuan-admin' },
        token: { colorPrimary: '#1677ff', borderRadius: 6, fontSize: 14 },
      }}
    >
      <AntApp>
        <ConsoleRoot
          themeControl={
            <Select
              aria-label={c.theme}
              value={mode}
              style={{ width: 110 }}
              options={[
                { value: 'system', label: c.systemTheme },
                { value: 'light', label: c.light },
                { value: 'dark', label: c.dark },
              ]}
              onChange={(value) => {
                persistAdminTheme(value);
                setMode(value);
              }}
            />
          }
        />
        <AdminNotificationViewport />
      </AntApp>
    </ConfigProvider>
  );
}

function ConsoleRoot({ themeControl }: { themeControl: ReactNode }) {
  const [client] = useState(() => new AdminConsoleClient());
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'signInFailed' | 'signInMetadataFailed' | null>(null);
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    let live = true;
    void client
      .restore()
      .then((value) => {
        if (live) setSession(value);
      })
      .catch(() => {
        if (live) setSession({ status: AdminConsoleStatus.SignedOut });
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client]);
  useEffect(() => {
    const change = () => setRoute(readRoute());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const signOut = async () => {
    setPending(true);
    try {
      await client.logout();
      setSession({ status: AdminConsoleStatus.SignedOut });
      navigate('overview');
    } finally {
      setPending(false);
    }
  };
  if (loading)
    return (
      <main className="admin-login">
        <Skeleton active />
      </main>
    );
  if (!session || session.status === AdminConsoleStatus.SignedOut)
    return (
      <main className="admin-login">
        <div className="admin-login-theme">{themeControl}</div>
        <Card className="admin-login-card">
          <Typography.Text type="secondary">ZHIYUAN · {c.brand}</Typography.Text>
          <Typography.Title level={2}>{c.signIn}</Typography.Title>
          <Typography.Paragraph type="secondary">{c.signInHint}</Typography.Paragraph>
          {error && <Alert type="error" showIcon title={t(error)} style={{ marginBottom: 20 }} />}
          <Form
            layout="vertical"
            requiredMark={false}
            disabled={pending}
            onFinish={async (values: { username: string; password: string }) => {
              setPending(true);
              setError(null);
              try {
                setSession(
                  await client.login({
                    username: values.username.trim(),
                    password: values.password,
                  }),
                );
              } catch (cause) {
                setError(cause instanceof AdminMetadataError ? 'signInMetadataFailed' : 'signInFailed');
              } finally {
                setPending(false);
              }
            }}
          >
            <Form.Item
              label={t('username')}
              name="username"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: t('requiredFields'),
                },
              ]}
            >
              <Input autoComplete="username" />
            </Form.Item>
            <Form.Item label={t('password')} name="password" rules={[{ required: true, message: t('requiredFields') }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={pending}>
              {t('signIn')}
            </Button>
          </Form>
        </Card>
      </main>
    );
  if (session.status === AdminConsoleStatus.Forbidden)
    return (
      <Result
        status="403"
        title={c.forbidden}
        subTitle={session.identity?.user.displayName}
        extra={<Button onClick={() => void signOut()}>{c.switchAccount}</Button>}
      />
    );
  const identity = session.identity;
  const allowed = (permission: P) => hasAdminPermission(identity, permission);
  const visible = modules.filter((m) => m.permissions.length === 0 || m.permissions.some(allowed));
  const [page = 'overview', subpage, detailTab] = route.split('/');
  const selected = modules.find((m) => m.key === page);
  const accessible = visible.some((m) => m.key === page);
  const enterprise = identity?.deployment?.name ?? identity?.enterprise?.name ?? identity?.deploymentId ?? c.enterprise;
  const props = { client, identity };
  const tabs = (
    items: {
      key: string;
      label: string;
      permission?: P | readonly P[];
      children: ReactNode;
    }[],
  ) => {
    const usable = items.filter(
      (item) =>
        !item.permission ||
        (typeof item.permission === 'string' ? allowed(item.permission) : item.permission.some(allowed)),
    );
    const key = subpage ?? usable[0]?.key;
    if (!key || !usable.some((item) => item.key === key)) return <Result status="403" title={c.forbidden} />;
    return <Tabs activeKey={key} onChange={(key) => navigate(`${page}/${key}`)} items={usable} destroyOnHidden />;
  };
  let content: ReactNode;
  switch (page) {
    case 'overview':
      content = <Overview {...props} onNavigate={navigate} />;
      break;
    case 'employees':
      content = (
        <Employees
          key={subpage ?? 'employees'}
          {...props}
          initialTab={subpage === 'requests' ? 'requests' : 'employees'}
        />
      );
      break;
    case 'knowledge':
      content = <Knowledge client={client} />;
      break;
    case 'skills':
      content = <Resources {...props} tab="skills" />;
      break;
    case 'users':
      content = tabs([
        {
          key: 'users',
          label: c.userList,
          permission: P.UsersRead,
          children: <Resources {...props} tab="users" />,
        },
        {
          key: 'teams',
          label: c.teams,
          permission: P.TeamsRead,
          children: <Resources {...props} tab="teams" />,
        },
        {
          key: 'roles',
          label: c.roles,
          permission: P.RolesRead,
          children: <Resources {...props} tab="roles" />,
        },
        {
          key: 'accounts',
          label: c.accounts,
          permission: P.IdentityRead,
          children: <Identity {...props} />,
        },
        {
          key: 'sessions',
          label: c.sessions,
          permission: P.UsersRead,
          children: <Sessions {...props} />,
        },
      ]);
      break;
    case 'audit':
      content = <Events {...props} />;
      break;
    case 'system':
      content = tabs([
        {
          key: 'models',
          label: c.models,
          permission: [P.ModelsRead, P.CredentialsRead, P.DataPlaneWrite],
          children: <ModelServices {...props} tab={detailTab} />,
        },
        {
          key: 'channels',
          label: c.channels,
          children: <Channels client={client} />,
        },
        {
          key: 'services',
          label: c.services,
          children: <Services client={client} />,
        },
        {
          key: 'settings',
          label: c.settings,
          children: <DeploymentSettings {...props} />,
        },
        {
          key: 'licenses',
          label: c.licenses,
          permission: P.LicensesRead,
          children: <Operations {...props} />,
        },
      ]);
      break;
    default:
      content = (
        <Result
          status="404"
          title={c.notFound}
          extra={<Button onClick={() => navigate('overview')}>{c.overview}</Button>}
        />
      );
  }
  return (
    <Layout className="admin-shell">
      <Layout.Sider width={208} theme="light" className="admin-sidebar">
        <div className="admin-brand">
          <RobotOutlined />
          <div>
            <strong>{c.brandShort}</strong>
            <small>{c.admin}</small>
          </div>
        </div>
        <Menu
          aria-label={c.navigation}
          mode="inline"
          selectedKeys={[page]}
          items={visible.map(({ key, label, icon }) => ({
            key,
            label,
            icon,
            'aria-label': label,
          }))}
          onClick={({ key }) => navigate(key)}
        />
        <div className="admin-sidebar-note">{c.accountScope}</div>
      </Layout.Sider>
      <Layout className="admin-body">
        <Layout.Header className="admin-header">
          <Typography.Text strong ellipsis>
            {enterprise}
          </Typography.Text>
          <Space wrap>
            {themeControl}
            <Typography.Text className="admin-user">{identity?.user.displayName}</Typography.Text>
            <Button aria-label={c.signOut} icon={<LogoutOutlined />} loading={pending} onClick={() => void signOut()}>
              {c.signOut}
            </Button>
          </Space>
        </Layout.Header>
        <Layout.Content className="admin-content">
          <Breadcrumb items={[{ title: c.admin }, { title: selected?.label ?? c.notFound }]} />
          <div className="admin-page">
            <Suspense fallback={<Skeleton active />}>
              <div key={page}>
                {accessible ? content : selected ? <Result status="403" title={c.forbidden} /> : content}
              </div>
            </Suspense>
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

function ModelServices({
  client,
  identity,
  tab,
}: {
  client: AdminConsoleClient;
  identity: AdminIdentity | undefined;
  tab: string | undefined;
}) {
  const props = { client, identity };
  const items = [
    {
      key: 'catalog',
      label: c.modelList,
      permission: P.ModelsRead,
      children: <Models {...props} />,
    },
    {
      key: 'connections',
      label: c.connections,
      permission: P.CredentialsRead,
      children: <Credentials {...props} />,
    },
    {
      key: 'configuration',
      label: c.configuration,
      permission: P.DataPlaneWrite,
      children: <ConfigurationStatus {...props} />,
    },
  ].filter((item) => hasAdminPermission(identity, item.permission));
  const active = tab ?? items[0]?.key;
  if (!active || !items.some((item) => item.key === active)) return <Result status="403" title={c.forbidden} />;
  return (
    <Tabs
      type="card"
      activeKey={active}
      onChange={(key) => navigate(`system/models/${key}`)}
      items={items}
      destroyOnHidden
    />
  );
}

function Channels({ client }: { client: AdminConsoleClient }) {
  const [rows, setRows] = useState<readonly PortalEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(false);
    void new PortalClient(() => client.getAccessToken())
      .listEmployees()
      .then((items) => {
        if (live) setRows(items.filter((item) => item.channels?.wecom));
      })
      .catch(() => {
        if (live) {
          setRows([]);
          setError(true);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [client, revision]);
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>{c.channels}</Typography.Title>
          <Typography.Paragraph type="secondary">{c.channelHint}</Typography.Paragraph>
        </div>
        <Button loading={loading} onClick={() => refresh((n) => n + 1)}>
          {t('refresh')}
        </Button>
      </div>
      <Alert
        type={error ? 'error' : 'info'}
        title={error ? c.channelFailure : c.channelScope}
        style={{ marginBottom: 16 }}
      />
      <Table
        rowKey="name"
        loading={loading}
        dataSource={[...rows]}
        scroll={{ x: 580 }}
        columns={[
          { title: c.employees, dataIndex: 'displayName' },
          {
            title: c.channelName,
            render: (_, employee) => employee.channels?.wecomName || t('wecomBadge'),
          },
          { title: c.channelStatus, render: () => c.configured },
        ]}
      />
    </section>
  );
}

function Overview({
  client,
  identity,
  onNavigate,
}: {
  client: AdminConsoleClient;
  identity: AdminIdentity | undefined;
  onNavigate: (route: string) => void;
}) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [records, setRecords] = useState<readonly AdminEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [auditFailed, setAuditFailed] = useState(false);
  const [revision, refresh] = useState(0);
  const canAudit = hasAdminPermission(identity, P.EventsRead);
  const [employeeCounts, setEmployeeCounts] = useState<{
    total: number;
    ready: number;
  } | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    setAuditFailed(false);
    const portal = new PortalClient(() => client.getAccessToken());
    void portal
      .listEmployees()
      .then((items) => {
        if (live)
          setEmployeeCounts({
            total: items.length,
            ready: items.filter((item) => item.phase === 'Ready').length,
          });
      })
      .catch(() => {
        if (live) setEmployeeCounts(null);
      });
    void portal
      .listRequests('pending')
      .then((items) => {
        if (live) setPendingCount(items.filter((item) => item.state === 'pending').length);
      })
      .catch(() => {
        if (live) setPendingCount(null);
      });
    void client
      .overview(identity)
      .then((value) => {
        if (live) {
          setOverview(value);
          setFailed(Boolean(value.failed?.length));
        }
      })
      .catch(() => {
        if (live) {
          setOverview(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    if (canAudit)
      void client
        .searchAudit({ limit: 5 })
        .then((value) => {
          if (live) setRecords(value.items);
        })
        .catch(() => {
          if (live) {
            setRecords([]);
            setAuditFailed(true);
          }
        });
    return () => {
      live = false;
    };
  }, [client, identity, canAudit, revision]);
  const metrics = [
    {
      key: 'users',
      label: c.accountCount,
      permission: P.UsersRead,
      route: 'users',
    },
    {
      key: 'teams',
      label: c.teams,
      permission: P.TeamsRead,
      route: 'users/teams',
    },
    {
      key: 'skills',
      label: c.skills,
      permission: P.SkillsRead,
      route: 'skills',
    },
    {
      key: 'models',
      label: c.models,
      permission: P.ModelsRead,
      route: 'system/models',
    },
  ] as const;
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>{c.overview}</Typography.Title>
          <Typography.Paragraph type="secondary">{c.overviewHint}</Typography.Paragraph>
        </div>
        <Button loading={loading} onClick={() => refresh((n) => n + 1)}>
          {t('refresh')}
        </Button>
      </div>
      {failed && <Alert type="warning" showIcon title={c.overviewFailed} style={{ marginBottom: 20 }} />}
      <Card title={c.runningSummary} style={{ marginBottom: 20 }}>
        <Row gutter={[24, 16]}>
          <Col xs={24} sm={8}>
            <Statistic title={c.visibleEmployees} value={employeeCounts?.total ?? c.unknown} />
          </Col>
          <Col xs={24} sm={8}>
            <Statistic title={c.readyEmployees} value={employeeCounts?.ready ?? c.unknown} />
          </Col>
          <Col xs={24} sm={8}>
            <Statistic title={c.pendingRequests} value={pendingCount ?? c.unknown} />
          </Col>
        </Row>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          {c.runSummaryHint}
        </Typography.Paragraph>
      </Card>
      <Row gutter={[16, 16]}>
        {metrics
          .filter((m) => hasAdminPermission(identity, m.permission))
          .map((m) => (
            <Col xs={24} sm={12} xl={6} key={m.key}>
              <Card>
                <Statistic title={m.label} loading={loading} value={overview?.[m.key] ?? c.unknown} />
                <Button type="link" style={{ paddingInline: 0 }} onClick={() => onNavigate(m.route)}>
                  {c.manage}
                </Button>
              </Card>
            </Col>
          ))}
      </Row>
      <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
        <Col xs={24} xl={10}>
          <Card title={c.quickLinks}>
            <Space wrap>
              <Button onClick={() => onNavigate('employees')}>{c.employees}</Button>
              <Button onClick={() => onNavigate('knowledge')}>{c.knowledge}</Button>
              {hasAdminPermission(identity, P.UsersRead) && (
                <Button onClick={() => onNavigate('users')}>{c.users}</Button>
              )}
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginTop: 20 }}>
              {c.countHint}
            </Typography.Paragraph>
          </Card>
          <Card title={c.pendingWork} style={{ marginTop: 20 }}>
            <Space orientation="vertical">
              <Typography.Text>
                {c.pendingRequests}: {pendingCount ?? c.unknown}
              </Typography.Text>
              <Button onClick={() => onNavigate('employees/requests')}>{c.reviewRequests}</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title={c.recentActivity}>
            {canAudit ? (
              auditFailed ? (
                <Alert type="warning" title={c.auditFailed} />
              ) : (
                <Table
                  size="small"
                  pagination={false}
                  rowKey="key"
                  dataSource={records.map((row, index) => ({
                    ...row,
                    key: row.eventId ?? `record-${index}`,
                  }))}
                  columns={[
                    {
                      title: c.event,
                      dataIndex: 'type',
                      render: (v: string) => v || c.unknown,
                    },
                    {
                      title: c.actor,
                      dataIndex: 'userId',
                      render: (v: string) => v || c.unknown,
                    },
                    {
                      title: c.result,
                      dataIndex: 'result',
                      render: (v: string) => v || c.unknown,
                    },
                  ]}
                />
              )
            ) : (
              <Typography.Text type="secondary">{c.auditRestricted}</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>
    </section>
  );
}
