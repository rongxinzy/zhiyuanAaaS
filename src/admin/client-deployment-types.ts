import type { DataPlaneDesiredState, DataPlaneStatus } from '@aep/sdk-node';

export interface AdminDataPlaneRouteMismatch {
  readonly modelId: string;
  readonly fields: readonly string[];
}

// Drift between the route set the model catalog would publish and the routes
// currently stored as desired state.
export interface AdminDataPlaneCatalogComparison {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly mismatched: readonly AdminDataPlaneRouteMismatch[];
}

// The SDK now carries catalogComparison on DataPlaneStatus; Omit keeps the
// local readonly collection shape instead of intersecting with it. The field
// is absent only in responses predating catalogComparison.
export type AdminDataPlaneStatus = Omit<DataPlaneStatus, 'catalogComparison'> & {
  readonly catalogComparison?: AdminDataPlaneCatalogComparison;
};

export interface AdminDataPlane {
  readonly desired: DataPlaneDesiredState;
  readonly status: AdminDataPlaneStatus;
}

export const AdminDeploymentSettingSource = {
  Override: 'override',
  Env: 'env',
  Unset: 'unset',
} as const;

export type AdminDeploymentSettingSource =
  (typeof AdminDeploymentSettingSource)[keyof typeof AdminDeploymentSettingSource];

export interface AdminDeploymentSettingValue {
  readonly override: string | null;
  readonly effectiveValue: string | null;
  readonly source: AdminDeploymentSettingSource;
}

export interface AdminDeploymentIntegerSettingValue {
  readonly override: number | null;
  readonly effectiveValue: number | null;
  readonly source: AdminDeploymentSettingSource;
}

export interface AdminDeploymentSettings {
  readonly modelGatewayBaseUrl: AdminDeploymentSettingValue;
  readonly computeDefaultTier: AdminDeploymentSettingValue;
  readonly computeIdleHibernateSeconds: AdminDeploymentIntegerSettingValue;
  readonly computeConcurrencyCap: AdminDeploymentIntegerSettingValue;
}

// Omitted fields stay unchanged; an explicit null clears the runtime override
// so the environment-configured value applies again.
export interface AdminDeploymentSettingsUpdate {
  readonly modelGatewayBaseUrl?: string | null;
  readonly computeDefaultTier?: string | null;
  readonly computeIdleHibernateSeconds?: number | null;
  readonly computeConcurrencyCap?: number | null;
}

export interface AdminComputeTier {
  readonly name: string;
  readonly description?: string;
  readonly cpuRequest: string;
  readonly cpuLimit: string;
  readonly memoryRequest: string;
  readonly memoryLimit: string;
  readonly source: 'deployment';
}

export interface AdminComputeAssignment {
  readonly agentId: string;
  readonly agentName?: string;
  readonly tier: {
    readonly override: string | null;
    readonly effective: string;
    readonly source: 'override' | 'default';
  };
  readonly updatedAt?: string;
  readonly updatedBy?: string;
}

export const AdminModelGatewayUrlProblem = {
  Invalid: 'invalid',
  ClusterInternal: 'cluster-internal',
} as const;

export type AdminModelGatewayUrlProblem =
  (typeof AdminModelGatewayUrlProblem)[keyof typeof AdminModelGatewayUrlProblem];

// Client-side pre-check for the model gateway override, mirroring the
// write-time server rule family: an absolute http/https URL whose hostname is
// neither cluster-internal nor a single-label bare hostname. Loopback depends
// on the deployment environment and stays a server-side judgment.
export function modelGatewayBaseUrlProblem(value: string): AdminModelGatewayUrlProblem | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return AdminModelGatewayUrlProblem.Invalid;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return AdminModelGatewayUrlProblem.Invalid;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return AdminModelGatewayUrlProblem.Invalid;
  const host = parsed.hostname.replace(/\.$/, '').toLowerCase();
  if (!host) return AdminModelGatewayUrlProblem.Invalid;
  // IP literals (IPv4, or bracketed IPv6 per URL hostname) skip the
  // hostname rules, as the server does.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return null;
  if (!host.includes('.') || host === 'svc.cluster.local' || host.endsWith('.svc.cluster.local')) {
    return AdminModelGatewayUrlProblem.ClusterInternal;
  }
  return null;
}
