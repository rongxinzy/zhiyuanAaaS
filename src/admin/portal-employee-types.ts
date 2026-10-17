export type PortalEmployee = {
  readonly name: string;
  readonly displayName: string;
  readonly phase: string;
  readonly runtime: string;
  readonly model: string;
  /** Full ordered model list (first = default); feeds the edit form. */
  readonly models: readonly string[];
  readonly owner: string;
  readonly ownerId: string;
  /** Owning department (AEP team id), empty for legacy unscoped employees. */
  readonly team?: string;
  readonly memoryUser: string;
  readonly createdAt: string;
  readonly channels?: {
    readonly wecom: boolean;
    readonly wecomName?: string;
    readonly feishu?: boolean;
    readonly feishuName?: string;
    readonly wechat?: boolean;
  };
  /** 用途说明 (release condition, new employees only). */
  readonly description?: string | null;
  /** null/undefined = legacy unrestricted policy (not configured). */
  readonly knowledgeBases?: readonly { readonly id: string; readonly name: string }[] | null;
  readonly skills?: readonly { readonly id: string; readonly name: string; readonly version: string }[] | null;
  /** null/undefined = legacy owner/team rules (not explicitly configured). */
  readonly visibility?: PortalEmployeeVisibility | null;
  /** Workbench roster: why the caller can see this employee. */
  readonly accessReason?: PortalEmployeeAccess | undefined;
  /**
   * Set while the platform failover watcher is serving this employee from a
   * fallback model (the default model failed its health probe). null/absent
   * = the default model is serving.
   */
  readonly modelFailover?: { readonly original: string; readonly active: string; readonly switchedAt: string } | null;
};

// accessReason.kind mirrors the portal's canAccessEmployee branch order:
// owner | all | team | user | legacy-team | admin. team carries the
// granting team (spec name snapshot when present); legacy-team ids resolve
// client-side against the caller's /api/v1/me teams.
type PortalEmployeeAccess = {
  readonly kind: string;
  readonly teamId?: string;
  readonly teamName?: string;
  readonly userId?: string;
};

type PortalEmployeeVisibility = {
  readonly mode: 'all' | 'restricted' | string;
  readonly teams: readonly { readonly id: string; readonly name: string }[];
  readonly users: readonly { readonly id: string; readonly name: string }[];
};
