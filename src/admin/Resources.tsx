import {
  AppstoreOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
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
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  theme,
  type TableProps,
} from "antd";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  AdminModel,
  JsonObject,
  ModelAssignment,
  Permission,
  PlatformUser,
  Role,
  Team,
} from "@aep/sdk-node";
import {
  AdminConsoleClient,
  AdminPermission,
  AdminSubjectType,
  hasAdminPermission,
  type AdminIdentity,
  type AdminIdentitySource,
  type AdminResources,
  type AdminSkill,
  type AdminSkillAssignment,
  type AdminSkillVersion,
  type AdminUserSession,
} from "./client.js";
import { translate, type AdminLanguage, type AdminTranslationKey } from "./i18n.js";
import { resourcesCopy as rc } from "./resources-copy.js";
import { SessionClientCell, SessionClientDetail } from "./session-client.js";
import { formatTimestamp } from "./format.js";
import { runBatch } from "./batch.js";
import { AdminNotificationKind, notify } from "./notifications.js";

const language: AdminLanguage = "zh";
const t = (key: AdminTranslationKey) => translate(language, key);

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 1024;
const RBAC_ID_PATTERN = /^[A-Za-z0-9._\-]{1,100}$/;

type AdminUser = PlatformUser & { readonly email?: string | null };

export const AdminResourceTab = {
  Users: "users",
  Teams: "teams",
  Roles: "roles",
  Skills: "skills",
  Assignments: "assignments",
} as const;
export type AdminResourceTab =
  (typeof AdminResourceTab)[keyof typeof AdminResourceTab];

interface ResourcesProps {
  readonly client: AdminConsoleClient;
  readonly tab: AdminResourceTab;
  readonly identity?: AdminIdentity | undefined;
}

const PAGINATION = { pageSize: 10, hideOnSinglePage: true, showSizeChanger: false } as const;

export function Resources({ client, tab, identity }: ResourcesProps) {
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
        hasAdminPermission(identity, AdminPermission.ModelsRead) &&
        typeof client.models === "function";
      const [next, models] = await Promise.all([
        client.resources(identity),
        canQueryModels
          ? client.models(identity)
          : Promise.resolve({ models: [], assignments: [] }),
      ]);
      setResources(next);
      setModelResources({ ...models, available: canQueryModels && hasAdminPermission(identity, AdminPermission.ModelsAssign), skillsAvailable: hasAdminPermission(identity, AdminPermission.SkillsRead) && hasAdminPermission(identity, AdminPermission.SkillsAssign) });
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
    notify(AdminNotificationKind.Error, t("operationUnavailable"));
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

  return (
    <section aria-label={sectionTitle(tab)}>
      {error ? (
        <Alert
          type="error"
          showIcon
          title={t("resourcesLoadFailed")}
          action={
            <Button size="small" onClick={() => void load()}>
              {rc.retry}
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {loading && !resources ? (
        <Skeleton active paragraph={{ rows: 6 }} title />
      ) : resources ? (
        <>
          {tab === AdminResourceTab.Users ? (
            <UsersSection
              client={client}
              identity={identity}
              resources={resources}
              modelResources={modelResources}
              canWrite={canMutate}
              loading={loading}
              onRefresh={load}
              onChanged={load}
              onError={reportError}
            />
          ) : null}
          {tab === AdminResourceTab.Teams ? (
            <TeamsSection
              client={client}
              resources={resources}
              modelResources={modelResources}
              canWrite={canMutate}
              loading={loading}
              onRefresh={load}
              onChanged={load}
              onError={reportError}
            />
          ) : null}
          {tab === AdminResourceTab.Roles ? (
            <RolesSection
              client={client}
              resources={resources}
              modelResources={modelResources}
              canWrite={canMutate}
              loading={loading}
              onRefresh={load}
              onChanged={load}
              onError={reportError}
            />
          ) : null}
          {tab === AdminResourceTab.Skills ? (
            <SkillsSection
              canAssign={hasAdminPermission(identity, AdminPermission.SkillsAssign)}
              client={client}
              resources={resources}
              canWrite={canMutate}
              loading={loading}
              onRefresh={load}
              onChanged={load}
              onError={reportError}
            />
          ) : null}
          {tab === AdminResourceTab.Assignments ? (
            <AssignmentsSection
              client={client}
              resources={resources}
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
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 16,
      }}
    >
      <div>
        <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>
      {extra ? <Space wrap>{extra}</Space> : null}
    </div>
  );
}

function RefreshButton({
  loading,
  onRefresh,
}: {
  readonly loading: boolean;
  readonly onRefresh: () => Promise<void>;
}) {
  return (
    <Button
      icon={<ReloadOutlined />}
      aria-label={t("refresh")}
      title={t("refresh")}
      loading={loading}
      onClick={() => void onRefresh()}
    />
  );
}

function UnknownText({ children }: { readonly children?: string }) {
  return <Typography.Text type="secondary">{children ?? rc.valueUnknown}</Typography.Text>;
}

function EnabledBadge({ enabled }: { readonly enabled: boolean }) {
  return (
    <Badge
      status={enabled ? "success" : "default"}
      text={enabled ? rc.statusEnabled : rc.statusDisabled}
    />
  );
}

function NameCell({
  name,
  detail,
}: {
  readonly name: string;
  readonly detail: string;
}) {
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
  readonly resourceType: "skill" | "model";
  readonly resourceId: string;
  readonly resourceName: string;
  readonly source: string;
  readonly effective: boolean;
  readonly reason: string | null;
}

function skillEffective(skill: AdminSkill | undefined): boolean {
  return Boolean(skill && skill.enabled && skill.state === "active");
}

function buildAccessRows(input: {
  readonly resources: AdminResources;
  readonly modelResources: ModelResources;
  readonly subjects: readonly { readonly type: "user" | "role" | "team"; readonly id: string; readonly label: string }[];
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
      resourceType: "skill",
      resourceId: assignment.skillId,
      resourceName: skill?.name ?? assignment.skillId,
      source:
        subject.type === "user"
          ? rc.accessDirect
          : `${subject.type === "role" ? rc.accessViaRole : rc.accessViaTeam}：${subject.label}`,
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
      resourceType: "model",
      resourceId: assignment.resourceId,
      resourceName: model?.displayName ?? assignment.resourceId,
      source:
        subject.type === "user"
          ? rc.accessDirect
          : `${subject.type === "role" ? rc.accessViaRole : rc.accessViaTeam}：${subject.label}`,
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
): readonly { readonly type: "user" | "role" | "team"; readonly id: string; readonly label: string }[] {
  const roles = new Map(resources.roles.map((role) => [role.id, role]));
  const teams = new Map(resources.teams.map((team) => [team.id, team]));
  return [
    { type: "user" as const, id: user.id, label: user.displayName },
    ...(user.roleIds ?? [])
      .filter((id) => roles.get(id)?.enabled)
      .map((id) => ({ type: "role" as const, id, label: roles.get(id)?.name ?? id })),
    ...(user.teamIds ?? [])
      .filter((id) => teams.get(id)?.enabled)
      .map((id) => ({ type: "team" as const, id, label: teams.get(id)?.name ?? id })),
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
  const columns: TableProps<AccessRow>["columns"] = [
    {
      title: rc.accessResource,
      key: "resource",
      render: (_, row) => (
        <Space size={8}>
          <Tag color={row.resourceType === "skill" ? "geekblue" : "purple"}>
            {row.resourceType === "skill" ? rc.resourceTypeSkill : rc.resourceTypeModel}
          </Tag>
          <span>{row.resourceName}</span>
        </Space>
      ),
    },
    { title: rc.accessPermission, key: "permission", render: () => rc.accessUse },
    { title: rc.accessSource, dataIndex: "source", key: "source" },
    {
      title: rc.accessState,
      key: "effective",
      render: (_, row) =>
        row.effective ? (
          <Badge status="success" text={rc.accessEffective} />
        ) : (
          <Badge status="default" text={row.reason ?? rc.accessResourceDisabled} />
        ),
    },
  ];
  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      {skillsAvailable ? null : <Alert type="info" showIcon title={rc.accessSkillsUnknown} />}
      {modelsAvailable ? null : (
        <Alert type="info" showIcon title={rc.accessModelsUnknown} />
      )}
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
    skills: new Set(effective.filter((row) => row.resourceType === "skill").map((row) => row.resourceId)).size,
    models: new Set(effective.filter((row) => row.resourceType === "model").map((row) => row.resourceId)).size,
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
      <Tag>{skillsAvailable ? `${counts.skills} ${t("skills")}` : rc.accessSkillsUnknown}</Tag>
      {modelsAvailable ? (
        <Tag>{`${counts.models} ${t("models")}`}</Tag>
      ) : (
        <Tag>{rc.accessModelsUnknown}</Tag>
      )}
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
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "disabled" | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ readonly id?: string } | null>(null);
  const [resetUser, setResetUser] = useState<PlatformUser | null>(null);
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
    const normalized = query.trim().toLowerCase();
    return resources.users.filter((user) => {
      if (normalized && !`${user.displayName} ${user.username}`.toLowerCase().includes(normalized)) return false;
      if (teamFilter && !(user.teamIds ?? []).includes(teamFilter)) return false;
      if (roleFilter && !(user.roleIds ?? []).includes(roleFilter)) return false;
      if (statusFilter && user.status !== statusFilter) return false;
      return true;
    });
  }, [resources.users, query, teamFilter, roleFilter, statusFilter]);

  const detailUser = detailUserId ? resources.users.find((user) => user.id === detailUserId) ?? null : null;

  const columns: TableProps<PlatformUser>["columns"] = [
    {
      title: rc.nameAndAccount,
      key: "name",
      render: (_, user) => <NameCell name={user.displayName} detail={user.username} />,
    },
    {
      title: rc.belongTeams,
      key: "teams",
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
      key: "roles",
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
    { title: rc.sourceColumn, key: "source", render: () => <UnknownText>{rc.sourceUnknown}</UnknownText> },
    {
      title: t("status"),
      key: "status",
      render: (_, user) => <EnabledBadge enabled={user.status === "active"} />,
    },
    { title: rc.lastLogin, key: "lastLogin", render: () => <UnknownText /> },
    {
      title: t("actions"),
      key: "actions",
      align: "right",
      render: (_, user) => (
        <Space size={0} wrap>
          <Button type="link" size="small" disabled={pending} onClick={() => setDetailUserId(user.id)}>
            {rc.view}
          </Button>
          {canWrite ? (
            <>
              <Button type="link" size="small" disabled={pending} onClick={() => setEditor({ id: user.id })}>
                {t("edit")}
              </Button>
              <Dropdown
                menu={{
                  items: [
                    { key: "reset", icon: <KeyOutlined />, label: t("resetPassword") },
                    user.status === "active"
                      ? { key: "disable", icon: <DeleteOutlined />, danger: true, label: t("disable") }
                      : { key: "enable", icon: <PlusOutlined />, label: t("enable") },
                  ],
                  onClick: ({ key }) => {
                    if (key === "reset") setResetUser(user);
                    else if (key === "disable") setDisableTarget(user);
                    else if (key === "enable")
                      void run(async () => {
                        await client.updateUser(user.id, { status: "active" });
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
                {t("addUser")}
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
                {t("importUsers")}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          aria-label={rc.searchUserPlaceholder}
          placeholder={rc.searchUserPlaceholder}
          allowClear
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ width: 220 }}
        />
        <Select
          aria-label={rc.belongTeams}
          placeholder={rc.allTeams}
          allowClear
          value={teamFilter}
          onChange={(value: string | undefined) => setTeamFilter(value ?? null)}
          options={resources.teams.map((team) => ({ value: team.id, label: team.name }))}
          style={{ minWidth: 160 }}
        />
        <Select
          aria-label={rc.accountRoles}
          placeholder={rc.allRoles}
          allowClear
          value={roleFilter}
          onChange={(value: string | undefined) => setRoleFilter(value ?? null)}
          options={resources.roles.map((role) => ({ value: role.id, label: role.name }))}
          style={{ minWidth: 160 }}
        />
        <Select
          aria-label={t("status")}
          placeholder={rc.allStatus}
          allowClear
          value={statusFilter}
          onChange={(value: "active" | "disabled" | undefined) => setStatusFilter(value ?? null)}
          options={[
            { value: "active", label: rc.statusEnabled },
            { value: "disabled", label: rc.statusDisabled },
          ]}
          style={{ minWidth: 140 }}
        />
      </Space>
      {importResult ? (
        <Alert
          type={importResult.rejected > 0 ? "warning" : "success"}
          showIcon
          style={{ marginBottom: 16 }}
          title={`${rc.importResultTitle}：${t("usersImported")}: ${importResult.created} / ${t("usersRejected")}: ${importResult.rejected}`}
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
      {rows.length === 0 ? (
        <Empty description={t("usersEmpty")}>
          <Typography.Text type="secondary">{t("usersEmptyHint")}</Typography.Text>
        </Empty>
      ) : (
        <Table<PlatformUser>
          rowKey="id"
          columns={columns}
          dataSource={[...rows]}
          pagination={PAGINATION}
          loading={loading && rows.length > 0}
        />
      )}
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
          user={editor.id ? (resources.users.find((user) => user.id === editor.id) as AdminUser | undefined) : undefined}
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
        accountActive: user.status === "active",
      }),
    [resources, modelResources, user],
  );
  const userTeams = (user.teamIds ?? []).map((id) => teamNames.get(id)).filter((team): team is NonNullable<typeof team> => Boolean(team));
  const userRoles = (user.roleIds ?? []).map((id) => roleNames.get(id)).filter((role): role is NonNullable<typeof role> => Boolean(role));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={720}
      title={
        <Space size={8}>
          <span>{user.displayName}</span>
          <Tag>{user.username}</Tag>
          <EnabledBadge enabled={user.status === "active"} />
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: "basic",
            label: rc.detailBasic,
            children: (
              <Descriptions
                column={1}
                size="small"
                items={[
                  { key: "name", label: t("displayName"), children: user.displayName },
                  { key: "username", label: t("username"), children: user.username },
                  { key: "email", label: t("email"), children: user.email ?? <UnknownText>{rc.emailUnset}</UnknownText> },
                  { key: "type", label: rc.accountType, children: <UnknownText /> },
                  { key: "source", label: rc.sourceColumn, children: <UnknownText>{rc.sourceUnknown}</UnknownText> },
                  { key: "status", label: t("status"), children: <EnabledBadge enabled={user.status === "active"} /> },
                  { key: "lastLogin", label: rc.lastLogin, children: <UnknownText /> },
                  { key: "createdAt", label: rc.createdAtLabel, children: formatTimestamp(user.createdAt) || <UnknownText /> },
                  { key: "updatedAt", label: rc.updatedAtLabel, children: formatTimestamp(user.updatedAt) || <UnknownText /> },
                ]}
              />
            ),
          },
          {
            key: "org",
            label: rc.detailOrg,
            children: (
              <Space orientation="vertical" size={16} style={{ width: "100%" }}>
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
            key: "access",
            label: rc.detailAccess,
            children: (
              <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                <Alert type="info" showIcon title={rc.accessNote} />
                <AccessTable rows={accessRows} modelsAvailable={modelResources.available} skillsAvailable={modelResources.skillsAvailable} />
              </Space>
            ),
          },
          {
            key: "links",
            label: rc.detailLinks,
            children: <UserAccountLinks client={client} identity={identity} userId={user.id} onError={onError} />,
          },
          {
            key: "sessions",
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
  const [form] = Form.useForm<{ roles: string[]; teams: string[] }>();
  const [pending, setPending] = useState(false);
  const submit = async (values: { roles: string[]; teams: string[] }) => {
    setPending(true);
    try {
      await client.replaceUserRBAC(user.id, { roleIds: values.roles, teamIds: values.teams });
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t("changesSaved"));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={rc.adjustOrgTitle}
      okText={t("save")}
      cancelText={t("cancel")}
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
        initialValues={{ roles: [...(user.roleIds ?? [])], teams: [...(user.teamIds ?? [])] }}
        onFinish={submit}
      >
        <Form.Item
          name="roles"
          label={t("selectRoles")}
          rules={[{ validator: (_, value: string[]) => (Array.isArray(value) && value.length > 0 ? Promise.resolve() : Promise.reject(new Error(t("roleRequired")))) }]}
        >
          <Checkbox.Group
            options={roles.map((role) => ({ value: role.id, label: `${role.name}（${role.id}）` }))}
          />
        </Form.Item>
        <Form.Item
          name="teams"
          label={t("selectTeams")}
          rules={[{ validator: (_, value: string[]) => (Array.isArray(value) && value.length > 0 ? Promise.resolve() : Promise.reject(new Error(t("teamRequired")))) }]}
        >
          <Checkbox.Group
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
  const [rows, setRows] = useState<readonly { readonly key: string; readonly source: AdminIdentitySource; readonly externalId: string; readonly status: string }[] | null>(null);
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
  if (loading && !rows) return <Skeleton active paragraph={{ rows: 2 }} />;
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
        { title: rc.linkSource, key: "source", render: (_, row) => row.source.displayName },
        { title: rc.linkExternal, dataIndex: "externalId", key: "externalId" },
        {
          title: t("status"),
          key: "status",
          render: (_, row) => <EnabledBadge enabled={row.status === "active"} />,
        },
        ...(canWrite
          ? [
              {
                title: t("actions"),
                key: "actions",
                align: "right" as const,
                render: (_: unknown, row: (typeof rows)[number]) => (
                  <Popconfirm
                    title={rc.unlinkTitle}
                    description={rc.unlinkImpact}
                    okText={rc.confirmUnlink}
                    cancelText={t("cancel")}
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
  if (loading && !sessions) return <Skeleton active paragraph={{ rows: 2 }} />;
  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
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
              key: "client",
              render: (_, session) => (
                <SessionClientCell client={session.client} current={session.sessionId === client.sessionId} />
              ),
            },
            {
              title: rc.sessionLastActive,
              key: "lastSeenAt",
              render: (_, session) => formatTimestamp(session.lastSeenAt) || <UnknownText />,
            },
            {
              title: t("status"),
              key: "status",
              render: (_, session) => (
                <Badge
                  status={session.revokedAt ? "default" : "success"}
                  text={session.revokedAt ? rc.sessionStateRevoked : rc.sessionStateActive}
                />
              ),
            },
            {
              title: t("actions"),
              key: "actions",
              align: "right",
              render: (_, session) => (
                <Space size={0}>
                  <Button type="link" size="small" onClick={() => setDetail(session)}>
                    {rc.view}
                  </Button>
                  {canRevoke && !session.revokedAt ? (
                    session.sessionId === client.sessionId ? (
                      <Tooltip title={t("sessionCurrentRevokeDisabled")}>
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
                        cancelText={t("cancel")}
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
              { key: "sessionId", label: t("sessionId"), children: <Typography.Text copyable>{detail.sessionId}</Typography.Text> },
              { key: "userId", label: t("userId"), children: detail.userId },
              { key: "client", label: rc.sessionClient, children: <SessionClientDetail client={detail.client} /> },
              { key: "topic", label: rc.sessionSubject, children: detail.topic },
              { key: "createdAt", label: rc.sessionCreatedAt, children: formatTimestamp(detail.createdAt) || <UnknownText /> },
              { key: "lastSeenAt", label: rc.sessionLastActive, children: formatTimestamp(detail.lastSeenAt) || <UnknownText /> },
              ...(detail.revokedAt
                ? [{ key: "revokedAt", label: rc.sessionRevokedAt, children: formatTimestamp(detail.revokedAt) }]
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
      await client.updateUser(user.id, { status: "disabled" });
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
      cancelText={t("cancel")}
      okButtonProps={result ? {} : { danger: true }}
      confirmLoading={pending}
      mask={{ closable: false }}
      cancelButtonProps={result ? { style: { display: "none" } } : {}}
      onOk={() => {
        if (result) onOpenChange(false);
        else void disable();
      }}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      {result ? (
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Alert type="success" showIcon title={rc.disableAccountDone} />
          <Alert
            type={result.failed !== 0 ? "warning" : "info"}
            showIcon
            title={
              result.failed > 0
                ? rc.disableSessionsFailed
                : result.failed < 0
                  ? (canRevokeSessions ? rc.disableSessionsUnknown : rc.disableSessionsNoPermission)
                  : result.revoked > 0
                    ? `${rc.disableSessionsRevoked}：${result.revoked}`
                    : rc.disableSessionsNone
            }
          />
          <Typography.Text type="secondary">{rc.disableBoundaryNote}</Typography.Text>
        </Space>
      ) : (
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Alert type="warning" showIcon title={rc.disableUserImpact} />
          {isSelf ? <Alert type="error" showIcon title={rc.disableSelfWarning} /> : null}
          <Descriptions
            column={1}
            size="small"
            items={[
              {
                key: "sessions",
                label: rc.disableUserActiveSessions,
                children:
                  activeSessions !== null ? (
                    String(activeSessions)
                  ) : sessionsUnknown ? (
                    <UnknownText>{rc.disableUserSessionsUnknown}</UnknownText>
                  ) : (
                    <Skeleton active paragraph={false} title={{ width: 60 }} />
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
    teams: string[];
    requirePasswordChange?: boolean;
  }) => {
    const normalizedUsername = (values.username ?? "").trim();
    if (!user && existingUsernames.includes(normalizedUsername)) {
      form.setFields([{ name: "username", errors: [t("usernameAlreadyExists")] }]);
      return;
    }
    setPending(true);
    try {
      if (user) {
        await client.updateUser(user.id, {
          displayName: values.displayName.trim(),
          email: values.email?.trim() || null,
        });
        await client.replaceUserRBAC(user.id, { roleIds: values.roles, teamIds: values.teams });
      } else {
        await client.createUser({
          username: normalizedUsername,
          displayName: values.displayName.trim(),
          email: values.email?.trim() || null,
          temporaryPassword: values.temporaryPassword ?? "",
          roleIds: values.roles,
          teamIds: values.teams,
          requirePasswordChange: values.requirePasswordChange !== false,
        });
      }
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t(editing ? "userUpdated" : "userCreated"));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t(editing ? "userEditTitle" : "userEditorTitle")}
      okText={t("save")}
      cancelText={t("cancel")}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">
        {t(editing ? "userEditDescription" : "userEditorDescription")}
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        autoComplete="off"
        initialValues={{
          username: user?.username ?? "",
          displayName: user?.displayName ?? "",
          email: user?.email ?? "",
          temporaryPassword: "",
          roles: [...(user?.roleIds ?? [])],
          teams: [...(user?.teamIds ?? [])],
          requirePasswordChange: true,
        }}
        onFinish={submit}
      >
        {editing ? null : (
          <Form.Item
            name="username"
            label={t("username")}
            rules={[{ required: true, whitespace: true, message: t("usernameRequired") }]}
          >
            <Input autoComplete="off" disabled={pending} />
          </Form.Item>
        )}
        <Form.Item
          name="displayName"
          label={t("displayName")}
          rules={[{ required: true, whitespace: true, message: t("displayNameRequired") }]}
        >
          <Input autoComplete="off" disabled={pending} />
        </Form.Item>
        <Form.Item name="email" label={t("email")} rules={[{ type: "email", message: t("email") }]}>
          <Input autoComplete="off" placeholder={t("emailPlaceholder")} disabled={pending} />
        </Form.Item>
        {editing ? null : (
          <Form.Item
            name="temporaryPassword"
            label={t("temporaryPassword")}
            extra={t("passwordPolicy")}
            rules={[
              { required: true, message: t("passwordPolicy") },
              { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: t("passwordPolicy") },
            ]}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={t("temporaryPasswordPlaceholder")}
              disabled={pending}
            />
          </Form.Item>
        )}
        <Form.Item
          name="roles"
          label={t("selectRoles")}
          rules={[{ validator: (_, value: string[]) => (Array.isArray(value) && value.length > 0 ? Promise.resolve() : Promise.reject(new Error(t("roleRequired")))) }]}
        >
          <Checkbox.Group
            options={roles.map((role) => ({ value: role.id, label: `${role.name}（${role.id}）` }))}
            disabled={pending}
          />
        </Form.Item>
        <Form.Item
          name="teams"
          label={t("selectTeams")}
          rules={[{ validator: (_, value: string[]) => (Array.isArray(value) && value.length > 0 ? Promise.resolve() : Promise.reject(new Error(t("teamRequired")))) }]}
        >
          <Checkbox.Group
            options={teams.map((team) => ({ value: team.id, label: `${team.name}（${team.id}）` }))}
            disabled={pending}
          />
        </Form.Item>
        {editing ? null : (
          <Form.Item name="requirePasswordChange" label={t("requirePasswordChange")} valuePropName="checked">
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
      title={t("resetPasswordTitle")}
      okText={t("save")}
      cancelText={t("cancel")}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">
        {t("resetPasswordDescription")} <Typography.Text strong>{user.displayName}</Typography.Text>
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        autoComplete="off"
        initialValues={{ temporaryPassword: "", requirePasswordChange: true }}
        onFinish={submit}
      >
        <Form.Item
          name="temporaryPassword"
          label={t("temporaryPassword")}
          extra={t("passwordPolicy")}
          rules={[
            { required: true, message: t("passwordPolicy") },
            { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: t("passwordPolicy") },
          ]}
        >
          <Input.Password
            autoComplete="new-password"
            placeholder={t("temporaryPasswordPlaceholder")}
            disabled={pending}
          />
        </Form.Item>
        <Form.Item name="requirePasswordChange" label={t("requirePasswordChange")} valuePropName="checked">
          <Switch disabled={pending} />
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
      const payload = normalizeUserImport(JSON.parse(await file.text()));
      const result = await client.importUsers(payload);
      const created = typeof result.created === "number" ? result.created : 0;
      const rejected = typeof result.rejected === "number" ? result.rejected : 0;
      const errors = Array.isArray(result.errors)
        ? result.errors.filter((item): item is string => typeof item === "string").slice(0, 20)
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
      title={t("importUsersTitle")}
      okText={t("importUsers")}
      cancelText={t("cancel")}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => void submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t("importUsersDescription")}</Typography.Paragraph>
      {failed ? (
        <Alert type="error" showIcon title={t("importUsersFailed")} style={{ marginBottom: 16 }} />
      ) : null}
      <Upload
        accept="application/json,.json"
        maxCount={1}
        disabled={pending}
        fileList={
          file
            ? [{ uid: "users-import", name: file.name, size: file.size }]
            : []
        }
        beforeUpload={(candidate) => {
          setFile(candidate);
          setFailed(false);
          return false;
        }}
        onChange={({ fileList }) => setFile(fileList[0]?.originFileObj ?? null)}
        onRemove={() => setFile(null)}
      >
        <Button icon={<UploadOutlined />} aria-label={t("importUsersFile")} disabled={pending}>
          {t("importUsersFile")}
        </Button>
      </Upload>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        {t("importUsersHint")}
      </Typography.Paragraph>
    </Modal>
  );
}

function normalizeUserImport(value: unknown): JsonObject {
  const users = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        Array.isArray((value as { readonly users?: unknown }).users)
      ? (value as { readonly users: unknown[] }).users
      : null;
  if (!users || users.length === 0 || users.length > 1000)
    throw new Error("Invalid user import row count.");
  for (const row of users) {
    if (!row || typeof row !== "object") throw new Error("Invalid user import row.");
    const item = row as Record<string, unknown>;
    for (const key of ["externalRowId", "username", "displayName", "temporaryPassword"]) {
      if (typeof item[key] !== "string" || item[key].trim() === "")
        throw new Error(`Missing ${key}.`);
    }
    if ((item.temporaryPassword as string).length < 12)
      throw new Error("Temporary password is too short.");
    for (const key of ["teamIds", "roleIds"]) {
      if (
        item[key] !== undefined &&
        (!Array.isArray(item[key]) || item[key].some((entry) => typeof entry !== "string"))
      )
        throw new Error(`Invalid ${key}.`);
      if (!Array.isArray(item[key]) || item[key].length === 0) throw new Error(`Missing ${key}.`);
    }
    if (item.requirePasswordChange !== undefined && typeof item.requirePasswordChange !== "boolean")
      throw new Error("Invalid requirePasswordChange.");
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
  const [query, setQuery] = useState("");
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ readonly id?: string } | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? resources.teams.filter((team) => `${team.name} ${team.id}`.toLowerCase().includes(normalized))
      : resources.teams;
  }, [resources.teams, query]);
  const detailTeam = detailTeamId ? resources.teams.find((team) => team.id === detailTeamId) ?? null : null;
  const columns: TableProps<Team>["columns"] = [
    {
      title: t("team"),
      key: "team",
      render: (_, team) => (
        <Space size={8}>
          <NameCell name={team.name} detail={team.id} />
          {team.builtIn ? <Tag color="blue">{t("builtIn")}</Tag> : null}
        </Space>
      ),
    },
    { title: rc.memberCount, dataIndex: "memberCount", key: "memberCount", width: 100 },
    {
      title: t("effectiveResources"),
      key: "access",
      render: (_, team) => (
        <ResourceAccessTags
          modelsAvailable={modelResources.available}
          skillsAvailable={modelResources.skillsAvailable}
          rows={buildAccessRows({
            resources,
            modelResources,
            subjects: [{ type: "team", id: team.id, label: team.name }],
            accountActive: team.enabled,
          })}
        />
      ),
    },
    { title: t("status"), key: "status", render: (_, team) => <EnabledBadge enabled={team.enabled} /> },
    {
      title: t("actions"),
      key: "actions",
      align: "right",
      render: (_, team) => (
        <Space size={0} wrap>
          <Button type="link" size="small" disabled={pending} onClick={() => setDetailTeamId(team.id)}>
            {rc.view}
          </Button>
          {canWrite ? (
            <>
              <Button type="link" size="small" disabled={pending} onClick={() => setEditor({ id: team.id })}>
                {t("edit")}
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
                {team.enabled ? t("disable") : t("enable")}
              </Button>
              <Popconfirm
                title={t("deleteTeamTitle")}
                description={t("deleteResourceDescription")}
                okText={t("delete")}
                cancelText={t("cancel")}
                okButtonProps={{ danger: true }}
                disabled={team.builtIn}
                onConfirm={() =>
                  void run(async () => {
                    await client.deleteTeam(team.id);
                  })
                }
              >
                <Button type="link" size="small" danger disabled={pending || team.builtIn}>
                  {t("delete")}
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
                {t("addTeam")}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      <Input.Search
        aria-label={rc.searchTeamPlaceholder}
        placeholder={rc.searchTeamPlaceholder}
        allowClear
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ width: 240, marginBottom: 16 }}
      />
      {rows.length === 0 ? (
        <Empty description={t("teamsEmpty")}>
          <Typography.Text type="secondary">{t("teamsEmptyHint")}</Typography.Text>
        </Empty>
      ) : (
        <Table<Team>
          rowKey="id"
          columns={columns}
          dataSource={[...rows]}
          pagination={PAGINATION}
        />
      )}
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
          existingTeams={resources.teams}
          team={editor.id ? resources.teams.find((team) => team.id === editor.id) : undefined}
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
    subjects: [{ type: "team", id: team.id, label: team.name }],
    accountActive: team.enabled,
  });
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={640}
      title={
        <Space size={8}>
          <span>{team.name}</span>
          <EnabledBadge enabled={team.enabled} />
        </Space>
      }
      extra={
        canWrite ? (
          <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
            {t("edit")}
          </Button>
        ) : null
      }
    >
      <Tabs
        items={[
          {
            key: "members",
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
                      title: t("user"),
                      key: "user",
                      render: (_, user) => <NameCell name={user.displayName} detail={user.username} />,
                    },
                    {
                      title: rc.accountRoles,
                      key: "roles",
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
                      title: t("status"),
                      key: "status",
                      render: (_, user) => <EnabledBadge enabled={user.status === "active"} />,
                    },
                  ]}
                />
              ),
          },
          {
            key: "access",
            label: rc.teamAccessTab,
            children: (
              <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                <Typography.Text type="secondary">{rc.teamAccessNote}</Typography.Text>
                <AccessTable rows={accessRows} modelsAvailable={modelResources.available} skillsAvailable={modelResources.skillsAvailable} />
              </Space>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

function TeamEditorModal({
  client,
  existingTeams,
  team,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly existingTeams: readonly Team[];
  readonly team: Team | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(team);
  const [form] = Form.useForm();
  const [pending, setPending] = useState(false);
  const submit = async (values: { id?: string; name: string; description?: string; enabled?: boolean }) => {
    const normalizedId = (values.id ?? "").trim();
    if (!team && existingTeams.some((item) => item.id === normalizedId)) {
      form.setFields([{ name: "id", errors: [t("teamIdAlreadyExists")] }]);
      return;
    }
    setPending(true);
    try {
      if (team)
        await client.updateTeam(team.id, {
          name: values.name.trim(),
          description: (values.description ?? "").trim(),
          enabled: values.enabled !== false,
        });
      else
        await client.createTeam({
          id: normalizedId,
          name: values.name.trim(),
          description: (values.description ?? "").trim(),
        });
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t("changesSaved"));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t(editing ? "teamEditTitle" : "teamEditorTitle")}
      okText={t("save")}
      cancelText={t("cancel")}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t("teamEditorDescription")}</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          id: team?.id ?? "",
          name: team?.name ?? "",
          description: team?.description ?? "",
          enabled: team?.enabled !== false,
        }}
        onFinish={submit}
      >
        {editing ? null : (
          <Form.Item
            name="id"
            label={t("teamId")}
            extra={t("rbacIdHint")}
            rules={[
              { required: true, whitespace: true, message: t("fieldRequired") },
              { pattern: RBAC_ID_PATTERN, message: t("rbacIdHint") },
            ]}
          >
            <Input disabled={pending} />
          </Form.Item>
        )}
        <Form.Item name="name" label={t("teamName")} rules={[{ required: true, whitespace: true, message: t("nameRequired") }]}>
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item name="description" label={t("description")}>
          <Input.TextArea rows={2} placeholder={t("descriptionPlaceholder")} disabled={pending} />
        </Form.Item>
        {editing ? (
          <Form.Item name="enabled" label={t("status")} valuePropName="checked">
            <Switch disabled={pending} checkedChildren={t("enabled")} unCheckedChildren={t("disabled")} />
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
  const [query, setQuery] = useState("");
  const [detailRoleId, setDetailRoleId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ readonly id?: string } | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? resources.roles.filter((role) => `${role.name} ${role.id}`.toLowerCase().includes(normalized))
      : resources.roles;
  }, [resources.roles, query]);
  const detailRole = detailRoleId ? resources.roles.find((role) => role.id === detailRoleId) ?? null : null;
  const memberCount = (roleId: string) =>
    resources.users.filter((user) => (user.roleIds ?? []).includes(roleId)).length;
  const columns: TableProps<Role>["columns"] = [
    {
      title: t("role"),
      key: "role",
      render: (_, role) => (
        <Space size={8}>
          <NameCell name={role.name} detail={role.id} />
          {role.builtIn ? <Tag color="blue">{t("builtIn")}</Tag> : null}
        </Space>
      ),
    },
    {
      title: rc.permissionCount,
      key: "permissions",
      width: 100,
      render: (_, role) => role.permissions.length,
    },
    {
      title: rc.roleMemberCount,
      key: "members",
      width: 100,
      render: (_, role) => memberCount(role.id),
    },
    {
      title: t("effectiveResources"),
      key: "access",
      render: (_, role) => (
        <ResourceAccessTags
          modelsAvailable={modelResources.available}
          skillsAvailable={modelResources.skillsAvailable}
          rows={buildAccessRows({
            resources,
            modelResources,
            subjects: [{ type: "role", id: role.id, label: role.name }],
            accountActive: role.enabled,
          })}
        />
      ),
    },
    { title: t("status"), key: "status", render: (_, role) => <EnabledBadge enabled={role.enabled} /> },
    {
      title: t("actions"),
      key: "actions",
      align: "right",
      render: (_, role) => (
        <Space size={0} wrap>
          <Button type="link" size="small" disabled={pending} onClick={() => setDetailRoleId(role.id)}>
            {rc.view}
          </Button>
          {canWrite ? (
            <>
              <Button type="link" size="small" disabled={pending} onClick={() => setEditor({ id: role.id })}>
                {t("edit")}
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
                {role.enabled ? t("disable") : t("enable")}
              </Button>
              <Popconfirm
                title={t("deleteRoleTitle")}
                description={t("deleteResourceDescription")}
                okText={t("delete")}
                cancelText={t("cancel")}
                okButtonProps={{ danger: true }}
                disabled={role.builtIn}
                onConfirm={() =>
                  void run(async () => {
                    await client.deleteRole(role.id);
                  })
                }
              >
                <Button type="link" size="small" danger disabled={pending || role.builtIn}>
                  {t("delete")}
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
                {t("addRole")}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      <Input.Search
        aria-label={rc.searchRolePlaceholder}
        placeholder={rc.searchRolePlaceholder}
        allowClear
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ width: 240, marginBottom: 16 }}
      />
      {rows.length === 0 ? (
        <Empty description={t("rolesEmpty")}>
          <Typography.Text type="secondary">{t("rolesEmptyHint")}</Typography.Text>
        </Empty>
      ) : (
        <Table<Role>
          rowKey="id"
          columns={columns}
          dataSource={[...rows]}
          pagination={PAGINATION}
        />
      )}
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
          existingRoleIds={resources.roles.map((role) => role.id)}
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
  const permissionDescriptions = new Map(resources.permissions.map((permission) => [permission.id, permission.description]));
  const subjects = resources.users.filter((user) => (user.roleIds ?? []).includes(role.id));
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={640}
      title={
        <Space size={8}>
          <span>{role.name}</span>
          {role.builtIn ? <Tag color="blue">{t("builtIn")}</Tag> : null}
          <EnabledBadge enabled={role.enabled} />
        </Space>
      }
      extra={
        canWrite ? (
          <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
            {t("edit")}
          </Button>
        ) : null
      }
    >
      <Tabs
        items={[
          {
            key: "permissions",
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
                    { title: t("permissions"), dataIndex: "id", key: "id" },
                    {
                      title: t("description"),
                      key: "description",
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
            key: "subjects",
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
                      title: t("user"),
                      key: "user",
                      render: (_, user) => <NameCell name={user.displayName} detail={user.username} />,
                    },
                    {
                      title: t("status"),
                      key: "status",
                      render: (_, user) => <EnabledBadge enabled={user.status === "active"} />,
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
  existingRoleIds,
  role,
  permissions,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly existingRoleIds: readonly string[];
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
  const submit = async (values: {
    id?: string;
    name: string;
    description?: string;
    permissions?: string[];
    enabled?: boolean;
  }) => {
    const normalizedId = (values.id ?? "").trim();
    if (!role && existingRoleIds.includes(normalizedId)) {
      form.setFields([{ name: "id", errors: [t("roleIdAlreadyExists")] }]);
      return;
    }
    setPending(true);
    try {
      if (role)
        await client.updateRole(role.id, {
          name: values.name.trim(),
          description: (values.description ?? "").trim(),
          enabled: values.enabled !== false,
          permissions: values.permissions ?? [],
        });
      else
        await client.createRole({
          id: normalizedId,
          name: values.name.trim(),
          description: (values.description ?? "").trim(),
          permissions: values.permissions ?? [],
        });
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t("changesSaved"));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t(editing ? "roleEditTitle" : "roleEditorTitle")}
      okText={t("save")}
      cancelText={t("cancel")}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t("roleEditorDescription")}</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          id: role?.id ?? "",
          name: role?.name ?? "",
          description: role?.description ?? "",
          permissions: [...(role?.permissions ?? [])],
          enabled: role?.enabled !== false,
        }}
        onFinish={submit}
      >
        {editing ? null : (
          <Form.Item
            name="id"
            label={t("roleId")}
            extra={t("rbacIdHint")}
            rules={[
              { required: true, whitespace: true, message: t("fieldRequired") },
              { pattern: RBAC_ID_PATTERN, message: t("rbacIdHint") },
            ]}
          >
            <Input disabled={pending} />
          </Form.Item>
        )}
        <Form.Item name="name" label={t("roleName")} rules={[{ required: true, whitespace: true, message: t("nameRequired") }]}>
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item name="description" label={t("description")}>
          <Input.TextArea rows={2} placeholder={t("descriptionPlaceholder")} disabled={pending} />
        </Form.Item>
        <Form.Item name="permissions" label={t("permissions")}>
          <Checkbox.Group
            disabled={pending}
            options={permissions.map((permission) => ({
              value: permission.id,
              label: permission.description ? `${permission.id} — ${permission.description}` : permission.id,
            }))}
          />
        </Form.Item>
        {editing ? (
          <Form.Item name="enabled" label={t("status")} valuePropName="checked">
            <Switch disabled={pending} checkedChildren={t("enabled")} unCheckedChildren={t("disabled")} />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

function SkillsSection({
  client,
  resources,
  canWrite,
  canAssign,
  loading,
  onRefresh,
  onChanged,
  onError,
}: SectionProps & { readonly canAssign: boolean }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [detailSkillId, setDetailSkillId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ readonly id?: string } | null>(null);
  const [grant, setGrant] = useState<{ readonly skillId?: string } | null>(null);
  const [blockedSkill, setBlockedSkill] = useState<AdminSkill | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return resources.skills.filter((skill) => {
      if (statusFilter === "enabled" && !skill.enabled) return false;
      if (statusFilter === "disabled" && skill.enabled) return false;
      if (!normalized) return true;
      return `${skill.name} ${skill.description ?? ""} ${skill.id}`.toLowerCase().includes(normalized);
    });
  }, [resources.skills, query, statusFilter]);
  const detailSkill = detailSkillId ? resources.skills.find((skill) => skill.id === detailSkillId) ?? null : null;
  const assignmentsFor = (skillId: string) => resources.assignments.filter((item) => item.skillId === skillId);
  const latestPublished = (skill: AdminSkill) =>
    skill.versions.find((version) => version.state === "published")?.version ?? null;
  const blockedRefs = blockedSkill ? assignmentsFor(blockedSkill.id) : [];
  const columns: TableProps<AdminSkill>["columns"] = [
    {
      title: t("skill"),
      key: "skill",
      render: (_, skill) => <NameCell name={skill.name} detail={skill.description || skill.id} />,
    },
    {
      title: rc.skillPurpose,
      key: "purpose",
      render: (_, skill) =>
        skill.description ? (
          <Typography.Text type="secondary">{skill.description}</Typography.Text>
        ) : (
          <UnknownText />
        ),
    },
    {
      title: t("versions"),
      key: "versions",
      width: 120,
      render: (_, skill) => {
        const published = latestPublished(skill);
        return published ? <Tag color="green">{published}</Tag> : <UnknownText>—</UnknownText>;
      },
    },
    { title: t("status"), key: "status", render: (_, skill) => <EnabledBadge enabled={skill.enabled} /> },
    { title: rc.skillEmployees, key: "employees", render: () => <UnknownText>{rc.notCollected}</UnknownText> },
    {
      title: t("actions"),
      key: "actions",
      align: "right",
      render: (_, skill) => {
        const refs = assignmentsFor(skill.id);
        return (
          <Space size={0} wrap>
            <Button type="link" size="small" disabled={pending} onClick={() => setDetailSkillId(skill.id)}>
              {rc.view}
            </Button>
            {canWrite ? (
              <>
                <Button type="link" size="small" disabled={pending} onClick={() => setEditor({ id: skill.id })}>
                  {t("edit")}
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
                  {skill.enabled ? t("disable") : t("enable")}
                </Button>
                {refs.length > 0 ? (
                  <Button type="link" size="small" danger disabled={pending} onClick={() => setBlockedSkill(skill)}>
                    {t("delete")}
                  </Button>
                ) : (
                  <Popconfirm
                    title={rc.deleteSkillConfirm}
                    description={`${rc.stopSkillFirst} ${rc.skillDeleteUncheckedNote}`}
                    okText={t("delete")}
                    cancelText={t("cancel")}
                    okButtonProps={{ danger: true }}
                    onConfirm={() =>
                      void run(async () => {
                        await client.deleteSkill(skill.id);
                      })
                    }
                  >
                    <Button type="link" size="small" danger disabled={pending}>
                      {t("delete")}
                    </Button>
                  </Popconfirm>
                )}
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
              <Button icon={<KeyOutlined />} onClick={() => setGrant({})}>{t("grantSkill")}</Button>
            ) : null}
            {canWrite ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor({})}>{t("addSkill")}</Button>
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
            { value: "all", label: rc.allStatus },
            { value: "enabled", label: rc.statusEnabled },
            { value: "disabled", label: rc.statusDisabled },
          ]}
          style={{ width: 140 }}
        />
      </Space>
      {rows.length === 0 ? (
        <Empty description={t("skillsEmpty")}>
          <Typography.Text type="secondary">{t("skillsEmptyHint")}</Typography.Text>
        </Empty>
      ) : (
        <Table<AdminSkill>
          rowKey="id"
          columns={columns}
          dataSource={[...rows]}
          pagination={PAGINATION}
        />
      )}
      {detailSkill ? (
        <SkillDetailDrawer
          client={client}
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
          existingSkillIds={resources.skills.map((skill) => skill.id)}
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
        open={blockedSkill !== null}
        title={rc.skillDeleteBlockedTitle}
        footer={
          <Button type="primary" onClick={() => setBlockedSkill(null)}>
            {rc.ok}
          </Button>
        }
        onCancel={() => setBlockedSkill(null)}
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Typography.Text>{rc.skillDeleteBlockedNote}</Typography.Text>
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {blockedRefs.map((assignment) => (
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
        </Space>
      </Modal>
    </div>
  );
}

function SkillDetailDrawer({
  client,
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
            {t("edit")}
          </Button>
        ) : null
      }
    >
      <Tabs
        items={[
          {
            key: "config",
            label: rc.skillDetailConfig,
            children: (
              <Space orientation="vertical" size={16} style={{ width: "100%" }}>
                <Descriptions
                  column={1}
                  bordered
                  size="small"
                  items={[
                    { key: "id", label: t("skillId"), children: skill.id },
                    { key: "name", label: t("skillName"), children: skill.name },
                    {
                      key: "description",
                      label: t("description"),
                      children: skill.description ? skill.description : <UnknownText />,
                    },
                    { key: "status", label: t("status"), children: <EnabledBadge enabled={skill.enabled} /> },
                  ]}
                />
                {canWrite ? (
                  <Space wrap>
                    <Button icon={<EditOutlined />} onClick={onEdit}>
                      {t("edit")}
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          await client.updateSkill(skill.id, { enabled: !skill.enabled });
                        })
                      }
                    >
                      {skill.enabled ? t("disable") : t("enable")}
                    </Button>
                  </Space>
                ) : null}
              </Space>
            ),
          },
          {
            key: "versions",
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
            key: "access",
            label: canAssign ? `${rc.skillDetailAccess}（${assignments.length}）` : rc.skillDetailAccess,
            children: (
              <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                {canAssign ? (
                  <Button icon={<KeyOutlined />} onClick={onGrant}>
                    {rc.grantAccess}
                  </Button>
                ) : null}
                {!canAssign ? <Alert type="info" title={rc.accessSkillsUnknown} /> : assignments.length === 0 ? (
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
                        key: "subject",
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
                              title: t("actions"),
                              key: "actions",
                              align: "right" as const,
                              render: (_: unknown, assignment: AdminSkillAssignment) => (
                                <Popconfirm
                                  title={t("revokeConfirmTitle")}
                                  description={t("revokeConfirmDescription")}
                                  okText={t("confirmRevoke")}
                                  cancelText={t("cancel")}
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
            key: "employees",
            label: rc.skillDetailEmployees,
            children: (
              <Empty description={rc.skillEmployeesEmpty}>
                <Typography.Text type="secondary">{rc.skillEmployeesEmptyHint}</Typography.Text>
              </Empty>
            ),
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
  const [version, setVersion] = useState("");
  const [archive, setArchive] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const { pending, run } = useMutationRunner(onChanged, onError);
  const busy = uploading || pending || pendingVersion !== null;
  const upload = async () => {
    if (!version.trim() || !archive) {
      notify(AdminNotificationKind.Error, t("skillUploadFailed"));
      return;
    }
    setUploading(true);
    try {
      await client.uploadSkillVersion(skill.id, version.trim(), new Uint8Array(await archive.arrayBuffer()));
      setVersion("");
      setArchive(null);
      await onChanged();
      notify(AdminNotificationKind.Success, t("versionUploaded"));
    } catch {
      notify(AdminNotificationKind.Error, t("skillUploadFailed"));
    } finally {
      setUploading(false);
    }
  };
  const publish = async (candidate: string) => {
    setPendingVersion(candidate);
    try {
      await client.publishSkillVersion(skill.id, candidate);
      await onChanged();
      notify(AdminNotificationKind.Success, t("changesSaved"));
    } catch {
      notify(AdminNotificationKind.Error, t("skillPublishFailed"));
    } finally {
      setPendingVersion(null);
    }
  };
  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      {canWrite ? (
        <Space size={8} wrap align="start">
          <Input
            aria-label={t("skillVersion")}
            placeholder={t("skillVersion")}
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
              {t("chooseSkillPackage")}
            </Button>
          </Upload>
          <Button type="primary" loading={uploading} disabled={busy || !version.trim() || !archive} onClick={() => void upload()}>
            {t("uploadVersion")}
          </Button>
        </Space>
      ) : null}
      {skill.versions.length === 0 ? (
        <Empty description={t("noVersions")} />
      ) : (
        <Table<AdminSkillVersion>
          rowKey="version"
          size="small"
          pagination={PAGINATION}
          dataSource={[...skill.versions]}
          columns={[
            { title: t("skillVersion"), dataIndex: "version", key: "version" },
            {
              title: t("status"),
              key: "state",
              render: (_, item) => (
                <Tag color={item.state === "published" ? "green" : item.state === "draft" ? "gold" : "default"}>
                  {t(versionStateLabel(item.state))}
                </Tag>
              ),
            },
            {
              title: rc.versionSize,
              key: "size",
              render: (_, item) => `${item.size} ${t("bytes")}`,
            },
            {
              title: rc.versionSha,
              key: "sha256",
              render: (_, item) => (
                <Typography.Text copyable={{ text: item.sha256 }} style={{ fontSize: 12 }}>
                  {`${item.sha256.slice(0, 12)}…`}
                </Typography.Text>
              ),
            },
            {
              title: rc.versionCreatedAt,
              key: "createdAt",
              render: (_, item) => (item.createdAt ? formatTimestamp(item.createdAt) || <UnknownText /> : <UnknownText />),
            },
            ...(canWrite
              ? [
                  {
                    title: t("actions"),
                    key: "actions",
                    align: "right" as const,
                    render: (_: unknown, item: AdminSkillVersion) => (
                      <Space size={0} wrap>
                        {item.state === "draft" ? (
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
                          title={t("withdrawVersionTitle")}
                          description={t("withdrawVersionDescription")}
                          okText={t("confirmWithdrawVersion")}
                          cancelText={t("cancel")}
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
  existingSkillIds,
  skill,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly existingSkillIds: readonly string[];
  readonly skill: AdminSkill | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(skill);
  const [form] = Form.useForm();
  const [pending, setPending] = useState(false);
  const submit = async (values: { id?: string; name: string; description?: string; enabled?: boolean }) => {
    const normalizedId = (values.id ?? "").trim();
    if (!skill && existingSkillIds.includes(normalizedId)) {
      form.setFields([{ name: "id", errors: [t("skillIdAlreadyExists")] }]);
      return;
    }
    setPending(true);
    try {
      if (skill)
        await client.updateSkill(skill.id, {
          name: values.name.trim(),
          description: (values.description ?? "").trim(),
          enabled: values.enabled !== false,
        });
      else
        await client.createSkill({
          id: normalizedId,
          name: values.name.trim(),
          description: (values.description ?? "").trim(),
        });
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t("changesSaved"));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t(editing ? "skillEditTitle" : "skillEditorTitle")}
      okText={t("save")}
      cancelText={t("cancel")}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t("skillEditorDescription")}</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          id: skill?.id ?? "",
          name: skill?.name ?? "",
          description: skill?.description ?? "",
          enabled: skill?.enabled !== false,
        }}
        onFinish={submit}
      >
        {editing ? null : (
          <Form.Item
            name="id"
            label={t("skillId")}
            extra={t("rbacIdHint")}
            rules={[
              { required: true, whitespace: true, message: t("fieldRequired") },
              { pattern: RBAC_ID_PATTERN, message: t("rbacIdHint") },
            ]}
          >
            <Input disabled={pending} />
          </Form.Item>
        )}
        <Form.Item name="name" label={t("skillName")} rules={[{ required: true, whitespace: true, message: t("nameRequired") }]}>
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item name="description" label={t("description")}>
          <Input.TextArea rows={2} placeholder={t("descriptionPlaceholder")} disabled={pending} />
        </Form.Item>
        {editing ? (
          <Form.Item name="enabled" label={t("status")} valuePropName="checked">
            <Switch disabled={pending} checkedChildren={t("enabled")} unCheckedChildren={t("disabled")} />
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
        const separator = subjectKey.indexOf(":");
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
      notify(AdminNotificationKind.Success, t("changesSaved"));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t("grantSkillTitle")}
      okText={t("grant")}
      cancelText={t("cancel")}
      confirmLoading={pending}
      okButtonProps={{ disabled: !skillId || selected.size === 0 }}
      mask={{ closable: false }}
      onOk={() => void submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t("grantSkillDescription")}</Typography.Paragraph>
      {failed ? (
        <Alert
          type="error"
          showIcon
          title={t("grantFailed")}
          description={
            failedSubjects.length > 0 ? `${t("grantFailedSubjects")}: ${failedSubjects.join(", ")}` : undefined
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Typography.Text strong>{t("selectSkill")}</Typography.Text>
          <Select
            aria-label={t("selectSkill")}
            value={skillId}
            onChange={(value) => setSkillId(value)}
            disabled={pending || Boolean(presetSkillId)}
            placeholder={t("selectSkill")}
            style={{ width: "100%", marginTop: 8 }}
            options={skills.map((skill) => ({
              value: skill.id,
              label: skill.enabled ? skill.name : `${skill.name}（${t("disabled")}）`,
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

function AssignmentsSection({
  client,
  resources,
  canWrite,
  loading,
  onRefresh,
  onChanged,
  onError,
}: SectionProps) {
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
                {t("grantSkill")}
              </Button>
            ) : null}
            <RefreshButton loading={loading} onRefresh={onRefresh} />
          </>
        }
      />
      {resources.assignments.length === 0 ? (
        <Empty description={t("assignmentsEmpty")}>
          <Space orientation="vertical" size={12}>
            <Typography.Text type="secondary">{t("assignmentsEmptyHint")}</Typography.Text>
            {canWrite ? (
              <Button type="primary" icon={<KeyOutlined />} onClick={() => setGrantOpen(true)}>
                {t("grantSkill")}
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
              title: t("skill"),
              key: "skill",
              render: (_, assignment) => skillNames.get(assignment.skillId) || assignment.skillId,
            },
            {
              title: rc.assignmentSubject,
              key: "subject",
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
                    title: t("actions"),
                    key: "actions",
                    align: "right" as const,
                    render: (_: unknown, assignment: AdminSkillAssignment) => (
                      <Popconfirm
                        title={t("revokeConfirmTitle")}
                        description={t("revokeConfirmDescription")}
                        okText={t("confirmRevoke")}
                        cancelText={t("cancel")}
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
  subjectType = "all",
  searchQuery = "",
}: {
  readonly users: readonly PlatformUser[];
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly excluded?: ReadonlySet<string>;
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly disabled: boolean;
  readonly subjectType?: "all" | "user" | "role" | "team";
  readonly searchQuery?: string;
}) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const options = [
    ...users.map((user) => ({
      key: `${AdminSubjectType.User}:${user.id}`,
      label: user.displayName,
      description: user.username,
      type: t("user"),
      subjectType: AdminSubjectType.User as AdminSubjectType,
    })),
    ...roles.map((role) => ({
      key: `${AdminSubjectType.Role}:${role.id}`,
      label: role.name,
      description: role.id,
      type: t("role"),
      subjectType: AdminSubjectType.Role as AdminSubjectType,
    })),
    ...teams.map((team) => ({
      key: `${AdminSubjectType.Team}:${team.id}`,
      label: team.name,
      description: team.id,
      type: t("team"),
      subjectType: AdminSubjectType.Team as AdminSubjectType,
    })),
  ].filter((option) => {
    if (excluded.has(option.key)) return false;
    if (subjectType !== "all" && option.subjectType !== subjectType) return false;
    if (!normalizedQuery) return true;
    return `${option.label} ${option.description} ${option.key}`.toLocaleLowerCase().includes(normalizedQuery);
  });
  return (
    <div>
      <Typography.Text strong>{t("selectSubjects")}</Typography.Text>
      <div
        role="group"
        aria-label={t("selectSubjects")}
        style={{
          marginTop: 8,
          maxHeight: 240,
          overflowY: "auto",
          border: "1px solid rgba(128, 128, 128, 0.35)",
          borderRadius: 8,
          padding: 4,
        }}
      >
        {options.length === 0 ? (
          <Typography.Text type="secondary" style={{ display: "block", padding: "12px 8px" }}>
            {t("noMatchingSubjects")}
          </Typography.Text>
        ) : (
          options.map((option) => (
            <Checkbox
              key={option.key}
              checked={selected.has(option.key)}
              onChange={() => onToggle(option.key)}
              disabled={disabled}
              style={{ display: "flex", marginInlineStart: 0, padding: "6px 8px", alignItems: "flex-start" }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {option.label}{" "}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    ({option.type})
                  </Typography.Text>
                </span>
                <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                  {option.description}
                </Typography.Text>
              </span>
            </Checkbox>
          ))
        )}
      </div>
      <Space size={8} style={{ marginTop: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t("selectedSubjectsLabel")}
        </Typography.Text>
        <Badge count={selected.size} showZero color="geekblue" />
      </Space>
    </div>
  );
}

function versionStateLabel(state: AdminSkillVersion["state"]): AdminTranslationKey {
  if (state === "published") return "versionPublished";
  if (state === "withdrawn") return "versionWithdrawn";
  return "versionDraft";
}
