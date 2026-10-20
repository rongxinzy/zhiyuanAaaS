import type { Role } from '@aep/sdk-node';
import { Form, Input, Modal, Select, Switch, Typography } from 'antd';
import { useId, useState } from 'react';
import type { AdminConsoleClient, AdminTeam as Team } from './client.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { t } from './resources-shared.js';

export function TeamEditorModal({
  client,
  team,
  roles,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly team: Team | undefined;
  readonly roles: readonly Role[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(team);
  const ownerFieldId = useId();
  const [form] = Form.useForm();
  const [pending, setPending] = useState(false);
  const submit = async (values: {
    name: string;
    description?: string;
    enabled?: boolean;
    defaultRoleIds?: string[];
  }) => {
    setPending(true);
    try {
      const defaultRoleIds = values.defaultRoleIds ?? [];
      // Older AEP versions reject unknown fields. An absent defaults field
      // with no selected roles needs no write; a known field must still send
      // [] so clearing existing defaults remains explicit.
      const defaultsWrite = team?.defaultRoleIds !== undefined || defaultRoleIds.length > 0 ? { defaultRoleIds } : {};
      if (team)
        await client.updateTeam(team.id, {
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
          enabled: values.enabled !== false,
          ...defaultsWrite,
        });
      else {
        // The team id is server-generated from the name and anchors the
        // immutable materialized path.
        await client.createTeam({
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
          ...defaultsWrite,
        });
      }
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
      width={600}
      title={t(editing ? 'teamEditTitle' : 'teamEditorTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t('teamEditorDescription')}</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          id: team?.id ?? '',
          name: team?.name ?? '',
          description: team?.description ?? '',
          enabled: team?.enabled !== false,
          defaultRoleIds: [...(team?.defaultRoleIds ?? [])],
        }}
        onFinish={submit}
      >
        <Form.Item
          name="name"
          label={t('teamName')}
          rules={[{ required: true, whitespace: true, message: t('nameRequired') }]}
        >
          <Input disabled={pending} />
        </Form.Item>
        <Form.Item label={t('teamOwner')} htmlFor={ownerFieldId} extra={t('teamOwnerUnsupportedHint')}>
          <Input id={ownerFieldId} autoComplete="off" placeholder={t('teamOwnerUnsupported')} disabled />
        </Form.Item>
        <Form.Item name="defaultRoleIds" label={t('teamDefaultRoles')} extra={t('teamDefaultRolesHint')}>
          <Select
            mode="multiple"
            popupMatchSelectWidth
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('teamDefaultRolesPlaceholder')}
            disabled={pending || roles.length === 0}
            options={roles.map((role) => ({
              value: role.id,
              label: `${role.name}（${role.id}）`,
              disabled: !role.enabled,
            }))}
          />
        </Form.Item>
        <Form.Item name="description" label={t('description')}>
          <Input.TextArea rows={2} placeholder={t('descriptionPlaceholder')} disabled={pending} />
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
