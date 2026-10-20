import type { DataPlaneDesiredState, DataPlaneRoute, DataPlaneStatus } from '@aep/sdk-node';
import {
  type AdminComputeAssignment,
  type AdminComputeTier,
  type AdminDataPlaneCatalogComparison,
  type AdminDataPlaneStatus,
  type AdminDeploymentIntegerSettingValue,
  AdminDeploymentSettingSource,
  type AdminDeploymentSettings,
  type AdminDeploymentSettingValue,
} from './client-deployment-types.js';
import { isRecord } from './client-values.js';

function parseDeploymentSettingValue(value: unknown): AdminDeploymentSettingValue {
  const record = isRecord(value) ? value : {};
  const source = record.source;
  if (
    source !== AdminDeploymentSettingSource.Override &&
    source !== AdminDeploymentSettingSource.Env &&
    source !== AdminDeploymentSettingSource.Unset
  ) {
    throw new Error('The AEP deployment settings response is invalid.');
  }
  const override = record.override;
  const effectiveValue = record.effectiveValue;
  if (
    (override !== null && override !== undefined && typeof override !== 'string') ||
    (effectiveValue !== null && effectiveValue !== undefined && typeof effectiveValue !== 'string')
  ) {
    throw new Error('The AEP deployment settings response is invalid.');
  }
  return {
    override: typeof override === 'string' ? override : null,
    effectiveValue: typeof effectiveValue === 'string' ? effectiveValue : null,
    source,
  };
}

function parseDeploymentIntegerSettingValue(value: unknown): AdminDeploymentIntegerSettingValue {
  const record = isRecord(value) ? value : {};
  const source = record.source;
  if (
    source !== AdminDeploymentSettingSource.Override &&
    source !== AdminDeploymentSettingSource.Env &&
    source !== AdminDeploymentSettingSource.Unset
  ) {
    throw new Error('The AEP deployment settings response is invalid.');
  }
  const override = record.override;
  const effectiveValue = record.effectiveValue;
  if (
    (override !== null && override !== undefined && typeof override !== 'number') ||
    (effectiveValue !== null && effectiveValue !== undefined && typeof effectiveValue !== 'number')
  ) {
    throw new Error('The AEP deployment settings response is invalid.');
  }
  return {
    override: typeof override === 'number' ? override : null,
    effectiveValue: typeof effectiveValue === 'number' ? effectiveValue : null,
    source,
  };
}

// Older control services do not return the compute keys at all; absent keys
// parse as unset so panels keep working against both generations.
function parseOptionalDeploymentSettingValue(value: unknown): AdminDeploymentSettingValue {
  if (value === undefined) return { override: null, effectiveValue: null, source: 'unset' };
  return parseDeploymentSettingValue(value);
}

function parseOptionalDeploymentIntegerSettingValue(value: unknown): AdminDeploymentIntegerSettingValue {
  if (value === undefined) return { override: null, effectiveValue: null, source: 'unset' };
  return parseDeploymentIntegerSettingValue(value);
}

export function parseDeploymentSettings(value: unknown): AdminDeploymentSettings {
  const record = isRecord(value) ? value : {};
  return {
    modelGatewayBaseUrl: parseDeploymentSettingValue(record.modelGatewayBaseUrl),
    computeDefaultTier: parseOptionalDeploymentSettingValue(record.computeDefaultTier),
    computeIdleHibernateSeconds: parseOptionalDeploymentIntegerSettingValue(record.computeIdleHibernateSeconds),
    computeConcurrencyCap: parseOptionalDeploymentIntegerSettingValue(record.computeConcurrencyCap),
  };
}

export function parseComputeTierCatalog(value: unknown): AdminComputeTier[] {
  const record = isRecord(value) ? value : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return items.map((item) => {
    const tier = isRecord(item) ? item : {};
    return {
      name: typeof tier.name === 'string' ? tier.name : '',
      ...(typeof tier.description === 'string' ? { description: tier.description } : {}),
      cpuRequest: typeof tier.cpuRequest === 'string' ? tier.cpuRequest : '',
      cpuLimit: typeof tier.cpuLimit === 'string' ? tier.cpuLimit : '',
      memoryRequest: typeof tier.memoryRequest === 'string' ? tier.memoryRequest : '',
      memoryLimit: typeof tier.memoryLimit === 'string' ? tier.memoryLimit : '',
      source: 'deployment' as const,
    };
  });
}

export function parseComputeAssignment(value: unknown): AdminComputeAssignment {
  const record = isRecord(value) ? value : {};
  const tier = isRecord(record.tier) ? record.tier : {};
  const override = tier.override;
  const source = tier.source;
  if (source !== 'override' && source !== 'default') {
    throw new Error('The AEP compute assignment response is invalid.');
  }
  return {
    agentId: typeof record.agentId === 'string' ? record.agentId : '',
    ...(typeof record.agentName === 'string' ? { agentName: record.agentName } : {}),
    tier: {
      override: typeof override === 'string' ? override : null,
      effective: typeof tier.effective === 'string' ? tier.effective : '',
      source,
    },
    ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
    ...(typeof record.updatedBy === 'string' ? { updatedBy: record.updatedBy } : {}),
  };
}

export function parseComputeAssignmentList(value: unknown): AdminComputeAssignment[] {
  const record = isRecord(value) ? value : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return items.map((item) => parseComputeAssignment(item));
}

const DATA_PLANE_STATES: readonly string[] = ['pending', 'applying', 'ready', 'degraded', 'error'];

export function parseDataPlaneStatus(value: unknown): AdminDataPlaneStatus {
  const record = isRecord(value) ? value : {};
  const state =
    typeof record.state === 'string' && DATA_PLANE_STATES.includes(record.state)
      ? (record.state as DataPlaneStatus['state'])
      : 'pending';
  return {
    state,
    observedRevision: typeof record.observedRevision === 'string' ? record.observedRevision : null,
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : null,
    ...(typeof record.lastAppliedAt === 'string' || record.lastAppliedAt === null
      ? { lastAppliedAt: record.lastAppliedAt }
      : {}),
    ...(typeof record.errorCode === 'string' || record.errorCode === null ? { errorCode: record.errorCode } : {}),
    ...(typeof record.message === 'string' || record.message === null ? { message: record.message } : {}),
    ...(typeof record.resourceCount === 'number' ? { resourceCount: record.resourceCount } : {}),
    ...(record.catalogComparison !== undefined
      ? { catalogComparison: parseCatalogComparison(record.catalogComparison) }
      : {}),
  };
}

function parseCatalogComparison(value: unknown): AdminDataPlaneCatalogComparison {
  const record = isRecord(value) ? value : {};
  const mismatched = Array.isArray(record.mismatched) ? record.mismatched : [];
  return {
    missing: stringList(record.missing),
    extra: stringList(record.extra),
    mismatched: mismatched.flatMap((item) => {
      if (!isRecord(item) || typeof item.modelId !== 'string') return [];
      return [{ modelId: item.modelId, fields: stringList(item.fields) }];
    }),
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : [];
}

export function parseDataPlaneDesiredState(value: unknown): DataPlaneDesiredState {
  const record = isRecord(value) ? value : {};
  if (typeof record.revision !== 'string' || !Array.isArray(record.routes)) {
    throw new Error('The AEP data-plane publish response is invalid.');
  }
  return {
    revision: record.revision,
    routes: record.routes as DataPlaneRoute[],
    deploymentId: typeof record.deploymentId === 'string' ? record.deploymentId : '',
    publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : '',
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : '',
  };
}
