import type { PlatformUser, Role } from '@aep/sdk-node';
import { Alert, Form, Modal, Select } from 'antd';
import { useState } from 'react';
import type { AdminConsoleClient, AdminTeam as Team } from './client.js';
import { AdminNotificationKind, notify } from './notifications.js';
import { resourcesCopy as rc } from './resources-copy.js';
import { t } from './resources-shared.js';

export function AdjustOrgModal({
  client,
  user,
  roles,
  teams,
  open,
  onOpenChange,
  onChanged,
  onError,
}: {
  readonly client: AdminConsoleClient;
  readonly user: PlatformUser;
  readonly roles: readonly Role[];
  readonly teams: readonly Team[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChanged: () => Promise<void>;
  readonly onError: () => void;
}) {
  const [form] = Form.useForm<{ roles: string[]; teams: string[] }>();
  const [pending, setPending] = useState(false);
  const submit = async (values: { roles: string[]; teams: string[] }) => {
    setPending(true);
    try {
      await client.replaceUserRBAC(user.id, { roleIds: values.roles, teamIds: values.teams });
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
      title={rc.adjustOrgTitle}
      okText={t('save')}
      cancelText={t('cancel')}
      confirmLoading={pending}
      mask={{ closable: false }}
      onOk={() => form.submit()}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
    >
      <Alert type="warning" showIcon title={rc.adjustOrgNote} style={{ marginBottom: 16 }} />
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ roles: [...(user.roleIds ?? [])], teams: [...(user.teamIds ?? [])] }}
        onFinish={submit}
      >
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
            disabled={pending}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('selectRoles')}
            options={roles.map((role) => ({ value: role.id, label: `${role.name}（${role.id}）` }))}
          />
        </Form.Item>
        <Form.Item name="teams" label={t('selectTeams')} rules={[{ required: true, message: t('teamRequired') }]}>
          <Select
            mode="multiple"
            disabled={pending}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('selectTeams')}
            options={teams.map((team) => ({ value: team.id, label: `${team.name}（${team.id}）` }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
