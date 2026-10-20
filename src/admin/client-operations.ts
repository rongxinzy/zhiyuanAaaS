import {
  type DataPlaneDesiredState,
  type DataPlaneDesiredStateWrite,
  HttpMethod,
  type JsonObject,
  type License,
  type LicenseImportRequest,
  type Query,
} from '@aep/sdk-node';
import { AdminRequestError } from './client-auth.js';
import type { ClientContext } from './client-context.js';
import {
  parseComputeAssignment,
  parseComputeAssignmentList,
  parseComputeTierCatalog,
  parseDataPlaneDesiredState,
  parseDataPlaneStatus,
  parseDeploymentSettings,
} from './client-deployment-parsers.js';
import type {
  AdminComputeAssignment,
  AdminComputeTier,
  AdminDataPlane,
  AdminDeploymentSettings,
  AdminDeploymentSettingsUpdate,
} from './client-deployment-types.js';
import { parseSessions } from './client-resource-parsers.js';
import type { AdminUserSession } from './client-resource-types.js';
import { arrayFrom, valueString } from './client-values.js';
import { type DataPlanePublication, parsePublication, publicationId } from './publication-contract.js';

export function createOperationsApi(context: ClientContext) {
  return {
    async createDataPlanePublication(
      idempotencyKey: string,
      input: { readonly includeGatewayLimits?: boolean } = {},
    ): Promise<DataPlanePublication> {
      if (!/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) throw new TypeError('Invalid publication key.');
      const result = parsePublication(
        await context.request<unknown>(context.requireClient(), {
          method: HttpMethod.Post,
          path: '/aep/v1/admin/data-plane/publications',
          body: input.includeGatewayLimits === true ? { includeGatewayLimits: true } : {},
          idempotencyKey,
        }),
      );
      if (result.deploymentId !== context.deploymentId) throw new Error('Publication deployment mismatch.');
      return result;
    },
    async getDataPlanePublication(operationId: string): Promise<DataPlanePublication> {
      if (!publicationId(operationId)) throw new TypeError('Invalid publication ID.');
      const result = parsePublication(
        await context.request<unknown>(context.requireClient(), {
          method: HttpMethod.Get,
          path: `/aep/v1/admin/data-plane/publications/${encodeURIComponent(operationId)}`,
        }),
      );
      if (result.operationId !== operationId || result.deploymentId !== context.deploymentId)
        throw new Error('Publication identity mismatch.');
      return result;
    },
    async licenses(): Promise<readonly License[]> {
      const client = context.requireClient();
      const licenses: License[] = [];
      let cursor: string | undefined;
      for (;;) {
        const page = await client.listLicenses({ ...(cursor ? { cursor } : {}), limit: 200 });
        licenses.push(...page.items);
        const nextCursor = page.nextCursor ?? null;
        if (!nextCursor || nextCursor === cursor) return licenses;
        cursor = nextCursor;
      }
    },
    async importLicense(input: LicenseImportRequest): Promise<License> {
      return context.requireClient().importLicense(input);
    },
    async revokeLicense(licenseId: string): Promise<void> {
      await context.requireClient().revokeLicense(licenseId);
    },
    async revokeUserSession(sessionId: string): Promise<void> {
      await context.requireClient().revokeUserSession(sessionId);
    },
    async sessions(userId?: string): Promise<readonly AdminUserSession[]> {
      const client = context.requireClient();
      const sessions: AdminUserSession[] = [];
      let cursor: string | undefined;
      for (;;) {
        const result = await client.listUserSessions({
          ...(userId ? { userId } : {}),
          ...(cursor ? { cursor } : {}),
          limit: 200,
        } satisfies Query);
        const items = arrayFrom(result, 'items');
        sessions.push(...parseSessions(items));
        const nextCursor = valueString(result, 'nextCursor');
        if (!nextCursor || nextCursor === cursor) return sessions;
        cursor = nextCursor;
      }
    },
    async dataPlane(): Promise<AdminDataPlane> {
      const client = context.requireClient();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const desired = await client.getDataPlaneDesiredState();
        // The pinned SDK release predates the catalogComparison field on the
        // data-plane status, so the status read goes through the same
        // handwritten transport path as the publish endpoint (see #request).
        const status = await context
          .request<JsonObject>(client, {
            method: HttpMethod.Get,
            path: '/aep/v1/admin/data-plane/status',
          })
          .then(parseDataPlaneStatus);
        const confirmed = await client.getDataPlaneDesiredState();
        const stable = desired.revision === confirmed.revision && desired.contentHash === confirmed.contentHash;
        const wrongReadyHash =
          status.state === 'ready' &&
          status.observedRevision === desired.revision &&
          Boolean(status.contentHash && desired.contentHash && status.contentHash !== desired.contentHash);
        if (stable && !wrongReadyHash) return { desired, status };
      }
      throw new AdminRequestError(503, 'GATEWAY_OBSERVATION_CHANGED', null);
    },
    // The pinned SDK release predates the catalog-derived publish endpoint:
    // the server derives gateway routes from the model catalog and atomically
    // replaces the desired state (see #request for the handwritten precedent).
    async publishDataPlaneRoutes(input?: { readonly revision?: string }): Promise<DataPlaneDesiredState> {
      const revision = input?.revision?.trim();
      const desired = await context.request<JsonObject>(context.requireClient(), {
        method: HttpMethod.Post,
        path: '/aep/v1/admin/data-plane/publish',
        body: revision ? { revision } : {},
      });
      return parseDataPlaneDesiredState(desired);
    },
    async putDataPlane(input: DataPlaneDesiredStateWrite): Promise<DataPlaneDesiredState> {
      return context.requireClient().putDataPlaneDesiredState(input);
    },
    // The pinned SDK release predates the deployment-settings admin endpoints,
    // so these calls go through the same handwritten transport path as the
    // identity-sources endpoints above (see #request).
    async deploymentSettings(): Promise<AdminDeploymentSettings> {
      const settings = await context.request<JsonObject>(context.requireClient(), {
        method: HttpMethod.Get,
        path: '/aep/v1/admin/deployment/settings',
      });
      return parseDeploymentSettings(settings);
    },
    async updateDeploymentSettings(input: AdminDeploymentSettingsUpdate): Promise<AdminDeploymentSettings> {
      const body: JsonObject = {};
      if ('modelGatewayBaseUrl' in input) body.modelGatewayBaseUrl = input.modelGatewayBaseUrl ?? null;
      if ('computeDefaultTier' in input) body.computeDefaultTier = input.computeDefaultTier ?? null;
      if ('computeIdleHibernateSeconds' in input)
        body.computeIdleHibernateSeconds = input.computeIdleHibernateSeconds ?? null;
      if ('computeConcurrencyCap' in input) body.computeConcurrencyCap = input.computeConcurrencyCap ?? null;
      const settings = await context.request<JsonObject>(context.requireClient(), {
        method: HttpMethod.Put,
        path: '/aep/v1/admin/deployment/settings',
        body,
      });
      return parseDeploymentSettings(settings);
    },
    // Compute governance endpoints (AEP compute governance contract): like the
    // deployment settings they predate the pinned SDK release, so they use the
    // same handwritten transport path.
    async computeTierCatalog(): Promise<AdminComputeTier[]> {
      const catalog = await context.request<JsonObject>(context.requireClient(), {
        method: HttpMethod.Get,
        path: '/aep/v1/admin/compute/tiers',
      });
      return parseComputeTierCatalog(catalog);
    },
    async computeAssignments(): Promise<AdminComputeAssignment[]> {
      const list = await context.request<JsonObject>(context.requireClient(), {
        method: HttpMethod.Get,
        path: '/aep/v1/admin/compute/assignments',
      });
      return parseComputeAssignmentList(list);
    },
    async updateComputeAssignment(agentId: string, tier: string | null): Promise<AdminComputeAssignment> {
      const assignment = await context.request<JsonObject>(context.requireClient(), {
        method: HttpMethod.Put,
        path: `/aep/v1/admin/compute/assignments/${encodeURIComponent(agentId)}`,
        body: { tier },
      });
      return parseComputeAssignment(assignment);
    },
  };
}
