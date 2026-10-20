import type { PlatformUser } from '@aep/sdk-node';
import { EditOutlined } from '@ant-design/icons';
import { Button, Drawer, Empty, Modal, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { AdminResources, AdminTeam as Team } from './client.js';
import { AccessTable, buildAccessRows, teamSubjects } from './resources-access.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { EnabledBadge, type ModelResources, NameCell, PAGINATION, t, UnknownText } from './resources-shared.js';

export function TeamDetailDrawer({
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
    subjects: teamSubjects(team, resources),
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
                <Typography.Text strong>{t('teamDefaultRoles')}</Typography.Text>
                <Space wrap>
                  {(team.defaultRoleIds ?? []).length ? (
                    team.defaultRoleIds?.map((id) => <Tag key={id}>{roleNames.get(id) ?? id}</Tag>)
                  ) : (
                    <Typography.Text type="secondary">{t('teamDefaultRolesEmpty')}</Typography.Text>
                  )}
                </Space>
                <Typography.Text type="secondary">{t('teamDefaultRolesHint')}</Typography.Text>
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

export function teamEmployeesCount(teamId: string, resources: AdminResources): number {
  return resources.users.filter((user) => (user.teamIds ?? []).includes(teamId)).length;
}

export function TeamEmployeesModal({
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
