import type { AdminControlEvent } from '@aep/sdk-node';

export const AdminIdentitySourceKind = {
  Directory: 'directory',
  Ldap: 'ldap',
  Oidc: 'oidc',
} as const;

export type AdminIdentitySourceKind = (typeof AdminIdentitySourceKind)[keyof typeof AdminIdentitySourceKind];

export const AdminIdentityMappingStatus = {
  Active: 'active',
  Disabled: 'disabled',
} as const;

export type AdminIdentityMappingStatus = (typeof AdminIdentityMappingStatus)[keyof typeof AdminIdentityMappingStatus];

export const AdminIdentitySubjectType = {
  User: 'user',
  Team: 'team',
} as const;

export type AdminIdentitySubjectType = (typeof AdminIdentitySubjectType)[keyof typeof AdminIdentitySubjectType];

export interface AdminIdentitySource {
  readonly id: string;
  readonly kind: AdminIdentitySourceKind | string;
  readonly displayName: string;
  readonly enabled: boolean;
}

export interface AdminIdentitySourcePage {
  readonly items: readonly AdminIdentitySource[];
  readonly nextCursor: string | null;
}

export interface AdminIdentityMapping {
  readonly sourceId: string;
  readonly externalSubjectType: AdminIdentitySubjectType | string;
  readonly externalId: string;
  readonly localSubjectId: string;
  readonly status: AdminIdentityMappingStatus | string;
}

export interface AdminIdentityMappingPage {
  readonly items: readonly AdminIdentityMapping[];
  readonly nextCursor: string | null;
}

export interface AdminIdentitySourceCreate {
  readonly kind: AdminIdentitySourceKind;
  readonly displayName: string;
}

export interface AdminIdentityMappingWrite {
  readonly externalSubjectType: AdminIdentitySubjectType;
  readonly externalId: string;
  readonly localSubjectId: string;
}

export interface AdminEventRecord {
  readonly eventId?: string;
  readonly type?: string;
  readonly userId?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly result?: string;
  readonly receivedAt?: string;
  readonly createdAt?: string;
}

export interface AdminEventPage {
  readonly items: readonly AdminEventRecord[];
  readonly nextCursor: string | null;
}

export interface AdminAuthenticationAuditRecord {
  readonly cursor: string;
  readonly userId?: string;
  readonly eventType: string;
  readonly outcome: string;
  readonly reason?: string;
  readonly sourceHash?: string;
  readonly createdAt?: string;
}

export interface AdminAuthenticationAuditPage {
  readonly items: readonly AdminAuthenticationAuditRecord[];
  readonly nextCursor: string | null;
}

export interface AuthenticationAuditFilters {
  readonly eventType?: string;
  readonly outcome?: string;
  readonly userId?: string;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface AdminAuditRecord {
  readonly cursor: string;
  readonly actorUserId?: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string;
  readonly result: string;
  readonly reason?: string;
  readonly changes?: Record<string, unknown>;
  readonly createdAt: string;
}

export interface AdminAuditTimeRange {
  readonly after: string | null;
  readonly before: string | null;
}

export interface AdminAuditPage {
  readonly items: readonly AdminAuditRecord[];
  readonly nextCursor: string | null;
  /**
   * The window the server actually applied. `null` means the response carried
   * no well-formed `timeRange`, i.e. a control service that predates the
   * default window and the `result` filter — callers MUST treat `null` as an
   * unknown capability, never as an unbounded window.
   */
  readonly timeRange: AdminAuditTimeRange | null;
}

export interface AdminAuditFilters {
  readonly cursor?: string;
  readonly limit?: number;
  readonly action?: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly actorUserId?: string;
  readonly result?: string;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
}

export interface AdminDeliveryRecord {
  readonly deliveryId: string;
  readonly eventId: string;
  readonly sessionId?: string | null;
  readonly state: string;
  readonly attemptCount?: number;
  readonly createdAt?: string;
  readonly receivedAt?: string | null;
  readonly completedAt?: string | null;
  readonly updatedAt?: string;
  readonly errorCode?: string | null;
  readonly message?: string | null;
}

export interface AdminDeliveryPage {
  readonly items: readonly AdminDeliveryRecord[];
  readonly nextCursor: string | null;
}

export interface AdminControlEvents {
  readonly items: readonly AdminControlEvent[];
  readonly nextCursor: string | null;
}
