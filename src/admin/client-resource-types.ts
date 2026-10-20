import type {
  AdminModel,
  CredentialAssignment,
  CredentialMetadata,
  ModelAssignment,
  Permission,
  PlatformUser,
  Role,
  Team as SdkTeam,
} from '@aep/sdk-node';

// Additive AEP team-default-role contract; keep the published SDK dependency.
export type AdminTeam = SdkTeam & { readonly defaultRoleIds?: readonly string[] };

export type Team = AdminTeam;

export type TeamDefaultsWrite = { readonly defaultRoleIds?: readonly string[] };

export interface AdminSkill {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly state: 'active' | 'withdrawn';
  readonly enabled: boolean;
  readonly versions: readonly AdminSkillVersion[];
}

export interface AdminSkillVersion {
  readonly version: string;
  readonly state: 'draft' | 'published' | 'withdrawn';
  readonly sha256: string;
  readonly size: number;
  readonly createdAt?: string;
}

export interface AdminSkillInstallation {
  readonly userId: string;
  readonly state: 'missing' | 'unreported';
  readonly revision?: string;
  readonly reportedAt?: string;
  readonly itemStatus?: string;
}

interface AdminSkillInstallationSummary {
  readonly granted: number;
  readonly reported: number;
  readonly installed: number;
  readonly missing: number;
  readonly unreported: number;
  readonly latestReportedAt: string | null;
}

/** What Agents last reported about one Skill: counts plus granted users that need attention. */
export interface AdminSkillInstallations {
  readonly skillId: string;
  readonly summary: AdminSkillInstallationSummary;
  readonly items: readonly AdminSkillInstallation[];
  readonly truncated: boolean;
}

export interface AdminSkillAssignment {
  readonly id: string;
  readonly skillId: string;
  readonly subjectType: string;
  readonly subjectId: string;
  /** ISO expiry. null = a perpetual grant; undefined = the server reported none. */
  readonly expiresAt?: string | null | undefined;
}

export const AdminSubjectType = {
  User: 'user',
  Role: 'role',
  Team: 'team',
} as const;

export type AdminSubjectType = (typeof AdminSubjectType)[keyof typeof AdminSubjectType];

export interface AdminAssignmentSubject {
  readonly type: AdminSubjectType;
  readonly id: string;
}

export const AdminModelSubjectType = {
  User: 'user',
  Role: 'role',
  Team: 'team',
} as const;

export type AdminModelSubjectType = (typeof AdminModelSubjectType)[keyof typeof AdminModelSubjectType];

export interface AdminModelAssignmentSubject {
  readonly type: AdminModelSubjectType;
  readonly id: string;
}

export interface AdminResources {
  /** Omitted for complete responses. These collections failed, rather than being empty. */
  readonly unavailable?: readonly AdminResourceCollection[];
  readonly users: readonly PlatformUser[];
  readonly teams: readonly Team[];
  readonly roles: readonly Role[];
  readonly permissions: readonly Permission[];
  readonly skills: readonly AdminSkill[];
  readonly assignments: readonly AdminSkillAssignment[];
}

export type AdminResourceCollection = 'users' | 'teams' | 'roles' | 'permissions' | 'skills' | 'assignments';
export type AdminResourceScope = AdminResourceCollection | 'directory';

export interface AdminModels {
  readonly models: readonly AdminModel[];
  readonly assignments: readonly ModelAssignment[];
}

export interface AdminSessionClient {
  readonly name: string;
  readonly version?: string;
  readonly deviceId?: string;
}

export interface AdminUserSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly topic: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly revokedAt?: string | null;
  // Self-reported or User-Agent-derived client identity recorded at login;
  // absent entirely on servers predating the field, null when unknown.
  readonly client?: AdminSessionClient | null;
}

export interface AdminCredentials {
  readonly credentials: readonly CredentialMetadata[];
  readonly assignments: readonly CredentialAssignment[];
}
