/**
 *
 * description:用户管理：用户列表、团队管理、角色权限、账号关联、登陆会话
 *
 * 2026-09-30 LiXiang2019 列表加载改为表格 Empty/loading；筛选区接入 ListQueryActions
 *
 */

import type { AdminModel, JsonObject, ModelAssignment, Permission, PlatformUser, Role, Team } from '@aep/sdk-node';
import { AepProblem } from '@aep/sdk-node';
import {
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  EditOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  type TableProps,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
  theme,
  Upload,
} from 'antd';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runBatch } from './batch.js';
import {
  type AdminConsoleClient,
  type AdminIdentity,
  type AdminIdentitySource,
  AdminPermission,
  type AdminResources,
  type AdminSkill,
  type AdminSkillAssignment,
  type AdminSkillVersion,
  AdminSubjectType,
  type AdminUserSession,
  hasAdminPermission,
} from './client.js';
/** 2026-09-30 LiXiang2019 列表查询按钮组（查询/重置/导出） */
import { ListQueryActions } from './components/ListQueryActions.js';
import { formatTimestamp } from './format.js';
import { type AdminLanguage, type AdminTranslationKey, translate } from './i18n.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { PortalClient, PortalError } from './portal.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { SessionClientCell, SessionClientDetail } from './session-client.js';

const language: AdminLanguage = 'zh';
const t = (key: AdminTranslationKey) => translate(language, key);

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 1024;

type AdminUser = PlatformUser & { readonly email?: string | null };

/** 2026-09-30 LiXiang2019 用户列表筛选表单字段 */
interface UserListFilters {
  readonly query?: string;
  readonly teamId?: string;
  readonly roleId?: string;
  readonly status?: 'active' | 'disabled';
}

/** 2026-09-30 LiXiang2019 团队/角色列表按名称筛选字段 */
interface NameListFilters {
  readonly query?: string;
}

export const AdminResourceTab = {
  Users: 'users',
  Teams: 'teams',
  Roles: 'roles',
  Skills: 'skills',
  Assignments: 'assignments',
} as const;
export type AdminResourceTab = (typeof AdminResourceTab)[keyof typeof AdminResourceTab];

interface ResourcesProps {
  readonly client: AdminConsoleClient;
  readonly tab: AdminResourceTab;
  readonly identity?: AdminIdentity | undefined;
  /** Test seam: injected portal client (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
}

const PAGINATION = { pageSize: 10, hideOnSinglePage: true, showSizeChanger: false, align: 'center' } as const;

/** 2026-09-30 LiXiang2019 首屏加载占位资源，用于先渲染页面结构再等接口返回 */
const EMPTY_RESOURCES: AdminResources = {
  users: [],
  teams: [],
  roles: [],
  permissions: [],
  skills: [],
  assignments: [],
};

export function Resources({ client, tab, identity, portal }: ResourcesProps) {
  const [resolvedPortal] = useState(() => portal ?? new PortalClient(() => client.getAccessToken()));
  const [resources, setResources] = useState<AdminResources | null>(null);
  const [modelResources, setModelResources] = useState<ModelResources>({
    models: [],
    assignments: [],
    available: false,
    skillsAvailable: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const canQueryModels =
        hasAdminPermission(identity, AdminPermission.ModelsRead) && typeof client.models === 'function';
      const [next, models] = await Promise.all([
        client.resources(identity),
        canQueryModels ? client.models(identity) : Promise.resolve({ models: [], assignments: [] }),
      ]);
      setResources(next);
      setModelResources({
        ...models,
        available: canQueryModels && hasAdminPermission(identity, AdminPermission.ModelsAssign),
        skillsAvailable:
          hasAdminPermission(identity, AdminPermission.SkillsRead) &&
          hasAdminPermission(identity, AdminPermission.SkillsAssign),
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [client, identity]);
  useEffect(() => {
    void load();
  }, [load]);
  const reportError = useCallback(() => {
    notify(AdminNotificationKind.Error, t('operationUnavailable'));
  }, []);
  const canMutate =
    tab === AdminResourceTab.Users
      ? hasAdminPermission(identity, AdminPermission.UsersWrite)
      : tab === AdminResourceTab.Teams
        ? hasAdminPermission(identity, AdminPermission.TeamsWrite)
        : tab === AdminResourceTab.Roles
          ? hasAdminPermission(identity, AdminPermission.RolesWrite)
          : tab === AdminResourceTab.Skills
            ? hasAdminPermission(identity, AdminPermission.SkillsWrite)
            : hasAdminPermission(identity, AdminPermission.SkillsAssign);
  // 2026-09-30 LiXiang2019 加载中保留页头与表格结构；无缓存且失败时不展示空成功态
  const view = resources ?? (loading && !error ? EMPTY_RESOURCES : null);

  return (
    <section aria-label={sectionTitle(tab)}>
      {error ? (
        <Alert
          type="error"
          showIcon
          title={t('resourcesLoadFailed')}
          action={
            <Button size="small" onClick={() => void load()}>
              {rc.retry}
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {view ? (
        <>
          {/* 用户列表 */}
          {tab === AdminResourceTab.Users ? (
            <UsersSection
              client={client}
              identity={identity}
              resources={view}
              modelResources={modelResources}
              canWrite={canMutate}
              loading={loading}
              onRefresh={load}
              onChanged={load}
              onError={reportError}
            />
          ) : null}

          {/* 团队管理 */}
          {tab === AdminResourceTab.Teams ? (
            <TeamsSection
              client={client}
              resources={view}
              modelResources={modelResources}
              canWrite={canMutate}
              loading={loading}
              onRefresh={load}
              onChanged={load}
              onError={reportError}
            />
          ) : null}

          {/* 角色权限 */}
          {tab === AdminResourceTab.Roles ? (
            <RolesSection
              client={client}
              resources={view}
              modelResources={modelResources}
              canWrite={canMutate}
              loading={loading}
              onRefresh={load}
              onChanged={load}
              onError={reportError}
            />
          ) : null}

          {/* 技能 */}
          {tab === AdminResourceTab.Skills ? (
            <SkillsSection
              canAssign={hasAdminPermission(identity, AdminPermission.SkillsAssign)}
              client={client}
              portal={resolvedPortal}
              resources={view}
              canWrite={canMutate}
              loading={loading}
              onRefresh={load}
              onChanged={load}
              onError={reportError}
            />
          ) : null}

          {/* 技能授权 */}
          {tab === AdminResourceTab.Assignments ? (
            <AssignmentsSection
              client={client}
              resources={view}
              canWrite={canMutate}
              loading={loading}
              onRefresh={load}
              onChanged={load}
              onError={reportError}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function sectionTitle(tab: AdminResourceTab): string {
  if (tab === AdminResourceTab.Users) return rc.pageUsers;
  if (tab === AdminResourceTab.Teams) return rc.pageTeams;
  if (tab === AdminResourceTab.Roles) return rc.pageRoles;
  if (tab === AdminResourceTab.Skills) return rc.pageSkills;
  return rc.pageAssignments;
}

function SectionHeader({
  title,
  description,
  extra,
}: {
  readonly title: string;
  readonly description: string;
  readonly extra?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      <div>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary">
          <InfoCircleOutlined style={{ marginInlineEnd: 6 }} />
          {description}
        </Typography.Text>
      </div>
      {extra ? <Space wrap>{extra}</Space> : null}
    </div>
  );
}

function RefreshButton({ loading, onRefresh }: { readonly loading: boolean; readonly onRefresh: () => Promise<void> }) {
  return (
    <Button
      icon={<ReloadOutlined />}
      aria-label={t('refresh')}
      title={t('refresh')}
      loading={loading}
      onClick={() => void onRefresh()}
    />
  );
}

function UnknownText({ children }: { readonly children?: string }) {
  return <Typography.Text type="secondary">{children ?? rc.valueUnknown}</Typography.Text>;
}

function EnabledBadge({ enabled }: { readonly enabled: boolean }) {
  return <Badge status={enabled ? 'success' : 'default'} text={enabled ? rc.statusEnabled : rc.statusDisabled} />;
}

function NameCell({ name, detail }: { readonly name: string; readonly detail: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div>{name}</div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {detail}
      </Typography.Text>
    </div>
  );
}

type MutationRunner = (operation: () => Promise<void>) => Promise<void>;

function useMutationRunner(onChanged: () => Promise<void>, onError: () => void) {
  const [pending, setPending] = useState(false);
  const run = useCallback<MutationRunner>(
    async (operation) => {
      setPending(true);
      try {
        await operation();
        await onChanged();
      } catch {
        onError();
      } finally {
        setPending(false);
      }
    },
    [onChanged, onError],
  );
  return { pending, run };
}

interface SectionProps {
  readonly client: AdminConsoleClient;
  readonly resources: AdminResources;
  readonly canWrite: boolean;
  readonly loading: boolean;
  readonly onRefresh: () => Promise<void>;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}

interface ModelResources {
  readonly models: readonly AdminModel[];
  readonly assignments: readonly ModelAssignment[];
  readonly available: boolean;
  readonly skillsAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Effective access computation (users / teams / roles share the same rules).
// ---------------------------------------------------------------------------

interface AccessRow {
  readonly key: string;
  readonly resourceType: 'skill' | 'model';
  readonly resourceId: string;
  readonly resourceName: string;
  readonly source: string;
  readonly effective: boolean;
  readonly reason: string | null;
}

function skillEffective(skill: AdminSkill | undefined): boolean {
  return Boolean(skill?.enabled && skill.state === 'active');
}

function buildAccessRows(input: {
  readonly resources: AdminResources;
  readonly modelResources: ModelResources;
  readonly subjects: readonly {
    readonly type: 'user' | 'role' | 'team';
    readonly id: string;
    readonly label: string;
  }[];
  readonly accountActive: boolean;
}): readonly AccessRow[] {
  const { resources, modelResources, subjects, accountActive } = input;
  const skills = new Map(resources.skills.map((skill) => [skill.id, skill]));
  const models = new Map(modelResources.models.map((model) => [model.id, model]));
  const subjectKeys = new Map(subjects.map((subject) => [`${subject.type}:${subject.id}`, subject]));
  const rows: AccessRow[] = [];
  for (const assignment of resources.assignments) {
    const subject = subjectKeys.get(`${assignment.subjectType}:${assignment.subjectId}`);
    if (!subject) continue;
    const skill = skills.get(assignment.skillId);
    const effective = skill !== undefined && accountActive && skillEffective(skill);
    rows.push({
      key: `skill:${assignment.id}`,
      resourceType: 'skill',
      resourceId: assignment.skillId,
      resourceName: skill?.name ?? assignment.skillId,
      source:
        subject.type === 'user'
          ? rc.accessDirect
          : `${subject.type === 'role' ? rc.accessViaRole : rc.accessViaTeam}：${subject.label}`,
      effective,
      reason: effective
        ? null
        : skill === undefined
          ? rc.accessStateUnknown
          : !accountActive
            ? rc.accessUserDisabled
            : rc.accessResourceDisabled,
    });
  }
  for (const assignment of modelResources.assignments) {
    const subject = subjectKeys.get(`${assignment.subject.type}:${assignment.subject.id}`);
    if (!subject) continue;
    const model = models.get(assignment.resourceId);
    const effective = model !== undefined && accountActive && Boolean(model.enabled);
    rows.push({
      key: `model:${assignment.id}`,
      resourceType: 'model',
      resourceId: assignment.resourceId,
      resourceName: model?.displayName ?? assignment.resourceId,
      source:
        subject.type === 'user'
          ? rc.accessDirect
          : `${subject.type === 'role' ? rc.accessViaRole : rc.accessViaTeam}：${subject.label}`,
      effective,
      reason: effective
        ? null
        : model === undefined
          ? rc.accessStateUnknown
          : !accountActive
            ? rc.accessUserDisabled
            : rc.accessResourceDisabled,
    });
  }
  return rows;
}

function userSubjects(
  user: PlatformUser,
  resources: AdminResources,
): readonly { readonly type: 'user' | 'role' | 'team'; readonly id: string; readonly label: string }[] {
  const roles = new Map(resources.roles.map((role) => [role.id, role]));
  const teams = new Map(resources.teams.map((team) => [team.id, team]));
  return [
    { type: 'user' as const, id: user.id, label: user.displayName },
    ...(user.roleIds ?? [])
      .filter((id) => roles.get(id)?.enabled)
      .map((id) => ({ type: 'role' as const, id, label: roles.get(id)?.name ?? id })),
    ...(user.teamIds ?? [])
      .filter((id) => teams.get(id)?.enabled)
      .map((id) => ({ type: 'team' as const, id, label: teams.get(id)?.name ?? id })),
  ];
}

function AccessTable({
  rows,
  modelsAvailable = true,
  skillsAvailable = true,
}: {
  readonly rows: readonly AccessRow[];
  readonly modelsAvailable?: boolean;
  readonly skillsAvailable?: boolean;
}) {
  const columns: TableProps<AccessRow>['columns'] = [
    {
      title: rc.accessResource,
      key: 'resource',
      render: (_, row) => (
        <Space size={8}>
          <Tag color={row.resourceType === 'skill' ? 'geekblue' : 'purple'}>
            {row.resourceType === 'skill' ? rc.resourceTypeSkill : rc.resourceTypeModel}
          </Tag>
          <span>{row.resourceName}</span>
        </Space>
      ),
    },
    { title: rc.accessPermission, key: 'permission', render: () => rc.accessUse },
    { title: rc.accessSource, dataIndex: 'source', key: 'source' },
    {
      title: rc.accessState,
      key: 'effective',
      render: (_, row) =>
        row.effective ? (
          <Badge status="success" text={rc.accessEffective} />
        ) : (
          <Badge status="default" text={row.reason ?? rc.accessResourceDisabled} />
        ),
    },
  ];
  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      {skillsAvailable ? null : <Alert type="info" showIcon title={rc.accessSkillsUnknown} />}
      {modelsAvailable ? null : <Alert type="info" showIcon title={rc.accessModelsUnknown} />}
      {rows.length === 0 ? (
        <Empty
          description={modelsAvailable && skillsAvailable ? rc.accessEmpty : rc.accessStateUnknown}
          children={<Typography.Text type="secondary">{rc.accessEmptyHint}</Typography.Text>}
        />
      ) : (
        <Table<AccessRow> rowKey="key" columns={columns} dataSource={[...rows]} pagination={PAGINATION} size="small" />
      )}
    </Space>
  );
}

function accessCount(rows: readonly AccessRow[]): { readonly skills: number; readonly models: number } {
  const effective = rows.filter((row) => row.effective);
  return {
    skills: new Set(effective.filter((row) => row.resourceType === 'skill').map((row) => row.resourceId)).size,
    models: new Set(effective.filter((row) => row.resourceType === 'model').map((row) => row.resourceId)).size,
  };
}

function ResourceAccessTags({
  rows,
  modelsAvailable = true,
  skillsAvailable = true,
}: {
  readonly rows: readonly AccessRow[];
  readonly modelsAvailable?: boolean;
  readonly skillsAvailable?: boolean;
}) {
  const counts = accessCount(rows);
  return (
    <Space size={4} wrap>
      <Tag>{skillsAvailable ? `${counts.skills} ${t('skills')}` : rc.accessSkillsUnknown}</Tag>
      {modelsAvailable ? <Tag>{`${counts.models} ${t('models')}`}</Tag> : <Tag>{rc.accessModelsUnknown}</Tag>}
    </Space>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function UsersSection({
  client,
  identity,
  resources,
  modelResources,
  canWrite,
  loading,
  onRefresh,
  onChanged,
  onError,
}: SectionProps & {
  readonly identity?: AdminIdentity | undefined;
  readonly modelResources: ModelResources;
}) {
  const { token } = theme.useToken();
  // 2026-09-30 LiXiang2019 用户列表筛选：点查询后才应用条件
  const [filterForm] = Form.useForm<UserListFilters>();
  const [filters, setFilters] = useState<UserListFilters>({});
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ readonly id?: string } | null>(null);
  const [resetUser, setResetUser] = useState<PlatformUser | null>(null);
  const [selfChangeOpen, setSelfChangeOpen] = useState(false);
  const [disableTarget, setDisableTarget] = useState<PlatformUser | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    readonly created: number;
    readonly rejected: number;
    readonly errors: readonly string[];
  } | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);

  const teamNames = useMemo(() => new Map(resources.teams.map((team) => [team.id, team.name])), [resources.teams]);
  const roleNames = useMemo(() => new Map(resources.roles.map((role) => [role.id, role.name])), [resources.roles]);
  const rows = useMemo(() => {
    const normalized = (filters.query ?? '').trim().toLowerCase();
    return resources.users.filter((user) => {
      if (normalized && !`${user.displayName} ${user.username}`.toLowerCase().includes(normalized)) return false;
      if (filters.teamId && !(user.teamIds ?? []).includes(filters.teamId)) return false;
      if (filters.roleId && !(user.roleIds ?? []).includes(filters.roleId)) return false;
      if (filters.status && user.status !== filters.status) return false;
      return true;
    });
  }, [resources.users, filters]);

  const detailUser = detailUserId ? (resources.users.find((user) => user.id === detailUserId) ?? null) : null;

  const columns: TableProps<PlatformUser>['columns'] = [
    {
      title: rc.nameAndAccount,
      key: 'name',
      render: (_, user) => <NameCell name={user.displayName} detail={user.username} />,
    },
    {
      title: rc.belongTeams,
      key: 'teams',
      render: (_, user) =>
        (user.teamIds ?? []).length > 0 ? (
          <Space size={4} wrap>
            {(user.teamIds ?? []).map((id) => (
              <Tag key={id}>{teamNames.get(id) ?? id}</Tag>
            ))}
          </Space>
        ) : (
          <UnknownText>{rc.noTeams}</UnknownText>
        ),
    },
    {
      title: rc.accountRoles,
      key: 'roles',
      render: (_, user) =>
        (user.roleIds ?? []).length > 0 ? (
          <Space size={4} wrap>
            {(user.roleIds ?? []).map((id) => (
              <Tag key={id}>{roleNames.get(id) ?? id}</Tag>
            ))}
          </Space>
        ) : (
          <UnknownText>{rc.noRoles}</UnknownText>
        ),
    },
    { title: rc.sourceColumn, key: 'source', render: () => <UnknownText>{rc.sourceUnknown}</UnknownText> },
    {
      title: t('status'),
      key: 'status',
      render: (_, user) => <EnabledBadge enabled={user.status === 'active'} />,
    },
    { title: rc.lastLogin, key: 'lastLogin', render: () => <UnknownText /> },
    {
      title: t('actions'),
      key: 'actions',
      align: 'right',
      render: (_, user) => (
        <Space size={0} wrap>
          <Button type="link" size="small" disabled={pending} onClick={() => setDetailUserId(user.id)}>
            {rc.view}
          </Button>
          {canWrite ? (
            <>
              <Button type="link" size="small" disabled={pending} onClick={() => setEditor({ id: user.id })}>
                {t('edit')}
              </Button>
              <Dropdown
                menu={{
                  items: [
                    identity?.user.id === user.id
                      ? { key: 'change', icon: <KeyOutlined />, label: t('changePassword') }
                      : { key: 'reset', icon: <KeyOutlined />, label: t('resetPassword') },
                    user.status === 'active'
                      ? { key: 'disable', icon: <DeleteOutlined />, danger: true, label: t('disable') }
                      : { key: 'enable', icon: <PlusOutlined />, label: t('enable') },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'reset') setResetUser(user);
                    else if (key === 'change') setSelfChangeOpen(true);
                    else if (key === 'disable') setDisableTarget(user);
                    else if (key === 'enable')
                      void run(async () => {
                        await client.updateUser(user.id, { status: 'active' });
                      });
                  },
                }}
              >
                <Button type="text" size="small" aria-label={rc.moreActions} icon={<DownOutlined />} />
              </Dropdown>
            </>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <SectionHeader
        title={rc.pageUsers}
        description={rc.pageUsersDescription}
        extra={
          <>
            {canWrite ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({})}>
                {t('addUser')}
              </Button>
            ) : null}
            {canWrite ? (
              <Button
                icon={<UploadOutlined />}
                onClick={() => {
                  setImportResult(null);
                  setImportOpen(true);
                }}
              >
                {t('importUsers')}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      {/* 2026-09-30 LiXiang2019 用户列表筛选条件 + 查询/重置按钮组 */}
      <Form form={filterForm} layout="inline" style={{ gap: 12, marginBottom: 16 }}>
        <Form.Item name="query" style={{ marginInlineEnd: 0 }}>
          <Input
            aria-label={rc.searchUserPlaceholder}
            placeholder={rc.searchUserPlaceholder}
            allowClear
            style={{ width: 220 }}
          />
        </Form.Item>
        <Form.Item name="teamId" style={{ marginInlineEnd: 0 }}>
          <Select
            aria-label={rc.belongTeams}
            placeholder={rc.allTeams}
            allowClear
            options={resources.teams.map((team) => ({ value: team.id, label: team.name }))}
            style={{ minWidth: 160 }}
          />
        </Form.Item>
        <Form.Item name="roleId" style={{ marginInlineEnd: 0 }}>
          <Select
            aria-label={rc.accountRoles}
            placeholder={rc.allRoles}
            allowClear
            options={resources.roles.map((role) => ({ value: role.id, label: role.name }))}
            style={{ minWidth: 160 }}
          />
        </Form.Item>
        <Form.Item name="status" style={{ marginInlineEnd: 0 }}>
          <Select
            aria-label={t('status')}
            placeholder={rc.allStatus}
            allowClear
            options={[
              { value: 'active', label: rc.statusEnabled },
              { value: 'disabled', label: rc.statusDisabled },
            ]}
            style={{ minWidth: 140 }}
          />
        </Form.Item>
        <Form.Item style={{ marginInlineEnd: 0 }}>
          <ListQueryActions
            form={filterForm}
            search={{ run: (values) => setFilters(values) }}
            onReset={() => setFilters({})}
          />
        </Form.Item>
      </Form>
      {importResult ? (
        <Alert
          type={importResult.rejected > 0 ? 'warning' : 'success'}
          showIcon
          style={{ marginBottom: 16 }}
          title={`${rc.importResultTitle}：${t('usersImported')}: ${importResult.created} / ${t('usersRejected')}: ${importResult.rejected}`}
          description={
            importResult.errors.length > 0 ? (
              <div>
                <p>{rc.userImportPartial}</p>
                <ul style={{ paddingInlineStart: token.padding, marginBottom: 0 }}>
                  {importResult.errors.map((message, index) => (
                    <li key={`${message}-${index}`}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : undefined
          }
          closable={{ onClose: () => setImportResult(null) }}
        />
      ) : null}
      {/* 2026-09-30 LiXiang2019 加载态用表格 loading，空数据用 Empty（对齐账号关联） */}
      <Table<PlatformUser>
        rowKey="id"
        columns={columns}
        dataSource={[...rows]}
        pagination={PAGINATION}
        loading={loading}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('usersEmpty')}>
              <Typography.Text type="secondary">{t('usersEmptyHint')}</Typography.Text>
            </Empty>
          ),
        }}
      />
      {detailUser ? (
        <UserDetailDrawer
          client={client}
          identity={identity}
          user={detailUser}
          resources={resources}
          modelResources={modelResources}
          canWrite={canWrite}
          open
          onClose={() => setDetailUserId(null)}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
      {canWrite && editor ? (
        <UserEditorModal
          client={client}
          existingUsernames={resources.users.map((user) => user.username)}
          user={
            editor.id ? (resources.users.find((user) => user.id === editor.id) as AdminUser | undefined) : undefined
          }
          roles={resources.roles}
          teams={resources.teams}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
      {canWrite && resetUser ? (
        <PasswordResetModal
          client={client}
          user={resetUser}
          open
          onOpenChange={(open) => {
            if (!open) setResetUser(null);
          }}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
      {canWrite && selfChangeOpen ? (
        <SelfPasswordChangeModal
          client={client}
          open
          onOpenChange={(open) => {
            if (!open) setSelfChangeOpen(false);
          }}
        />
      ) : null}
      {canWrite && disableTarget ? (
        <DisableUserModal
          client={client}
          identity={identity}
          user={disableTarget}
          open
          onOpenChange={(open) => {
            if (!open) setDisableTarget(null);
          }}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
      {canWrite ? (
        <UserImportModal
          client={client}
          open={importOpen}
          onOpenChange={setImportOpen}
          onChanged={async (result) => {
            setImportResult(result);
            await onChanged();
          }}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// User detail drawer
// ---------------------------------------------------------------------------

function UserDetailDrawer({
  client,
  identity,
  user,
  resources,
  modelResources,
  canWrite,
  open,
  onClose,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly user: AdminUser;
  readonly resources: AdminResources;
  readonly modelResources: ModelResources;
  readonly canWrite: boolean;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const teamNames = useMemo(() => new Map(resources.teams.map((team) => [team.id, team])), [resources.teams]);
  const roleNames = useMemo(() => new Map(resources.roles.map((role) => [role.id, role])), [resources.roles]);
  const accessRows = useMemo(
    () =>
      buildAccessRows({
        resources,
        modelResources,
        subjects: userSubjects(user, resources),
        accountActive: user.status === 'active',
      }),
    [resources, modelResources, user],
  );
  const userTeams = (user.teamIds ?? [])
    .map((id) => teamNames.get(id))
    .filter((team): team is NonNullable<typeof team> => Boolean(team));
  const userRoles = (user.roleIds ?? [])
    .map((id) => roleNames.get(id))
    .filter((role): role is NonNullable<typeof role> => Boolean(role));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={720}
      title={
        <Space size={8}>
          <span>{user.displayName}</span>
          <Tag>{user.username}</Tag>
          <EnabledBadge enabled={user.status === 'active'} />
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: 'basic',
            label: rc.detailBasic,
            children: (
              <Descriptions
                column={1}
                size="small"
                items={[
                  { key: 'name', label: t('displayName'), children: user.displayName },
                  { key: 'username', label: t('username'), children: user.username },
                  {
                    key: 'email',
                    label: t('email'),
                    children: user.email ?? <UnknownText>{rc.emailUnset}</UnknownText>,
                  },
                  { key: 'type', label: rc.accountType, children: <UnknownText /> },
                  { key: 'source', label: rc.sourceColumn, children: <UnknownText>{rc.sourceUnknown}</UnknownText> },
                  { key: 'status', label: t('status'), children: <EnabledBadge enabled={user.status === 'active'} /> },
                  { key: 'lastLogin', label: rc.lastLogin, children: <UnknownText /> },
                  {
                    key: 'createdAt',
                    label: rc.createdAtLabel,
                    children: formatTimestamp(user.createdAt) || <UnknownText />,
                  },
                  {
                    key: 'updatedAt',
                    label: rc.updatedAtLabel,
                    children: formatTimestamp(user.updatedAt) || <UnknownText />,
                  },
                ]}
              />
            ),
          },
          {
            key: 'org',
            label: rc.detailOrg,
            children: (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <div>
                  <Typography.Title level={5}>{rc.belongTeams}</Typography.Title>
                  {userTeams.length === 0 ? (
                    <UnknownText>{rc.noTeams}</UnknownText>
                  ) : (
                    <Space size={4} wrap>
                      {userTeams.map((team) => (
                        <Tag key={team.id} icon={<TeamOutlined />}>
                          {team.name}
                        </Tag>
                      ))}
                    </Space>
                  )}
                </div>
                <div>
                  <Typography.Title level={5}>{rc.accountRoles}</Typography.Title>
                  {userRoles.length === 0 ? (
                    <UnknownText>{rc.noRoles}</UnknownText>
                  ) : (
                    <Space size={4} wrap>
                      {userRoles.map((role) => (
                        <Tag key={role.id} icon={<SafetyCertificateOutlined />}>
                          {role.name}
                        </Tag>
                      ))}
                    </Space>
                  )}
                </div>
                {canWrite ? (
                  <Button icon={<EditOutlined />} onClick={() => setAdjusting(true)}>
                    {rc.adjustOrg}
                  </Button>
                ) : null}
              </Space>
            ),
          },
          {
            key: 'access',
            label: rc.detailAccess,
            children: (
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                <Alert type="info" showIcon title={rc.accessNote} />
                <AccessTable
                  rows={accessRows}
                  modelsAvailable={modelResources.available}
                  skillsAvailable={modelResources.skillsAvailable}
                />
              </Space>
            ),
          },
          {
            key: 'links',
            label: rc.detailLinks,
            children: <UserAccountLinks client={client} identity={identity} userId={user.id} onError={onError} />,
          },
          {
            key: 'sessions',
            label: rc.detailSessions,
            children: <UserLoginSessions client={client} identity={identity} userId={user.id} onError={onError} />,
          },
        ]}
      />
      {canWrite && adjusting ? (
        <AdjustOrgModal
          client={client}
          user={user}
          roles={resources.roles}
          teams={resources.teams}
          open
          onOpenChange={setAdjusting}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
    </Drawer>
  );
}

function AdjustOrgModal({
  client,
  user,
  roles,
  teams,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly user: PlatformUser;
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [form] = Form.useForm<{ roles: string[]; teams: string }>();
  const [pending, setPending] = useState(false);
  const submit = async (values: { roles: string[]; teams: string }) => {
    setPending(true);
    try {
      await client.replaceUserRBAC(user.id, { roleIds: values.roles, teamIds: values.teams ? [values.teams] : [] });
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t('changesSaved'));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      width={600}
      title={rc.adjustOrgTitle}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Alert type="warning" showIcon title={rc.adjustOrgNote} style={{ marginBottom: 16 }} />
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ roles: [...(user.roleIds ?? [])], teams: user.teamIds?.[0] ?? undefined }}
        onFinish={submit}
      >
        <Form.Item
          name="roles"
          label={t('selectRoles')}
          rules={[
            {
              validator: (_, value: string[]) =>
                Array.isArray(value) && value.length > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('roleRequired'))),
            },
          ]}
        >
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('selectRoles')}
            options={roles.map((role) => ({ value: role.id, label: `${role.name}（${role.id}）` }))}
          />
        </Form.Item>
        <Form.Item name="teams" label={t('selectTeams')} rules={[{ required: true, message: t('teamRequired') }]}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('selectTeams')}
            options={teams.map((team) => ({ value: team.id, label: `${team.name}（${team.id}）` }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function UserAccountLinks({
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
  const [rows, setRows] = useState<
    | readonly {
        readonly key: string;
        readonly source: AdminIdentitySource;
        readonly externalId: string;
        readonly status: string;
      }[]
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const sources = (await client.identitySources()).items;
      const mappings = await Promise.all(sources.map((source) => client.identityMappings(source.id)));
      setRows(
        sources.flatMap((source, index) =>
          (mappings[index]?.items ?? [])
            .filter((mapping) => mapping.localSubjectId === userId)
            .map((mapping) => ({
              key: `${source.id}:${mapping.externalId}`,
              source,
              externalId: mapping.externalId,
              status: mapping.status,
            })),
        ),
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [client, userId]);
  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);
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

function UserLoginSessions({
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
  const [sessions, setSessions] = useState<readonly AdminUserSession[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detail, setDetail] = useState<AdminUserSession | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setSessions(await client.sessions(userId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [client, userId]);
  useEffect(() => {
    void load();
  }, [load]);
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

function DisableUserModal({
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
  const [activeSessions, setActiveSessions] = useState<number | null>(null);
  const [sessionsUnknown, setSessionsUnknown] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ readonly revoked: number; readonly failed: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    setResult(null);
    setActiveSessions(null);
    setSessionsUnknown(false);
    void client
      .sessions(user.id)
      .then((sessions) => setActiveSessions(sessions.filter((session) => !session.revokedAt).length))
      .catch(() => setSessionsUnknown(true));
  }, [open, client, user.id]);
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

// ---------------------------------------------------------------------------
// User editor / password reset / import
// ---------------------------------------------------------------------------

function UserEditorModal({
  client,
  existingUsernames,
  user,
  roles,
  teams,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly existingUsernames: readonly string[];
  readonly user: AdminUser | undefined;
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(user);
  const [form] = Form.useForm();
  const [pending, setPending] = useState(false);
  const submit = async (values: {
    username?: string;
    displayName: string;
    email?: string;
    temporaryPassword?: string;
    roles: string[];
    teams: string;
    requirePasswordChange?: boolean;
  }) => {
    const normalizedUsername = (values.username ?? '').trim();
    if (!user && existingUsernames.includes(normalizedUsername)) {
      form.setFields([{ name: 'username', errors: [t('usernameAlreadyExists')] }]);
      return;
    }
    setPending(true);
    try {
      if (user) {
        await client.updateUser(user.id, {
          displayName: values.displayName.trim(),
          email: values.email?.trim() || null,
        });
        await client.replaceUserRBAC(user.id, { roleIds: values.roles, teamIds: values.teams ? [values.teams] : [] });
      } else {
        await client.createUser({
          username: normalizedUsername,
          displayName: values.displayName.trim(),
          email: values.email?.trim() || null,
          temporaryPassword: values.temporaryPassword ?? '',
          roleIds: values.roles,
          teamIds: values.teams ? [values.teams] : [],
          requirePasswordChange: values.requirePasswordChange !== false,
        });
      }
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t(editing ? 'userUpdated' : 'userCreated'));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      width={600}
      title={t(editing ? 'userEditTitle' : 'userEditorTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">
        {t(editing ? 'userEditDescription' : 'userEditorDescription')}
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        autoComplete="off"
        initialValues={{
          username: user?.username ?? '',
          displayName: user?.displayName ?? '',
          email: user?.email ?? '',
          temporaryPassword: '',
          roles: [...(user?.roleIds ?? [])],
          teams: user?.teamIds?.[0] ?? undefined,
          requirePasswordChange: true,
        }}
        onFinish={submit}
      >
        {editing ? null : (
          <Form.Item
            name="username"
            label={t('username')}
            rules={[{ required: true, whitespace: true, message: t('usernameRequired') }]}
          >
            <Input autoComplete="off" disabled={pending} />
          </Form.Item>
        )}
        <Form.Item
          name="displayName"
          label={t('displayName')}
          rules={[{ required: true, whitespace: true, message: t('displayNameRequired') }]}
        >
          <Input autoComplete="off" disabled={pending} />
        </Form.Item>
        <Form.Item name="email" label={t('email')} rules={[{ type: 'email', message: t('email') }]}>
          <Input autoComplete="off" placeholder={t('emailPlaceholder')} disabled={pending} />
        </Form.Item>
        {editing ? null : (
          <Form.Item
            name="temporaryPassword"
            label={t('temporaryPassword')}
            extra={t('passwordPolicy')}
            rules={[
              { required: true, message: t('passwordPolicy') },
              { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: t('passwordPolicy') },
            ]}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={t('temporaryPasswordPlaceholder')}
              disabled={pending}
            />
          </Form.Item>
        )}
        <Form.Item
          name="roles"
          label={t('selectRoles')}
          rules={[
            {
              validator: (_, value: string[]) =>
                Array.isArray(value) && value.length > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('roleRequired'))),
            },
          ]}
        >
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('selectRoles')}
            disabled={pending}
            options={roles.map((role) => ({ value: role.id, label: `${role.name}（${role.id}）` }))}
          />
        </Form.Item>
        <Form.Item name="teams" label={t('selectTeams')} rules={[{ required: true, message: t('teamRequired') }]}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('selectTeams')}
            disabled={pending}
            options={teams.map((team) => ({ value: team.id, label: `${team.name}（${team.id}）` }))}
          />
        </Form.Item>
        {editing ? null : (
          <Form.Item name="requirePasswordChange" label={t('requirePasswordChange')} valuePropName="checked">
            <Switch disabled={pending} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

function PasswordResetModal({
  client,
  user,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly user: PlatformUser;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [form] = Form.useForm<{ temporaryPassword: string; requirePasswordChange: boolean }>();
  const [pending, setPending] = useState(false);
  const submit = async (values: { temporaryPassword: string; requirePasswordChange: boolean }) => {
    setPending(true);
    try {
      await client.resetUserPassword(user.id, {
        temporaryPassword: values.temporaryPassword,
        requirePasswordChange: values.requirePasswordChange,
      });
      onOpenChange(false);
      await onChanged();
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t('resetPasswordTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">
        {t('resetPasswordDescription')} <Typography.Text strong>{user.displayName}</Typography.Text>
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        autoComplete="off"
        initialValues={{ temporaryPassword: '', requirePasswordChange: true }}
        onFinish={submit}
      >
        <Form.Item
          name="temporaryPassword"
          label={t('temporaryPassword')}
          extra={t('passwordPolicy')}
          rules={[
            { required: true, message: t('passwordPolicy') },
            { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: t('passwordPolicy') },
          ]}
        >
          <Input.Password
            autoComplete="new-password"
            placeholder={t('temporaryPasswordPlaceholder')}
            disabled={pending}
          />
        </Form.Item>
        <Form.Item name="requirePasswordChange" label={t('requirePasswordChange')} valuePropName="checked">
          <Switch disabled={pending} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function SelfPasswordChangeModal({
  client,
  open,
  onOpenChange,
}: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [form] = Form.useForm<{ newPassword: string; confirmNewPassword: string }>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async (values: { newPassword: string }) => {
    setPending(true);
    setFailed(false);
    try {
      // The self-service endpoint rotates this console session in place; the
      // admin reset endpoint would revoke it and sign the operator out.
      await client.changePassword({ newPassword: values.newPassword });
      onOpenChange(false);
      notify(AdminNotificationKind.Success, t('passwordChangeSucceeded'));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t('changePasswordTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t('selfPasswordChangeDescription')}</Typography.Paragraph>
      {failed ? <Alert type="error" showIcon title={t('passwordChangeFailed')} style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" preserve={false} autoComplete="off" onFinish={submit}>
        <Form.Item
          name="newPassword"
          label={t('newPassword')}
          extra={t('passwordChangePolicy')}
          rules={[
            { required: true, message: t('passwordChangePolicy') },
            { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: t('passwordChangePolicy') },
          ]}
        >
          <Input.Password autoComplete="new-password" disabled={pending} />
        </Form.Item>
        <Form.Item
          name="confirmNewPassword"
          label={t('confirmNewPassword')}
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
          <Input.Password autoComplete="new-password" disabled={pending} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

type UserImportResult = {
  readonly created: number;
  readonly rejected: number;
  readonly errors: readonly string[];
};
// 用户导入弹窗
function UserImportModal({
  client,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: (result: UserImportResult) => Promise<void>;
  readonly onError: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (open) {
      setFile(null);
      setPending(false);
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
      const name = file.name.toLowerCase();
      const payload = name.endsWith('.json')
        ? normalizeUserImport(JSON.parse(await file.text()))
        : normalizeUserImport(parseUserImportTable(await file.text()));
      const result = await client.importUsers(payload);
      const created = typeof result.created === 'number' ? result.created : 0;
      const rejected = typeof result.rejected === 'number' ? result.rejected : 0;
      const errors = Array.isArray(result.errors)
        ? result.errors.filter((item): item is string => typeof item === 'string').slice(0, 20)
        : [];
      onOpenChange(false);
      await onChanged({ created, rejected, errors });
    } catch {
      setFailed(true);
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      width={700}
      title={t('importUsersTitle')}
      okText={t('importUsers')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => void submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, flex: 1 }}>
          {t('importUsersDescription')}
        </Typography.Paragraph>
      </div>
      {failed ? <Alert type="error" showIcon title={t('importUsersFailed')} style={{ marginBottom: 16 }} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '24px 0px' }}>
        <Upload
          accept=".csv,.xlsx,.xls,.json,application/json,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          maxCount={1}
          disabled={pending}
          style={{ textAlign: 'center' }}
          fileList={file ? [{ uid: 'users-import', name: file.name, size: file.size }] : []}
          beforeUpload={(candidate) => {
            setFile(candidate);
            setFailed(false);
            return false;
          }}
          onChange={({ fileList }) => setFile(fileList[0]?.originFileObj ?? null)}
          onRemove={() => setFile(null)}
        >
          <Button icon={<UploadOutlined />} aria-label={t('importUsersFile')} disabled={pending}>
            {t('importUsersFile')}
          </Button>
        </Upload>
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        {t('importUsersHint')}
        <Button
          type="link"
          icon={<DownloadOutlined />}
          disabled={pending}
          onClick={downloadUserImportTemplate}
          style={{ flexShrink: 0, paddingInlineEnd: 0 }}
        >
          {t('downloadTemplate')}
        </Button>
      </Typography.Paragraph>
    </Modal>
  );
}

function downloadUserImportTemplate(): void {
  const columns: ReadonlyArray<{ readonly label: string; readonly required: boolean }> = [
    { label: '用户名', required: true },
    { label: '显示名称', required: true },
    { label: '邮箱', required: false },
    { label: '临时密码', required: true },
    { label: '选择角色', required: true },
    { label: '选择团队', required: true },
    { label: '首次登录要求修改密码', required: false },
  ];
  const example = [
    'zhangsan',
    '张三',
    'zhangsan@example.com',
    'TempPass123456',
    'role-admin;role-viewer',
    'team-a',
    '是',
  ];
  const escapeHtml = (cell: string): string => cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const headerCells = columns
    .map((column) =>
      column.required
        ? `<th style="color:#ff0000;border:1px solid #000000;padding:4px 8px;">${escapeHtml(`*${column.label}`)}</th>`
        : `<th style="border:1px solid #000000;padding:4px 8px;">${escapeHtml(column.label)}</th>`,
    )
    .join('');
  const exampleCells = example
    .map((cell) => `<td style="border:1px solid #000000;padding:4px 8px;">${escapeHtml(cell)}</td>`)
    .join('');
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="UTF-8" /><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;"><tr>${headerCells}</tr><tr>${exampleCells}</tr></table></body></html>`;
  const blob = new Blob([`﻿${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '用户导入模板.xls';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function splitIds(cell: string): string[] {
  return cell
    .split(/[;；，,、\s|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseUserImportTable(text: string): { readonly users: readonly Record<string, unknown>[] } {
  const content = text.replace(/^\uFEFF/, '');
  if (/<table[\s>]/i.test(content)) {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const rows = [...doc.querySelectorAll('table tr')].map((row) =>
      [...row.querySelectorAll('th, td')].map((cell) => cell.textContent?.trim() ?? ''),
    );
    return buildUserImportUsers(rows.filter((row) => row.some((cell) => cell !== '')));
  }
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (quoted) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      current.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') i += 1;
      current.push(field);
      field = '';
      if (current.some((cell) => cell.trim() !== '')) rows.push(current);
      current = [];
    } else field += char;
  }
  current.push(field);
  if (current.some((cell) => cell.trim() !== '')) rows.push(current);
  return buildUserImportUsers(rows);
}

function buildUserImportUsers(rows: readonly string[][]): { readonly users: readonly Record<string, unknown>[] } {
  if (rows.length < 2) throw new Error('Empty user import table.');
  const [headerRow] = rows;
  if (!headerRow) throw new Error('Empty user import table.');
  const header = headerRow.map((cell) => cell.trim().replace(/^[*＊]+\s*/, ''));
  const indexOf = (...names: readonly string[]): number => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const usernameIdx = indexOf('用户名', 'username');
  const displayNameIdx = indexOf('显示名称', 'displayName');
  const emailIdx = indexOf('邮箱', 'email');
  const passwordIdx = indexOf('临时密码', 'temporaryPassword');
  const rolesIdx = indexOf('选择角色', '角色ID', '角色', 'roleIds', 'roles');
  const teamsIdx = indexOf('选择团队', '团队ID', '团队', 'teamIds', 'teams');
  const requireChangeIdx = indexOf('首次登录要求修改密码', 'requirePasswordChange');
  if (usernameIdx < 0 || displayNameIdx < 0 || passwordIdx < 0 || rolesIdx < 0 || teamsIdx < 0)
    throw new Error('Invalid user import header.');
  return {
    users: rows.slice(1).map((cells, rowIndex) => {
      const at = (index: number): string => (cells[index] ?? '').trim();
      const requireText = requireChangeIdx >= 0 ? at(requireChangeIdx).trim().toLowerCase() : '';
      return {
        externalRowId: `row-${rowIndex + 2}`,
        username: at(usernameIdx),
        displayName: at(displayNameIdx),
        email: emailIdx >= 0 ? at(emailIdx) || null : null,
        temporaryPassword: at(passwordIdx),
        roleIds: splitIds(at(rolesIdx)),
        teamIds: splitIds(at(teamsIdx)),
        requirePasswordChange: ['', '是', 'yes', 'true', '1', 'y'].includes(requireText),
      };
    }),
  };
}

function normalizeUserImport(value: unknown): JsonObject {
  const users = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { readonly users?: unknown }).users)
      ? (value as { readonly users: unknown[] }).users
      : null;
  if (!users || users.length === 0 || users.length > 1000) throw new Error('Invalid user import row count.');
  for (const row of users) {
    if (!row || typeof row !== 'object') throw new Error('Invalid user import row.');
    const item = row as Record<string, unknown>;
    for (const key of ['externalRowId', 'username', 'displayName', 'temporaryPassword']) {
      if (typeof item[key] !== 'string' || item[key].trim() === '') throw new Error(`Missing ${key}.`);
    }
    if ((item.temporaryPassword as string).length < 12) throw new Error('Temporary password is too short.');
    for (const key of ['teamIds', 'roleIds']) {
      if (
        item[key] !== undefined &&
        (!Array.isArray(item[key]) || item[key].some((entry) => typeof entry !== 'string'))
      )
        throw new Error(`Invalid ${key}.`);
      if (!Array.isArray(item[key]) || item[key].length === 0) throw new Error(`Missing ${key}.`);
    }
    if (item.requirePasswordChange !== undefined && typeof item.requirePasswordChange !== 'boolean')
      throw new Error('Invalid requirePasswordChange.');
  }
  return { users } as JsonObject;
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

function TeamsSection({
  client,
  resources,
  modelResources,
  canWrite,
  loading,
  onRefresh,
  onChanged,
  onError,
}: SectionProps & { readonly modelResources: ModelResources }) {
  // 2026-09-30 LiXiang2019 团队列表筛选：点查询后才应用条件
  const [filterForm] = Form.useForm<NameListFilters>();
  const [filters, setFilters] = useState<NameListFilters>({});
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null);
  const [employeesTeamId, setEmployeesTeamId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ readonly id?: string } | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const [teamOwners, setTeamOwners] = useState<Record<string, string>>(() => loadTeamOwners());
  const rows = useMemo(() => {
    const normalized = (filters.query ?? '').trim().toLowerCase();
    return normalized
      ? resources.teams.filter((team) => `${team.name} ${team.id}`.toLowerCase().includes(normalized))
      : resources.teams;
  }, [resources.teams, filters]);
  const detailTeam = detailTeamId ? (resources.teams.find((team) => team.id === detailTeamId) ?? null) : null;
  const columns: TableProps<Team>['columns'] = [
    {
      title: t('team'),
      key: 'team',
      render: (_, team) => (
        <Space size={8}>
          <NameCell name={team.name} detail={team.id} />
          {team.builtIn ? <Tag color="blue">{t('builtIn')}</Tag> : null}
        </Space>
      ),
    },
    {
      title: t('teamOwner'),
      key: 'owner',
      width: 120,
      render: (_, team) => {
        const owner = (teamOwners[team.id] ?? '').trim();
        return owner ? owner : <UnknownText>{t('teamOwnerUnset')}</UnknownText>;
      },
    },
    { title: rc.memberCount, dataIndex: 'memberCount', key: 'memberCount', width: 100 },
    {
      title: t('teamEmployees'),
      key: 'employees',
      width: 140,
      render: (_, team) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setEmployeesTeamId(team.id)}>
          {teamEmployeesCount(team.id, resources)}
        </Button>
      ),
    },
    {
      title: t('effectiveResources'),
      key: 'access',
      render: (_, team) => (
        <ResourceAccessTags
          modelsAvailable={modelResources.available}
          skillsAvailable={modelResources.skillsAvailable}
          rows={buildAccessRows({
            resources,
            modelResources,
            subjects: [{ type: 'team', id: team.id, label: team.name }],
            accountActive: team.enabled,
          })}
        />
      ),
    },
    { title: t('status'), key: 'status', render: (_, team) => <EnabledBadge enabled={team.enabled} /> },
    {
      title: t('actions'),
      key: 'actions',
      align: 'right',
      render: (_, team) => (
        <Space size={0} wrap>
          <Button type="link" size="small" disabled={pending} onClick={() => setDetailTeamId(team.id)}>
            {rc.view}
          </Button>
          {canWrite ? (
            <>
              <Button type="link" size="small" disabled={pending} onClick={() => setEditor({ id: team.id })}>
                {t('edit')}
              </Button>
              <Button
                type="link"
                size="small"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    await client.updateTeam(team.id, { enabled: !team.enabled });
                  })
                }
              >
                {team.enabled ? t('disable') : t('enable')}
              </Button>
              <Popconfirm
                title={t('deleteTeamTitle')}
                description={t('deleteResourceDescription')}
                okText={t('delete')}
                cancelText={t('cancel')}
                okButtonProps={{ danger: true }}
                disabled={team.builtIn}
                onConfirm={() =>
                  void run(async () => {
                    await client.deleteTeam(team.id);
                  })
                }
              >
                <Button type="link" size="small" danger disabled={pending || team.builtIn}>
                  {t('delete')}
                </Button>
              </Popconfirm>
            </>
          ) : null}
        </Space>
      ),
    },
  ];
  return (
    <div>
      <SectionHeader
        title={rc.pageTeams}
        description={rc.pageTeamsDescription}
        extra={
          <>
            {canWrite ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({})}>
                {t('addTeam')}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      {/* 2026-09-30 LiXiang2019 团队列表筛选条件 + 查询/重置按钮组 */}
      <Form form={filterForm} layout="inline" style={{ gap: 12, marginBottom: 16 }}>
        <Form.Item name="query" style={{ marginInlineEnd: 0 }}>
          <Input
            aria-label={rc.searchTeamPlaceholder}
            placeholder={rc.searchTeamPlaceholder}
            allowClear
            style={{ width: 240 }}
          />
        </Form.Item>
        <Form.Item style={{ marginInlineEnd: 0 }}>
          <ListQueryActions
            form={filterForm}
            search={{ run: (values) => setFilters(values) }}
            onReset={() => setFilters({})}
          />
        </Form.Item>
      </Form>
      {/* 2026-09-30 LiXiang2019 加载态用表格 loading，空数据用 Empty（对齐账号关联） */}
      <Table<Team>
        rowKey="id"
        columns={columns}
        dataSource={[...rows]}
        pagination={PAGINATION}
        loading={loading}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('teamsEmpty')}>
              <Typography.Text type="secondary">{t('teamsEmptyHint')}</Typography.Text>
            </Empty>
          ),
        }}
      />
      {detailTeam ? (
        <TeamDetailDrawer
          team={detailTeam}
          resources={resources}
          modelResources={modelResources}
          canWrite={canWrite}
          open
          onClose={() => setDetailTeamId(null)}
          onEdit={() => {
            setDetailTeamId(null);
            setEditor({ id: detailTeam.id });
          }}
        />
      ) : null}
      {canWrite && editor ? (
        <TeamEditorModal
          client={client}
          team={editor.id ? resources.teams.find((team) => team.id === editor.id) : undefined}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onChanged={onChanged}
          onError={onError}
          onOwnerChange={(teamId, ownerId) => {
            setTeamOwners((current) => {
              const next = { ...current };
              if (ownerId) next[teamId] = ownerId;
              else delete next[teamId];
              saveTeamOwners(next);
              return next;
            });
          }}
          initialOwnerId={editor.id ? teamOwners[editor.id] : undefined}
        />
      ) : null}
      {employeesTeamId ? (
        <TeamEmployeesModal
          team={resources.teams.find((team) => team.id === employeesTeamId) ?? null}
          resources={resources}
          open
          onClose={() => setEmployeesTeamId(null)}
        />
      ) : null}
    </div>
  );
}

function TeamDetailDrawer({
  team,
  resources,
  modelResources,
  canWrite,
  open,
  onClose,
  onEdit,
}: {
  readonly team: Team;
  readonly resources: AdminResources;
  readonly modelResources: ModelResources;
  readonly canWrite: boolean;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onEdit: () => void;
}) {
  const members = resources.users.filter((user) => (user.teamIds ?? []).includes(team.id));
  const roleNames = new Map(resources.roles.map((role) => [role.id, role.name]));
  const accessRows = buildAccessRows({
    resources,
    modelResources,
    subjects: [{ type: 'team', id: team.id, label: team.name }],
    accountActive: team.enabled,
  });
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={700}
      title={
        <Space size={8}>
          <span>{team.name}</span>
          <EnabledBadge enabled={team.enabled} />
        </Space>
      }
      extra={
        canWrite ? (
          <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
            {t('edit')}
          </Button>
        ) : null
      }
    >
      <Tabs
        items={[
          {
            key: 'members',
            label: `${rc.teamMembersTab}（${team.memberCount}）`,
            children:
              members.length === 0 ? (
                <Empty description={<UnknownText>{rc.notCollected}</UnknownText>} />
              ) : (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={PAGINATION}
                  dataSource={[...members]}
                  columns={[
                    {
                      title: t('user'),
                      key: 'user',
                      render: (_, user) => <NameCell name={user.displayName} detail={user.username} />,
                    },
                    {
                      title: rc.accountRoles,
                      key: 'roles',
                      render: (_, user) =>
                        (user.roleIds ?? []).length > 0 ? (
                          <Space size={4} wrap>
                            {(user.roleIds ?? []).map((id) => (
                              <Tag key={id}>{roleNames.get(id) ?? id}</Tag>
                            ))}
                          </Space>
                        ) : (
                          <UnknownText>{rc.noRoles}</UnknownText>
                        ),
                    },
                    {
                      title: t('status'),
                      key: 'status',
                      render: (_, user) => <EnabledBadge enabled={user.status === 'active'} />,
                    },
                  ]}
                />
              ),
          },
          {
            key: 'access',
            label: rc.teamAccessTab,
            children: (
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                <Typography.Text type="secondary">{rc.teamAccessNote}</Typography.Text>
                <AccessTable
                  rows={accessRows}
                  modelsAvailable={modelResources.available}
                  skillsAvailable={modelResources.skillsAvailable}
                />
              </Space>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

function loadTeamOwners(): Record<string, string> {
  try {
    const raw = localStorage.getItem('admin-team-owners');
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

function saveTeamOwners(owners: Record<string, string>): void {
  try {
    localStorage.setItem('admin-team-owners', JSON.stringify(owners));
  } catch {
    // 忽略本地存储失败，不阻塞主流程
  }
}

function teamEmployeesCount(teamId: string, resources: AdminResources): number {
  return resources.users.filter((user) => (user.teamIds ?? []).includes(teamId)).length;
}

function TeamEmployeesModal({
  team,
  resources,
  open,
  onClose,
}: {
  readonly team: Team | null;
  readonly resources: AdminResources;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const members = team ? resources.users.filter((user) => (user.teamIds ?? []).includes(team.id)) : [];
  return (
    <Modal
      open={open}
      width={600}
      title={team ? `${t('teamEmployeesTitle')}：${team.name}` : t('teamEmployeesTitle')}
      cancelText={t('close')}
      okButtonProps={{ style: { display: 'none' } }}
      onCancel={onClose}
      onOk={onClose}
    >
      <Typography.Paragraph type="secondary">{t('teamEmployeesEmptyHint')}</Typography.Paragraph>
      {members.length === 0 ? (
        <Empty description={t('teamEmployeesEmpty')} />
      ) : (
        <Table<PlatformUser>
          rowKey="id"
          size="small"
          pagination={PAGINATION}
          dataSource={[...members]}
          columns={[
            {
              title: t('displayName'),
              key: 'name',
              render: (_, user) => <NameCell name={user.displayName} detail={user.username} />,
            },
            {
              title: t('status'),
              key: 'status',
              width: 100,
              render: (_, user) => <EnabledBadge enabled={user.status === 'active'} />,
            },
          ]}
        />
      )}
    </Modal>
  );
}

function TeamEditorModal({
  client,
  team,
  open,
  onOpenChange,
  onChanged,
  onError,
  onOwnerChange,
  initialOwnerId,
}: {
  readonly client: AdminConsoleClient;
  readonly team: Team | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onOwnerChange: (teamId: string, ownerId: string | undefined) => void;
  readonly initialOwnerId: string | undefined;
}) {
  const editing = Boolean(team);
  const [form] = Form.useForm();
  const [pending, setPending] = useState(false);
  const submit = async (values: { name: string; description?: string; enabled?: boolean; ownerId?: string }) => {
    setPending(true);
    try {
      let teamId = team?.id ?? '';
      if (team)
        await client.updateTeam(team.id, {
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
          enabled: values.enabled !== false,
        });
      else {
        // The team id is server-generated from the name and anchors the
        // immutable materialized path.
        const created = await client.createTeam({
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
        });
        teamId = created.id;
      }
      onOwnerChange(teamId, values.ownerId || undefined);
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t('changesSaved'));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      width={600}
      title={t(editing ? 'teamEditTitle' : 'teamEditorTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t('teamEditorDescription')}</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          id: team?.id ?? '',
          name: team?.name ?? '',
          description: team?.description ?? '',
          enabled: team?.enabled !== false,
          ownerId: initialOwnerId ?? undefined,
        }}
        onFinish={submit}
      >
        <Form.Item
          name="name"
          label={t('teamName')}
          rules={[{ required: true, whitespace: true, message: t('nameRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item name="ownerId" label={t('teamOwner')}>
          <Input autoComplete="off" placeholder={t('teamOwnerPlaceholder')} disabled={pending} />
        </Form.Item>
        <Form.Item name="description" label={t('description')}>
          <Input.TextArea rows={2} placeholder={t('descriptionPlaceholder')} disabled={pending} />
        </Form.Item>
        {editing ? (
          <Form.Item name="enabled" label={t('status')} valuePropName="checked">
            <Switch disabled={pending} checkedChildren={t('enabled')} unCheckedChildren={t('disabled')} />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

function RolesSection({
  client,
  resources,
  modelResources,
  canWrite,
  loading,
  onRefresh,
  onChanged,
  onError,
}: SectionProps & { readonly modelResources: ModelResources }) {
  // 2026-09-30 LiXiang2019 角色列表筛选：点查询后才应用条件
  const [filterForm] = Form.useForm<NameListFilters>();
  const [filters, setFilters] = useState<NameListFilters>({});
  const [detailRoleId, setDetailRoleId] = useState<string | null>(null);
  const [membersRoleId, setMembersRoleId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ readonly id?: string } | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const rows = useMemo(() => {
    const normalized = (filters.query ?? '').trim().toLowerCase();
    return normalized
      ? resources.roles.filter((role) => `${role.name} ${role.id}`.toLowerCase().includes(normalized))
      : resources.roles;
  }, [resources.roles, filters]);
  const detailRole = detailRoleId ? (resources.roles.find((role) => role.id === detailRoleId) ?? null) : null;
  const memberCount = (roleId: string) =>
    resources.users.filter((user) => (user.roleIds ?? []).includes(roleId)).length;
  const columns: TableProps<Role>['columns'] = [
    {
      title: t('role'),
      key: 'role',
      render: (_, role) => (
        <Space size={8}>
          <NameCell name={role.name} detail={role.id} />
          {role.builtIn ? <Tag color="blue">{t('builtIn')}</Tag> : null}
        </Space>
      ),
    },
    {
      title: rc.permissionCount,
      key: 'permissions',
      width: 100,
      render: (_, role) => role.permissions.length,
    },
    {
      title: rc.roleMemberCount,
      key: 'members',
      width: 100,
      render: (_, role) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setMembersRoleId(role.id)}>
          {memberCount(role.id)}
        </Button>
      ),
    },
    {
      title: t('effectiveResources'),
      key: 'access',
      render: (_, role) => (
        <ResourceAccessTags
          modelsAvailable={modelResources.available}
          skillsAvailable={modelResources.skillsAvailable}
          rows={buildAccessRows({
            resources,
            modelResources,
            subjects: [{ type: 'role', id: role.id, label: role.name }],
            accountActive: role.enabled,
          })}
        />
      ),
    },
    { title: t('status'), key: 'status', render: (_, role) => <EnabledBadge enabled={role.enabled} /> },
    {
      title: t('actions'),
      key: 'actions',
      align: 'right',
      render: (_, role) => (
        <Space size={0} wrap>
          <Button type="link" size="small" disabled={pending} onClick={() => setDetailRoleId(role.id)}>
            {rc.view}
          </Button>
          {canWrite ? (
            <>
              <Button type="link" size="small" disabled={pending} onClick={() => setEditor({ id: role.id })}>
                {t('edit')}
              </Button>
              <Button
                type="link"
                size="small"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    await client.updateRole(role.id, { enabled: !role.enabled });
                  })
                }
              >
                {role.enabled ? t('disable') : t('enable')}
              </Button>
              <Popconfirm
                title={t('deleteRoleTitle')}
                description={t('deleteResourceDescription')}
                okText={t('delete')}
                cancelText={t('cancel')}
                okButtonProps={{ danger: true }}
                disabled={role.builtIn}
                onConfirm={() =>
                  void run(async () => {
                    await client.deleteRole(role.id);
                  })
                }
              >
                <Button type="link" size="small" danger disabled={pending || role.builtIn}>
                  {t('delete')}
                </Button>
              </Popconfirm>
            </>
          ) : null}
        </Space>
      ),
    },
  ];
  return (
    <div>
      <SectionHeader
        title={rc.pageRoles}
        description={rc.pageRolesDescription}
        extra={
          <>
            {canWrite ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({})}>
                {t('addRole')}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      {/* 2026-09-30 LiXiang2019 角色列表筛选条件 + 查询/重置按钮组 */}
      <Form form={filterForm} layout="inline" style={{ gap: 12, marginBottom: 16 }}>
        <Form.Item name="query" style={{ marginInlineEnd: 0 }}>
          <Input
            aria-label={rc.searchRolePlaceholder}
            placeholder={rc.searchRolePlaceholder}
            allowClear
            style={{ width: 240 }}
          />
        </Form.Item>
        <Form.Item style={{ marginInlineEnd: 0 }}>
          <ListQueryActions
            form={filterForm}
            search={{ run: (values) => setFilters(values) }}
            onReset={() => setFilters({})}
          />
        </Form.Item>
      </Form>
      {/* 2026-09-30 LiXiang2019 加载态用表格 loading，空数据用 Empty（对齐账号关联） */}
      <Table<Role>
        rowKey="id"
        columns={columns}
        dataSource={[...rows]}
        pagination={PAGINATION}
        loading={loading}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('rolesEmpty')}>
              <Typography.Text type="secondary">{t('rolesEmptyHint')}</Typography.Text>
            </Empty>
          ),
        }}
      />
      {membersRoleId ? (
        <RoleMembersModal
          role={resources.roles.find((role) => role.id === membersRoleId) ?? null}
          resources={resources}
          open
          onClose={() => setMembersRoleId(null)}
        />
      ) : null}
      {detailRole ? (
        <RoleDetailDrawer
          role={detailRole}
          resources={resources}
          canWrite={canWrite}
          open
          onClose={() => setDetailRoleId(null)}
          onEdit={() => {
            setDetailRoleId(null);
            setEditor({ id: detailRole.id });
          }}
        />
      ) : null}
      {canWrite && editor ? (
        <RoleEditorModal
          client={client}
          role={editor.id ? resources.roles.find((role) => role.id === editor.id) : undefined}
          permissions={resources.permissions}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

function RoleMembersModal({
  role,
  resources,
  open,
  onClose,
}: {
  readonly role: Role | null;
  readonly resources: AdminResources;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const members = role ? resources.users.filter((user) => (user.roleIds ?? []).includes(role.id)) : [];
  return (
    <Modal
      open={open}
      width={600}
      title={role ? `${rc.roleSubjectsTab}：${role.name}` : rc.roleSubjectsTab}
      cancelText={t('close')}
      okButtonProps={{ style: { display: 'none' } }}
      onCancel={onClose}
      onOk={onClose}
    >
      {members.length === 0 ? (
        <Empty description={rc.roleSubjectsEmpty} />
      ) : (
        <Table<PlatformUser>
          rowKey="id"
          size="small"
          pagination={PAGINATION}
          dataSource={[...members]}
          columns={[
            {
              title: t('user'),
              key: 'user',
              render: (_, user) => <NameCell name={user.displayName} detail={user.username} />,
            },
            {
              title: t('status'),
              key: 'status',
              width: 100,
              render: (_, user) => <EnabledBadge enabled={user.status === 'active'} />,
            },
          ]}
        />
      )}
    </Modal>
  );
}

function RoleDetailDrawer({
  role,
  resources,
  canWrite,
  open,
  onClose,
  onEdit,
}: {
  readonly role: Role;
  readonly resources: AdminResources;
  readonly canWrite: boolean;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onEdit: () => void;
}) {
  const permissionDescriptions = new Map(
    resources.permissions.map((permission) => [permission.id, permission.description]),
  );
  const subjects = resources.users.filter((user) => (user.roleIds ?? []).includes(role.id));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={800}
      title={
        <Space size={8}>
          <span>{role.name}</span>
          {role.builtIn ? <Tag color="blue">{t('builtIn')}</Tag> : null}
          <EnabledBadge enabled={role.enabled} />
        </Space>
      }
      extra={
        canWrite ? (
          <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
            {t('edit')}
          </Button>
        ) : null
      }
    >
      <Tabs
        items={[
          {
            key: 'permissions',
            label: `${rc.rolePermissionsTab}（${role.permissions.length}）`,
            children:
              role.permissions.length === 0 ? (
                <Empty description={<UnknownText>{rc.notCollected}</UnknownText>} />
              ) : (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={PAGINATION}
                  dataSource={role.permissions.map((id) => ({ id, description: permissionDescriptions.get(id) }))}
                  columns={[
                    { title: t('permissions'), dataIndex: 'id', key: 'id' },
                    {
                      title: t('description'),
                      key: 'description',
                      render: (_, item) =>
                        item.description ? (
                          <Typography.Text type="secondary">{item.description}</Typography.Text>
                        ) : (
                          <UnknownText />
                        ),
                    },
                  ]}
                />
              ),
          },
          {
            key: 'subjects',
            label: `${rc.roleSubjectsTab}（${subjects.length}）`,
            children:
              subjects.length === 0 ? (
                <Empty description={rc.roleSubjectsEmpty} />
              ) : (
                <Table<PlatformUser>
                  rowKey="id"
                  size="small"
                  pagination={PAGINATION}
                  dataSource={[...subjects]}
                  columns={[
                    {
                      title: t('user'),
                      key: 'user',
                      render: (_, user) => <NameCell name={user.displayName} detail={user.username} />,
                    },
                    {
                      title: t('status'),
                      key: 'status',
                      render: (_, user) => <EnabledBadge enabled={user.status === 'active'} />,
                    },
                  ]}
                />
              ),
          },
        ]}
      />
    </Drawer>
  );
}

function RoleEditorModal({
  client,
  role,
  permissions,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly role: Role | undefined;
  readonly permissions: readonly Permission[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(role);
  const [form] = Form.useForm();
  const [pending, setPending] = useState(false);
  const submit = async (values: { name: string; description?: string; permissions?: string[]; enabled?: boolean }) => {
    setPending(true);
    try {
      if (role)
        await client.updateRole(role.id, {
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
          enabled: values.enabled !== false,
          permissions: values.permissions ?? [],
        });
      // The role id is server-generated from the name.
      else
        await client.createRole({
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
          permissions: values.permissions ?? [],
        });
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t('changesSaved'));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      width={1000}
      title={t(editing ? 'roleEditTitle' : 'roleEditorTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t('roleEditorDescription')}</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          id: role?.id ?? '',
          name: role?.name ?? '',
          description: role?.description ?? '',
          permissions: [...(role?.permissions ?? [])],
          enabled: role?.enabled !== false,
        }}
        onFinish={submit}
      >
        <Form.Item
          name="name"
          label={t('roleName')}
          rules={[{ required: true, whitespace: true, message: t('nameRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item name="description" label={t('description')}>
          <Input.TextArea rows={2} placeholder={t('descriptionPlaceholder')} disabled={pending} />
        </Form.Item>
        <Form.Item
          name="permissions"
          label={t('permissions')}
          valuePropName="checkedKeys"
          trigger="onCheck"
          getValueFromEvent={(checked: readonly string[] | { readonly checked: readonly string[] }) =>
            // Array.isArray cannot narrow a readonly array, so cast the
            // object branch instead.
            (Array.isArray(checked)
              ? checked
              : (checked as { readonly checked: readonly string[] }).checked) as string[]
          }
        >
          <Tree
            checkable
            disabled={pending}
            treeData={permissions.map((permission) => ({
              key: permission.id,
              title: permission.description ? `${permission.id} — ${permission.description}` : permission.id,
            }))}
          />
        </Form.Item>
        {editing ? (
          <Form.Item name="enabled" label={t('status')} valuePropName="checked">
            <Switch disabled={pending} checkedChildren={t('enabled')} unCheckedChildren={t('disabled')} />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

type SkillEmployeeRef = {
  readonly key: string;
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
};

type SkillEmployeesState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly bySkill: ReadonlyMap<string, readonly SkillEmployeeRef[]>;
      readonly unconfigured: number;
    }
  | { readonly status: 'unavailable'; readonly forbidden: boolean };

// One portal read backs the list column, the detail tab and the delete dialog.
// The portal authorises the call and returns every employee, so the console
// groups them by Skill locally. A failed or forbidden read is never rendered as
// "nobody uses it".
function useSkillEmployees(portal: PortalClient): SkillEmployeesState {
  const [state, setState] = useState<SkillEmployeesState>({ status: 'loading' });
  const ticket = useRef(0);
  useEffect(() => {
    ticket.current += 1;
    const current = ticket.current;
    setState({ status: 'loading' });
    portal
      .listEmployees()
      .then((employees) => {
        if (current !== ticket.current) return;
        const bySkill = new Map<string, SkillEmployeeRef[]>();
        let unconfigured = 0;
        for (const employee of employees) {
          // null/undefined = no explicit skill policy yet; [] = an explicit
          // "no skills". Only a listed Skill counts as enabled.
          if (employee.skills === null || employee.skills === undefined) {
            unconfigured += 1;
            continue;
          }
          for (const skill of employee.skills) {
            const refs = bySkill.get(skill.id) ?? [];
            refs.push({
              key: employee.name,
              name: employee.name,
              displayName: employee.displayName,
              version: skill.version ?? '',
            });
            bySkill.set(skill.id, refs);
          }
        }
        setState({ status: 'ready', bySkill, unconfigured });
      })
      .catch((error: unknown) => {
        if (current !== ticket.current) return;
        setState({ status: 'unavailable', forbidden: error instanceof PortalError && error.status === 403 });
      });
    return () => {
      // A later load (or unmount) invalidates this response.
      ticket.current += 1;
    };
  }, [portal]);
  return state;
}

// Presentational: one Skill's employee bindings for the shared read state.
function SkillEmployees({
  state,
  skillId,
  variant,
}: {
  readonly state: SkillEmployeesState;
  readonly skillId: string;
  readonly variant: 'compact' | 'table';
}) {
  if (state.status === 'loading') return <Spin size="small" />;
  if (state.status === 'unavailable') {
    return (
      <Alert
        type="warning"
        showIcon
        title={state.forbidden ? rc.skillEmployeesForbidden : rc.skillEmployeesUnavailable}
      />
    );
  }
  const refs = state.bySkill.get(skillId) ?? [];
  if (refs.length === 0) {
    return <Typography.Text type="secondary">{rc.skillEmployeesNone}</Typography.Text>;
  }
  const count = (
    <Typography.Text type="secondary">{rc.skillEmployeesCount.replace('{count}', String(refs.length))}</Typography.Text>
  );
  const unconfigured =
    state.unconfigured > 0 ? (
      <Typography.Text type="secondary">
        {rc.skillEmployeesUnconfigured.replace('{count}', String(state.unconfigured))}
      </Typography.Text>
    ) : null;
  if (variant === 'table') {
    return (
      <Space orientation="vertical" size={8} style={{ width: '100%' }}>
        {count}
        <Table<SkillEmployeeRef>
          rowKey="key"
          size="small"
          pagination={PAGINATION}
          dataSource={[...refs]}
          columns={[
            { title: rc.skillEmployeeColumnName, key: 'name', render: (_, ref) => ref.displayName || ref.name },
            {
              title: rc.skillEmployeeColumnId,
              key: 'id',
              render: (_, ref) => <Typography.Text type="secondary">{ref.name}</Typography.Text>,
            },
            { title: rc.skillEmployeeColumnVersion, key: 'version', render: (_, ref) => ref.version || '—' },
          ]}
        />
        {unconfigured}
      </Space>
    );
  }
  return (
    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
      {count}
      <div style={{ maxHeight: 160, overflowY: 'auto' }}>
        <ul style={{ margin: 0, paddingInlineStart: 20 }}>
          {refs.map((ref) => (
            <li key={ref.key}>
              {ref.displayName || ref.name}
              {ref.version ? ` · ${ref.version}` : ''}
            </li>
          ))}
        </ul>
      </div>
      {unconfigured}
    </Space>
  );
}

function SkillsSection({
  client,
  portal,
  resources,
  canWrite,
  canAssign,
  loading,
  onRefresh,
  onChanged,
  onError,
}: SectionProps & { readonly canAssign: boolean; readonly portal: PortalClient }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [detailSkillId, setDetailSkillId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ readonly id?: string } | null>(null);
  const [grant, setGrant] = useState<{ readonly skillId?: string } | null>(null);
  const [forceSkill, setForceSkill] = useState<AdminSkill | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const employeeState = useSkillEmployees(portal);
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return resources.skills.filter((skill) => {
      if (statusFilter === 'enabled' && !skill.enabled) return false;
      if (statusFilter === 'disabled' && skill.enabled) return false;
      if (!normalized) return true;
      return `${skill.name} ${skill.description ?? ''} ${skill.id}`.toLowerCase().includes(normalized);
    });
  }, [resources.skills, query, statusFilter]);
  const detailSkill = detailSkillId ? (resources.skills.find((skill) => skill.id === detailSkillId) ?? null) : null;
  const assignmentsFor = (skillId: string) => resources.assignments.filter((item) => item.skillId === skillId);
  const latestPublished = (skill: AdminSkill) =>
    skill.versions.find((version) => version.state === 'published')?.version ?? null;
  const forceRefs = forceSkill ? assignmentsFor(forceSkill.id) : [];
  // The server refuses to delete a Skill that is still referenced; surface that
  // as an explicit forced delete instead of the generic failure notice.
  const remove = (skill: AdminSkill) =>
    run(async () => {
      try {
        await client.deleteSkill(skill.id);
      } catch (error) {
        if (error instanceof AepProblem && error.code === 'SKILL_IN_USE') {
          setForceSkill(skill);
          return;
        }
        throw error;
      }
    });
  const forceRemove = (skill: AdminSkill) =>
    run(async () => {
      await client.deleteSkill(skill.id, true);
      setForceSkill(null);
    });
  const columns: TableProps<AdminSkill>['columns'] = [
    {
      title: t('skill'),
      key: 'skill',
      render: (_, skill) => <NameCell name={skill.name} detail={skill.description || skill.id} />,
    },
    {
      title: rc.skillPurpose,
      key: 'purpose',
      render: (_, skill) =>
        skill.description ? <Typography.Text type="secondary">{skill.description}</Typography.Text> : <UnknownText />,
    },
    {
      title: t('versions'),
      key: 'versions',
      width: 120,
      render: (_, skill) => {
        const published = latestPublished(skill);
        return published ? <Tag color="green">{published}</Tag> : <UnknownText>—</UnknownText>;
      },
    },
    { title: t('status'), key: 'status', render: (_, skill) => <EnabledBadge enabled={skill.enabled} /> },
    {
      title: rc.skillEmployees,
      key: 'employees',
      render: (_, skill) => {
        if (employeeState.status === 'loading') return <Spin size="small" />;
        if (employeeState.status === 'unavailable') {
          return <UnknownText>{rc.skillEmployeesUnknown}</UnknownText>;
        }
        const count = (employeeState.bySkill.get(skill.id) ?? []).length;
        return count === 0 ? (
          <Typography.Text type="secondary">{rc.skillEmployeesCellNone}</Typography.Text>
        ) : (
          <Typography.Text>{rc.skillEmployeesCellCount.replace('{count}', String(count))}</Typography.Text>
        );
      },
    },
    {
      title: t('actions'),
      key: 'actions',
      align: 'right',
      render: (_, skill) => {
        return (
          <Space size={0} wrap>
            <Button type="link" size="small" disabled={pending} onClick={() => setDetailSkillId(skill.id)}>
              {rc.view}
            </Button>
            {canWrite ? (
              <>
                <Button type="link" size="small" disabled={pending} onClick={() => setEditor({ id: skill.id })}>
                  {t('edit')}
                </Button>
                <Button
                  type="link"
                  size="small"
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      await client.updateSkill(skill.id, { enabled: !skill.enabled });
                    })
                  }
                >
                  {skill.enabled ? t('disable') : t('enable')}
                </Button>
                <Popconfirm
                  title={rc.deleteSkillConfirm}
                  description={rc.deleteSkillImpact}
                  okText={t('delete')}
                  cancelText={t('cancel')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void remove(skill)}
                >
                  <Button type="link" size="small" danger disabled={pending}>
                    {t('delete')}
                  </Button>
                </Popconfirm>
              </>
            ) : null}
          </Space>
        );
      },
    },
  ];
  return (
    <div>
      <SectionHeader
        title={rc.pageSkills}
        description={rc.pageSkillsDescription}
        extra={
          <>
            {canAssign ? (
              <Button icon={<KeyOutlined />} onClick={() => setGrant({})}>
                {t('grantSkill')}
              </Button>
            ) : null}
            {canWrite ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({})}>
                {t('addSkill')}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      <Space size={8} wrap style={{ marginBottom: 16 }}>
        <Input.Search
          aria-label={rc.searchSkillPlaceholder}
          placeholder={rc.searchSkillPlaceholder}
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: 240 }}
        />
        <Select
          aria-label={rc.allStatus}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: rc.allStatus },
            { value: 'enabled', label: rc.statusEnabled },
            { value: 'disabled', label: rc.statusDisabled },
          ]}
          style={{ width: 140 }}
        />
      </Space>
      {rows.length === 0 ? (
        <Empty description={t('skillsEmpty')}>
          <Typography.Text type="secondary">{t('skillsEmptyHint')}</Typography.Text>
        </Empty>
      ) : (
        <Table<AdminSkill> rowKey="id" columns={columns} dataSource={[...rows]} pagination={PAGINATION} />
      )}
      {detailSkill ? (
        <SkillDetailDrawer
          client={client}
          employees={employeeState}
          skill={detailSkill}
          resources={resources}
          canWrite={canWrite}
          canAssign={canAssign}
          open
          onClose={() => setDetailSkillId(null)}
          onChanged={onChanged}
          onError={onError}
          onEdit={() => {
            setDetailSkillId(null);
            setEditor({ id: detailSkill.id });
          }}
          onGrant={() => {
            setDetailSkillId(null);
            setGrant({ skillId: detailSkill.id });
          }}
        />
      ) : null}
      {canWrite && editor ? (
        <SkillEditorModal
          client={client}
          skill={editor.id ? resources.skills.find((skill) => skill.id === editor.id) : undefined}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
      {canAssign && grant ? (
        <SkillGrantModal
          client={client}
          users={resources.users}
          roles={resources.roles}
          teams={resources.teams}
          skills={resources.skills}
          existingAssignments={resources.assignments}
          presetSkillId={grant.skillId}
          open
          onOpenChange={(open) => {
            if (!open) setGrant(null);
          }}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
      <Modal
        open={forceSkill !== null}
        title={rc.skillForceDeleteTitle}
        footer={
          <Space>
            <Button onClick={() => setForceSkill(null)}>{t('cancel')}</Button>
            <Button
              danger
              type="primary"
              loading={pending}
              disabled={forceSkill === null}
              onClick={() => forceSkill && void forceRemove(forceSkill)}
            >
              {rc.skillForceDeleteAction}
            </Button>
          </Space>
        }
        onCancel={() => setForceSkill(null)}
      >
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>{rc.skillForceDeleteNote}</Typography.Text>
          <Typography.Text strong>{rc.skillEmployeesSection}</Typography.Text>
          {forceSkill ? <SkillEmployees state={employeeState} skillId={forceSkill.id} variant="compact" /> : null}
          <Typography.Text strong>{rc.skillForceDeleteGrants}</Typography.Text>
          {forceRefs.length > 0 ? (
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {forceRefs.map((assignment) => (
                  <li key={assignment.id}>
                    <SubjectCell
                      subjectType={assignment.subjectType}
                      subjectId={assignment.subjectId}
                      user={
                        assignment.subjectType === AdminSubjectType.User
                          ? resources.users.find((user) => user.id === assignment.subjectId)
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Typography.Text type="secondary">{rc.skillForceDeleteGrantsNone}</Typography.Text>
          )}
          <Typography.Text type="secondary">{rc.skillForceDeletePlatformNote}</Typography.Text>
        </Space>
      </Modal>
    </div>
  );
}

function SkillDetailDrawer({
  client,
  employees,
  skill,
  resources,
  canWrite,
  canAssign,
  open,
  onClose,
  onChanged,
  onError,
  onEdit,
  onGrant,
}: {
  readonly client: AdminConsoleClient;
  readonly employees: SkillEmployeesState;
  readonly skill: AdminSkill;
  readonly resources: AdminResources;
  readonly canWrite: boolean;
  readonly canAssign: boolean;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
  readonly onEdit: () => void;
  readonly onGrant: () => void;
}) {
  const { pending, run } = useMutationRunner(onChanged, onError);
  const assignments = resources.assignments.filter((item) => item.skillId === skill.id);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={720}
      title={
        <Space size={8}>
          <span>{skill.name}</span>
          <EnabledBadge enabled={skill.enabled} />
        </Space>
      }
      extra={
        canWrite ? (
          <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
            {t('edit')}
          </Button>
        ) : null
      }
    >
      <Tabs
        items={[
          {
            key: 'config',
            label: rc.skillDetailConfig,
            children: (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Descriptions
                  column={1}
                  bordered
                  size="small"
                  items={[
                    { key: 'id', label: t('skillId'), children: skill.id },
                    { key: 'name', label: t('skillName'), children: skill.name },
                    {
                      key: 'description',
                      label: t('description'),
                      children: skill.description ? skill.description : <UnknownText />,
                    },
                    { key: 'status', label: t('status'), children: <EnabledBadge enabled={skill.enabled} /> },
                  ]}
                />
                {canWrite ? (
                  <Space wrap>
                    <Button icon={<EditOutlined />} onClick={onEdit}>
                      {t('edit')}
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          await client.updateSkill(skill.id, { enabled: !skill.enabled });
                        })
                      }
                    >
                      {skill.enabled ? t('disable') : t('enable')}
                    </Button>
                  </Space>
                ) : null}
              </Space>
            ),
          },
          {
            key: 'versions',
            label: `${rc.skillDetailVersions}（${skill.versions.length}）`,
            children: (
              <VersionManager
                client={client}
                skill={skill}
                canWrite={canWrite}
                onChanged={onChanged}
                onError={onError}
              />
            ),
          },
          {
            key: 'access',
            label: canAssign ? `${rc.skillDetailAccess}（${assignments.length}）` : rc.skillDetailAccess,
            children: (
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                {canAssign ? (
                  <Button icon={<KeyOutlined />} onClick={onGrant}>
                    {rc.grantAccess}
                  </Button>
                ) : null}
                {!canAssign ? (
                  <Alert type="info" title={rc.accessSkillsUnknown} />
                ) : assignments.length === 0 ? (
                  <Empty description={rc.skillAccessEmpty}>
                    <Typography.Text type="secondary">{rc.skillAccessEmptyHint}</Typography.Text>
                  </Empty>
                ) : (
                  <Table<AdminSkillAssignment>
                    rowKey="id"
                    size="small"
                    pagination={PAGINATION}
                    dataSource={[...assignments]}
                    columns={[
                      {
                        title: rc.assignmentSubject,
                        key: 'subject',
                        render: (_, assignment) => (
                          <SubjectCell
                            subjectType={assignment.subjectType}
                            subjectId={assignment.subjectId}
                            user={
                              assignment.subjectType === AdminSubjectType.User
                                ? resources.users.find((user) => user.id === assignment.subjectId)
                                : undefined
                            }
                          />
                        ),
                      },
                      ...(canAssign
                        ? [
                            {
                              title: t('actions'),
                              key: 'actions',
                              align: 'right' as const,
                              render: (_: unknown, assignment: AdminSkillAssignment) => (
                                <Popconfirm
                                  title={t('revokeConfirmTitle')}
                                  description={t('revokeConfirmDescription')}
                                  okText={t('confirmRevoke')}
                                  cancelText={t('cancel')}
                                  okButtonProps={{ danger: true }}
                                  onConfirm={() =>
                                    void run(async () => {
                                      await client.deleteSkillAssignment(assignment.id);
                                    })
                                  }
                                >
                                  <Button type="link" size="small" danger disabled={pending}>
                                    {rc.assignmentRevoke}
                                  </Button>
                                </Popconfirm>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </Space>
            ),
          },
          {
            key: 'employees',
            label: rc.skillDetailEmployees,
            children: <SkillEmployees state={employees} skillId={skill.id} variant="table" />,
          },
        ]}
      />
    </Drawer>
  );
}

function VersionManager({
  client,
  skill,
  canWrite,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly skill: AdminSkill;
  readonly canWrite: boolean;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [version, setVersion] = useState('');
  const [archive, setArchive] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const busy = uploading || pending || pendingVersion !== null;
  const upload = async () => {
    if (!version.trim() || !archive) {
      notify(AdminNotificationKind.Error, t('skillUploadFailed'));
      return;
    }
    setUploading(true);
    try {
      await client.uploadSkillVersion(skill.id, version.trim(), new Uint8Array(await archive.arrayBuffer()));
      setVersion('');
      setArchive(null);
      await onChanged();
      notify(AdminNotificationKind.Success, t('versionUploaded'));
    } catch {
      notify(AdminNotificationKind.Error, t('skillUploadFailed'));
    } finally {
      setUploading(false);
    }
  };
  const publish = async (candidate: string) => {
    setPendingVersion(candidate);
    try {
      await client.publishSkillVersion(skill.id, candidate);
      await onChanged();
      notify(AdminNotificationKind.Success, t('changesSaved'));
    } catch {
      notify(AdminNotificationKind.Error, t('skillPublishFailed'));
    } finally {
      setPendingVersion(null);
    }
  };
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {canWrite ? (
        <Space size={8} wrap align="start">
          <Input
            aria-label={t('skillVersion')}
            placeholder={t('skillVersion')}
            value={version}
            disabled={busy}
            onChange={(event) => setVersion(event.target.value)}
            style={{ width: 160 }}
          />
          <Upload
            accept=".zip,application/zip"
            maxCount={1}
            disabled={busy}
            beforeUpload={(file) => {
              setArchive(file);
              return false;
            }}
            onRemove={() => {
              setArchive(null);
            }}
          >
            <Button icon={<UploadOutlined />} disabled={busy}>
              {t('chooseSkillPackage')}
            </Button>
          </Upload>
          <Button
            type="primary"
            loading={uploading}
            disabled={busy || !version.trim() || !archive}
            onClick={() => void upload()}
          >
            {t('uploadVersion')}
          </Button>
        </Space>
      ) : null}
      {skill.versions.length === 0 ? (
        <Empty description={t('noVersions')} />
      ) : (
        <Table<AdminSkillVersion>
          rowKey="version"
          size="small"
          pagination={PAGINATION}
          dataSource={[...skill.versions]}
          columns={[
            { title: t('skillVersion'), dataIndex: 'version', key: 'version' },
            {
              title: t('status'),
              key: 'state',
              render: (_, item) => (
                <Tag color={item.state === 'published' ? 'green' : item.state === 'draft' ? 'gold' : 'default'}>
                  {t(versionStateLabel(item.state))}
                </Tag>
              ),
            },
            {
              title: rc.versionSize,
              key: 'size',
              render: (_, item) => `${item.size} ${t('bytes')}`,
            },
            {
              title: rc.versionSha,
              key: 'sha256',
              render: (_, item) => (
                <Typography.Text copyable={{ text: item.sha256 }} style={{ fontSize: 12 }}>
                  {`${item.sha256.slice(0, 12)}…`}
                </Typography.Text>
              ),
            },
            {
              title: rc.versionCreatedAt,
              key: 'createdAt',
              render: (_, item) =>
                item.createdAt ? formatTimestamp(item.createdAt) || <UnknownText /> : <UnknownText />,
            },
            ...(canWrite
              ? [
                  {
                    title: t('actions'),
                    key: 'actions',
                    align: 'right' as const,
                    render: (_: unknown, item: AdminSkillVersion) => (
                      <Space size={0} wrap>
                        {item.state === 'draft' ? (
                          <Button
                            type="link"
                            size="small"
                            loading={pendingVersion === item.version}
                            disabled={busy}
                            onClick={() => void publish(item.version)}
                          >
                            {rc.publishAction}
                          </Button>
                        ) : null}
                        <Popconfirm
                          title={t('withdrawVersionTitle')}
                          description={t('withdrawVersionDescription')}
                          okText={t('confirmWithdrawVersion')}
                          cancelText={t('cancel')}
                          okButtonProps={{ danger: true }}
                          onConfirm={() =>
                            void run(async () => {
                              await client.deleteSkillVersion(skill.id, item.version);
                            })
                          }
                        >
                          <Button type="link" size="small" danger disabled={busy}>
                            {rc.withdrawAction}
                          </Button>
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </Space>
  );
}

function SkillEditorModal({
  client,
  skill,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly skill: AdminSkill | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(skill);
  const [form] = Form.useForm();
  const [pending, setPending] = useState(false);
  const submit = async (values: { name: string; description?: string; enabled?: boolean }) => {
    setPending(true);
    try {
      if (skill)
        await client.updateSkill(skill.id, {
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
          enabled: values.enabled !== false,
        });
      // The skill id is server-generated from the name.
      else
        await client.createSkill({
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
        });
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t('changesSaved'));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t(editing ? 'skillEditTitle' : 'skillEditorTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t('skillEditorDescription')}</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          name: skill?.name ?? '',
          description: skill?.description ?? '',
          enabled: skill?.enabled !== false,
        }}
        onFinish={submit}
      >
        <Form.Item
          name="name"
          label={t('skillName')}
          rules={[{ required: true, whitespace: true, message: t('nameRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item name="description" label={t('description')}>
          <Input.TextArea rows={2} placeholder={t('descriptionPlaceholder')} disabled={pending} />
        </Form.Item>
        {editing ? (
          <Form.Item name="enabled" label={t('status')} valuePropName="checked">
            <Switch disabled={pending} checkedChildren={t('enabled')} unCheckedChildren={t('disabled')} />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}

function SkillGrantModal({
  client,
  users,
  roles,
  teams,
  skills,
  existingAssignments,
  presetSkillId,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly skills: readonly AdminSkill[];
  readonly existingAssignments: readonly AdminSkillAssignment[];
  readonly presetSkillId?: string | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [skillId, setSkillId] = useState<string | null>(presetSkillId ?? null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failedSubjects, setFailedSubjects] = useState<readonly string[]>([]);
  useEffect(() => {
    if (open) {
      setSkillId(presetSkillId ?? null);
      setSelected(new Set());
      setFailed(false);
      setFailedSubjects([]);
    }
  }, [open, presetSkillId]);
  const toggleSubject = useCallback((subjectKey: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(subjectKey)) next.delete(subjectKey);
      else next.add(subjectKey);
      return next;
    });
  }, []);
  const submit = async () => {
    if (!skillId || selected.size === 0) return;
    setPending(true);
    setFailed(false);
    setFailedSubjects([]);
    try {
      const subjectKeys = [...selected];
      const results = await runBatch(subjectKeys, (subjectKey) => {
        const separator = subjectKey.indexOf(':');
        const type = subjectKey.slice(0, separator) as AdminSubjectType;
        const id = subjectKey.slice(separator + 1);
        return client.createSkillAssignment({ skillId, subject: { type, id } });
      });
      const failures = results.filter((result) => !result.ok).map((result) => result.item);
      if (failures.length > 0) {
        setFailed(true);
        setFailedSubjects(failures);
        setSelected(new Set(failures));
        await onChanged();
        return;
      }
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t('changesSaved'));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t('grantSkillTitle')}
      okText={t('grant')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      okButtonProps={{ disabled: !skillId || selected.size === 0 }}
      mask={{ closable: false }}
      onOk={() => void submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t('grantSkillDescription')}</Typography.Paragraph>
      {failed ? (
        <Alert
          type="error"
          showIcon
          title={t('grantFailed')}
          description={
            failedSubjects.length > 0 ? `${t('grantFailedSubjects')}: ${failedSubjects.join(', ')}` : undefined
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Typography.Text strong>{t('selectSkill')}</Typography.Text>
          <Select
            aria-label={t('selectSkill')}
            value={skillId}
            onChange={(value) => setSkillId(value)}
            disabled={pending || Boolean(presetSkillId)}
            placeholder={t('selectSkill')}
            style={{ width: '100%', marginTop: 8 }}
            options={skills.map((skill) => ({
              value: skill.id,
              label: skill.enabled ? skill.name : `${skill.name}（${t('disabled')}）`,
            }))}
          />
        </div>
        <SubjectMultiPicker
          users={users}
          roles={roles}
          teams={teams}
          excluded={
            new Set(
              existingAssignments
                .filter((item) => item.skillId === skillId)
                .map((item) => `${item.subjectType}:${item.subjectId}`),
            )
          }
          selected={selected}
          onToggle={toggleSubject}
          disabled={pending}
        />
      </Space>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

function AssignmentsSection({ client, resources, canWrite, loading, onRefresh, onChanged, onError }: SectionProps) {
  const [grantOpen, setGrantOpen] = useState(false);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const skillNames = new Map(resources.skills.map((skill) => [skill.id, skill.name]));
  const userNames = new Map(resources.users.map((user) => [user.id, user]));
  return (
    <div>
      <SectionHeader
        title={rc.pageAssignments}
        description={rc.pageAssignmentsDescription}
        extra={
          <>
            {canWrite ? (
              <Button type="primary" icon={<KeyOutlined />} onClick={() => setGrantOpen(true)}>
                {t('grantSkill')}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      {resources.assignments.length === 0 ? (
        <Empty description={t('assignmentsEmpty')}>
          <Space orientation="vertical" size={12}>
            <Typography.Text type="secondary">{t('assignmentsEmptyHint')}</Typography.Text>
            {canWrite ? (
              <Button type="primary" icon={<KeyOutlined />} onClick={() => setGrantOpen(true)}>
                {t('grantSkill')}
              </Button>
            ) : null}
          </Space>
        </Empty>
      ) : (
        <Table<AdminSkillAssignment>
          rowKey="id"
          pagination={PAGINATION}
          dataSource={[...resources.assignments]}
          columns={[
            {
              title: t('skill'),
              key: 'skill',
              render: (_, assignment) => skillNames.get(assignment.skillId) || assignment.skillId,
            },
            {
              title: rc.assignmentSubject,
              key: 'subject',
              render: (_, assignment) => (
                <SubjectCell
                  subjectType={assignment.subjectType}
                  subjectId={assignment.subjectId}
                  user={userNames.get(assignment.subjectId)}
                />
              ),
            },
            ...(canWrite
              ? [
                  {
                    title: t('actions'),
                    key: 'actions',
                    align: 'right' as const,
                    render: (_: unknown, assignment: AdminSkillAssignment) => (
                      <Popconfirm
                        title={t('revokeConfirmTitle')}
                        description={t('revokeConfirmDescription')}
                        okText={t('confirmRevoke')}
                        cancelText={t('cancel')}
                        okButtonProps={{ danger: true }}
                        onConfirm={() =>
                          void run(async () => {
                            await client.deleteSkillAssignment(assignment.id);
                          })
                        }
                      >
                        <Button type="link" size="small" danger disabled={pending}>
                          {rc.assignmentRevoke}
                        </Button>
                      </Popconfirm>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
      {canWrite && grantOpen ? (
        <SkillGrantModal
          client={client}
          users={resources.users}
          roles={resources.roles}
          teams={resources.teams}
          skills={resources.skills}
          existingAssignments={resources.assignments}
          open
          onOpenChange={setGrantOpen}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pickers (exported for Operations and other work areas)
// ---------------------------------------------------------------------------

export function SubjectCell({
  subjectType,
  subjectId,
  user,
}: {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly user: PlatformUser | undefined;
}) {
  if (subjectType === AdminSubjectType.User && user) {
    return <NameCell name={user.displayName} detail={user.username} />;
  }
  return (
    <Typography.Text type="secondary">
      {subjectType}: {subjectId}
    </Typography.Text>
  );
}

export function SubjectMultiPicker({
  users,
  roles,
  teams,
  excluded = new Set(),
  selected,
  onToggle,
  disabled,
  subjectType = 'all',
  searchQuery = '',
}: {
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly excluded?: ReadonlySet<string>;
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly disabled: boolean;
  readonly subjectType?: 'all' | 'user' | 'role' | 'team';
  readonly searchQuery?: string;
}) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const options = [
    ...users.map((user) => ({
      key: `${AdminSubjectType.User}:${user.id}`,
      label: user.displayName,
      description: user.username,
      type: t('user'),
      subjectType: AdminSubjectType.User as AdminSubjectType,
    })),
    ...roles.map((role) => ({
      key: `${AdminSubjectType.Role}:${role.id}`,
      label: role.name,
      description: role.id,
      type: t('role'),
      subjectType: AdminSubjectType.Role as AdminSubjectType,
    })),
    ...teams.map((team) => ({
      key: `${AdminSubjectType.Team}:${team.id}`,
      label: team.name,
      description: team.id,
      type: t('team'),
      subjectType: AdminSubjectType.Team as AdminSubjectType,
    })),
  ].filter((option) => {
    if (excluded.has(option.key)) return false;
    if (subjectType !== 'all' && option.subjectType !== subjectType) return false;
    if (!normalizedQuery) return true;
    return `${option.label} ${option.description} ${option.key}`.toLocaleLowerCase().includes(normalizedQuery);
  });
  return (
    <div>
      <Typography.Text strong>{t('selectSubjects')}</Typography.Text>
      <fieldset
        aria-label={t('selectSubjects')}
        style={{
          marginTop: 8,
          maxHeight: 240,
          overflowY: 'auto',
          border: '1px solid rgba(128, 128, 128, 0.35)',
          borderRadius: 8,
          padding: 4,
        }}
      >
        {options.length === 0 ? (
          <Typography.Text type="secondary" style={{ display: 'block', padding: '12px 8px' }}>
            {t('noMatchingSubjects')}
          </Typography.Text>
        ) : (
          options.map((option) => (
            <Checkbox
              key={option.key}
              checked={selected.has(option.key)}
              onChange={() => onToggle(option.key)}
              disabled={disabled}
              style={{ display: 'flex', marginInlineStart: 0, padding: '6px 8px', alignItems: 'flex-start' }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {option.label}{' '}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    ({option.type})
                  </Typography.Text>
                </span>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  {option.description}
                </Typography.Text>
              </span>
            </Checkbox>
          ))
        )}
      </fieldset>
      <Space size={8} style={{ marginTop: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('selectedSubjectsLabel')}
        </Typography.Text>
        <Badge count={selected.size} showZero color="geekblue" />
      </Space>
    </div>
  );
}

function versionStateLabel(state: AdminSkillVersion['state']): AdminTranslationKey {
  if (state === 'published') return 'versionPublished';
  if (state === 'withdrawn') return 'versionWithdrawn';
  return 'versionDraft';
}
