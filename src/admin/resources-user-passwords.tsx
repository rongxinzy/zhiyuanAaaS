import type { PlatformUser } from '@aep/sdk-node';
import { Alert, Form, Input, Modal, Switch, Typography } from 'antd';
import { useState } from 'react';
import type { AdminConsoleClient } from './client.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { edgeWhitespaceRule, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, t } from './resources-shared.js';

export function PasswordResetModal({
  client,
  user,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly user: PlatformUser;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [form] = Form.useForm<{ temporaryPassword: string; requirePasswordChange: boolean }>();
  const [pending, setPending] = useState(false);
  const submit = async (values: { temporaryPassword: string; requirePasswordChange: boolean }) => {
    setPending(true);
    try {
      await client.resetUserPassword(user.id, {
        temporaryPassword: values.temporaryPassword,
        requirePasswordChange: values.requirePasswordChange,
      });
      onOpenChange(false);
      await onChanged();
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t('resetPasswordTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">
        {t('resetPasswordDescription')} <Typography.Text strong>{user.displayName}</Typography.Text>
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        autoComplete="off"
        initialValues={{ temporaryPassword: '', requirePasswordChange: true }}
        onFinish={submit}
      >
        <Form.Item
          name="temporaryPassword"
          label={t('temporaryPassword')}
          extra={t('passwordPolicy')}
          rules={[
            { required: true, message: t('passwordPolicy') },
            { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: t('passwordPolicy') },
            edgeWhitespaceRule,
          ]}
        >
          <Input.Password
            autoComplete="new-password"
            placeholder={t('temporaryPasswordPlaceholder')}
            disabled={pending}
          />
        </Form.Item>
        <Form.Item name="requirePasswordChange" label={t('requirePasswordChange')} valuePropName="checked">
          <Switch disabled={pending} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function SelfPasswordChangeModal({
  client,
  open,
  onOpenChange,
}: {
  readonly client: AdminConsoleClient;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [form] = Form.useForm<{ newPassword: string; confirmNewPassword: string }>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async (values: { newPassword: string }) => {
    setPending(true);
    setFailed(false);
    try {
      // The self-service endpoint rotates this console session in place; the
      // admin reset endpoint would revoke it and sign the operator out.
      await client.changePassword({ newPassword: values.newPassword });
      onOpenChange(false);
      notify(AdminNotificationKind.Success, t('passwordChangeSucceeded'));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t('changePasswordTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t('selfPasswordChangeDescription')}</Typography.Paragraph>
      {failed ? <Alert type="error" showIcon title={t('passwordChangeFailed')} style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" preserve={false} autoComplete="off" onFinish={submit}>
        <Form.Item
          name="newPassword"
          label={t('newPassword')}
          extra={t('passwordChangePolicy')}
          rules={[
            { required: true, message: t('passwordChangePolicy') },
            { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: t('passwordChangePolicy') },
            edgeWhitespaceRule,
          ]}
        >
          <Input.Password autoComplete="new-password" disabled={pending} />
        </Form.Item>
        <Form.Item
          name="confirmNewPassword"
          label={t('confirmNewPassword')}
          dependencies={['newPassword']}
          rules={[
            { required: true, message: t('requiredFields') },
            ({ getFieldValue }) => ({
              validator: (_, value: string) =>
                !value || getFieldValue('newPassword') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('newPasswordMismatch'))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" disabled={pending} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
