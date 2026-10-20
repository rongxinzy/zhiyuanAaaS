import { type AdminModel, AepProblem, type ModelAssignment, type PlatformUser } from '@aep/sdk-node';
import { InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Badge, Button, Space, Typography } from 'antd';
import { type ReactNode, useCallback, useState } from 'react';
import { type AdminConsoleClient, AdminRequestError, type AdminResources } from './client.js';
import { type AdminLanguage, type AdminTranslationKey, translate } from './i18n.js';
import { resourcesCopy as rc } from './resources-copy.js';

const language: AdminLanguage = 'zh';

export const t = (key: AdminTranslationKey) => translate(language, key);

export function resourcesAvailable(
  resources: AdminResources,
  ...collections: NonNullable<AdminResources['unavailable']>
): boolean {
  return !collections.some((collection) => resources.unavailable?.includes(collection));
}

export const PASSWORD_MIN_LENGTH = 6;

export const PASSWORD_MAX_LENGTH = 1024;

// New passwords reject edge whitespace; the prompt names the cause instead of
// silently trimming a secret the operator may have pasted deliberately.
export const edgeWhitespaceRule = {
  validator: (_: unknown, value: string) =>
    !value || value === value.trim() ? Promise.resolve() : Promise.reject(new Error(t('passwordEdgeWhitespace'))),
};

export type AdminUser = PlatformUser & { readonly email?: string | null };

/** 2026-09-30 LiXiang2019 用户列表筛选表单字段 */
export interface UserListFilters {
  readonly query?: string;
  readonly teamId?: string;
  readonly roleId?: string;
  readonly status?: 'active' | 'disabled';
}

/** 2026-09-30 LiXiang2019 团队/角色列表按名称筛选字段 */
export interface NameListFilters {
  readonly query?: string;
}

export const AdminResourceTab = {
  Users: 'users',
  Teams: 'teams',
  Roles: 'roles',
  Skills: 'skills',
  Assignments: 'assignments',
} as const;

export type AdminResourceTab = (typeof AdminResourceTab)[keyof typeof AdminResourceTab];

export const PAGINATION = { pageSize: 10, hideOnSinglePage: true, showSizeChanger: false, align: 'center' } as const;

export function sectionTitle(tab: AdminResourceTab): string {
  if (tab === AdminResourceTab.Users) return rc.pageUsers;
  if (tab === AdminResourceTab.Teams) return rc.pageTeams;
  if (tab === AdminResourceTab.Roles) return rc.pageRoles;
  if (tab === AdminResourceTab.Skills) return rc.pageSkills;
  return rc.pageAssignments;
}

export function SectionHeader({
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
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      <div>
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary">
          <InfoCircleOutlined style={{ marginInlineEnd: 6 }} />
          {description}
        </Typography.Text>
      </div>
      {extra ? <Space wrap>{extra}</Space> : null}
    </div>
  );
}

export function RefreshButton({
  loading,
  onRefresh,
}: {
  readonly loading: boolean;
  readonly onRefresh: () => Promise<void>;
}) {
  return (
    <Button
      icon={<ReloadOutlined />}
      aria-label={t('refresh')}
      title={t('refresh')}
      loading={loading}
      onClick={() => void onRefresh()}
    />
  );
}

export function UnknownText({ children }: { readonly children?: string }) {
  return <Typography.Text type="secondary">{children ?? rc.valueUnknown}</Typography.Text>;
}

export function EnabledBadge({ enabled }: { readonly enabled: boolean }) {
  return <Badge status={enabled ? 'success' : 'default'} text={enabled ? rc.statusEnabled : rc.statusDisabled} />;
}

export function NameCell({ name, detail }: { readonly name: string; readonly detail: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div>{name}</div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {detail}
      </Typography.Text>
    </div>
  );
}

export type MutationRunner = (operation: () => Promise<void>) => Promise<void>;

// The console talks to two client layers. Skill packages go through the
// generated SDK, which throws AepProblem; the handwritten request path (used by
// Skill deletion, for example) throws AdminRequestError. Read the code off
// either, so a refusal is named instead of collapsing into one generic notice.
export function problemCode(error: unknown): string | null {
  if (error instanceof AepProblem || error instanceof AdminRequestError) return error.code;
  return null;
}

// Each action names only the refusals it can actually produce. A missing version
// means the version is gone when publishing, but a missing Skill when uploading,
// so the upload list deliberately omits RESOURCE_NOT_FOUND.
export const uploadFailureCopy: Record<string, AdminTranslationKey> = {
  INVALID_SKILL_PACKAGE: 'skillPackageInvalid',
  PACKAGE_TOO_LARGE: 'skillPackageTooLarge',
  INVALID_SKILL_VERSION: 'skillVersionInvalid',
};

export const publishFailureCopy: Record<string, AdminTranslationKey> = {
  INVALID_SKILL_VERSION: 'skillVersionInvalid',
  RESOURCE_NOT_FOUND: 'skillVersionGone',
};

export function useMutationRunner(onChanged: () => Promise<void>, onError: () => void) {
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

export interface SectionProps {
  readonly client: AdminConsoleClient;
  readonly resources: AdminResources;
  readonly canWrite: boolean;
  readonly loading: boolean;
  readonly onRefresh: () => Promise<void>;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}

export interface ModelResources {
  readonly models: readonly AdminModel[];
  readonly assignments: readonly ModelAssignment[];
  readonly available: boolean;
  readonly skillsAvailable: boolean;
}
