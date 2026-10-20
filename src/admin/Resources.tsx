import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from 'antd';
import { useCallback, useState } from 'react';
import {
  type AdminConsoleClient,
  type AdminIdentity,
  AdminPermission,
  type AdminResources,
  hasAdminPermission,
} from './client.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { PortalClient } from './portal.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { RolesSection } from './resources-roles.js';
import { AdminResourceTab, type ModelResources, sectionTitle, t } from './resources-shared.js';
import { AssignmentsSection } from './resources-skill-grants.js';
import { SkillsSection } from './resources-skills.js';
import { TeamsSection } from './resources-teams.js';
import { UsersSection } from './resources-users.js';

export interface ResourcesProps {
  readonly client: AdminConsoleClient;
  readonly tab: AdminResourceTab;
  readonly identity?: AdminIdentity | undefined;
  /** Test seam: injected portal client (defaults to a bearer client). */
  readonly portal?: PortalClient | undefined;
}

/** 2026-09-30 LiXiang2019 首屏加载占位资源，用于先渲染页面结构再等接口返回 */
export const EMPTY_RESOURCES: AdminResources = {
  users: [],
  teams: [],
  roles: [],
  permissions: [],
  skills: [],
  assignments: [],
};

export function Resources({ client, tab, identity, portal }: ResourcesProps) {
  const createPortal = () => portal ?? new PortalClient((token) => client.getAccessToken(token));
  const [resolvedPortal] = useState(createPortal);
  const canQueryModels =
    hasAdminPermission(identity, AdminPermission.ModelsRead) && typeof client.models === 'function';
  const resourcesKey = ['admin', 'resources', identity?.user.id ?? null, canQueryModels] as const;
  const queryClient = useQueryClient();
  const resourcesQuery = useQuery({
    queryKey: resourcesKey,
    queryFn: async () => {
      const [next, models] = await Promise.all([
        client.resources(identity),
        canQueryModels ? client.models(identity) : Promise.resolve({ models: [], assignments: [] }),
      ]);
      return {
        resources: next,
        modelResources: {
          ...models,
          available: canQueryModels && hasAdminPermission(identity, AdminPermission.ModelsAssign),
          skillsAvailable:
            hasAdminPermission(identity, AdminPermission.SkillsRead) &&
            hasAdminPermission(identity, AdminPermission.SkillsAssign),
        } satisfies ModelResources,
      };
    },
  });
  const resources = resourcesQuery.data?.resources ?? null;
  const modelResources: ModelResources = resourcesQuery.data?.modelResources ?? {
    models: [],
    assignments: [],
    available: false,
    skillsAvailable: false,
  };
  const loading = resourcesQuery.isFetching;
  const error = resourcesQuery.isError;
  const load = async () => {
    await queryClient.invalidateQueries({ queryKey: resourcesKey });
  };
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
export { AdminResourceTab } from './resources-shared.js';
export { SubjectCell, SubjectMultiPicker } from './resources-subjects.js';
