import type { AdminModel } from '@aep/sdk-node';
import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Tag, Timeline, Tooltip, Typography } from 'antd';
import type { AdminDataPlane } from './client.js';
import { translate } from './i18n.js';
import {
  catalogMismatch,
  catalogMissing,
  driftFieldLabel,
  gatewayStateLabel,
  routeIncluded,
} from './model-config-state.js';
import { formatDateTime, language, t } from './models-shared.js';

export function ConfigStatusPanel({
  model,
  dataPlane,
  error,
  loading,
  allowed,
  onRefresh,
}: {
  readonly model: AdminModel;
  readonly dataPlane: AdminDataPlane | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly allowed: boolean;
  readonly onRefresh: () => Promise<void>;
}) {
  if (!allowed) {
    return (
      <Alert type="info" showIcon title={t('configNoPermissionTitle')} description={t('configNoPermissionHint')} />
    );
  }
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Alert
          type="error"
          showIcon
          title={`${t('configLoadFailed')}：${error}`}
          description={t('configLoadFailedHint')}
        />
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void onRefresh()}>
          {t('configRefresh')}
        </Button>
      </div>
    );
  }
  if (!dataPlane) {
    return (
      <div className="flex flex-col gap-4">
        <Alert type="info" showIcon title={t('configUnknown')} description={t('configNotConfirmed')} />
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void onRefresh()}>
          {t('configRefresh')}
        </Button>
      </div>
    );
  }
  const state = gatewayStateLabel(dataPlane);
  const included = routeIncluded(dataPlane, model.id);
  const observed = dataPlane.status.observedRevision;
  const comparison = dataPlane.status.catalogComparison;
  const mismatch = catalogMismatch(dataPlane, model.id);
  const missing = catalogMissing(dataPlane, model.id);
  const publishState = !comparison ? null : mismatch ? (
    <Tag color="warning">{t('driftMismatched')}</Tag>
  ) : missing ? (
    <Tag color="warning">{t('driftMissing')}</Tag>
  ) : included ? (
    <Tag color="success">{t('catalogPublishIncluded')}</Tag>
  ) : (
    <Tag>{t('catalogPublishSkipped')}</Tag>
  );
  return (
    <div className="flex flex-col gap-4">
      <Alert
        type="info"
        showIcon
        title={translate(language, 'publicationLegacy')}
        description={translate(language, 'publicationLegacyNote')}
      />
      <Descriptions
        bordered
        size="small"
        column={1}
        items={[
          {
            key: 'manage',
            label: t('colManageState'),
            children: model.enabled ? t('stateEnabled') : t('stateDisabled'),
          },
          {
            key: 'state',
            label: t('configGatewayState'),
            children: <Tag color={state.color}>{state.label}</Tag>,
          },
          {
            key: 'target',
            label: t('configTargetRevision'),
            children: dataPlane.desired.revision,
          },
          {
            key: 'applied',
            label: t('configAppliedRevision'),
            children: observed ?? t('configUnknown'),
          },
          {
            key: 'sync',
            label: t('configLastSync'),
            children: formatDateTime(dataPlane.status.lastAppliedAt),
          },
          {
            key: 'route',
            label: t('colConfigState'),
            children: included ? (
              t('configRouteIncluded')
            ) : (
              <Tooltip title={t('configRouteMissingHint')}>
                <span>{t('configRouteMissing')}</span>
              </Tooltip>
            ),
          },
          ...(publishState ? [{ key: 'catalog', label: t('catalogPublishState'), children: publishState }] : []),
          ...(mismatch
            ? [
                {
                  key: 'drift',
                  label: t('driftFields'),
                  children: mismatch.fields.map(driftFieldLabel).join('、'),
                },
              ]
            : []),
          {
            key: 'executor',
            label: t('labelExecutionService'),
            children: t('executionServiceGateway'),
          },
        ]}
      />
      {observed === null || observed === undefined ? (
        <Typography.Text type="secondary">{t('configNotConfirmed')}</Typography.Text>
      ) : null}
      <Timeline
        items={[
          {
            children: `${t('statusTimelineSaved')} · ${formatDateTime(dataPlane.desired.publishedAt)}`,
          },
          state.confirmed
            ? {
                color: 'green',
                children: `${t('statusTimelineApplied')} · ${formatDateTime(dataPlane.status.lastAppliedAt)}`,
              }
            : {
                color: 'gray',
                children: t('statusTimelineNotApplied'),
              },
        ]}
      />
      <div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void onRefresh()}>
          {t('configRefresh')}
        </Button>
      </div>
    </div>
  );
}
