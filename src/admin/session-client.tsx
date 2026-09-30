import { Space, Tag, Typography } from 'antd';

import type { AdminSessionClient } from './client.js';
import { translate, type AdminLanguage, type AdminTranslationKey } from './i18n.js';

const language: AdminLanguage = 'zh';
const t = (key: AdminTranslationKey) => translate(language, key);

const USER_AGENT_CLIENT_LABELS: Readonly<Record<string, AdminTranslationKey>> = {
  browser: 'sessionClientBrowser',
  electron: 'sessionClientElectron',
  node: 'sessionClientNode',
  curl: 'sessionClientCurl',
};

// User-Agent-derived names are coarse server labels and get localized; a
// self-reported client name is shown as recorded.
export function sessionClientNameLabel(name: string): string {
  const key = USER_AGENT_CLIENT_LABELS[name.toLowerCase()];
  return key ? t(key) : name;
}

export function formatSessionClientName(client: AdminSessionClient): string {
  const label = sessionClientNameLabel(client.name);
  return client.version ? `${label} ${client.version}` : label;
}

export function truncateSessionDeviceId(deviceId: string): string {
  return deviceId.length > 11 ? `${deviceId.slice(0, 8)}…` : deviceId;
}

export function SessionClientCell({ client, current = false }: {
  readonly client: AdminSessionClient | null | undefined;
  readonly current?: boolean;
}) {
  if (!client) {
    return (
      <Space size={8} wrap>
        <Typography.Text type="secondary">{t('sessionClientUnknown')}</Typography.Text>
        {current ? <Tag color="processing">{t('sessionCurrentBadge')}</Tag> : null}
      </Space>
    );
  }
  return (
    <Space orientation="vertical" size={0}>
      <Space size={8} wrap>
        <span>{formatSessionClientName(client)}</span>
        {current ? <Tag color="processing">{t('sessionCurrentBadge')}</Tag> : null}
      </Space>
      {client.deviceId ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }} title={client.deviceId}>
          {truncateSessionDeviceId(client.deviceId)}
        </Typography.Text>
      ) : null}
    </Space>
  );
}

export function SessionClientDetail({ client }: {
  readonly client: AdminSessionClient | null | undefined;
}) {
  if (!client) return <Typography.Text type="secondary">{t('sessionClientUnknown')}</Typography.Text>;
  return (
    <Space orientation="vertical" size={2}>
      <span>{formatSessionClientName(client)}</span>
      {client.deviceId ? (
        <Typography.Text type="secondary" copyable={{ text: client.deviceId }} style={{ fontSize: 12 }}>
          {`${t('sessionDeviceId')} ${client.deviceId}`}
        </Typography.Text>
      ) : null}
    </Space>
  );
}
