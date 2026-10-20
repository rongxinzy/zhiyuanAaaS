import { EditOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Drawer, Space, Tabs, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { AdminConsoleClient, AdminIdentity, AdminResources } from './client.js';
import { formatTimestamp } from './format.js';
import { AccessTable, buildAccessRows, effectiveRoleIds, userSubjects } from './resources-access.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { type AdminUser, EnabledBadge, type ModelResources, t, UnknownText } from './resources-shared.js';
import { UserAccountLinks, UserLoginSessions } from './resources-user-identity.js';
import { AdjustOrgModal } from './resources-user-organization.js';

// ---------------------------------------------------------------------------
// User detail drawer
// ---------------------------------------------------------------------------
export function UserDetailDrawer({
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
  const userRoles = effectiveRoleIds(user, resources)
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
