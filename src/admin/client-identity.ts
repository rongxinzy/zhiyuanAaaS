import { HttpMethod, type JsonObject } from '@aep/sdk-node';
import type { ClientContext } from './client-context.js';
import { parseIdentityMappings, parseIdentitySource, parseIdentitySources } from './client-directory-parsers.js';
import {
  type AdminIdentityMapping,
  type AdminIdentityMappingPage,
  type AdminIdentityMappingWrite,
  type AdminIdentitySource,
  type AdminIdentitySourceCreate,
  type AdminIdentitySourcePage,
  AdminIdentitySubjectType,
} from './client-directory-types.js';
import { identityQuery, segment, valueString } from './client-values.js';

export function createIdentityApi(context: ClientContext) {
  return {
    async identitySources(): Promise<AdminIdentitySourcePage> {
      const client = context.requireClient();
      const items: AdminIdentitySource[] = [];
      let cursor: string | undefined;
      for (;;) {
        const page = await context.request<JsonObject>(client, {
          method: HttpMethod.Get,
          path: `/aep/v1/admin/identity-sources?${identityQuery({ cursor, limit: 200 })}`,
        });
        items.push(...parseIdentitySources(page));
        const nextCursor = valueString(page, 'nextCursor');
        if (!nextCursor || nextCursor === cursor) return { items, nextCursor: null };
        cursor = nextCursor;
      }
    },
    async createIdentitySource(input: AdminIdentitySourceCreate): Promise<AdminIdentitySource> {
      const source = await context.request<JsonObject>(context.requireClient(), {
        method: HttpMethod.Post,
        path: '/aep/v1/admin/identity-sources',
        body: { kind: input.kind, displayName: input.displayName, config: {} },
      });
      return parseIdentitySource(source);
    },
    async identityMappings(sourceId: string): Promise<AdminIdentityMappingPage> {
      const client = context.requireClient();
      const items: AdminIdentityMapping[] = [];
      let cursor: string | undefined;
      for (;;) {
        const page = await context.request<JsonObject>(client, {
          method: HttpMethod.Get,
          path: `/aep/v1/admin/identity-sources/${segment(sourceId)}/mappings?${identityQuery({ subjectType: AdminIdentitySubjectType.User, cursor, limit: 200 })}`,
        });
        items.push(...parseIdentityMappings(page, sourceId));
        const nextCursor = valueString(page, 'nextCursor');
        if (!nextCursor || nextCursor === cursor) return { items, nextCursor: null };
        cursor = nextCursor;
      }
    },
    async upsertIdentityMapping(sourceId: string, input: AdminIdentityMappingWrite): Promise<void> {
      await context.request<JsonObject>(context.requireClient(), {
        method: HttpMethod.Put,
        path: `/aep/v1/admin/identity-sources/${segment(sourceId)}/mappings`,
        body: {
          externalSubjectType: input.externalSubjectType,
          externalId: input.externalId,
          localSubjectId: input.localSubjectId,
        },
      });
    },
    async deleteIdentityMapping(sourceId: string, externalId: string): Promise<void> {
      await context.request<null>(context.requireClient(), {
        method: HttpMethod.Delete,
        responseType: 'empty',
        path: `/aep/v1/admin/identity-sources/${segment(sourceId)}/mappings/${AdminIdentitySubjectType.User}/${segment(externalId)}`,
      });
    },
    async importUsers(input: JsonObject): Promise<Record<string, unknown>> {
      const deploymentId = context.deploymentId;
      if (!deploymentId) throw new Error('The deployment identity is unavailable.');
      return context.requireClient().importUsers({ ...input, deploymentId }) as Promise<Record<string, unknown>>;
    },
  };
}
