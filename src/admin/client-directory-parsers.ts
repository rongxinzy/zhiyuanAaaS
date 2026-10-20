import {
  type AdminIdentityMapping,
  AdminIdentityMappingStatus,
  type AdminIdentitySource,
  AdminIdentitySourceKind,
  AdminIdentitySubjectType,
} from './client-directory-types.js';
import { arrayFrom, isRecord } from './client-values.js';

export function parseIdentitySource(value: unknown): AdminIdentitySource {
  const record = isRecord(value) ? value : {};
  if (typeof record.id !== 'string' || typeof record.displayName !== 'string') {
    throw new Error('The AEP identity source response is invalid.');
  }
  return {
    id: record.id,
    displayName: record.displayName,
    kind: typeof record.kind === 'string' ? record.kind : AdminIdentitySourceKind.Directory,
    enabled: record.enabled !== false,
  };
}

export function parseIdentitySources(value: unknown): AdminIdentitySource[] {
  return arrayFrom(value, 'identitySources').flatMap((item) =>
    item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string'
      ? [safeIdentitySource(item)]
      : [],
  );
}

function safeIdentitySource(item: unknown): AdminIdentitySource {
  const record = item as Record<string, unknown>;
  return {
    id: record.id as string,
    displayName: typeof record.displayName === 'string' ? record.displayName : (record.id as string),
    kind: typeof record.kind === 'string' ? record.kind : AdminIdentitySourceKind.Directory,
    enabled: record.enabled !== false,
  };
}

export function parseIdentityMappings(value: unknown, sourceId: string): AdminIdentityMapping[] {
  return arrayFrom(value, 'mappings').flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.externalId !== 'string' || typeof record.localSubjectId !== 'string') return [];
    return [
      {
        sourceId: typeof record.sourceId === 'string' ? record.sourceId : sourceId,
        externalSubjectType:
          typeof record.externalSubjectType === 'string' ? record.externalSubjectType : AdminIdentitySubjectType.User,
        externalId: record.externalId,
        localSubjectId: record.localSubjectId,
        status: typeof record.status === 'string' ? record.status : AdminIdentityMappingStatus.Active,
      },
    ];
  });
}
