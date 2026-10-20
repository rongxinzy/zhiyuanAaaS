import type { Role } from '@aep/sdk-node';
import { Alert, Form, Input, Modal, Select, Switch, Typography } from 'antd';
import { useState } from 'react';
import type { AdminConsoleClient, AdminTeam as Team } from './client.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { type AdminUser, edgeWhitespaceRule, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, t } from './resources-shared.js';

// ---------------------------------------------------------------------------
// User editor / password reset / import
// ---------------------------------------------------------------------------
export function UserEditorModal({
  client,
  existingUsernames,
  user,
  roles,
  teams,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly existingUsernames: readonly string[];
  readonly user: AdminUser | undefined;
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const editing = Boolean(user);
  const [form] = Form.useForm();
  const [pending, setPending] = useState(false);
  const [partialSave, setPartialSave] = useState(false);
  const submit = async (values: {
    username?: string;
    displayName: string;
    email?: string;
    temporaryPassword?: string;
    roles: string[];
    teams: string[];
    requirePasswordChange?: boolean;
  }) => {
    const normalizedUsername = (values.username ?? '').trim();
    if (!user && existingUsernames.includes(normalizedUsername)) {
      form.setFields([{ name: 'username', errors: [t('usernameAlreadyExists')] }]);
      return;
    }
    setPending(true);
    setPartialSave(false);
    let profileCommitted = false;
    try {
      if (user) {
        await client.updateUser(user.id, {
          displayName: values.displayName.trim(),
          email: values.email?.trim() || null,
        });
        profileCommitted = true;
        await client.replaceUserRBAC(user.id, { roleIds: values.roles, teamIds: values.teams });
      } else {
        await client.createUser({
          username: normalizedUsername,
          displayName: values.displayName.trim(),
          email: values.email?.trim() || null,
          temporaryPassword: values.temporaryPassword ?? '',
          roleIds: values.roles,
          teamIds: values.teams,
          requirePasswordChange: values.requirePasswordChange !== false,
        });
      }
      onOpenChange(false);
      await onChanged();
      notify(AdminNotificationKind.Success, t(editing ? 'userUpdated' : 'userCreated'));
    } catch {
      if (profileCommitted) {
        setPartialSave(true);
        // These endpoints commit independently. Refresh the committed profile,
        // keep the intended memberships in the open form, and never claim rollback.
        await onChanged().catch(() => undefined);
        notify(AdminNotificationKind.Error, t('userPartialSave'));
      } else onError();
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      width={600}
      title={t(editing ? 'userEditTitle' : 'userEditorTitle')}
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
        {t(editing ? 'userEditDescription' : 'userEditorDescription')}
      </Typography.Paragraph>
      {partialSave ? (
        <Alert type="warning" showIcon title={t('userPartialSave')} description={t('userPartialSaveHint')} />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        autoComplete="off"
        initialValues={{
          username: user?.username ?? '',
          displayName: user?.displayName ?? '',
          email: user?.email ?? '',
          temporaryPassword: '',
          roles: [...(user?.roleIds ?? [])],
          teams: [...(user?.teamIds ?? [])],
          requirePasswordChange: true,
        }}
        onFinish={submit}
      >
        {editing ? null : (
          <Form.Item
            name="username"
            label={t('username')}
            rules={[{ required: true, whitespace: true, message: t('usernameRequired') }]}
          >
            <Input autoComplete="off" disabled={pending} />
          </Form.Item>
        )}
        <Form.Item
          name="displayName"
          label={t('displayName')}
          rules={[{ required: true, whitespace: true, message: t('displayNameRequired') }]}
        >
          <Input autoComplete="off" disabled={pending} />
        </Form.Item>
        <Form.Item name="email" label={t('email')} rules={[{ type: 'email', message: t('email') }]}>
          <Input autoComplete="off" placeholder={t('emailPlaceholder')} disabled={pending} />
        </Form.Item>
        {editing ? null : (
          <Form.Item
            name="temporaryPassword"
            label={t('temporaryPassword')}
            extra={t('passwordPolicy')}
            rules={[
              { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH, message: t('passwordPolicy') },
              edgeWhitespaceRule,
            ]}
          >
            <Input.Password
              autoComplete="new-password"
              placeholder={t('defaultPasswordPlaceholder')}
              disabled={pending}
            />
          </Form.Item>
        )}
        <Form.Item
          name="roles"
          label={t('selectRoles')}
          rules={[
            {
              validator: (_, value: string[]) =>
                Array.isArray(value) && value.length > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('roleRequired'))),
            },
          ]}
        >
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('selectRoles')}
            disabled={pending}
            options={roles.map((role) => ({ value: role.id, label: `${role.name}（${role.id}）` }))}
          />
        </Form.Item>
        <Form.Item name="teams" label={t('selectTeams')} rules={[{ required: true, message: t('teamRequired') }]}>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('selectTeams')}
            disabled={pending}
            options={teams.map((team) => ({ value: team.id, label: `${team.name}（${team.id}）` }))}
          />
        </Form.Item>
        {editing ? null : (
          <Form.Item name="requirePasswordChange" label={t('requirePasswordChange')} valuePropName="checked">
            <Switch disabled={pending} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
