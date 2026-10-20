import { PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Form, Input, Popconfirm, Space, Table, type TableProps, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { AdminTeam as Team } from './client.js';
import { ListQueryActions } from './components/ListQueryActions.js';
import { buildAccessRows, ResourceAccessTags, teamSubjects } from './resources-access.js';
import { resourcesCopy as rc } from './resources-copy.js';
import {
  EnabledBadge,
  type ModelResources,
  NameCell,
  type NameListFilters,
  PAGINATION,
  RefreshButton,
  resourcesAvailable,
  SectionHeader,
  type SectionProps,
  t,
  UnknownText,
  useMutationRunner,
} from './resources-shared.js';
import { TeamDetailDrawer, TeamEmployeesModal, teamEmployeesCount } from './resources-team-detail.js';
import { TeamEditorModal } from './resources-team-editor.js';

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
export function TeamsSection({
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
      render: () => <UnknownText>{t('teamOwnerUnsupported')}</UnknownText>,
    },
    { title: rc.memberCount, dataIndex: 'memberCount', key: 'memberCount', width: 100 },
    {
      title: t('teamDefaultRoles'),
      key: 'defaultRoles',
      render: (_, team) => (
        <Space wrap>
          {(team.defaultRoleIds ?? []).length ? (
            team.defaultRoleIds?.map((id) => (
              <Tag key={id}>{resources.roles.find((role) => role.id === id)?.name ?? id}</Tag>
            ))
          ) : (
            <Typography.Text type="secondary">{t('teamDefaultRolesEmpty')}</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: t('teamEmployees'),
      key: 'employees',
      width: 140,
      render: (_, team) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0 }}
          disabled={!resourcesAvailable(resources, 'users')}
          onClick={() => setEmployeesTeamId(team.id)}
        >
          {resourcesAvailable(resources, 'users')
            ? teamEmployeesCount(team.id, resources)
            : t('resourceAssociationUnavailable')}
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
            subjects: teamSubjects(team, resources),
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
        scroll={{ x: 'max-content' }}
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
          roles={resources.roles}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onChanged={onChanged}
          onError={onError}
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
