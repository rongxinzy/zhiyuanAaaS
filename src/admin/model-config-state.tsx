// 目录「配置状态（网关）」列及其判定逻辑：网关期望/观测版本比对、路由收录
// 与漂移字段标注。从 Models.tsx 抽出以保持源文件在行数基线内。

import { Space, Tag, Tooltip, Typography } from 'antd';

import type { AdminDataPlane, AdminDataPlaneRouteMismatch } from './client.js';
import { type AdminLanguage, translate } from './i18n.js';
import { modelsT } from './models-copy.js';

const language: AdminLanguage = 'zh';
const t = (key: Parameters<typeof modelsT>[0]): string => modelsT(key, language);

// The gateway reports one global sync state (revision → observedRevision).
// "Applied" is only claimed when the gateway confirmed this exact desired
// revision; anything else degrades to pending/failed/unknown, never a
// blanket green.
export function gatewayStateLabel(dataPlane: AdminDataPlane): { label: string; color: string; confirmed: boolean } {
  const { desired, status } = dataPlane;
  if (status.observedRevision === null || status.observedRevision === undefined) {
    return { label: t('configUnknown'), color: 'default', confirmed: false };
  }
  if (status.observedRevision === desired.revision && status.state === 'ready') {
    return { label: t('configApplied'), color: 'success', confirmed: true };
  }
  if (status.observedRevision !== desired.revision) {
    return { label: t('configPending'), color: 'processing', confirmed: false };
  }
  switch (status.state) {
    case 'pending':
      return { label: t('configPending'), color: 'default', confirmed: false };
    case 'applying':
      return { label: t('configApplying'), color: 'processing', confirmed: false };
    case 'degraded':
      return { label: t('configDegraded'), color: 'warning', confirmed: false };
    case 'error':
      return { label: t('configError'), color: 'error', confirmed: false };
    default:
      return { label: t('configUnknown'), color: 'default', confirmed: false };
  }
}

export function routeIncluded(dataPlane: AdminDataPlane, modelId: string): boolean {
  return dataPlane.desired.routes.some((route) => route.modelId === modelId);
}

export function catalogMismatch(dataPlane: AdminDataPlane, modelId: string): AdminDataPlaneRouteMismatch | null {
  return dataPlane.status.catalogComparison?.mismatched.find((item) => item.modelId === modelId) ?? null;
}

export function catalogMissing(dataPlane: AdminDataPlane, modelId: string): boolean {
  return dataPlane.status.catalogComparison?.missing.includes(modelId) ?? false;
}

export function driftFieldLabel(field: string): string {
  switch (field) {
    case 'enabled':
      return t('fieldEnabled');
    case 'endpoint':
      return t('fieldEndpoint');
    case 'upstreamModel':
      return t('fieldUpstreamModel');
    case 'providerType':
      return t('fieldProviderType');
    case 'credentialRef':
      return t('fieldCredentialRef');
    default:
      return field;
  }
}

export function ConfigStateCell({
  dataPlane,
  error,
  allowed,
  modelId,
}: {
  readonly dataPlane: AdminDataPlane | null;
  readonly error: string | null;
  readonly allowed: boolean;
  readonly modelId: string;
}) {
  if (!allowed) {
    return (
      <Tooltip title={t('configNoPermissionHint')}>
        <Tag>{t('configNoPermission')}</Tag>
      </Tooltip>
    );
  }
  if (error) {
    return (
      <Tooltip title={`${t('configLoadFailedHint')}（${error}）`}>
        <Tag>{t('configUnknown')}</Tag>
      </Tooltip>
    );
  }
  if (!dataPlane) {
    return <Tag>{t('configUnknown')}</Tag>;
  }
  const state = gatewayStateLabel(dataPlane);
  const included = routeIncluded(dataPlane, modelId);
  const missing = catalogMissing(dataPlane, modelId);
  const mismatch = catalogMismatch(dataPlane, modelId);
  const tooltip = [
    `${t('configTargetRevision')}：${dataPlane.desired.revision}`,
    `${t('configAppliedRevision')}：${dataPlane.status.observedRevision ?? '—'}`,
    included ? t('configRouteIncluded') : t('configRouteMissingHint'),
    ...(mismatch ? [`${t('driftMismatched')}：${mismatch.fields.map(driftFieldLabel).join('、')}`] : []),
    ...(missing ? [translate(language, 'publicationLegacyModelHint')] : []),
  ].join('\n');
  return (
    <Tooltip title={<div style={{ whiteSpace: 'pre-line' }}>{tooltip}</div>}>
      <Space orientation="vertical" size={0}>
        <Tag color={state.color}>{state.label}</Tag>
        {mismatch ? <Tag color="warning">{t('driftMismatched')}</Tag> : null}
        {!mismatch && missing ? <Tag color="warning">{t('driftMissing')}</Tag> : null}
        {included || missing ? null : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('configRouteMissing')}
          </Typography.Text>
        )}
      </Space>
    </Tooltip>
  );
}
