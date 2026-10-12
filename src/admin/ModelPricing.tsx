import type { AdminModel } from '@aep/sdk-node';
import { ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { type AdminConsoleClient, AdminRequestError } from './client.js';
import { ADMIN_LANGUAGE, translate } from './i18n.js';
import type { ModelPriceConfiguration, ModelPricing } from './model-pricing-api.js';
import { AdminNotificationKind, notify } from './notifications.js';

const t = (key: Parameters<typeof translate>[1]) => translate(ADMIN_LANGUAGE, key);
const PRICE_PATTERN = /^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$/;
type PriceFields = ModelPriceConfiguration;

export function ModelPricingDrawer({
  client,
  model,
  canWrite,
  onClose,
}: {
  client: AdminConsoleClient;
  model: Pick<AdminModel, 'id' | 'displayName'>;
  canWrite: boolean;
  onClose: () => void;
}) {
  const { token } = theme.useToken();
  const [form] = Form.useForm<PriceFields>();
  const [modal, contextHolder] = Modal.useModal();
  const [value, setValue] = useState<ModelPricing>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [reload, setReload] = useState(0);
  const apply = useCallback(
    (next: ModelPricing) => {
      setValue(next);
      form.resetFields();
      form.setFieldsValue(next.pricing ?? { currency: 'CNY' });
      setDirty(false);
      setSaveError(false);
      setConflict(false);
    },
    [form],
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setUnsupported(false);
    void client
      .getModelPricing(model.id)
      .then((next) => {
        if (active) apply(next);
      })
      .catch((error) => {
        if (active) {
          setLoadError(true);
          setValue(undefined);
          setUnsupported(
            error instanceof AdminRequestError && error.status === 404 && error.code !== 'RESOURCE_NOT_FOUND',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, model.id, apply, reload]);

  const editable = canWrite && Boolean(value) && !loading && !saving && !conflict;
  function withDiscardConfirmation(action: () => void) {
    if (saving) return;
    if (!dirty) {
      action();
      return;
    }
    modal.confirm({
      title: t('modelPricingDiscard'),
      content: t('modelPricingDiscardHint'),
      okText: t('modelPricingDiscardAction'),
      cancelText: t('cancel'),
      onOk: action,
    });
  }
  async function save(pricing: ModelPriceConfiguration | null) {
    if (!editable || !value) return;
    setSaving(true);
    setSaveError(false);
    try {
      apply(await client.putModelPricing(model.id, { pricing, expectedVersion: value.version }));
      notify(AdminNotificationKind.Success, t(pricing ? 'modelPricingSaved' : 'modelPricingCleared'));
    } catch (error) {
      if (error instanceof AdminRequestError && error.status === 409) setConflict(true);
      else setSaveError(true);
    } finally {
      setSaving(false);
    }
  }
  const submit = (fields: PriceFields) =>
    save({
      currency: fields.currency,
      inputPricePerMillionTokens: String(fields.inputPricePerMillionTokens),
      outputPricePerMillionTokens: String(fields.outputPricePerMillionTokens),
      ...(fields.cachedInputPricePerMillionTokens != null && fields.cachedInputPricePerMillionTokens !== ''
        ? { cachedInputPricePerMillionTokens: String(fields.cachedInputPricePerMillionTokens) }
        : {}),
      ...(fields.source?.trim() ? { source: fields.source.trim() } : {}),
    });
  const currencies = [
    ...new Set(['CNY', 'USD', value?.pricing?.currency].filter((item): item is string => Boolean(item))),
  ];
  const priceRules = (required: boolean) => [
    ...(required ? [{ required: true, message: t('modelPricingRequired') }] : []),
    { pattern: PRICE_PATTERN, message: t('modelPricingDecimal') },
  ];
  return (
    <>
      {contextHolder}
      <Drawer
        open
        title={t('modelPricingTitle')}
        size={560}
        onClose={() => withDiscardConfirmation(onClose)}
        closable={!saving}
        keyboard={!saving}
        maskClosable={!saving}
        footer={
          canWrite ? (
            <Space wrap>
              <Button
                type="primary"
                aria-label={t('modelPricingSave')}
                loading={saving}
                disabled={!editable}
                onClick={() => form.submit()}
              >
                {t('modelPricingSave')}
              </Button>
              <Popconfirm
                title={t('modelPricingClearConfirm')}
                okText={t('modelPricingClear')}
                cancelText={t('cancel')}
                onConfirm={() => save(null)}
                disabled={!editable || !value?.pricing}
              >
                <Button danger disabled={!editable || !value?.pricing}>
                  {t('modelPricingClear')}
                </Button>
              </Popconfirm>
              <Button disabled={saving} onClick={() => withDiscardConfirmation(onClose)}>
                {t('cancel')}
              </Button>
            </Space>
          ) : undefined
        }
      >
        <Space orientation="vertical" size={token.marginLG} style={{ width: '100%' }}>
          <div>
            <Typography.Title level={5} style={{ marginTop: 0, marginBottom: token.marginXS }}>
              {model.displayName}
            </Typography.Title>
            <Typography.Text type="secondary">{t('modelPricingDescription')}</Typography.Text>
          </div>
          <Alert type="info" showIcon title={t('modelPricingScope')} />
          {!canWrite ? <Alert type="info" showIcon title={t('modelPricingReadOnly')} /> : null}
          {loading ? <Skeleton active /> : null}
          {loadError ? (
            <Alert
              type="error"
              showIcon
              title={t('modelPricingLoadFailed')}
              description={unsupported ? t('modelPricingUnavailable') : undefined}
              action={<Button onClick={() => setReload((n) => n + 1)}>{t('retry')}</Button>}
            />
          ) : null}
          {value && !loading ? (
            <>
              <Descriptions
                column={1}
                size="small"
                items={[
                  {
                    key: 'status',
                    label: t('status'),
                    children: (
                      <Tag color={value.pricing ? 'success' : 'default'}>
                        {t(value.pricing ? 'modelPricingConfigured' : 'modelPricingUnconfigured')}
                      </Tag>
                    ),
                  },
                  ...(value.updatedAt
                    ? [
                        {
                          key: 'updated',
                          label: t('modelPricingUpdated'),
                          children: new Date(value.updatedAt).toLocaleString(),
                        },
                      ]
                    : []),
                ]}
              />
              {conflict ? (
                <Alert
                  type="warning"
                  showIcon
                  title={t('modelPricingConflict')}
                  action={
                    <Button
                      icon={<ReloadOutlined aria-hidden />}
                      onClick={() => withDiscardConfirmation(() => setReload((n) => n + 1))}
                    >
                      {t('modelPricingReload')}
                    </Button>
                  }
                />
              ) : null}
              {saveError ? <Alert type="error" showIcon title={t('modelPricingSaveFailed')} /> : null}
            </>
          ) : null}
          <Form
            form={form}
            layout="vertical"
            disabled={!editable}
            onValuesChange={() => setDirty(true)}
            onFinish={submit}
            initialValues={{ currency: 'CNY' }}
          >
            <Form.Item name="currency" label={t('modelPricingCurrency')} rules={[{ required: true }]}>
              <Select options={currencies.map((currency) => ({ label: currency, value: currency }))} />
            </Form.Item>
            <Row gutter={token.margin}>
              <Col xs={24} sm={12}>
                <Form.Item name="inputPricePerMillionTokens" label={t('modelPricingInput')} rules={priceRules(true)}>
                  <InputNumber stringMode changeOnBlur={false} controls={false} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="outputPricePerMillionTokens" label={t('modelPricingOutput')} rules={priceRules(true)}>
                  <InputNumber stringMode changeOnBlur={false} controls={false} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="cachedInputPricePerMillionTokens"
              label={t('modelPricingCachedInput')}
              rules={priceRules(false)}
              extra={t('modelPricingOptional')}
            >
              <InputNumber stringMode changeOnBlur={false} controls={false} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="source" label={t('modelPricingSource')} extra={t('modelPricingSourceHint')}>
              <Input.TextArea rows={3} maxLength={200} />
            </Form.Item>
          </Form>
        </Space>
      </Drawer>
    </>
  );
}
