import { HttpMethod } from '@aep/sdk-node';
import type { ClientContext } from './client-context.js';
import { identityQuery } from './client-values.js';
import type {
  GatewayCapabilities,
  GatewayHealth,
  GatewayLimit,
  GatewayLimitPage,
  GatewayLimitPublication,
  GatewayLimitStatus,
  GatewayLimitWrite,
  GatewayMetricQuery,
  GatewayMetricResult,
  GatewayNativeResult,
  GatewayQuota,
  GatewayRequestQuery,
  GatewayTestAccess,
} from './gateway-api.js';

export function createGatewayApi(context: ClientContext) {
  return {
    getGatewayCapabilities(): Promise<GatewayCapabilities> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Get,
        path: '/aep/v1/admin/model-gateway/capabilities',
      });
    },
    queryGatewayMetrics(input: GatewayMetricQuery): Promise<GatewayMetricResult> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Get,
        path: `/aep/v1/admin/model-gateway/metrics?${identityQuery({ ...input })}`,
      });
    },
    getGatewayMonitoringHealth(): Promise<GatewayHealth> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Get,
        path: '/aep/v1/admin/model-gateway/health',
      });
    },
    searchGatewayRequests(input: GatewayRequestQuery): Promise<GatewayNativeResult> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Get,
        path: `/aep/v1/admin/model-gateway/requests?${identityQuery({ ...input })}`,
      });
    },
    getGatewayRequest(requestId: string, input: GatewayRequestQuery): Promise<GatewayNativeResult> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Get,
        path: `/aep/v1/admin/model-gateway/requests/${encodeURIComponent(requestId)}?${identityQuery({ ...input })}`,
      });
    },
    listGatewayLimits(): Promise<GatewayLimitPage> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Get,
        path: '/aep/v1/admin/model-gateway/limits',
      });
    },
    putGatewayLimit(ruleId: string, input: GatewayLimitWrite): Promise<GatewayLimit> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Put,
        path: `/aep/v1/admin/model-gateway/limits/${encodeURIComponent(ruleId)}`,
        body: { ...input },
      });
    },
    deleteGatewayLimit(ruleId: string, expectedVersion: number): Promise<void> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Delete,
        path: `/aep/v1/admin/model-gateway/limits/${encodeURIComponent(ruleId)}?${identityQuery({ expectedVersion })}`,
        responseType: 'empty',
      });
    },
    publishGatewayLimits(): Promise<GatewayLimitPublication> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Post,
        path: '/aep/v1/admin/model-gateway/limits/publish',
      });
    },
    getGatewayLimitsStatus(): Promise<GatewayLimitStatus> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Get,
        path: '/aep/v1/admin/model-gateway/limits/status',
      });
    },
    getGatewayQuota(userId: string): Promise<GatewayQuota> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Get,
        path: `/aep/v1/admin/model-gateway/quotas/${encodeURIComponent(userId)}`,
      });
    },
    refreshGatewayQuota(userId: string, quota: number): Promise<GatewayQuota> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Post,
        path: `/aep/v1/admin/model-gateway/quotas/${encodeURIComponent(userId)}/refresh`,
        body: { quota },
      });
    },
    changeGatewayQuota(userId: string, value: number): Promise<GatewayQuota> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Post,
        path: `/aep/v1/admin/model-gateway/quotas/${encodeURIComponent(userId)}/delta`,
        body: { value },
      });
    },
    createGatewayTestAccess(modelId: string): Promise<GatewayTestAccess> {
      return context.request(context.requireClient(), {
        method: HttpMethod.Post,
        path: `/aep/v1/admin/model-gateway/models/${encodeURIComponent(modelId)}/test-access`,
      });
    },
  };
}
