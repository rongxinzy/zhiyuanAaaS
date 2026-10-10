import { Alert, Button, Col, Form, Row, Select, Typography, theme } from 'antd';
import { type ReactNode, useCallback, useEffect, useId, useState } from 'react';
import type { AdminConsoleClient, AdminIdentity } from './client.js';
import { ADMIN_LANGUAGE, type AdminTranslationKey, translate } from './i18n.js';

export const gatewayT = (key: AdminTranslationKey) => translate(ADMIN_LANGUAGE, key);
export interface GatewayProps {
  client: AdminConsoleClient;
  identity?: AdminIdentity | undefined;
}
export const dimensionLabels = {
  model: 'gatewayModel',
  user: 'gatewayUser',
  team: 'gatewayTeam',
  role: 'gatewayRole',
} as const;
export function GatewayPage({ children }: { children: ReactNode }) {
  const { token } = theme.useToken();
  return (
    <section
      className="gateway-workbench"
      style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: token.marginLG }}
    >
      {children}
    </section>
  );
}
export function GatewayHeading({
  title,
  description,
  children,
}: {
  title: AdminTranslationKey;
  description: AdminTranslationKey;
  children?: ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <Row justify="space-between" align="top" gutter={[token.margin, token.margin]}>
      <Col flex="auto">
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: token.marginXS }}>
          {gatewayT(title)}
        </Typography.Title>
        <Typography.Text type="secondary">{gatewayT(description)}</Typography.Text>
      </Col>
      <Col>{children}</Col>
    </Row>
  );
}
export function GatewayField({
  label,
  value,
  options,
  onChange,
  disabled = false,
  loading = false,
  layout = 'vertical',
}: {
  label: string;
  value?: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  layout?: 'vertical' | 'horizontal';
}) {
  const id = useId();
  return (
    <Form
      layout={layout}
      {...(layout === 'horizontal' ? { labelCol: { flex: 'none' }, wrapperCol: { flex: 'auto' } } : {})}
    >
      <Form.Item label={label} htmlFor={id} style={{ marginBottom: 0 }}>
        <Select
          id={id}
          value={value ?? null}
          onChange={onChange}
          options={options}
          disabled={disabled}
          loading={loading}
          showSearch
          optionFilterProp="label"
          virtual={false}
          style={{ width: '100%' }}
        />
      </Form.Item>
    </Form>
  );
}
export function useGatewayRemote<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((old) => old + 1), []);
  useEffect(() => {
    let current = true;
    setValue(undefined);
    setError(false);
    setLoading(true);
    void load()
      .then((next) => {
        if (current) setValue(next);
      })
      .catch(() => {
        if (current) setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [load, revision]);
  return { value, loading, error, retry };
}
export function GatewayLoadError({ retry }: { retry: () => void }) {
  return (
    <Alert
      showIcon
      type="error"
      title={gatewayT('gatewayLoadFailed')}
      description={gatewayT('gatewayLoadFailedHint')}
      action={
        <Button aria-label={gatewayT('retry')} onClick={retry}>
          {gatewayT('retry')}
        </Button>
      }
    />
  );
}
export function formatGatewayNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? gatewayT('gatewayNotProvided')
    : new Intl.NumberFormat(ADMIN_LANGUAGE === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 3 }).format(value);
}
