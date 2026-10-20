import type { PlatformUser } from '@aep/sdk-node';
import { DeleteOutlined, DownOutlined, KeyOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Dropdown,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Table,
  type TableProps,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useMemo, useState } from 'react';
import type { AdminIdentity } from './client.js';
import { ListQueryActions } from './components/ListQueryActions.js';
import { effectiveRoleIds } from './resources-access.js';
import { resourcesCopy as rc } from './resources-copy.js';
import {
  type AdminUser,
  EnabledBadge,
  type ModelResources,
  NameCell,
  PAGINATION,
  RefreshButton,
  SectionHeader,
  type SectionProps,
  t,
  UnknownText,
  type UserListFilters,
  useMutationRunner,
} from './resources-shared.js';
import { UserDetailDrawer } from './resources-user-detail.js';
import { DisableUserModal } from './resources-user-disable.js';
import { UserEditorModal } from './resources-user-editor.js';
import { UserImportModal } from './resources-user-import.js';
import { PasswordResetModal, SelfPasswordChangeModal } from './resources-user-passwords.js';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export function UsersSection({
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
      if (filters.roleId && !effectiveRoleIds(user, resources).includes(filters.roleId)) return false;
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
        effectiveRoleIds(user, resources).length > 0 ? (
          <Space size={4} wrap>
            {effectiveRoleIds(user, resources).map((id) => (
              <Tag key={id}>
                {roleNames.get(id) ?? id}
                {!(user.roleIds ?? []).includes(id) ? ` · ${t('teamInheritedRole')}` : ''}
              </Tag>
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
