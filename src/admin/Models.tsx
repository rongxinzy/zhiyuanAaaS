import type { AdminModel } from '@aep/sdk-node';
import { PlusOutlined, ReloadOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Empty, Input, Space, Table, Tag, Typography } from 'antd';
import { useCallback, useState } from 'react';
import {
  type AdminConsoleClient,
  type AdminIdentity,
  AdminPermission,
  AdminRequestError,
  hasAdminPermission,
} from './client.js';
import { GatewayPublication } from './GatewayPublication.js';
import { translate } from './i18n.js';
import { ModelPricingDrawer } from './ModelPricing.js';
import { modelCapabilitiesColumn } from './model-capabilities.js';
import { ConfigStateCell } from './model-config-state.js';
import { ModelDetailDrawer } from './models-detail.js';
import { ModelCreateModal, ModelDeleteModal, ModelEditorModal } from './models-editor.js';
import { ModelGrantPage } from './models-grants.js';
import { HealthStateCell } from './models-health.js';
import { ModelRowMenu } from './models-row-menu.js';
import { catalogPublishable, language, type ModelGrantTarget, t } from './models-shared.js';
import { AdminNotificationKind, notify } from './notifications.js';

export function Models({
  client,
  identity,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
}) {
  const canWrite = hasAdminPermission(identity, AdminPermission.ModelsWrite);
  // Gateway sync state is ops data: without data_plane.write the console
  // neither requests it nor renders a technical verdict it cannot back.
  const canDataPlane = hasAdminPermission(identity, AdminPermission.DataPlaneWrite);
  const queryClient = useQueryClient();
  const modelsQuery = useQuery({
    queryKey: ['admin', 'models', identity],
    queryFn: () => client.models(identity),
  });
  const directoryQuery = useQuery({
    queryKey: ['admin', 'model-directory', identity],
    queryFn: () => client.resources(identity, 'directory'),
  });
  const state = modelsQuery.data ?? null;
  const users = directoryQuery.isSuccess ? directoryQuery.data.users : [];
  const roles = directoryQuery.isSuccess ? directoryQuery.data.roles : [];
  const teams = directoryQuery.isSuccess ? directoryQuery.data.teams : [];
  const canAssign = hasAdminPermission(identity, AdminPermission.ModelsAssign) && directoryQuery.isSuccess;
  const loading = modelsQuery.isFetching;
  const error =
    modelsQuery.error && !modelsQuery.isFetching
      ? modelsQuery.error instanceof Error
        ? modelsQuery.error.message
        : String(modelsQuery.error)
      : null;
  const [query, setQuery] = useState('');
  const [granting, setGranting] = useState<ModelGrantTarget | null>(null);
  const [detail, setDetail] = useState<AdminModel | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminModel | null>(null);
  const [pricingModel, setPricingModel] = useState<AdminModel | null>(null);
  const [deleting, setDeleting] = useState<AdminModel | null>(null);
  // Gateway sync state loads independently: a data-plane failure must not
  // block the catalog, and must not be shown as "applied".
  const dataPlaneQuery = useQuery({
    queryKey: ['admin', 'data-plane'],
    queryFn: () => client.dataPlane(),
    enabled: canDataPlane,
  });
  const dataPlane = dataPlaneQuery.data ?? null;
  const dataPlaneError =
    dataPlaneQuery.error && !dataPlaneQuery.isFetching
      ? dataPlaneQuery.error instanceof AdminRequestError && dataPlaneQuery.error.code === 'GATEWAY_OBSERVATION_CHANGED'
        ? translate(language, 'gatewayObservationChanged')
        : dataPlaneQuery.error instanceof Error
          ? dataPlaneQuery.error.message
          : String(dataPlaneQuery.error)
      : null;
  const dataPlaneLoading = dataPlaneQuery.isFetching;

  const reportMutationError = useCallback(() => {
    notify(AdminNotificationKind.Error, translate(language, 'modelFormFailed'));
  }, []);

  const load = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'models', identity] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'model-directory', identity] }),
    ]);
  }, [queryClient, identity]);

  const loadDataPlane = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['admin', 'data-plane'] }),
    [queryClient],
  );

  // Catalog mutations change what publish would derive, so the drift badges
  // reload alongside the catalog itself.
  const reloadAll = useCallback(async () => {
    await load();
    if (canDataPlane) await loadDataPlane();
  }, [load, loadDataPlane, canDataPlane]);

  // Models the publish would skip: disabled or incomplete gateway mapping.
  const publishExcluded = (state?.models ?? []).filter((model) => !catalogPublishable(model));

  if (granting && directoryQuery.isSuccess) {
    return (
      <ModelGrantPage
        client={client}
        model={granting.model}
        existingAssignments={granting.assignments}
        users={users}
        roles={roles}
        teams={teams}
        onBack={() => setGranting(null)}
        onChanged={load}
        onError={reportMutationError}
      />
    );
  }

  const filtered = (state?.models ?? []).filter((model) => {
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return [model.id, model.displayName].some((value) => value.toLowerCase().includes(needle));
  });

  const columns = [
    {
      title: t('colModel'),
      key: 'model',
      width: 230,
      render: (_: unknown, model: AdminModel) => (
        <Space orientation="vertical" size={0}>
          <Space size={6} wrap>
            <Typography.Text strong style={{ wordBreak: 'break-word' }}>
              {model.displayName}
            </Typography.Text>
            {model.isDefault ? <Tag color="blue">{translate(language, 'defaultModel')}</Tag> : null}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12, wordBreak: 'break-all' }}>
            {model.id}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('colUpstream'),
      key: 'upstream',
      render: (_: unknown, model: AdminModel) => model.upstreamModel || model.localModelRef || t('notProvided'),
    },
    modelCapabilitiesColumn(),
    {
      title: t('colManageState'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean) =>
        enabled ? <Tag color="success">{t('stateEnabled')}</Tag> : <Tag>{t('stateDisabled')}</Tag>,
    },
    {
      title: translate(language, 'publicationLegacyShort'),
      key: 'config',
      width: 190,
      render: (_: unknown, model: AdminModel) => (
        <ConfigStateCell dataPlane={dataPlane} error={dataPlaneError} allowed={canDataPlane} modelId={model.id} />
      ),
    },
    {
      title: t('colTestState'),
      key: 'test',
      width: 170,
      render: (_: unknown, model: AdminModel) => <HealthStateCell model={model} />,
    },
    {
      title: translate(language, 'actions'),
      key: 'actions',
      align: 'right' as const,
      render: (_: unknown, model: AdminModel) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: click shield so action buttons do not open the detail row
        // biome-ignore lint/a11y/useKeyWithClickEvents: see above — not an interactive control
        <span onClick={(event) => event.stopPropagation()}>
          <Space size={0}>
            <Button type="link" size="small" onClick={() => setDetail(model)}>
              {translate(language, 'viewDetails')}
            </Button>
            {hasAdminPermission(identity, AdminPermission.ModelsRead) ? (
              <Button type="link" size="small" onClick={() => setPricingModel(model)}>
                {translate(language, 'modelPricingTitle')}
              </Button>
            ) : null}
            {canWrite ? (
              <Button type="link" size="small" onClick={() => setEditing(model)}>
                {translate(language, 'editModel')}
              </Button>
            ) : null}
            {canAssign ? (
              <Button
                type="link"
                size="small"
                icon={<UserOutlined />}
                onClick={() =>
                  setGranting({
                    model,
                    assignments: (state?.assignments ?? []).filter((item) => item.resourceId === model.id),
                  })
                }
              >
                {translate(language, 'grantModel')}
              </Button>
            ) : null}
            {canWrite ? (
              <ModelRowMenu
                client={client}
                model={model}
                assignmentCount={(state?.assignments ?? []).filter((item) => item.resourceId === model.id).length}
                onChanged={reloadAll}
                onError={reportMutationError}
                onDelete={() => setDeleting(model)}
              />
            ) : null}
          </Space>
        </span>
      ),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            {t('modelsListTitle')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('modelsListDescription')}</Typography.Text>
        </div>
        <Space>
          {canWrite ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              {translate(language, 'addModel')}
            </Button>
          ) : null}
          <Button
            icon={<ReloadOutlined />}
            disabled={loading}
            onClick={() => {
              void load();
              if (canDataPlane) void loadDataPlane();
            }}
          >
            {translate(language, 'refresh')}
          </Button>
        </Space>
      </div>

      {error ? <Alert type="error" showIcon title={`${translate(language, 'modelsLoadFailed')}：${error}`} /> : null}
      {directoryQuery.isError ? (
        <Alert
          type="warning"
          showIcon
          title={translate(language, 'resourceAuxiliaryFailed')}
          description={translate(language, 'resourceAuxiliaryFailedHint')}
          action={
            <Button size="small" onClick={() => void load()}>
              {translate(language, 'retry')}
            </Button>
          }
        />
      ) : null}
      <GatewayPublication
        language={language}
        client={client}
        identity={identity}
        allowPublish
        compact
        disabled={Boolean(error) || loading}
        excluded={publishExcluded.map(
          (model) =>
            `${model.displayName}（${model.enabled ? t('publishExcludedIncomplete') : t('publishExcludedDisabled')}）`,
        )}
      />
      {state && canDataPlane && dataPlaneError && !error ? (
        <Alert type="warning" showIcon title={`${t('configLoadFailed')}：${dataPlaneError}`} />
      ) : null}

      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={t('searchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ maxWidth: 320 }}
      />

      <Table
        rowKey="id"
        size="middle"
        loading={loading && state === null}
        dataSource={error ? [] : filtered}
        columns={columns}
        pagination={{ hideOnSinglePage: true }}
        onRow={(model) => ({ onClick: () => setDetail(model) })}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={translate(language, 'modelsEmpty')}>
              <Typography.Text type="secondary">{translate(language, 'modelsEmptyHint')}</Typography.Text>
            </Empty>
          ),
        }}
      />

      <ModelCreateModal
        client={client}
        identity={identity}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={reloadAll}
      />
      <ModelEditorModal
        client={client}
        identity={identity}
        model={editing}
        onClose={() => setEditing(null)}
        onChanged={reloadAll}
      />
      <ModelDeleteModal
        client={client}
        model={deleting}
        assignmentCount={
          deleting ? (state?.assignments ?? []).filter((item) => item.resourceId === deleting.id).length : 0
        }
        onClose={() => setDeleting(null)}
        onChanged={reloadAll}
        onError={reportMutationError}
      />
      <ModelDetailDrawer
        client={client}
        model={detail}
        users={users}
        assignments={detail ? (state?.assignments ?? []).filter((item) => item.resourceId === detail.id) : []}
        canWrite={canWrite}
        canAssign={canAssign}
        dataPlane={dataPlane}
        dataPlaneError={dataPlaneError}
        dataPlaneLoading={dataPlaneLoading}
        dataPlaneAllowed={canDataPlane}
        onDataPlaneRefresh={loadDataPlane}
        onClose={() => setDetail(null)}
        onChanged={load}
        onError={reportMutationError}
        onEdit={(model) => setEditing(model)}
        onGrant={(model) =>
          setGranting({
            model,
            assignments: (state?.assignments ?? []).filter((item) => item.resourceId === model.id),
          })
        }
        onDelete={(model) => setDeleting(model)}
      />
      {pricingModel ? (
        <ModelPricingDrawer
          key={pricingModel.id}
          client={client}
          model={pricingModel}
          canWrite={canWrite}
          onClose={() => setPricingModel(null)}
        />
      ) : null}
    </div>
  );
}
