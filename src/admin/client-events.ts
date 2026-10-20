import { type AdminControlEvent, HttpMethod, type JsonObject, type Query } from '@aep/sdk-node';
import type { ClientContext } from './client-context.js';
import type {
  AdminAuditFilters,
  AdminAuditPage,
  AdminAuthenticationAuditPage,
  AdminControlEvents,
  AdminDeliveryPage,
  AdminDeliveryRecord,
  AdminEventPage,
  AuthenticationAuditFilters,
} from './client-directory-types.js';
import { parseAuditTimeRange } from './client-resource-parsers.js';
import { arrayFrom, identityQuery, isRecord, valueString } from './client-values.js';

export function createEventsApi(context: ClientContext) {
  return {
    async controlEvents(filters?: Query): Promise<AdminControlEvents> {
      const result = await context.requireClient().listAdminControlEvents(filters);
      return { items: result.items, nextCursor: result.nextCursor };
    },
    async getControlEvent(eventId: string): Promise<AdminControlEvent> {
      return context.requireClient().getAdminControlEvent(eventId);
    },
    async cancelControlEvent(eventId: string): Promise<AdminControlEvent> {
      return context.requireClient().cancelControlEvent(eventId);
    },
    async publishControlEvent(input: JsonObject): Promise<Record<string, unknown>> {
      return context.requireClient().createControlEvent(input) as Promise<Record<string, unknown>>;
    },
    async deliverySummary(eventId: string, filters?: Query): Promise<AdminDeliveryPage> {
      const result = await context.requireClient().listControlEventDeliveries(eventId, filters);
      const items = Array.isArray(result.items)
        ? result.items.flatMap((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
            const record = item as Record<string, unknown>;
            if (
              typeof record.deliveryId !== 'string' ||
              typeof record.eventId !== 'string' ||
              typeof record.state !== 'string'
            )
              return [];
            return [record as unknown as AdminDeliveryRecord];
          })
        : [];
      return { items, nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : null };
    },
    async searchAudit(filters?: Query): Promise<AdminEventPage> {
      const result = await context.requireClient().searchEvents(filters);
      const items = arrayFrom(result, 'items').flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const record = item as Record<string, unknown>;
        return [
          {
            ...(typeof record.eventId === 'string' ? { eventId: record.eventId } : {}),
            ...(typeof record.type === 'string' ? { type: record.type } : {}),
            ...(typeof record.userId === 'string' ? { userId: record.userId } : {}),
            ...(typeof record.resourceType === 'string' ? { resourceType: record.resourceType } : {}),
            ...(typeof record.resourceId === 'string' ? { resourceId: record.resourceId } : {}),
            ...(typeof record.result === 'string' ? { result: record.result } : {}),
            ...(typeof record.receivedAt === 'string' ? { receivedAt: record.receivedAt } : {}),
            ...(typeof record.createdAt === 'string' ? { createdAt: record.createdAt } : {}),
          },
        ];
      });
      return { items, nextCursor: typeof result.nextCursor === 'string' ? result.nextCursor : null };
    },
    async searchAuthenticationAudit(filters?: AuthenticationAuditFilters): Promise<AdminAuthenticationAuditPage> {
      const result = await context.request<JsonObject>(context.requireClient(), {
        method: HttpMethod.Get,
        path: `/aep/v1/admin/audit/authentication?${identityQuery({ ...filters })}`,
      });
      const items = arrayFrom(result, 'items').flatMap((item) => {
        if (!isRecord(item)) return [];
        const record = item as Record<string, unknown>;
        if (
          typeof record.cursor !== 'string' ||
          typeof record.eventType !== 'string' ||
          typeof record.outcome !== 'string'
        ) {
          return [];
        }
        return [
          {
            cursor: record.cursor,
            eventType: record.eventType,
            outcome: record.outcome,
            ...(typeof record.userId === 'string' ? { userId: record.userId } : {}),
            ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
            ...(typeof record.sourceHash === 'string' ? { sourceHash: record.sourceHash } : {}),
            ...(typeof record.createdAt === 'string' ? { createdAt: record.createdAt } : {}),
          },
        ];
      });
      return { items, nextCursor: valueString(result, 'nextCursor') };
    },
    async searchAdminAudit(filters?: AdminAuditFilters): Promise<AdminAuditPage> {
      const result = await context.request<JsonObject>(context.requireClient(), {
        method: HttpMethod.Get,
        path: `/aep/v1/admin/audit/operations?${identityQuery({ ...filters })}`,
      });
      const items = arrayFrom(result, 'items').flatMap((item) => {
        if (!isRecord(item)) return [];
        const record = item as Record<string, unknown>;
        if (
          typeof record.cursor !== 'string' ||
          typeof record.action !== 'string' ||
          typeof record.resourceType !== 'string' ||
          typeof record.result !== 'string' ||
          typeof record.createdAt !== 'string'
        ) {
          return [];
        }
        return [
          {
            cursor: record.cursor,
            action: record.action,
            resourceType: record.resourceType,
            result: record.result,
            createdAt: record.createdAt,
            ...(typeof record.actorUserId === 'string' ? { actorUserId: record.actorUserId } : {}),
            ...(typeof record.resourceId === 'string' ? { resourceId: record.resourceId } : {}),
            ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
            ...(isRecord(record.changes) ? { changes: record.changes } : {}),
          },
        ];
      });
      const range = isRecord(result) ? result.timeRange : null;
      return {
        items,
        nextCursor: valueString(result, 'nextCursor'),
        timeRange: parseAuditTimeRange(range),
      };
    },
  };
}
