import type { AdminModel } from '@aep/sdk-node';
import { Alert, Form, Input, Modal, Select, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { type AdminConsoleClient, type AdminIdentity, AdminPermission, hasAdminPermission } from './client.js';
import { translate } from './i18n.js';
import { ModelConnectionSelect } from './ModelConnectionSelect.js';
import { ModelCapabilitiesFormItem } from './model-capabilities.js';
import {
  language,
  MODEL_PROTOCOL_OPTIONS,
  ModelProtocol,
  ModelSourceType,
  modelSaveMessage,
  t,
} from './models-shared.js';
import { AdminNotificationKind, notify } from './notifications.js';

export function ModelCreateModal({
  client,
  identity,
  open,
  onClose,
  onCreated,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => Promise<void>;
}) {
  const [form] = Form.useForm<{
    displayName: string;
    protocol: 'openai-compatible' | 'anthropic';
    endpoint: string;
    upstreamModel: string;
    capabilities: string[];
    credentialId?: string | null;
  }>();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  const submit = async (values: {
    readonly displayName: string;
    readonly protocol: 'openai-compatible' | 'anthropic';
    readonly endpoint: string;
    readonly upstreamModel: string;
    readonly capabilities: string[];
    readonly credentialId?: string | null;
  }) => {
    setPending(true);
    try {
      await client.createModel({
        displayName: values.displayName.trim(),
        sourceType: ModelSourceType.Gateway,
        protocol: values.protocol,
        endpoint: values.endpoint.trim(),
        upstreamModel: values.upstreamModel.trim(),
        capabilities: values.capabilities,
        isDefault: false,
        enabled: true,
        // The identifier is server-generated from the display name; for
        // anthropic models it doubles as the gateway path prefix.
        credentialId: values.credentialId ?? null,
      });
      onClose();
      await onCreated();
      notify(AdminNotificationKind.Success, translate(language, 'changesSaved'));
    } catch (error) {
      notify(AdminNotificationKind.Error, modelSaveMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={translate(language, 'addModel')}
      okText={translate(language, 'save')}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={onClose}
      onOk={() => void form.submit()}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">{translate(language, 'addModelDescription')}</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <Form.Item
          name="displayName"
          label={translate(language, 'modelName')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item
          name="protocol"
          label={translate(language, 'modelProtocol')}
          initialValue={ModelProtocol.OpenAiCompatible}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Select disabled={pending} options={MODEL_PROTOCOL_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="endpoint"
          label={translate(language, 'modelEndpoint')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input placeholder={translate(language, 'modelEndpointPlaceholder')} disabled={pending} />
        </Form.Item>
        <Form.Item
          name="upstreamModel"
          label={translate(language, 'upstreamModel')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input placeholder={t('upstreamModelPlaceholder')} disabled={pending} />
        </Form.Item>
        <ModelCapabilitiesFormItem pending={pending} initialValue={['text']} />
        <Form.Item name="credentialId" label={t('labelCredential')} initialValue={null}>
          <ModelConnectionSelect client={client} identity={identity} disabled={pending} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function ModelEditorModal({
  client,
  identity,
  model,
  onClose,
  onChanged,
}: {
  readonly client: AdminConsoleClient;
  readonly identity?: AdminIdentity | undefined;
  readonly model: AdminModel | null;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
}) {
  // Without credentials.read the select renders the current reference as
  // read-only text and the patch below omits the key entirely, so the
  // server keeps the existing value instead of overwriting it with null.
  const canReadCredentials = hasAdminPermission(identity, AdminPermission.CredentialsRead);
  const [form] = Form.useForm<{
    displayName: string;
    endpoint: string;
    upstreamModel: string;
    capabilities: string[];
    enabled: boolean;
    isDefault: boolean;
    credentialId?: string | null;
  }>();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (model) {
      form.resetFields();
      form.setFieldsValue({
        displayName: model.displayName,
        endpoint: model.endpoint ?? '',
        upstreamModel: model.upstreamModel ?? '',
        capabilities: model.capabilities ?? [],
        enabled: model.enabled,
        isDefault: model.isDefault,
        credentialId: model.credentialId ?? null,
      });
    }
  }, [model, form]);
  const submit = async (values: {
    readonly displayName: string;
    readonly endpoint: string;
    readonly upstreamModel: string;
    readonly capabilities: string[];
    readonly enabled: boolean;
    readonly isDefault: boolean;
    readonly credentialId?: string | null;
  }) => {
    if (!model) return;
    setPending(true);
    try {
      await client.updateModel(model.id, {
        displayName: values.displayName.trim(),
        endpoint: values.endpoint.trim(),
        upstreamModel: values.upstreamModel.trim(),
        capabilities: values.capabilities,
        enabled: values.enabled,
        isDefault: values.isDefault,
        ...(canReadCredentials ? { credentialId: values.credentialId ?? null } : {}),
      });
      onClose();
      await onChanged();
      notify(AdminNotificationKind.Success, translate(language, 'changesSaved'));
    } catch (error) {
      notify(AdminNotificationKind.Error, modelSaveMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={model !== null}
      title={translate(language, 'editModel')}
      okText={translate(language, 'save')}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={onClose}
      onOk={() => void form.submit()}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">{translate(language, 'addModelDescription')}</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <Form.Item
          name="displayName"
          label={translate(language, 'modelName')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item
          name="endpoint"
          label={translate(language, 'modelEndpoint')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input placeholder={translate(language, 'modelEndpointPlaceholder')} disabled={pending} />
        </Form.Item>
        <Form.Item
          name="upstreamModel"
          label={translate(language, 'upstreamModel')}
          rules={[{ required: true, message: translate(language, 'fieldRequired') }]}
        >
          <Input placeholder={t('upstreamModelPlaceholder')} disabled={pending} />
        </Form.Item>
        <ModelCapabilitiesFormItem pending={pending} />
        <Form.Item name="enabled" label={translate(language, 'status')} valuePropName="checked">
          <Switch checkedChildren={t('stateEnabled')} unCheckedChildren={t('stateDisabled')} disabled={pending} />
        </Form.Item>
        <Form.Item name="isDefault" label={translate(language, 'defaultModel')} valuePropName="checked">
          <Switch disabled={pending} />
        </Form.Item>
        <Form.Item name="credentialId" label={t('labelCredential')}>
          <ModelConnectionSelect client={client} identity={identity} disabled={pending} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function ModelDeleteModal({
  client,
  model,
  assignmentCount,
  onClose,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly model: AdminModel | null;
  readonly assignmentCount: number;
  readonly onClose: () => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [pending, setPending] = useState(false);
  const remove = async () => {
    if (!model) return;
    setPending(true);
    try {
      await client.deleteModel(model.id);
      onClose();
      await onChanged();
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={model !== null}
      title={translate(language, 'deleteModelTitle')}
      okText={translate(language, 'delete')}
      okButtonProps={{ danger: true }}
      cancelText={translate(language, 'cancel')}
      confirmLoading={pending}
      onCancel={onClose}
      onOk={() => void remove()}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        title={translate(language, 'deleteModelDescription')}
        description={`${t('deleteImpactAssignments')}：${assignmentCount}`}
        style={{ marginBottom: 12 }}
      />
      <Typography.Text type="secondary">{t('disableImpact')}</Typography.Text>
    </Modal>
  );
}
