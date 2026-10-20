import type { Permission, Role } from '@aep/sdk-node';
import { Form, Input, Modal, Switch, Typography } from 'antd';
import { useState } from 'react';
import type { AdminConsoleClient } from './client.js';
import { PermissionTree } from './components/PermissionTree.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { t } from './resources-shared.js';

export function RoleEditorModal({
  client,
  role,
  permissions,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly role: Role | undefined;
  readonly permissions: readonly Permission[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(role);
  const [form] = Form.useForm();
  const [pending, setPending] = useState(false);
  const submit = async (values: { name: string; description?: string; permissions?: string[]; enabled?: boolean }) => {
    setPending(true);
    try {
      if (role)
        await client.updateRole(role.id, {
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
          enabled: values.enabled !== false,
          permissions: values.permissions ?? [],
        });
      // The role id is server-generated from the name.
      else
        await client.createRole({
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
          permissions: values.permissions ?? [],
        });
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t('changesSaved'));
    } catch {
      onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      width={1000}
      title={t(editing ? 'roleEditTitle' : 'roleEditorTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t('roleEditorDescription')}</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          id: role?.id ?? '',
          name: role?.name ?? '',
          description: role?.description ?? '',
          permissions: [...(role?.permissions ?? [])],
          enabled: role?.enabled !== false,
        }}
        onFinish={submit}
      >
        <Form.Item
          name="name"
          label={t('roleName')}
          rules={[{ required: true, whitespace: true, message: t('nameRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item name="description" label={t('description')}>
          <Input.TextArea rows={2} placeholder={t('descriptionPlaceholder')} disabled={pending} />
        </Form.Item>
        <Form.Item name="permissions" label={t('permissions')} extra={t('permissionTreeHint')}>
          <PermissionTree permissions={permissions} existingPermissions={role?.permissions ?? []} disabled={pending} />
        </Form.Item>
        {editing ? (
          <Form.Item name="enabled" label={t('status')} valuePropName="checked">
            <Switch disabled={pending} checkedChildren={t('enabled')} unCheckedChildren={t('disabled')} />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
