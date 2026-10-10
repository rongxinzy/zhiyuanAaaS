import { DeleteOutlined, EditOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useCallback, useState } from 'react';
import type { GatewayDimension, GatewayLimit, GatewayLimitWrite } from './gateway-api.js';
import {
  dimensionLabels,
  formatGatewayNumber,
  GatewayField,
  GatewayHeading,
  GatewayLoadError,
  GatewayPage,
  type GatewayProps,
  gatewayT as t,
  useGatewayRemote,
} from './gateway-ui.js';
import { notify } from './notifications.js';

type RuleForm = GatewayLimitWrite & { id: string };
export function GatewayLimits({ client, identity }: GatewayProps) {
  const { token } = theme.useToken();
  const capabilities = useGatewayRemote(useCallback(() => client.getGatewayCapabilities(), [client]));
  const subjects = useGatewayRemote(useCallback(() => client.gatewaySubjects(identity), [client, identity]));
  const rules = useGatewayRemote(useCallback(() => client.listGatewayLimits(), [client]));
  const status = useGatewayRemote(useCallback(() => client.getGatewayLimitsStatus(), [client]));
  const [mode, setMode] = useState('limits');
  const [form] = Form.useForm<RuleForm>();
  const [editing, setEditing] = useState<GatewayLimit>();
  const [busy, setBusy] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  const [unpublished, setUnpublished] = useState(false);
  const scope = Form.useWatch('scopeType', form) ?? 'user';
  const [quotaUser, setQuotaUser] = useState('');
  const [amount, setAmount] = useState<number | null>(1000);
  const quota = useGatewayRemote(
    useCallback(
      () => (quotaUser ? client.getGatewayQuota(quotaUser) : Promise.resolve(undefined)),
      [client, quotaUser],
    ),
  );
  const options = (dimension: GatewayDimension) => {
    const items =
      dimension === 'model'
        ? subjects.value?.models
        : dimension === 'user'
          ? subjects.value?.users
          : dimension === 'team'
            ? subjects.value?.teams
            : subjects.value?.roles;
    return (items ?? []).map((item) => ({
      value: item.id,
      label: 'displayName' in item ? item.displayName : item.name,
    }));
  };
  const intervalLabels = {
    second: 'gatewaySecond',
    minute: 'gatewayMinute',
    hour: 'gatewayHour',
    day: 'gatewayDay',
  } as const;
  const stateLabels = {
    unpublished: 'gatewayUnpublished',
    pending: 'gatewayPending',
    applied: 'gatewayApplied',
    error: 'gatewayApplyFailed',
  } as const;
  async function mutate(action: () => Promise<unknown>, message: Parameters<typeof t>[0], after?: () => void) {
    if (busy) return;
    setBusy(true);
    setWriteFailed(false);
    try {
      await action();
      after?.();
      notify('success', t(message));
    } catch {
      setWriteFailed(true);
      notify('error', t('gatewayWriteFailed'));
    } finally {
      setBusy(false);
    }
  }
  async function save(values: RuleForm) {
    const configuration: GatewayLimitWrite = {
      kind: values.kind,
      scopeType: values.scopeType,
      maximum: values.maximum,
      interval: values.interval,
      enabled: values.enabled,
      expectedVersion: editing?.version ?? 0,
      scopeId: values.scopeType === 'global' ? null : (values.scopeId ?? null),
      modelId: values.scopeType === 'model' ? null : values.modelId || null,
    };
    await mutate(
      async () => {
        const saved = await client.putGatewayLimit(values.id, configuration);
        setEditing(saved);
      },
      'gatewayRuleSaved',
      () => {
        rules.retry();
        setUnpublished(true);
      },
    );
  }
  function edit(rule: GatewayLimit) {
    setEditing(rule);
    form.setFieldsValue({ ...rule.configuration, id: rule.id });
  }
  function reset() {
    setEditing(undefined);
    form.resetFields();
  }
  function refresh() {
    rules.retry();
    status.retry();
    capabilities.retry();
    subjects.retry();
    quota.retry();
  }
  const canWrite =
    !busy &&
    !rules.loading &&
    !status.loading &&
    !capabilities.error &&
    !rules.error &&
    !status.error &&
    Boolean(rules.value && status.value && capabilities.value);
  return (
    <GatewayPage>
      <GatewayHeading title="gatewayLimits" description="gatewayLimitsDescription">
        <Button icon={<ReloadOutlined aria-hidden />} onClick={refresh} loading={rules.loading || status.loading}>
          {t('refresh')}
        </Button>
      </GatewayHeading>
      {subjects.error ? <GatewayLoadError retry={subjects.retry} /> : null}
      {capabilities.error ? <GatewayLoadError retry={capabilities.retry} /> : null}
      <Segmented
        aria-label={t('gatewayManagementMode')}
        value={mode}
        onChange={setMode}
        disabled={busy}
        options={[
          { value: 'limits', label: t('gatewayRateRules') },
          { value: 'quota', label: t('gatewayTokenQuota') },
        ]}
      />
      {writeFailed ? (
        <Alert type="error" showIcon title={t('gatewayWriteFailed')} description={t('gatewayVersionHint')} />
      ) : null}
      {mode === 'limits' ? (
        <>
          {rules.error ? <GatewayLoadError retry={rules.retry} /> : null}
          {status.error ? <GatewayLoadError retry={status.retry} /> : null}
          <Row justify="space-between" gutter={[token.margin, token.margin]}>
            <Col>
              <Space wrap>
                <Tag
                  color={
                    status.value?.state === 'applied'
                      ? 'success'
                      : status.value?.state === 'error'
                        ? 'error'
                        : 'default'
                  }
                >
                  {status.value ? t(stateLabels[status.value.state]) : t('loading')}
                </Tag>
                {status.value?.revision ? <Typography.Text copyable>{status.value.revision}</Typography.Text> : null}
              </Space>
            </Col>
            <Col>
              <Popconfirm
                title={t('gatewayPublishConfirm')}
                description={t('gatewayPublishHint')}
                okText={t('gatewayPublish')}
                cancelText={t('cancel')}
                onConfirm={() =>
                  mutate(
                    () => client.publishGatewayLimits(),
                    'gatewayPublished',
                    () => {
                      status.retry();
                      setUnpublished(false);
                    },
                  )
                }
              >
                <Button type="primary" icon={<UploadOutlined aria-hidden />} disabled={!canWrite} loading={busy}>
                  {t('gatewayPublish')}
                </Button>
              </Popconfirm>
            </Col>
          </Row>
          <Alert
            type="info"
            showIcon
            title={unpublished ? t('gatewayDraftChanged') : t('gatewayRuntimeHint')}
            description={status.value?.runtimeVerified ? t('gatewayRuntimeVerified') : t('gatewayRuntimeNotVerified')}
          />
          <Table
            aria-label={t('gatewayRateRules')}
            rowKey="id"
            dataSource={rules.value?.items ?? []}
            loading={rules.loading}
            scroll={{ x: 'max-content' }}
            columns={[
              { title: t('gatewayRuleId'), dataIndex: 'id' },
              {
                title: t('gatewayRuleType'),
                render: (_: unknown, row: GatewayLimit) =>
                  t(row.configuration.kind === 'requests' ? 'gatewayRequestLimit' : 'gatewayTokenLimit'),
              },
              {
                title: t('gatewayScope'),
                render: (_: unknown, row: GatewayLimit) => (
                  <>
                    {t(
                      row.configuration.scopeType === 'global'
                        ? 'gatewayGlobal'
                        : dimensionLabels[row.configuration.scopeType],
                    )}
                    {row.configuration.scopeId
                      ? `: ${options(row.configuration.scopeType as GatewayDimension).find((item) => item.value === row.configuration.scopeId)?.label ?? row.configuration.scopeId}`
                      : ''}
                  </>
                ),
              },
              {
                title: t('gatewayModel'),
                render: (_: unknown, row: GatewayLimit) =>
                  row.configuration.modelId ||
                  (row.configuration.scopeType === 'model' ? row.configuration.scopeId : null) ||
                  t('gatewayAllModels'),
              },
              {
                title: t('gatewayMaximum'),
                render: (_: unknown, row: GatewayLimit) =>
                  `${formatGatewayNumber(row.configuration.maximum)} / ${t(intervalLabels[row.configuration.interval])}`,
              },
              {
                title: t('gatewayEnabled'),
                render: (_: unknown, row: GatewayLimit) => (
                  <Switch
                    aria-label={`${t('gatewayEnabled')} ${row.id}`}
                    checked={row.configuration.enabled}
                    disabled={!canWrite}
                    onChange={(enabled) =>
                      void mutate(
                        () =>
                          client.putGatewayLimit(row.id, {
                            ...row.configuration,
                            enabled,
                            expectedVersion: row.version,
                          }),
                        'gatewayRuleSaved',
                        () => {
                          rules.retry();
                          setUnpublished(true);
                        },
                      )
                    }
                  />
                ),
              },
              {
                title: t('gatewayAction'),
                render: (_: unknown, row: GatewayLimit) => (
                  <Space>
                    <Button type="link" icon={<EditOutlined aria-hidden />} disabled={busy} onClick={() => edit(row)}>
                      {t('edit')}
                    </Button>
                    <Popconfirm
                      title={t('gatewayDeleteConfirm')}
                      okText={t('delete')}
                      cancelText={t('cancel')}
                      onConfirm={() =>
                        mutate(
                          () => client.deleteGatewayLimit(row.id, row.version),
                          'gatewayRuleDeleted',
                          () => {
                            rules.retry();
                            setUnpublished(true);
                            if (editing?.id === row.id) reset();
                          },
                        )
                      }
                    >
                      <Button type="link" danger icon={<DeleteOutlined aria-hidden />} disabled={!canWrite}>
                        {t('delete')}
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
          <Card title={t(editing ? 'gatewayEditRule' : 'gatewayNewRule')}>
            <Form
              form={form}
              layout="vertical"
              initialValues={{ kind: 'requests', scopeType: 'user', maximum: 40, interval: 'minute', enabled: true }}
              onFinish={(values) => void save(values)}
              disabled={busy}
            >
              <Row gutter={[token.margin, token.margin]}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="id"
                    label={t('gatewayRuleId')}
                    rules={[
                      { required: true, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/, message: t('gatewayRuleIdHint') },
                    ]}
                  >
                    <Input disabled={Boolean(editing) || busy} maxLength={80} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="kind" label={t('gatewayRuleType')} rules={[{ required: true }]}>
                    <Select
                      aria-label={t('gatewayRuleType')}
                      options={[
                        { value: 'requests', label: t('gatewayRequestLimit') },
                        { value: 'tokens', label: t('gatewayTokenLimit') },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="scopeType" label={t('gatewayScope')} rules={[{ required: true }]}>
                    <Select
                      aria-label={t('gatewayScope')}
                      onChange={() => form.setFieldsValue({ scopeId: null, modelId: null })}
                      options={[
                        { value: 'global', label: t('gatewayGlobal') },
                        ...(['user', 'team', 'role', 'model'] as const).map((value) => ({
                          value,
                          label: t(dimensionLabels[value]),
                        })),
                      ]}
                    />
                  </Form.Item>
                </Col>
                {scope !== 'global' ? (
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="scopeId"
                      label={t('gatewaySubject')}
                      rules={[{ required: true, message: t('gatewaySubjectRequired') }]}
                    >
                      <Select
                        aria-label={t('gatewaySubject')}
                        showSearch
                        optionFilterProp="label"
                        options={options(scope as GatewayDimension)}
                        loading={subjects.loading}
                      />
                    </Form.Item>
                  </Col>
                ) : null}
                {scope !== 'model' ? (
                  <Col xs={24} md={12}>
                    <Form.Item name="modelId" label={t('gatewayOptionalModel')}>
                      <Select
                        aria-label={t('gatewayOptionalModel')}
                        allowClear
                        placeholder={t('gatewayAllModels')}
                        showSearch
                        optionFilterProp="label"
                        options={options('model')}
                        loading={subjects.loading}
                      />
                    </Form.Item>
                  </Col>
                ) : null}
                <Col xs={24} md={12}>
                  <Form.Item
                    name="maximum"
                    label={t('gatewayMaximum')}
                    rules={[
                      {
                        required: true,
                        type: 'number',
                        min: 1,
                        max: 1e12,
                        transform: (value) => value,
                        message: t('gatewayMaximumHint'),
                      },
                    ]}
                  >
                    <InputNumber min={1} max={1e12} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="interval" label={t('gatewayInterval')} rules={[{ required: true }]}>
                    <Select
                      aria-label={t('gatewayInterval')}
                      options={Object.entries(intervalLabels).map(([value, key]) => ({ value, label: t(key) }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="enabled" label={t('gatewayEnabled')} valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
              </Row>
              <Space wrap>
                <Button type="primary" htmlType="submit" loading={busy} disabled={!canWrite}>
                  {t('gatewaySaveRule')}
                </Button>
                <Button onClick={reset} disabled={busy}>
                  {t('gatewayNewRule')}
                </Button>
              </Space>
            </Form>
          </Card>
        </>
      ) : (
        <Card title={t('gatewayTokenQuota')}>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Typography.Text type="secondary">{t('gatewayQuotaScope')}</Typography.Text>
            {!capabilities.value?.sources.quota && !capabilities.loading ? (
              <Alert showIcon type="warning" title={t('gatewayQuotaUnavailable')} />
            ) : null}
            <GatewayField
              label={t('gatewayUser')}
              value={quotaUser}
              options={options('user')}
              onChange={setQuotaUser}
              loading={subjects.loading}
              disabled={busy || !capabilities.value?.sources.quota}
            />
            {quota.error ? <GatewayLoadError retry={quota.retry} /> : null}
            <Descriptions
              column={1}
              items={[
                {
                  key: 'balance',
                  label: t('gatewayQuotaBalance'),
                  children: quota.loading && quotaUser ? t('loading') : formatGatewayNumber(quota.value?.quota),
                },
              ]}
            />
            <Form layout="vertical">
              <Form.Item label={t('gatewayQuotaAmount')} htmlFor="gateway-quota-amount">
                <InputNumber
                  id="gateway-quota-amount"
                  value={amount}
                  onChange={setAmount}
                  min={-1e12}
                  max={1e12}
                  precision={0}
                  disabled={busy}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Form>
            <Space wrap>
              <Button
                onClick={quota.retry}
                loading={quota.loading && Boolean(quotaUser)}
                disabled={!quotaUser || busy || !capabilities.value?.sources.quota}
              >
                {t('gatewayReadQuota')}
              </Button>
              <Popconfirm
                title={t('gatewayQuotaRefreshConfirm')}
                okText={t('gatewayRefreshQuota')}
                cancelText={t('cancel')}
                onConfirm={() =>
                  mutate(() => client.refreshGatewayQuota(quotaUser, amount ?? 0), 'gatewayQuotaChanged', quota.retry)
                }
              >
                <Button
                  disabled={
                    !quotaUser ||
                    busy ||
                    amount === null ||
                    amount < 0 ||
                    !Number.isSafeInteger(amount) ||
                    !capabilities.value?.sources.quota
                  }
                >
                  {t('gatewayRefreshQuota')}
                </Button>
              </Popconfirm>
              <Popconfirm
                title={t('gatewayQuotaDeltaConfirm')}
                okText={t('gatewayChangeQuota')}
                cancelText={t('cancel')}
                onConfirm={() =>
                  mutate(() => client.changeGatewayQuota(quotaUser, amount ?? 0), 'gatewayQuotaChanged', quota.retry)
                }
              >
                <Button
                  type="primary"
                  disabled={
                    !quotaUser ||
                    busy ||
                    amount === null ||
                    !Number.isSafeInteger(amount) ||
                    !capabilities.value?.sources.quota
                  }
                >
                  {t('gatewayChangeQuota')}
                </Button>
              </Popconfirm>
            </Space>
          </Space>
        </Card>
      )}
    </GatewayPage>
  );
}
