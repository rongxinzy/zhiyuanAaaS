import type { AdminAuditTimeRange } from './client-directory-types.js';
import type {
  AdminSessionClient,
  AdminSkill,
  AdminSkillAssignment,
  AdminSkillInstallations,
  AdminSkillVersion,
  AdminUserSession,
} from './client-resource-types.js';
import { arrayFrom, isRecord, nonEmptyString, valueString } from './client-values.js';

export function listCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown[] }).items)) {
    return (value as { items: unknown[] }).items.length;
  }
  if (value && typeof value === 'object' && Array.isArray((value as { models?: unknown[] }).models)) {
    return (value as { models: unknown[] }).models.length;
  }
  if (value && typeof value === 'object' && Array.isArray((value as { skills?: unknown[] }).skills)) {
    return (value as { skills: unknown[] }).skills.length;
  }
  return 0;
}

export function parseSkillInstallations(value: unknown): AdminSkillInstallations {
  const record = isRecord(value) ? value : {};
  const summary = isRecord(record.summary) ? record.summary : {};
  const count = (key: string): number => (typeof summary[key] === 'number' ? (summary[key] as number) : 0);
  const items = Array.isArray(record.items)
    ? record.items.flatMap((item) => {
        if (!isRecord(item)) return [];
        const userId = nonEmptyString(item.userId);
        const state =
          item.state === 'missing' || item.state === 'unreported' ? (item.state as 'missing' | 'unreported') : null;
        if (!userId || !state) return [];
        const revision = nonEmptyString(item.revision);
        const reportedAt = nonEmptyString(item.reportedAt);
        const itemStatus = nonEmptyString(item.itemStatus);
        return [
          {
            userId,
            state,
            ...(revision ? { revision } : {}),
            ...(reportedAt ? { reportedAt } : {}),
            ...(itemStatus ? { itemStatus } : {}),
          },
        ];
      })
    : [];
  return {
    skillId: nonEmptyString(record.skillId) ?? '',
    summary: {
      granted: count('granted'),
      reported: count('reported'),
      installed: count('installed'),
      missing: count('missing'),
      unreported: count('unreported'),
      latestReportedAt: nonEmptyString(summary.latestReportedAt) ?? null,
    },
    items,
    truncated: record.truncated === true,
  };
}

export function parseSkills(value: unknown): AdminSkill[] {
  const items = arrayFrom(value, 'skills');
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.name !== 'string') return [];
    const versions = Array.isArray(record.versions)
      ? record.versions.flatMap((version) => {
          if (!version || typeof version !== 'object') return [];
          const item = version as Record<string, unknown>;
          if (
            typeof item.version !== 'string' ||
            typeof item.state !== 'string' ||
            typeof item.sha256 !== 'string' ||
            typeof item.size !== 'number'
          )
            return [];
          return [
            {
              version: item.version,
              state: item.state as AdminSkillVersion['state'],
              sha256: item.sha256,
              size: item.size,
              ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}),
            },
          ];
        })
      : [];
    const state =
      record.state === 'withdrawn' || record.state === 'active'
        ? record.state
        : record.enabled === false
          ? 'withdrawn'
          : 'active';
    return [
      {
        id: record.id,
        name: record.name,
        ...(typeof record.description === 'string' ? { description: record.description } : {}),
        state,
        enabled: state === 'active',
        versions,
      },
    ];
  });
}

export function parseAssignments(value: unknown): AdminSkillAssignment[] {
  return arrayFrom(value, 'items').flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const subject = record.subject;
    if (
      typeof record.id !== 'string' ||
      typeof record.skillId !== 'string' ||
      !subject ||
      typeof subject !== 'object' ||
      typeof (subject as Record<string, unknown>).type !== 'string' ||
      typeof (subject as Record<string, unknown>).id !== 'string'
    )
      return [];
    const subjectType = (subject as Record<string, unknown>).type;
    const subjectId = (subject as Record<string, unknown>).id;
    if (typeof subjectType !== 'string' || typeof subjectId !== 'string') return [];
    return [
      {
        id: record.id,
        skillId: record.skillId,
        subjectType,
        subjectId,
        // Distinguish "the server said null (perpetual)" from "the server did
        // not report an expiry at all" (an older API).
        expiresAt:
          record.expiresAt === null ? null : typeof record.expiresAt === 'string' ? record.expiresAt : undefined,
      },
    ];
  });
}

/**
 * A page only proves the newer operations protocol when it carries a
 * well-formed `timeRange`. Missing, partial or wrong-typed data means the
 * control service predates the echoed window and the `result` filter, so the
 * console must not report either of them as supported.
 */
export function parseAuditTimeRange(value: unknown): AdminAuditTimeRange | null {
  if (!isRecord(value) || !('after' in value) || !('before' in value)) return null;
  const bounds = [value.after, value.before];
  if (!bounds.every((bound) => bound === null || (typeof bound === 'string' && bound.length > 0))) return null;
  return { after: valueString(value, 'after'), before: valueString(value, 'before') };
}

export function parseSessions(items: unknown[]): AdminUserSession[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.sessionId !== 'string' ||
      typeof record.userId !== 'string' ||
      typeof record.topic !== 'string' ||
      typeof record.createdAt !== 'string' ||
      typeof record.lastSeenAt !== 'string'
    )
      return [];
    return [
      {
        sessionId: record.sessionId,
        userId: record.userId,
        topic: record.topic,
        createdAt: record.createdAt,
        lastSeenAt: record.lastSeenAt,
        ...(typeof record.revokedAt === 'string' || record.revokedAt === null ? { revokedAt: record.revokedAt } : {}),
        ...('client' in record ? { client: parseSessionClient(record.client) } : {}),
      },
    ];
  });
}

function parseSessionClient(value: unknown): AdminSessionClient | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return null;
  const name = nonEmptyString(value.name);
  if (!name) return null;
  const version = nonEmptyString(value.version);
  const deviceId = nonEmptyString(value.deviceId);
  return {
    name,
    ...(version ? { version } : {}),
    ...(deviceId ? { deviceId } : {}),
  };
}

export function pendingEventCount(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const record = value as { items?: unknown[]; pending?: unknown };
  if (typeof record.pending === 'number') return record.pending;
  return Array.isArray(record.items)
    ? record.items.filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const state = (item as { state?: unknown }).state;
        return state === 'pending' || state === 'delivered';
      }).length
    : 0;
}
