import type { Permission } from '@aep/sdk-node';
import { FolderOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Empty, Tree, type TreeDataNode, Typography } from 'antd';
import { type AdminLanguage, type AdminTranslationKey, translate } from '../i18n.js';

const groupLabels: Readonly<Record<string, AdminTranslationKey>> = {
  users: 'permissionGroupUsers',
  roles: 'permissionGroupRoles',
  teams: 'permissionGroupTeams',
  models: 'permissionGroupModels',
  skills: 'permissionGroupSkills',
  credentials: 'permissionGroupCredentials',
  events: 'permissionGroupEvents',
  licenses: 'permissionGroupLicenses',
  audit: 'permissionGroupAudit',
  data_plane: 'permissionGroupDataPlane',
  data_scope: 'permissionGroupDataScope',
  identity: 'permissionGroupIdentity',
  sessions: 'permissionGroupSessions',
  deployment: 'permissionGroupDeployment',
  agents: 'permissionGroupAgents',
};

// Encode each node kind separately so catalog IDs can never collide with a folder key.
const leafKey = (id: string) => JSON.stringify(['permission', id]);

const permissionLabels: Readonly<Record<string, AdminTranslationKey>> = {
  'users.read': 'permissionNameUsersRead',
  'users.write': 'permissionNameUsersWrite',
  'roles.read': 'permissionNameRolesRead',
  'roles.write': 'permissionNameRolesWrite',
  'teams.read': 'permissionNameTeamsRead',
  'teams.write': 'permissionNameTeamsWrite',
  'models.read': 'permissionNameModelsRead',
  'models.write': 'permissionNameModelsWrite',
  'models.assign': 'permissionNameModelsAssign',
  'skills.read': 'permissionNameSkillsRead',
  'skills.write': 'permissionNameSkillsWrite',
  'skills.assign': 'permissionNameSkillsAssign',
  'credentials.read': 'permissionNameCredentialsRead',
  'credentials.write': 'permissionNameCredentialsWrite',
  'credentials.assign': 'permissionNameCredentialsAssign',
  'events.read': 'permissionNameEventsRead',
  'events.write': 'permissionNameEventsWrite',
  'licenses.read': 'permissionNameLicensesRead',
  'licenses.write': 'permissionNameLicensesWrite',
  'licenses.revoke': 'permissionNameLicensesRevoke',
  'audit.read': 'permissionNameAuditRead',
  'data_plane.write': 'permissionNameDataPlaneWrite',
  'data_scope.read': 'permissionNameDataScopeRead',
  'data_scope.write': 'permissionNameDataScopeWrite',
  'identity.read': 'permissionNameIdentityRead',
  'identity.write': 'permissionNameIdentityWrite',
  'sessions.write': 'permissionNameSessionsWrite',
  'deployment.read': 'permissionNameDeploymentRead',
  'deployment.write': 'permissionNameDeploymentWrite',
  'agents.read': 'permissionNameAgentsRead',
  'agents.invoke': 'permissionNameAgentsInvoke',
  'agents.write': 'permissionNameAgentsWrite',
};

export function PermissionTree({
  permissions,
  existingPermissions = [],
  value = [],
  onChange,
  disabled = false,
  language = 'zh',
  id,
}: {
  readonly permissions: readonly Permission[];
  readonly existingPermissions?: readonly string[];
  readonly value?: readonly string[];
  readonly onChange?: (value: string[]) => void;
  readonly disabled?: boolean;
  readonly language?: AdminLanguage;
  readonly id?: string;
}) {
  const t = (key: AdminTranslationKey) => translate(language, key);
  const catalog = new Map(permissions.map((permission) => [permission.id, permission]));
  const catalogIds = new Set(catalog.keys());
  // An incomplete/newer catalog must not silently drop permissions already on the role.
  for (const permissionId of existingPermissions) {
    if (!catalog.has(permissionId))
      catalog.set(permissionId, { id: permissionId, description: t('permissionNotInCatalog') });
  }
  const groups = new Map<string, TreeDataNode[]>();
  const leafIds = new Map<string, string>();
  for (const permission of catalog.values()) {
    const group = permission.id.includes('.') ? permission.id.split('.')[0]! : '';
    const children = groups.get(group) ?? [];
    const key = leafKey(permission.id);
    leafIds.set(key, permission.id);
    children.push({
      key,
      icon: <SafetyCertificateOutlined aria-hidden />,
      title: (
        <span className="admin-permission-label">
          <span>
            {t(
              Object.hasOwn(permissionLabels, permission.id)
                ? permissionLabels[permission.id]!
                : 'permissionNameUnknown',
            )}
          </span>
          <Typography.Text type="secondary">{permission.id}</Typography.Text>
          {!catalogIds.has(permission.id) ? (
            <Typography.Text type="secondary">{t('permissionNotInCatalog')}</Typography.Text>
          ) : null}
        </span>
      ),
    });
    groups.set(group, children);
  }
  const treeData: TreeDataNode[] = [
    {
      key: JSON.stringify(['all']),
      title: t('permissionAll'),
      icon: <FolderOutlined />,
      children: [...groups].map(([group, children]) => ({
        key: JSON.stringify(['group', group]),
        title: Object.hasOwn(groupLabels, group) ? t(groupLabels[group]!) : t('permissionGroupOther'),
        icon: <FolderOutlined />,
        children,
      })),
    },
  ];
  return (
    <section id={id} className="admin-permission-tree" aria-label={t('permissions')}>
      {catalog.size ? (
        <Tree
          aria-label={t('permissions')}
          checkable
          showIcon
          selectable={false}
          defaultExpandAll
          disabled={disabled}
          checkedKeys={value.map(leafKey)}
          treeData={treeData}
          onCheck={(keys) => {
            const checked = Array.isArray(keys) ? keys : keys.checked;
            onChange?.(
              checked.flatMap((key) => {
                const permissionId = leafIds.get(String(key));
                return permissionId === undefined ? [] : [permissionId];
              }),
            );
          }}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('permissionCatalogEmpty')} />
      )}
    </section>
  );
}
