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
import { AdminResourceTab, type ModelResources, resourcesAvailable, sectionTitle, t } from './resources-shared.js';
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
  const resourcesKey = ['admin', 'resources', identity, tab] as const;
  const queryClient = useQueryClient();
  const resourcesQuery = useQuery({
    queryKey: resourcesKey,
    queryFn: () => client.resources(identity, tab),
  });
  const modelsKey = ['admin', 'resource-model-access', identity] as const;
  const modelsQuery = useQuery({
    queryKey: modelsKey,
    queryFn: () => client.models(identity),
    enabled: canQueryModels,
  });
  const resources = resourcesQuery.data ?? null;
  const modelResources: ModelResources = {
    models: modelsQuery.data?.models ?? [],
    assignments: modelsQuery.data?.assignments ?? [],
    available:
      canQueryModels &&
      modelsQuery.isSuccess &&
      hasAdminPermission(identity, AdminPermission.ModelsAssign) &&
      (!resources || resourcesAvailable(resources, 'roles', 'teams')),
    skillsAvailable:
      hasAdminPermission(identity, AdminPermission.SkillsRead) &&
      hasAdminPermission(identity, AdminPermission.SkillsAssign) &&
      Boolean(resources && resourcesAvailable(resources, 'skills', 'assignments', 'roles', 'teams')),
  };
  const loading = resourcesQuery.isFetching;
  const error = resourcesQuery.isError;
  const load = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: resourcesKey }),
      queryClient.invalidateQueries({ queryKey: modelsKey }),
    ]);
  };
  const reportError = useCallback(() => {
    notify(AdminNotificationKind.Error, t('operationUnavailable'));
  }, []);
  const dependenciesAvailable = !resources
    ? !error
    : tab === AdminResourceTab.Users
      ? resourcesAvailable(resources, 'roles', 'teams')
      : tab === AdminResourceTab.Teams
        ? resourcesAvailable(resources, 'roles')
        : tab === AdminResourceTab.Roles
          ? resourcesAvailable(resources, 'permissions')
          : tab === AdminResourceTab.Assignments
            ? resourcesAvailable(resources, 'users', 'teams', 'roles', 'skills')
            : true;
  const canMutate =
    dependenciesAvailable &&
    (tab === AdminResourceTab.Users
      ? hasAdminPermission(identity, AdminPermission.UsersWrite)
      : tab === AdminResourceTab.Teams
        ? hasAdminPermission(identity, AdminPermission.TeamsWrite)
        : tab === AdminResourceTab.Roles
          ? hasAdminPermission(identity, AdminPermission.RolesWrite)
          : tab === AdminResourceTab.Skills
            ? hasAdminPermission(identity, AdminPermission.SkillsWrite)
            : hasAdminPermission(identity, AdminPermission.SkillsAssign));
  // 2026-09-30 LiXiang2019 加载中保留页头与表格结构；无缓存且失败时不展示空成功态
  const view = resources ?? (loading && !error ? EMPTY_RESOURCES : null);

  return (
    <section aria-label={sectionTitle(tab)}>
      {modelsQuery.isError || resources?.unavailable?.length ? (
        <Alert
          type="warning"
          showIcon
          title={t('resourceAuxiliaryFailed')}
          description={t('resourceAuxiliaryFailedHint')}
          action={
            <Button size="small" onClick={() => void load()}>
              {rc.retry}
            </Button>
          }
        />
      ) : null}
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
              canAssign={
                hasAdminPermission(identity, AdminPermission.SkillsAssign) &&
                Boolean(resources && resourcesAvailable(resources, 'users', 'teams', 'roles'))
              }
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
