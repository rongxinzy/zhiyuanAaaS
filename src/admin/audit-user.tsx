/**
 * 审计页的「用户」口径与共享用户目录。
 *
 * 五个页签统一：列名「用户」，主行用户名、次行用户 ID；目录里查不到（已删除、改名或
 * 目录不可用）只显示用户 ID，主行不留白、不编造。检索以用户名为准，同时接受用户 ID。
 */
import type { PlatformUser } from '@aep/sdk-node';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Space, Typography } from 'antd';
import { useCallback } from 'react';
import { auditCopy as c } from './audit-copy.js';
import type { AdminConsoleClient } from './client.js';

/** 共享用户目录：`users` 为 null 表示还没拿到（无权限、离线或仍在加载）。 */
export type AuditDirectory = {
  readonly users: readonly PlatformUser[] | null;
  readonly load: () => Promise<readonly PlatformUser[] | null>;
};

/** 平台用户 ID 是 UUID；该形态可直接查询，其余输入必须先解析成用户，不能当 ID 发出去。 */
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuditActor =
  | { readonly userId: string }
  | { readonly problem: 'notFound' | 'ambiguous' | 'unverified'; readonly name: string };

const actorProblemCopy = {
  notFound: c.actorNotFound,
  ambiguous: c.actorAmbiguous,
  unverified: c.actorLookupFailed,
} as const;

const userDirectoryKey = ['admin', 'audit', 'user-directory'] as const;

/**
 * 用户目录只在页面级拉一次，姓名解析与用户列显示共用。
 * `enabled` 为假（没有审计权限）时一次都不发；失败后不缓存，下次查询再试。
 */
export function useUserDirectory(client: AdminConsoleClient, enabled: boolean): AuditDirectory {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: userDirectoryKey,
    queryFn: () => client.users(),
    enabled,
  });
  const load = useCallback(async (): Promise<readonly PlatformUser[] | null> => {
    if (!enabled) return null;
    return queryClient.ensureQueryData({ queryKey: userDirectoryKey, queryFn: () => client.users() });
  }, [client, enabled, queryClient]);
  // 目录取不到（无权限或离线）不影响审计查询，用户列如实按 ID 显示。
  return { users: data ?? null, load };
}

/**
 * 用户检索：主键是用户名，其次接受用户 ID，显示名称只在唯一命中时接受；
 * 解析不出来返回问题，绝不把姓名当 ID 发出去。UUID 由调用方直接透传，不走目录。
 */
function resolveAuditActor(input: string, users: readonly PlatformUser[] | null): AuditActor {
  const name = input.trim();
  if (users === null) return { problem: 'unverified', name };
  const byUsername = users.filter((user) => user.username === name);
  const byId = byUsername.length > 0 ? byUsername : users.filter((user) => user.id === name);
  const matches = byId.length > 0 ? byId : users.filter((user) => user.displayName === name);
  const [match] = matches;
  if (!match) return { problem: 'notFound', name };
  if (matches.length > 1) return { problem: 'ambiguous', name };
  return { userId: match.id };
}

/** 检索框里的用户输入解析成服务端参数；没填返回 null。 */
export async function resolveActorFilter(
  input: string | undefined,
  directory: AuditDirectory,
): Promise<AuditActor | null> {
  const name = input?.trim();
  if (!name) return null;
  if (userIdPattern.test(name)) return { userId: name };
  let users = directory.users;
  if (users === null) {
    try {
      users = await directory.load();
    } catch {
      users = null;
    }
  }
  return resolveAuditActor(name, users);
}

/** 解析失败时给用户的提示：只提示，不发请求。 */
export function actorProblemText(problem: keyof typeof actorProblemCopy, name: string): string {
  return actorProblemCopy[problem].replace('{name}', name);
}

/** 用户标签：目录里查得到就用用户名，查不到（已删除或目录不可用）如实回落用户 ID。 */
export function userLabel(users: readonly PlatformUser[] | null, userId: string): string {
  return users?.find((user) => user.id === userId)?.username || userId;
}

/** 「用户」列：主行用户名，次行用户 ID；查不到的用户只显示用户 ID。 */
export function UserCell({
  userId,
  users,
}: {
  readonly userId?: string | undefined;
  readonly users: readonly PlatformUser[] | null;
}) {
  if (!userId) return <>{c.unknown}</>;
  const username = users?.find((user) => user.id === userId)?.username;
  if (!username) return <>{userId}</>;
  return (
    <Space orientation="vertical" size={0}>
      <span>{username}</span>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {userId}
      </Typography.Text>
    </Space>
  );
}
