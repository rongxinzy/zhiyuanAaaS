// Compatibility adapter for AEP PR #295's additive OpenAPI contract, including
// #307 revision observations. Replace with SDK exports when a release ships it.
// Source: openapi/aep-v1-data-plane-publications.openapi.yaml in AEP.
export interface DataPlanePublication {
  readonly operationId: string;
  readonly deploymentId: string;
  readonly revision: string;
  readonly contentHash: string;
  readonly phase: 'queued' | 'projecting' | 'projected' | 'failed' | 'superseded';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly idempotencyExpiresAt: string;
  readonly conditions: readonly PublicationCondition[];
  readonly errorCode: string | null;
}

export interface PublicationCondition {
  readonly type: 'Accepted' | 'Applied' | 'Ready';
  readonly status: 'True' | 'False' | 'Unknown';
  readonly observedRevision: string | null;
  readonly reason: string;
  readonly lastTransitionTime: string;
}

export const publicationId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));

export function parsePublication(value: unknown): DataPlanePublication {
  const invalid = () => new Error('Invalid AEP publication response.');
  if (!record(value)) throw invalid();
  if (
    !publicationId(value.operationId) ||
    typeof value.deploymentId !== 'string' ||
    !value.deploymentId ||
    typeof value.revision !== 'string' ||
    !value.revision ||
    value.revision.length > 200 ||
    typeof value.contentHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.contentHash) ||
    !['queued', 'projecting', 'projected', 'failed', 'superseded'].includes(String(value.phase)) ||
    !timestamp(value.createdAt) ||
    !timestamp(value.updatedAt) ||
    !timestamp(value.idempotencyExpiresAt) ||
    !(value.errorCode === null || (typeof value.errorCode === 'string' && value.errorCode.length <= 100)) ||
    !Array.isArray(value.conditions) ||
    value.conditions.length !== 3
  )
    throw invalid();
  const types = new Set<string>();
  const conditions = value.conditions.map((c: unknown): PublicationCondition => {
    if (
      !record(c) ||
      !['Accepted', 'Applied', 'Ready'].includes(String(c.type)) ||
      !['True', 'False', 'Unknown'].includes(String(c.status)) ||
      !(c.observedRevision === null || c.observedRevision === value.revision) ||
      (c.status !== 'Unknown' && c.observedRevision !== value.revision) ||
      typeof c.reason !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(c.reason) ||
      !timestamp(c.lastTransitionTime) ||
      types.has(String(c.type))
    )
      throw invalid();
    types.add(String(c.type));
    return {
      type: c.type as PublicationCondition['type'],
      status: c.status as PublicationCondition['status'],
      observedRevision: c.observedRevision as string | null,
      reason: c.reason,
      lastTransitionTime: c.lastTransitionTime,
    };
  });
  return {
    operationId: value.operationId,
    deploymentId: value.deploymentId,
    revision: value.revision,
    contentHash: value.contentHash,
    phase: value.phase as DataPlanePublication['phase'],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    idempotencyExpiresAt: value.idempotencyExpiresAt,
    conditions,
    errorCode: value.errorCode as string | null,
  };
}
