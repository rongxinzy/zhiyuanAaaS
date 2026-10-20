import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Select, Space, Typography } from 'antd';
import { type AdminConsoleClient, type AdminIdentity, AdminPermission, hasAdminPermission } from './client.js';
import { connectionCopy as c } from './model-connection-copy.js';

/** Controlled Form.Item field. Only credential metadata is requested. */
export function ModelConnectionSelect({
  client,
  identity,
  value,
  onChange,
  disabled,
  id,
}: {
  readonly client: AdminConsoleClient;
  readonly identity: AdminIdentity | undefined;
  readonly value?: string | null | undefined;
  readonly onChange?: (value: string | null) => void;
  readonly disabled?: boolean | undefined;
  readonly id?: string | undefined;
}) {
  const allowed = hasAdminPermission(identity, AdminPermission.CredentialsRead);
  const credentialsQuery = useQuery({
    queryKey: ['admin', 'credentials', identity],
    queryFn: () => client.credentials(identity),
    enabled: allowed,
  });
  const rows = (credentialsQuery.data?.credentials ?? []).filter(
    (row) => row.enabled && row.deliveryMode === 'server_only',
  );
  const loading = credentialsQuery.isFetching;
  const failed = credentialsQuery.isError && !credentialsQuery.isFetching;
  if (!allowed)
    return (
      <Space orientation="vertical">
        <Typography.Text>{value || c.none}</Typography.Text>
        <Typography.Text type="secondary">{c.restricted}</Typography.Text>
      </Space>
    );
  const missing = Boolean(value && !rows.some((row) => row.id === value));
  const options = [
    { value: '', label: c.none },
    ...rows.map((row) => ({
      value: row.id,
      label: `${row.name} · ${row.service}`,
    })),
    ...(missing ? [{ value: value!, label: value!, disabled: true }] : []),
  ];
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Select
        {...(id ? { id } : {})}
        aria-label={c.label}
        value={value ?? ''}
        onChange={(next) => onChange?.(next || null)}
        options={options}
        loading={loading}
        disabled={disabled || loading || failed}
        showSearch={{ optionFilterProp: 'label' }}
        style={{ width: '100%' }}
      />
      {failed ? (
        <Alert
          type="error"
          title={c.failed}
          action={
            <Button size="small" onClick={() => void credentialsQuery.refetch()}>
              {c.retry}
            </Button>
          }
        />
      ) : missing && !loading ? (
        <Alert type="warning" title={c.unavailable} />
      ) : null}
      <Typography.Text type="secondary">
        {c.hint} {c.serviceOnly}
      </Typography.Text>
    </Space>
  );
}
