import type { Role } from '@aep/sdk-node';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Form, Input, Popconfirm, Space, Table, type TableProps, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { ListQueryActions } from './components/ListQueryActions.js';
import { buildAccessRows, effectiveRoleIds, ResourceAccessTags } from './resources-access.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { RoleDetailDrawer, RoleMembersModal } from './resources-role-detail.js';
import { RoleEditorModal } from './resources-role-editor.js';
import {
  EnabledBadge,
  type ModelResources,
  NameCell,
  type NameListFilters,
  PAGINATION,
  RefreshButton,
  SectionHeader,
  type SectionProps,
  t,
  useMutationRunner,
} from './resources-shared.js';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
export function RolesSection({
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
    resources.users.filter((user) => effectiveRoleIds(user, resources).includes(roleId)).length;
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
