import { Form, Input, Modal, Switch, Typography } from 'antd';
import { useState } from 'react';
import type { AdminConsoleClient, AdminSkill } from './client.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { t } from './resources-shared.js';

export function SkillEditorModal({
  client,
  skill,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly skill: AdminSkill | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(skill);
  const [form] = Form.useForm();
  const [pending, setPending] = useState(false);
  const submit = async (values: { name: string; description?: string; enabled?: boolean }) => {
    setPending(true);
    try {
      if (skill)
        await client.updateSkill(skill.id, {
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
          enabled: values.enabled !== false,
        });
      // The skill id is server-generated from the name.
      else
        await client.createSkill({
          name: values.name.trim(),
          description: (values.description ?? '').trim(),
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
      title={t(editing ? 'skillEditTitle' : 'skillEditorTitle')}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Typography.Paragraph type="secondary">{t('skillEditorDescription')}</Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          name: skill?.name ?? '',
          description: skill?.description ?? '',
          enabled: skill?.enabled !== false,
        }}
        onFinish={submit}
      >
        <Form.Item
          name="name"
          label={t('skillName')}
          rules={[{ required: true, whitespace: true, message: t('nameRequired') }]}
        >
          <Input disabled={pending} />
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
