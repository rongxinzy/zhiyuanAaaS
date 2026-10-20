import type { PlatformUser, Role } from '@aep/sdk-node';
import { EditOutlined } from '@ant-design/icons';
import { Button, Drawer, Empty, Modal, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { AdminResources } from './client.js';
import { effectiveRoleIds } from './resources-access.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { EnabledBadge, NameCell, PAGINATION, t, UnknownText } from './resources-shared.js';

export function RoleMembersModal({
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
  const members = role ? resources.users.filter((user) => effectiveRoleIds(user, resources).includes(role.id)) : [];
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

export function RoleDetailDrawer({
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
  const subjects = resources.users.filter((user) => effectiveRoleIds(user, resources).includes(role.id));
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
