import {
  AppstoreOutlined,
  AuditOutlined,
  BookOutlined,
  DashboardOutlined,
  LogoutOutlined,
  MenuOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App as AntApp,
  Breadcrumb,
  Button,
  Card,
  Col,
  ConfigProvider,
  Drawer,
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
import { Network } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import {
  AdminConsoleClient,
  AdminConsoleStatus,
  type AdminIdentity,
  AdminMetadataError,
  type AdminSession,
  hasAdminPermission,
  AdminPermission as P,
} from './client.js';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import { AdminNotificationViewport } from './notifications.js';
import { PageCrumbContext } from './page-crumb.js';
import { botUIBaseURL, PortalClient } from './portal.js';
import { createAdminQueryClient } from './query-client.js';
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
const Channels = lazy(() => import('./Channels.js').then((m) => ({ default: m.Channels })));
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
const ComputeResources = lazy(() => import('./ComputeResources.js').then((m) => ({ default: m.ComputeResources })));
const Events = lazy(() => import('./Events.js').then((m) => ({ default: m.Events })));
const GatewayCall = lazy(() => import('./GatewayWorkbench.js').then((m) => ({ default: m.GatewayCall })));
const GatewayObservation = lazy(() => import('./GatewayWorkbench.js').then((m) => ({ default: m.GatewayObservation })));
const GatewayLimits = lazy(() => import('./GatewayWorkbench.js').then((m) => ({ default: m.GatewayLimits })));

const ModelGatewayRoute = {
  Page: 'model-gateway',
  Catalog: 'catalog',
  Connections: 'connections',
  Configuration: 'configuration',
  Call: 'call',
  Observe: 'observe',
  Limits: 'limits',
} as const;

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
    key: ModelGatewayRoute.Page,
    label: translate('zh', 'modelGateway'),
    icon: <Network size={14} aria-hidden="true" />,
    permissions: [P.ModelsRead, P.CredentialsRead, P.DataPlaneWrite],
  },
  {
    key: 'audit',
    label: c.audit,
    icon: <AuditOutlined />,
    // 该页同时承载业务遥测（events.read）与管理审计（audit.read），任一权限即可进入，
    // 具体 tab 由 Events 按各自权限门控。
    permissions: [P.EventsRead, P.AuditRead],
  },
  {
    key: 'system',
    label: c.system,
    icon: <SettingOutlined />,
    permissions: [P.LicensesRead, P.DeploymentRead],
  },
] as const;
const legacyRoutes: Record<string, string> = {
  resources: 'users',
  identity: 'users/accounts',
  'digital-employees': 'employees',
  memory: 'system/services',
  models: ModelGatewayRoute.Page,
  events: 'audit',
  operations: 'system/licenses',
};
function readRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '') || 'overview';
  if (raw === 'system/connections') return `${ModelGatewayRoute.Page}/${ModelGatewayRoute.Connections}`;
  if (raw === 'system/configuration') return `${ModelGatewayRoute.Page}/${ModelGatewayRoute.Configuration}`;
  if (raw === 'system/models' || raw.startsWith('system/models/')) {
    return raw.replace('system/models', ModelGatewayRoute.Page);
  }
  if (raw === 'resources/skills') return 'skills';
  const [first = 'overview', ...rest] = raw.split('/');
  return `${legacyRoutes[first] ?? first}${rest.length ? `/${rest.join('/')}` : ''}`;
}
function navigate(route: string) {
  window.location.hash = route;
}
const t = (key: Parameters<typeof translate>[1]) => translate('zh', key);
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 1024;
// New passwords reject edge whitespace (see Resources.tsx for the same rule).
const edgeWhitespaceRule = {
  validator: (_: unknown, value: string) =>
    !value || value === value.trim() ? Promise.resolve() : Promise.reject(new Error(t('passwordEdgeWhitespace'))),
};

export function AdminApp() {
  const [queryClient] = useState(createAdminQueryClient);
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
      <AntApp message={{ duration: 3, maxCount: 1 }}>
        <QueryClientProvider client={queryClient}>
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
        </QueryClientProvider>
        <AdminNotificationViewport />
      </AntApp>
    </ConfigProvider>
  );
}

function ConsoleRoot({ themeControl }: { themeControl: ReactNode }) {
  const queryClient = useQueryClient();
  const [client] = useState(() => new AdminConsoleClient());
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'signInFailed' | 'signInMetadataFailed' | null>(null);
  const [route, setRoute] = useState(readRoute);
  const [crumbTail, setCrumbTail] = useState<string | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
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
  // 查询缓存按会话隔离：登录身份的任何变化（退出、换账号、强制改密后换号）
  // 都先取消在途请求再清空缓存，新会话从空缓存开始，看不到上一账号的数据。
  const sessionKey = session?.identity?.user.id ?? session?.status ?? null;
  const previousSessionKey = useRef<string | null>(null);
  useEffect(() => {
    if (previousSessionKey.current !== null && previousSessionKey.current !== sessionKey) {
      void queryClient.cancelQueries().then(() => queryClient.clear());
    }
    previousSessionKey.current = sessionKey;
  }, [queryClient, sessionKey]);
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
                    password: values.password.trim(),
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
  if (session.identity?.passwordChangeRequired)
    return (
      <ForcedPasswordChange
        client={client}
        themeControl={themeControl}
        onChanged={setSession}
        onSwitchAccount={() => void signOut()}
      />
    );
  const identity = session.identity;
  // 管理端只服务管理员：普通员工使用独立员工前端（zhiyuanBotUI，NodePort 30202），
  // 非管理员登录这里只看到无权限提示。
  const adminAccess = session.status === AdminConsoleStatus.Authenticated;
  const [page = 'overview', subpage] = route.split('/');
  if (!adminAccess) {
    return (
      <Result
        status="403"
        title={c.forbidden}
        subTitle={c.employeeConsoleHint}
        extra={
          <Button type="primary" onClick={() => window.open(botUIBaseURL(), '_blank', 'noopener')}>
            {c.openEmployeeConsole}
          </Button>
        }
      />
    );
  }
  const allowed = (permission: P) => hasAdminPermission(identity, permission);
  const visible = modules.filter((m) => m.permissions.length === 0 || m.permissions.some(allowed));
  const navigation = (
    <Menu
      aria-label={c.navigation}
      mode="inline"
      selectedKeys={[page]}
      items={visible.map(({ key, label, icon }) => ({ key, label, icon, 'aria-label': label }))}
      onClick={({ key }) => {
        navigate(key);
        setNavigationOpen(false);
      }}
    />
  );
  const selected = modules.find((m) => m.key === page);
  const accessible = visible.some((m) => m.key === page);
  const enterprise = identity?.deployment?.name ?? identity?.enterprise?.name ?? identity?.deploymentId ?? c.enterprise;
  const props = { client, identity };
  const tabs = (
    items: {
      key: string;
      label: string;
      permission?: P | readonly P[];
      requiredPermissions?: readonly P[];
      children: ReactNode;
    }[],
  ) => {
    const usable = items.filter(
      (item) =>
        (!item.permission ||
          (typeof item.permission === 'string' ? allowed(item.permission) : item.permission.some(allowed))) &&
        (!item.requiredPermissions || item.requiredPermissions.every(allowed)),
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
      content = <Knowledge client={client} baseId={subpage ?? null} onNavigate={navigate} />;
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
      content = <Events {...props} initialTab={subpage} knowledgeBaseId={route.split('/')[2]} />;
      break;
    case ModelGatewayRoute.Page:
      content = tabs([
        {
          key: ModelGatewayRoute.Catalog,
          label: c.modelList,
          permission: P.ModelsRead,
          children: <Models {...props} />,
        },
        {
          key: ModelGatewayRoute.Connections,
          label: c.connections,
          permission: P.CredentialsRead,
          children: <Credentials {...props} />,
        },
        {
          key: ModelGatewayRoute.Configuration,
          label: c.configuration,
          permission: P.DataPlaneWrite,
          children: <ConfigurationStatus {...props} />,
        },
        {
          key: ModelGatewayRoute.Call,
          label: translate('zh', 'gatewayCall'),
          permission: P.ModelsRead,
          children: (
            <GatewayCall
              {...props}
              onObserve={() => navigate(`${ModelGatewayRoute.Page}/${ModelGatewayRoute.Observe}`)}
            />
          ),
        },
        {
          key: ModelGatewayRoute.Observe,
          label: translate('zh', 'gatewayObserve'),
          permission: P.ModelsRead,
          children: (
            <GatewayObservation
              {...props}
              onPrices={() => navigate(`${ModelGatewayRoute.Page}/${ModelGatewayRoute.Catalog}`)}
            />
          ),
        },
        {
          key: ModelGatewayRoute.Limits,
          label: translate('zh', 'gatewayLimits'),
          permission: P.DataPlaneWrite,
          requiredPermissions: [P.ModelsRead],
          children: <GatewayLimits {...props} />,
        },
      ]);
      break;
    case 'system':
      content = tabs([
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
          key: 'resources',
          label: c.resources,
          permission: P.DeploymentRead,
          children: <ComputeResources {...props} />,
        },
        {
          key: 'licenses',
          label: c.licenses,
          permission: P.LicensesRead,
          children: <Operations {...props} />,
        },
        {
          // Last on purpose: channels are the outward-facing result of the
          // configuration above (settings, resources, licences), not the entry
          // point of the page. The tab key is unchanged, so #system/channels
          // deep links keep working.
          key: 'channels',
          label: c.channels,
          children: <Channels client={client} language={ADMIN_LANGUAGE} />,
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
        {navigation}
        <div className="admin-sidebar-note">{c.accountScope}</div>
      </Layout.Sider>
      <Layout className="admin-body">
        <Layout.Header className="admin-header">
          <Button
            className="admin-navigation-toggle"
            aria-label={c.navigation}
            aria-expanded={navigationOpen}
            icon={<MenuOutlined aria-hidden />}
            onClick={() => setNavigationOpen(true)}
          />
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
          <Breadcrumb
            items={[
              { title: c.admin },
              {
                // 单一面包屑：有子页时把分区项做成回分区根（列表）的链接。
                title: subpage ? (
                  <a href={`#/${page}`}>{selected?.label ?? c.notFound}</a>
                ) : (
                  (selected?.label ?? c.notFound)
                ),
              },
              // 页面把自己的对象名报上来（如知识库名），补在分区之后。
              ...(crumbTail ? [{ title: crumbTail }] : []),
            ]}
          />
          <div className="admin-page">
            <Suspense fallback={<Skeleton active />}>
              <div key={page}>
                <PageCrumbContext value={setCrumbTail}>
                  {accessible ? content : selected ? <Result status="403" title={c.forbidden} /> : content}
                </PageCrumbContext>
              </div>
            </Suspense>
          </div>
        </Layout.Content>
      </Layout>
      <Drawer
        title={c.navigation}
        placement="left"
        size={256}
        className="admin-navigation-drawer"
        open={navigationOpen}
        onClose={() => setNavigationOpen(false)}
      >
        {navigation}
      </Drawer>
    </Layout>
  );
}

function ForcedPasswordChange({
  client,
  themeControl,
  onChanged,
  onSwitchAccount,
}: {
  client: AdminConsoleClient;
  themeControl: ReactNode;
  onChanged: (session: AdminSession) => void;
  onSwitchAccount: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <main className="admin-login">
      <div className="admin-login-theme">{themeControl}</div>
      <Card className="admin-login-card">
        <Typography.Text type="secondary">ZHIYUAN · {c.brand}</Typography.Text>
        <Typography.Title level={2}>{c.passwordChangeTitle}</Typography.Title>
        <Typography.Paragraph type="secondary">{c.passwordChangeHint}</Typography.Paragraph>
        {failed && <Alert type="error" showIcon title={t('passwordChangeFailed')} style={{ marginBottom: 20 }} />}
        <Form
          layout="vertical"
          requiredMark={false}
          disabled={pending}
          onFinish={async (values: { newPassword: string; confirmNewPassword: string }) => {
            setPending(true);
            setFailed(false);
            try {
              onChanged(await client.changePassword({ newPassword: values.newPassword }));
            } catch {
              setFailed(true);
            } finally {
              setPending(false);
            }
          }}
        >
          <Form.Item
            label={t('newPassword')}
            name="newPassword"
            rules={[
              { required: true, message: t('requiredFields') },
              { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: t('passwordChangePolicy') },
              edgeWhitespaceRule,
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            label={t('confirmNewPassword')}
            name="confirmNewPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: t('requiredFields') },
              ({ getFieldValue }) => ({
                validator: (_, value: string) =>
                  !value || getFieldValue('newPassword') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('newPasswordMismatch'))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={pending}>
            {t('changePassword')}
          </Button>
          <Button type="link" block disabled={pending} onClick={onSwitchAccount} style={{ marginTop: 8 }}>
            {c.switchAccount}
          </Button>
        </Form>
      </Card>
    </main>
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
  const [portal] = useState(() => new PortalClient((rejectedToken) => client.getAccessToken(rejectedToken)));
  const canReadTelemetry = hasAdminPermission(identity, P.EventsRead);
  const employeesQuery = useQuery({
    queryKey: ['portal', 'employees'],
    queryFn: () => portal.listEmployees().catch(() => null),
  });
  const pendingQuery = useQuery({
    queryKey: ['portal', 'requests', 'pending'],
    queryFn: () => portal.listRequests('pending').catch(() => null),
  });
  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => client.overview(identity).catch(() => null),
  });
  const auditQuery = useQuery({
    queryKey: ['admin', 'audit', 'recent'],
    queryFn: () => client.searchAudit({ limit: 5 }).catch(() => null),
    enabled: canReadTelemetry,
  });
  const employeeCounts = employeesQuery.data
    ? {
        total: employeesQuery.data.length,
        ready: employeesQuery.data.filter((item) => item.phase === 'Ready').length,
      }
    : null;
  const pendingCount = pendingQuery.data ? pendingQuery.data.filter((item) => item.state === 'pending').length : null;
  const overview = overviewQuery.data ?? null;
  const failed = overviewQuery.data === null || Boolean(overview?.failed?.length);
  const records = auditQuery.data?.items ?? [];
  const auditFailed = auditQuery.data === null;
  const loading = overviewQuery.isFetching;
  const refresh = () => {
    void employeesQuery.refetch();
    void pendingQuery.refetch();
    void overviewQuery.refetch();
    if (canReadTelemetry) void auditQuery.refetch();
  };
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
      label: t('modelGateway'),
      permission: P.ModelsRead,
      route: ModelGatewayRoute.Page,
    },
  ] as const;
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <Typography.Title level={2}>{c.overview}</Typography.Title>
          <Typography.Paragraph type="secondary">{c.overviewHint}</Typography.Paragraph>
        </div>
        <Button loading={loading} onClick={refresh}>
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
            {canReadTelemetry ? (
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
